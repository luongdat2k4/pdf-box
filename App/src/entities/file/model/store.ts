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

  async function load() {
    items.value = toMetas(await api.listDocuments()).sort((a, b) => b.addedAt - a.addedAt)
    loaded.value = true
  }

  /** Applies a record returned by the native side to the list item it describes. */
  function apply(r: DocumentRecord) {
    const next = toMeta(r)
    const m = find(r.id)
    if (next && m) Object.assign(m, next)
  }

  const all = computed(() => items.value)
  const recent = computed(() =>
    items.value.filter((f) => f.openedAt).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0)),
  )
  const favorites = computed(() => items.value.filter((f) => f.favorite))
  const pdfs = computed(() => items.value.filter((f) => f.kind === 'pdf'))
  const images = computed(() => items.value.filter((f) => f.kind === 'image'))
  const documents = computed(() => items.value.filter((f) => f.kind !== 'pdf' && f.kind !== 'image'))

  function find(id: string) {
    return items.value.find((f) => f.id === id)
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
    items.value.unshift(...added)
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
    if (existing) { Object.assign(existing, meta); return existing }
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
    items.value = items.value.filter((f) => !ids.includes(f.id))
  }

  return {
    items, loaded, all, recent, favorites, pdfs, images, documents,
    load, find, addBlob, importFiles, importFromDevice, blobOf, bytesOf, touch, toggleFavorite, rename, replaceBlob, remove,
    saveProgress, adopt,
  }
})
