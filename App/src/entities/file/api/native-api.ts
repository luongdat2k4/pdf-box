import { isNative } from '@/shared/lib/platform'
import { nativeApi } from './native'
import { mockApi } from './mock'

/** One library row as the native side returns it. Mirrors design-note/native-api.md section 3. */
export interface DocumentRecord {
  /** Revision of a native mutation response; omitted on snapshot rows. */
  revision?: number
  id: string
  storage: 'app' | 'external'
  location: string
  displayName: string
  mimeType: string
  sizeBytes: number | null
  pageCount: number | null
  isEncrypted: boolean
  isFavorite: boolean
  lastPage: number
  lastZoom: number | null
  lastOpenedAt: number | null
  addedAt: number
  /** Original file modification time in milliseconds; unknown when the provider omits it. */
  modifiedAt: number | null
}

export type DocumentPatch = Partial<
  Pick<
    DocumentRecord,
    'displayName' | 'pageCount' | 'isEncrypted' | 'isFavorite' | 'lastPage' | 'lastZoom' | 'lastOpenedAt' | 'sizeBytes'
  >
>

export interface Settings {
  saveMode: 'app' | 'ask' | 'folder'
  saveFolderUri: string | null
}

/** A file another app asked us to open ("Open with"), already imported by the native side. */
export interface OpenedEvent {
  document?: DocumentRecord
  skipped: string[]
  error?: string
}

export interface NativeApi {
  getLibraryAccess(): Promise<LibraryAccess>
  requestLibraryAccess(): Promise<LibraryAccess>
  syncLibrary(accept: string[]): Promise<LibrarySyncState>
  scanLibrary(accept: string[]): Promise<LibrarySyncState>
  getLibrarySnapshot(): Promise<LibrarySnapshot>
  listDocuments(): Promise<DocumentRecord[]>
  updateDocument(id: string, patch: DocumentPatch): Promise<DocumentRecord>
  removeDocuments(ids: string[]): Promise<{ revision: number }>

  importFromDevice(opts: {
    accept: string[]
    multiple: boolean
    mode: 'copy' | 'link'
  }): Promise<{ added: DocumentRecord[]; skipped: string[] }>
  saveOutput(opts: { name: string; mimeType: string; data: Blob }): Promise<DocumentRecord>

  /** Stop reading when the content exceeds the caller's byte budget, including unknown-size streams. */
  readContent(id: string, maxBytes?: number): Promise<Blob>
  replaceContent(id: string, data: Blob): Promise<DocumentRecord>

  /** Returns where the copy ended up (a path, URI or file name). */
  exportDocument(id: string): Promise<{ where: string }>
  shareDocument(id: string): Promise<void>

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  pickSaveFolder(): Promise<Settings>

  /** Called for each "Open with" request, including one that launched the app. Returns an unsubscribe function. */
  onDocumentOpened(cb: (e: OpenedEvent) => void): Promise<() => void>
  /** Actual deletions made in the app or detected on device storage. */
  onDocumentsRemoved(cb: (ids: string[]) => void): Promise<() => void>
  onDocumentsChanged(cb: (change: LibraryChange) => void): Promise<() => void>
  onLibrarySyncState(cb: (state: LibrarySyncState) => void): Promise<() => void>
}

export interface LibrarySnapshot { documents: DocumentRecord[]; revision: number }
export interface LibraryChange { revision: number; upserted: DocumentRecord[]; removedIds: string[] }
export interface LibrarySyncState {
  hasAccess: boolean
  initialization: 'not_started' | 'running' | 'complete' | 'interrupted'
  phase: 'idle' | 'permission_required' | 'indexing' | 'updating' | 'error'
  processed: number
  observers?: number
  directoriesRead?: number
  filesRead?: number
  syncTasks?: number
  lastSuccessAt?: number | null
  error?: string | null
}

export interface LibraryAccess {
  hasAccess: boolean
  prompted: boolean
}

/** The real Android plugin on a device, an IndexedDB stand-in in the browser (dev only). */
export const api: NativeApi = isNative() ? nativeApi : mockApi
