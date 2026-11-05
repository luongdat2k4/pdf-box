import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as db from '../api/db'
import { kindOf, type FileKind, type FileMeta } from './types'

const MIME: Record<FileKind, string> = {
  pdf: 'application/pdf', word: 'application/msword', excel: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint', txt: 'text/plain', md: 'text/markdown', image: 'image/*',
}

export const useLibrary = defineStore('library', () => {
  const items = ref<FileMeta[]>([])
  const loaded = ref(false)

  async function load() {
    items.value = (await db.listMeta()).sort((a, b) => b.addedAt - a.addedAt)
    loaded.value = true
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
    const meta: FileMeta = {
      id: crypto.randomUUID(), name, kind, size: blob.size,
      mime: blob.type || MIME[kind], addedAt: Date.now(), openedAt: null, favorite: false,
    }
    await db.putFile(meta, blob)
    items.value.unshift(meta)
    return meta
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
    const b = await db.getBlob(id)
    if (!b) throw new Error('The file no longer exists')
    return b
  }

  async function bytesOf(id: string): Promise<Uint8Array> {
    return new Uint8Array(await (await blobOf(id)).arrayBuffer())
  }

  async function touch(id: string) {
    const m = find(id)
    if (!m) return
    m.openedAt = Date.now()
    await db.putMeta({ ...m })
  }

  async function toggleFavorite(id: string) {
    const m = find(id)
    if (!m) return
    m.favorite = !m.favorite
    await db.putMeta({ ...m })
  }

  async function rename(id: string, name: string) {
    const m = find(id)
    if (!m) return
    const ext = m.name.includes('.') ? m.name.slice(m.name.lastIndexOf('.')) : ''
    m.name = name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext
    await db.putMeta({ ...m })
  }

  /** Overwrite the stored bytes of an existing file (used when saving annotations). */
  async function replaceBlob(id: string, blob: Blob) {
    const m = find(id)
    if (!m) return
    m.size = blob.size
    await db.putFile({ ...m }, blob)
  }

  async function remove(ids: string[]) {
    for (const id of ids) await db.removeFile(id)
    items.value = items.value.filter((f) => !ids.includes(f.id))
  }

  return {
    items, loaded, all, recent, favorites, pdfs, images, documents,
    load, find, addBlob, importFiles, blobOf, bytesOf, touch, toggleFavorite, rename, replaceBlob, remove,
  }
})
