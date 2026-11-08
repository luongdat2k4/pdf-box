import { kindOf, type FileMeta } from '../model/types'
import * as db from './db'
import type { DocumentRecord, NativeApi, Settings } from './native-api'

/**
 * Browser stand-in for the Android plugin, for UI development only. It keeps the existing IndexedDB layout
 * (`db.ts`, FileMeta rows) and converts to the DocumentRecord shape on the way out, so no data migration is needed.
 * Limits on purpose: storage is always 'app', import is copy-only, saveMode is always 'app'.
 */

function toRecord(m: FileMeta): DocumentRecord {
  return {
    id: m.id, storage: 'app', location: `idb:${m.id}`, displayName: m.name, mimeType: m.mime,
    sizeBytes: m.size, pageCount: m.pageCount ?? null, isEncrypted: m.isEncrypted ?? false, isFavorite: m.favorite,
    lastPage: m.lastPage ?? 0, lastZoom: m.lastZoom ?? null, lastOpenedAt: m.openedAt, addedAt: m.addedAt,
  }
}

function pickFiles(accept: string[], multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.accept = accept.join(',')
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const settings: Settings = { saveMode: 'app', saveFolderUri: null }

async function metaOf(id: string): Promise<FileMeta> {
  const m = (await db.listMeta()).find((f) => f.id === id)
  if (!m) throw Object.assign(new Error('The file no longer exists'), { code: 'NOT_FOUND' })
  return m
}

async function blobOf(id: string): Promise<Blob> {
  const b = await db.getBlob(id)
  if (!b) throw Object.assign(new Error('The file no longer exists'), { code: 'NOT_FOUND' })
  return b
}

async function store(name: string, mimeType: string, data: Blob): Promise<DocumentRecord> {
  const kind = kindOf(name)
  if (!kind) throw Object.assign(new Error(`Unsupported file type: ${name}`), { code: 'UNSUPPORTED_TYPE' })
  const meta: FileMeta = {
    id: crypto.randomUUID(), name, kind, size: data.size, mime: mimeType || data.type || 'application/octet-stream',
    addedAt: Date.now(), openedAt: null, favorite: false,
    lastPage: 0, lastZoom: null, pageCount: null, isEncrypted: false,
  }
  await db.putFile(meta, data)
  return toRecord(meta)
}

export const mockApi: NativeApi = {
  async getLibraryAccess() { return { hasAccess: false, prompted: true } },
  async requestLibraryAccess() {
    throw Object.assign(new Error('Device file access needs the Android app'), { code: 'INVALID_ARGUMENT' })
  },
  async scanLibrary() { return { count: 0 } },
  async listDocuments() {
    return (await db.listMeta()).map(toRecord)
  },

  async updateDocument(id, patch) {
    const m = await metaOf(id)
    if (patch.displayName !== undefined) m.name = patch.displayName
    if (patch.isFavorite !== undefined) m.favorite = patch.isFavorite
    if (patch.lastOpenedAt !== undefined) m.openedAt = patch.lastOpenedAt
    if (patch.sizeBytes != null) m.size = patch.sizeBytes
    if (patch.lastPage !== undefined) m.lastPage = patch.lastPage
    if (patch.lastZoom !== undefined) m.lastZoom = patch.lastZoom
    if (patch.pageCount !== undefined) m.pageCount = patch.pageCount
    if (patch.isEncrypted !== undefined) m.isEncrypted = patch.isEncrypted
    await db.putMeta(m)
    return toRecord(m)
  },

  async removeDocuments(ids) {
    for (const id of ids) await db.removeFile(id)
  },

  async importFromDevice({ accept, multiple }) {
    const files = await pickFiles(accept, multiple)
    const added: DocumentRecord[] = []
    const skipped: string[] = []
    for (const f of files) {
      try {
        added.push(await store(f.name, f.type, f))
      } catch {
        skipped.push(f.name)
      }
    }
    return { added, skipped }
  },

  saveOutput: ({ name, mimeType, data }) => store(name, mimeType, data),

  readContent: blobOf,

  async replaceContent(id, data) {
    const m = await metaOf(id)
    m.size = data.size
    await db.putFile(m, data)
    return toRecord(m)
  },

  async exportDocument(id) {
    const m = await metaOf(id)
    download(m.name, await blobOf(id))
    return { where: m.name }
  },

  async shareDocument(id) {
    const m = await metaOf(id)
    const blob = await blobOf(id)
    const file = new File([blob], m.name, { type: blob.type })
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: m.name })
    else download(m.name, blob)
  },

  async getSettings() {
    return { ...settings }
  },
  async setSettings(patch) {
    if (patch.saveMode && patch.saveMode !== 'app') {
      throw Object.assign(new Error('Only "app" is available in the browser'), { code: 'INVALID_ARGUMENT' })
    }
    return { ...settings }
  },
  async onDocumentOpened() {
    return () => {} // nothing opens files from outside the browser tab
  },
  async pickSaveFolder() {
    throw Object.assign(new Error('Choosing a folder needs the Android app'), { code: 'INVALID_ARGUMENT' })
  },
}
