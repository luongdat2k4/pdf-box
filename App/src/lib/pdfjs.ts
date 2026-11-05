import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

export class PasswordRequiredError extends Error {
  /** true when a password was supplied but was wrong */
  wrong: boolean
  constructor(wrong: boolean) {
    super(wrong ? 'Incorrect password' : 'Password required')
    this.name = 'PasswordRequiredError'
    this.wrong = wrong
  }
}

/** Open a PDF. pdf.js transfers the buffer to its worker, so we always hand it a copy. */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({ data: bytes.slice(), password })
  try {
    return await task.promise
  } catch (e) {
    if (e instanceof pdfjs.PasswordException) {
      throw new PasswordRequiredError(e.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
    }
    throw e
  }
}

/** Cheap check used by tool screens to know whether a file needs a password. */
export async function probePdf(bytes: Uint8Array, password?: string) {
  const doc = await openPdf(bytes, password)
  const pageCount = doc.numPages
  await destroyDoc(doc)
  return { pageCount }
}

/** In pdf.js 5+ a document is released through its loading task. */
export function destroyDoc(doc: PDFDocumentProxy | null | undefined): Promise<void> {
  return doc ? doc.loadingTask.destroy() : Promise.resolve()
}
