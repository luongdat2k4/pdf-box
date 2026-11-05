import { createStore, del, get, getMany, set, values } from 'idb-keyval'
import type { FileMeta } from '../model/types'

// Metadata and blobs live in separate stores so listing never loads file bodies.
const metaStore = createStore('pdftoolbox-meta', 'files')
const blobStore = createStore('pdftoolbox-blob', 'files')

export async function listMeta(): Promise<FileMeta[]> {
  return (await values(metaStore)) as FileMeta[]
}

export async function putFile(meta: FileMeta, blob: Blob): Promise<void> {
  await set(meta.id, blob, blobStore)
  await set(meta.id, meta, metaStore)
}

export async function putMeta(meta: FileMeta): Promise<void> {
  await set(meta.id, meta, metaStore)
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return get<Blob>(id, blobStore)
}

export async function getBlobs(ids: string[]): Promise<(Blob | undefined)[]> {
  return getMany<Blob>(ids, blobStore)
}

export async function removeFile(id: string): Promise<void> {
  await del(id, blobStore)
  await del(id, metaStore)
}
