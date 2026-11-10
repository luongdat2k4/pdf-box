import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type DocumentRecord, type LibraryChange, type LibrarySyncState } from '../api/native-api'
import { EXT_KIND, kindOf, type FileKind, type FileMeta } from './types'

const MIME: Record<FileKind, string> = {
  pdf: 'application/pdf', word: 'application/msword', excel: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint', txt: 'text/plain', md: 'text/markdown', image: 'image/*',
}

/** Rows whose name has no supported type cannot be shown, so they map to null. */
function toMeta(r: DocumentRecord): FileMeta | null {
  const kind = kindOf(r.displayName)
  if (!kind) return null
  return {
    id: r.id, name: r.displayName, kind, size: r.sizeBytes ?? 0, mime: r.mimeType,
    addedAt: r.addedAt, modifiedAt: r.modifiedAt ?? null, openedAt: r.lastOpenedAt, favorite: r.isFavorite,
    lastPage: r.lastPage, lastZoom: r.lastZoom, pageCount: r.pageCount, isEncrypted: r.isEncrypted,
    thumbnailPath: r.thumbnailPath ?? null,
  }
}

function toMetas(rs: DocumentRecord[]): FileMeta[] {
  return rs.map(toMeta).filter((m): m is FileMeta => m !== null)
}

/** Sort by the actual file date. Insertion time must never make an old file appear new. */
function newestFirst(files: FileMeta[]): FileMeta[] {
  return files.sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0) || a.id.localeCompare(b.id))
}

export const useLibrary = defineStore('library', () => {
  const items = ref<FileMeta[]>([])
  const loaded = ref(false)
  const searchRevision = ref(0)
  const libraryAccess = ref({ hasAccess: false, prompted: true })
  /** False until the device permission has been checked once, so the UI does not guess. */
  const accessChecked = ref(false)
  const scanning = ref(false)
  const syncState = ref<LibrarySyncState>({ hasAccess: false, initialization: 'not_started', phase: 'idle', processed: 0 })
  const updating = computed(() => syncState.value.phase === 'updating')
  let scanPending: Promise<void> | undefined
  let scanPendingFull = false
  const deletedIds = new Set<string>()
  let loadSequence = 0
  let revision = -1
  let mutationSequence = 0
  const mutations = new Map<string, { sequence: number; revision?: number }>()
  let startup: Promise<void> | undefined
  let stopChanges: (() => void) | undefined
  let stopSyncState: (() => void) | undefined
  let lifecycle = 0

  function setSyncState(state: LibrarySyncState) {
    syncState.value = state
    libraryAccess.value = { ...libraryAccess.value, hasAccess: state.hasAccess }
    scanning.value = state.phase === 'indexing'
  }

  /** Subscribe first, show the DB snapshot, then start native initialization/catch-up. */
  function start(): Promise<void> {
    if (startup) return startup
    const generation = ++lifecycle
    startup = (async () => {
      try {
        const changes = await api.onDocumentsChanged(changed)
        if (generation !== lifecycle) { changes(); return }
        stopChanges = changes
        const state = await api.onLibrarySyncState(setSyncState)
        if (generation !== lifecycle) { state(); return }
        stopSyncState = state
        await load()
        if (generation === lifecycle) await syncDeviceFiles()
      } catch (error) {
        if (generation === lifecycle) stop()
        throw error
      }
    })()
    return startup
  }

  function stop() {
    lifecycle++; loadSequence++
    stopChanges?.(); stopSyncState?.()
    stopChanges = undefined; stopSyncState = undefined; startup = undefined
  }

  /** Normal refresh catches up; only the explicit full option requests a device-wide rescan. */
  function syncDeviceFiles(requestAccess = false, full = false): Promise<void> {
    if (scanPending) return full && !scanPendingFull
      ? scanPending.then(() => syncDeviceFiles(requestAccess, true)) : scanPending
    scanPendingFull = full
    scanPending = (async () => {
      try {
        libraryAccess.value = await api.getLibraryAccess()
        accessChecked.value = true
        // The system permission screen only opens on an explicit request (never at launch).
        if (!libraryAccess.value.hasAccess && requestAccess) {
          libraryAccess.value = await api.requestLibraryAccess()
        }
        if (libraryAccess.value.hasAccess) {
          setSyncState(await (full ? api.scanLibrary(Object.keys(EXT_KIND)) : api.syncLibrary(Object.keys(EXT_KIND))))
          await load() // DB only; also covers any event missed while the bridge was registering.
        }
      } catch (e) {
        libraryAccess.value = await api.getLibraryAccess().catch(() => libraryAccess.value)
        accessChecked.value = true
        syncState.value = { ...syncState.value, hasAccess: libraryAccess.value.hasAccess,
          phase: libraryAccess.value.hasAccess ? 'error' : 'permission_required' }
        if ((e as Error).name !== 'AbortError') throw e
      } finally {
        scanning.value = false
        scanPending = undefined
        scanPendingFull = false
      }
    })()
    return scanPending
  }

  async function load() {
    const sequence = ++loadSequence
    const since = mutationSequence
    const snapshot = await api.getLibrarySnapshot()
    if (sequence !== loadSequence) return
    const records = new Map(toMetas(snapshot.documents).map(file => [file.id, file]))
    for (const id of records.keys()) {
      const removedAt = mutations.get(id)?.revision
      if (removedAt !== undefined && removedAt <= snapshot.revision) deletedIds.delete(id)
    }
    // Merge changes delivered during the request, including additions and metadata edits.
    for (const [id, mutation] of mutations) if (mutation.sequence > since &&
      (mutation.revision === undefined || mutation.revision > snapshot.revision)) {
      const current = find(id)
      if (current) records.set(id, current)
      else records.delete(id)
    }
    items.value = newestFirst([...records.values()].filter(file => !deletedIds.has(file.id)))
    revision = Math.max(revision, snapshot.revision)
    loaded.value = true
  }

  function forget(ids: string[], changeRevision?: number) {
    ids.forEach(id => { deletedIds.add(id); mutations.set(id, { sequence: ++mutationSequence, revision: changeRevision }) })
    items.value = items.value.filter(file => !deletedIds.has(file.id))
  }

  function watchRemovals() { return api.onDocumentsRemoved(forget) }

  function changed(change: LibraryChange) {
    if (change.revision <= revision) return
    revision = change.revision
    forget(change.removedIds.filter(id => (mutations.get(id)?.revision ?? -1) <= change.revision), change.revision)
    const incoming = new Map<string, FileMeta>()
    const changedIds = new Set<string>()
    for (const record of change.upserted) {
      if ((mutations.get(record.id)?.revision ?? -1) > change.revision) continue
      changedIds.add(record.id)
      deletedIds.delete(record.id)
      mutations.set(record.id, { sequence: ++mutationSequence, revision: change.revision })
      const meta = toMeta(record)
      if (meta) incoming.set(record.id, meta)
    }
    searchRevision.value++
    items.value = newestFirst([...incoming.values(), ...items.value.filter(file => !changedIds.has(file.id))])
  }

  /** Applies a record returned by the native side to the list item it describes. */
  function apply(r: DocumentRecord) {
    if (r.revision !== undefined && r.revision < (mutations.get(r.id)?.revision ?? -1)) return
    mutations.set(r.id, { sequence: ++mutationSequence, revision: r.revision })
    const next = toMeta(r)
    const m = find(r.id)
    if (next && m) {
      const timeChanged = next.modifiedAt !== m.modifiedAt
      if (next.name !== m.name || next.mime !== m.mime || next.kind !== m.kind) searchRevision.value++
      Object.assign(m, next)
      if (timeChanged) items.value = newestFirst([...items.value])
    }
  }

  const all = computed(() => items.value)
  const recent = computed(() =>
    items.value.filter((f) => f.openedAt).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0)),
  )
  const favorites = computed(() => items.value.filter((f) => f.favorite))
  // Build type buckets once per structural/type change; switching Home chips reuses these arrays.
  const byKind = computed(() => {
    const groups: Record<FileKind, FileMeta[]> = { pdf: [], word: [], excel: [], ppt: [], txt: [], md: [], image: [] }
    for (const file of items.value) groups[file.kind].push(file)
    return groups
  })
  const pdfs = computed(() => byKind.value.pdf)
  const images = computed(() => byKind.value.image)
  const documents = computed(() => items.value.filter((f) => f.kind !== 'pdf' && f.kind !== 'image'))
  const byId = computed(() => new Map(items.value.map((file) => [file.id, file])))

  function find(id: string) {
    return byId.value.get(id)
  }

  async function addBlob(name: string, blob: Blob): Promise<FileMeta> {
    const kind = kindOf(name)
    if (!kind) throw new Error(`Unsupported file type: ${name}`)
    const record = await api.saveOutput({ name, mimeType: blob.type || MIME[kind], data: blob })
    const meta = toMeta(record)
    if (!meta) throw new Error(`Unsupported file type: ${name}`)
    adopt(record)
    return meta
  }

  /**
   * Native picker (device) or file dialog (browser). `link` keeps the original file in place instead of copying;
   * native falls back to a copy when the file's provider will not hand out a lasting permission.
   * A cancelled picker resolves with nothing added.
   */
  async function importFromDevice(opts: { accept?: string[]; multiple?: boolean; mode?: 'copy' | 'link' } = {}) {
    let res: Awaited<ReturnType<typeof api.importFromDevice>>
    try {
      res = await api.importFromDevice({
        accept: opts.accept ?? Object.keys(EXT_KIND),
        multiple: opts.multiple ?? true,
        mode: opts.mode ?? 'link',
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { added: [] as FileMeta[], skipped: [] as string[] }
      throw e
    }
    const added = toMetas(res.added)
    // Native returns existing records for an already linked URI. Keep one row per document ID.
    const incoming = new Map(added.map((file) => [file.id, file]))
    for (const record of res.added) { deletedIds.delete(record.id); mutations.set(record.id, { sequence: ++mutationSequence, revision: record.revision }) }
    items.value = newestFirst([...incoming.values(), ...items.value.filter((file) => !incoming.has(file.id))])
    return { added, skipped: res.skipped }
  }

  /** Import files chosen with <input type=file>. Unsupported types are skipped and reported. */
  async function importFiles(files: File[]): Promise<{ added: FileMeta[]; skipped: string[] }> {
    const added: FileMeta[] = []
    const skipped: string[] = []
    for (const f of files) {
      if (!kindOf(f.name)) skipped.push(f.name)
      else added.push(await addBlob(f.name, f))
    }
    return { added, skipped }
  }

  async function blobOf(id: string, maxBytes?: number): Promise<Blob> {
    return api.readContent(id, maxBytes)
  }

  async function bytesOf(id: string): Promise<Uint8Array> {
    return new Uint8Array(await (await blobOf(id)).arrayBuffer())
  }

  async function touch(id: string) {
    if (!find(id)) return
    apply(await api.updateDocument(id, { lastOpenedAt: Date.now() }))
  }

  async function toggleFavorite(id: string) {
    const m = find(id)
    if (!m) return
    apply(await api.updateDocument(id, { isFavorite: !m.favorite }))
  }

  async function rename(id: string, name: string) {
    const m = find(id)
    if (!m) return
    const ext = m.name.includes('.') ? m.name.slice(m.name.lastIndexOf('.')) : ''
    const displayName = name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext
    apply(await api.updateDocument(id, { displayName }))
  }

  /** Takes in a record the native side created on its own (a file opened from another app). */
  function adopt(r: DocumentRecord): FileMeta | null {
    if (deletedIds.has(r.id)) return null
    if (r.revision !== undefined && r.revision < (mutations.get(r.id)?.revision ?? -1)) return find(r.id) ?? null
    const meta = toMeta(r)
    if (!meta) return null
    mutations.set(r.id, { sequence: ++mutationSequence, revision: r.revision })
    const existing = find(meta.id)
    if (existing) { apply(r); return existing }
    items.value = newestFirst([meta, ...items.value])
    return meta
  }

  /** Remembers where the user stopped reading and what the PDF turned out to be. Failures are not worth surfacing. */
  async function saveProgress(
    id: string,
    p: { lastPage?: number; lastZoom?: number | null; pageCount?: number; isEncrypted?: boolean },
  ) {
    if (!find(id)) return
    try { apply(await api.updateDocument(id, p)) } catch { /* progress is best effort */ }
  }

  /** Overwrite the stored bytes of an existing file (used when saving annotations). */
  async function replaceBlob(id: string, blob: Blob) {
    if (!find(id)) return
    apply(await api.replaceContent(id, blob))
  }

  async function remove(ids: string[]) {
    const requested = [...new Set(ids)]
    try {
      const result = await api.removeDocuments(requested)
      forget(requested, result?.revision)
    } catch (e) {
      // Earlier files in a batch may already be gone; preserve the actual native result on screen.
      await load().catch(() => {})
      throw e
    }
  }

  return {
    items, loaded, all, recent, favorites, byKind, pdfs, images, documents, searchRevision, libraryAccess, accessChecked, scanning, syncDeviceFiles, syncState, updating, start, stop,
    load, find, addBlob, importFiles, importFromDevice, blobOf, bytesOf, touch, toggleFavorite, rename, replaceBlob, remove,
    saveProgress, adopt, watchRemovals,
  }
})
