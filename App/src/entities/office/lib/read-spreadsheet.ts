import type { SpreadsheetBook } from './spreadsheet'

/** Parsing runs off the UI thread; transfer the original bytes instead of copying them to the worker. */
export async function readSpreadsheet(blob: Blob, signal?: AbortSignal): Promise<SpreadsheetBook> {
  const data = await blob.arrayBuffer()
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/spreadsheet.worker.ts', import.meta.url), { type: 'module' })
    const clean = () => { worker.terminate(); signal?.removeEventListener('abort', abort) }
    const abort = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ book?: SpreadsheetBook; error?: string }>) => {
      clean()
      if (event.data.book) resolve(event.data.book)
      else reject(new Error(event.data.error ?? 'Could not read spreadsheet'))
    }
    worker.onerror = (event) => { clean(); reject(new Error(event.message || 'Could not read spreadsheet')) }
    worker.postMessage(data, [data])
  })
}
