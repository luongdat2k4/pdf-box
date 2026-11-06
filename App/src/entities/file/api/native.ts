import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { askConfirm } from '@/shared/ui'
import { t, type MessageKey } from '@/shared/i18n'
import type { DocumentPatch, DocumentRecord, NativeApi, OpenedEvent, Settings } from './native-api'

/** Raw commands of the Kotlin `Library` plugin (design-note/native-api.md, "Lệnh của plugin"). */
interface LibraryPlugin {
  listDocuments(): Promise<{ documents: DocumentRecord[] }>
  updateDocument(o: { id: string; patch: DocumentPatch }): Promise<{ document: DocumentRecord }>
  removeDocuments(o: { ids: string[] }): Promise<void>
  importFromDevice(o: { accept: string[]; multiple: boolean; mode: 'copy' | 'link' }): Promise<{
    added: DocumentRecord[]
    skipped: string[]
  }>
  readChunk(o: { id: string; offset: number; length: number }): Promise<{ data: string; eof: boolean; size: number | null }>
  writeBegin(): Promise<{ token: string }>
  writeChunk(o: { token: string; data: string }): Promise<void>
  writeAbort(o: { token: string }): Promise<void>
  writeCommit(o: { token: string; name?: string; mimeType?: string; id?: string; fallbackToApp?: boolean }): Promise<{
    document: DocumentRecord
  }>
  exportDocument(o: { id: string }): Promise<{ where: string }>
  shareDocument(o: { id: string }): Promise<void>
  getSettings(): Promise<Settings>
  setSettings(o: Partial<Settings>): Promise<Settings>
  pickSaveFolder(): Promise<Settings>
  addListener(event: 'documentOpened', cb: (e: OpenedEvent) => void): Promise<PluginListenerHandle>
}

const Library = registerPlugin<LibraryPlugin>('Library')

// Chunks must stay under the plugin's 4 MiB limit; 3 MiB is also a multiple of 3 so base64 has no padding mid-stream.
const CHUNK = 3 * 1024 * 1024

/** The user closing a system picker is not a failure; surface it as an AbortError like the Web Share API does. */
function rethrow(e: unknown): never {
  if ((e as { code?: string })?.code === 'CANCELLED') {
    const err = new Error('Cancelled')
    err.name = 'AbortError'
    throw err
  }
  throw e
}

async function call<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    return rethrow(e)
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

const WHY: Record<string, MessageKey> = {
  CANCELLED: 'fallback.cancelled',
  PERMISSION_LOST: 'fallback.permissionLost',
  NO_WRITE_PERMISSION: 'fallback.noWrite',
}

/**
 * Commits a write session. When the chosen save location cannot be used (picker cancelled, folder gone) the native
 * side keeps the session, so we offer to keep the result inside the app rather than losing the work.
 */
async function commitOrFallback(token: string, commit: { name?: string; mimeType?: string; id?: string }) {
  try {
    return await Library.writeCommit({ token, ...commit })
  } catch (e) {
    const code = (e as { code?: string })?.code ?? ''
    if (commit.id || !(code in WHY)) return rethrow(e)
    const ok = await askConfirm(t('fallback.title'), t('fallback.body', { why: t(WHY[code]!) }), t('fallback.confirm'))
    if (!ok) return rethrow(e)
    return await call(Library.writeCommit({ token, ...commit, fallbackToApp: true }))
  }
}

/** Streams a blob into a write session, then commits it with the given arguments. */
async function writeBlob(data: Blob, commit: { name?: string; mimeType?: string; id?: string }): Promise<DocumentRecord> {
  const { token } = await call(Library.writeBegin())
  try {
    for (let off = 0; off < data.size; off += CHUNK) {
      await call(Library.writeChunk({ token, data: await blobToBase64(data.slice(off, off + CHUNK)) }))
    }
    return (await commitOrFallback(token, commit)).document
  } catch (e) {
    await Library.writeAbort({ token }).catch(() => {})
    throw e
  }
}

export const nativeApi: NativeApi = {
  async listDocuments() {
    return (await call(Library.listDocuments())).documents
  },
  async updateDocument(id, patch) {
    return (await call(Library.updateDocument({ id, patch }))).document
  },
  async removeDocuments(ids) {
    await call(Library.removeDocuments({ ids }))
  },

  importFromDevice: (opts) => call(Library.importFromDevice(opts)),
  saveOutput: ({ name, mimeType, data }) => writeBlob(data, { name, mimeType }),

  async readContent(id) {
    const parts: Uint8Array<ArrayBuffer>[] = []
    for (let offset = 0; ; ) {
      const r = await call(Library.readChunk({ id, offset, length: CHUNK }))
      const bytes = base64ToBytes(r.data) as Uint8Array<ArrayBuffer>
      parts.push(bytes)
      offset += bytes.length
      if (r.eof) break
    }
    return new Blob(parts)
  },
  replaceContent: (id, data) => writeBlob(data, { id }),

  exportDocument: (id) => call(Library.exportDocument({ id })),
  shareDocument: (id) => call(Library.shareDocument({ id })),

  getSettings: () => call(Library.getSettings()),
  setSettings: (patch) => call(Library.setSettings(patch)),
  pickSaveFolder: () => call(Library.pickSaveFolder()),

  async onDocumentOpened(cb) {
    const handle = await Library.addListener('documentOpened', cb)
    return () => void handle.remove()
  },
}
