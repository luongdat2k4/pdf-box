import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type DocumentRecord } from '../api/native-api'
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
    addedAt: r.addedAt, openedAt: r.lastOpenedAt, favorite: r.isFavorite,
    lastPage: r.lastPage, lastZoom: r.lastZoom, pageCount: r.pageCount, isEncrypted: r.isEncrypted,
  }
}

function toMetas(rs: DocumentRecord[]): FileMeta[] {
  return rs.map(toMeta).filter((m): m is FileMeta => m !== null)
}

export const useLibrary = defineStore('library', () => {
  const items = ref<FileMeta[]>([])
  const loaded = ref(false)
  const searchRevision = ref(0)
  const libraryAccess = ref({ hasAccess: false, prompted: true })
  const scanning = ref(false)
  let scanPending: Promise<void> | undefined

  /** Serialises Home entry, resume and manual refresh so only one permission request/scan can be active. */
  function syncDeviceFiles(requestAccess = false): Promise<void> {
    if (scanPending) return scanPending
    scanning.value = true
    scanPending = (async () => {
      try {
        libraryAccess.value = await api.getLibraryAccess()
        if (!libraryAccess.value.hasAccess && (requestAccess || !libraryAccess.value.prompted)) {
          libraryAccess.value = await api.requestLibraryAccess()
        }
        if (libraryAccess.value.hasAccess) {
          await api.scanLibrary(Object.keys(EXT_KIND))
          await load()
        }
      } catch (e) {
        libraryAccess.value = await api.getLibraryAccess().catch(() => libraryAccess.value)
        if ((e as Error).name !== 'AbortError') throw e
      } finally {
        scanning.value = false
        scanPending = undefined
      }
    })()
    return scanPending
  }

  async function load() {
    items.value = toMetas(await api.listDocuments()).sort((a, b) => b.addedAt - a.addedAt)
    loaded.value = true
  }

  /** Applies a record returned by the native side to the list item it describes. */
  function apply(r: DocumentRecord) {
    const next = toMeta(r)
    const m = find(r.id)
    if (next && m) {
      if (next.name !== m.name || next.mime !== m.mime || next.kind !== m.kind) searchRevision.value++
      Object.assign(m, next)
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
    const meta = toMeta(await api.saveOutput({ name, mimeType: blob.type || MIME[kind], data: blob }))
    if (!meta) throw new Error(`Unsupported file type: ${name}`)
    items.value.unshift(meta)
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
    items.value = [...incoming.values(), ...items.value.filter((file) => !incoming.has(file.id))]
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

  async function blobOf(id: string): Promise<Blob> {
    return api.readContent(id)
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
    const meta = toMeta(r)
    if (!meta) return null
    const existing = find(meta.id)
    if (existing) { apply(r); return existing }
    items.value.unshift(meta)
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
    await api.removeDocuments(ids)
    const removed = new Set(ids)
    items.value = items.value.filter((f) => !removed.has(f.id))
  }

  return {
    items, loaded, all, recent, favorites, byKind, pdfs, images, documents, searchRevision, libraryAccess, scanning, syncDeviceFiles,
    load, find, addBlob, importFiles, importFromDevice, blobOf, bytesOf, touch, toggleFavorite, rename, replaceBlob, remove,
    saveProgress, adopt,
  }
})
