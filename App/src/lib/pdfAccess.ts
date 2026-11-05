import { askPassword } from './dialogs'
import { destroyDoc, openPdf, PasswordRequiredError, type PDFDocumentProxy } from './pdfjs'
import { useLibrary } from '@/stores/library'
import type { FileMeta, PdfSource } from './types'

export interface OpenedPdf {
  doc: PDFDocumentProxy
  source: PdfSource
}

/**
 * Open PDF bytes with pdf.js, asking for a password (repeatedly, on wrong input) when needed.
 * Resolves to null when the user cancels.
 */
export async function openWithPassword(bytes: Uint8Array, name: string, initial?: string): Promise<OpenedPdf | null> {
  let password = initial
  for (;;) {
    try {
      const doc = await openPdf(bytes, password)
      return { doc, source: { bytes, password } }
    } catch (e) {
      if (!(e instanceof PasswordRequiredError)) throw e
      const pw = await askPassword(`${name} is protected`, e.wrong, 'Enter the password to open this file.')
      if (pw === null) return null
      password = pw
    }
  }
}

/** Load a library PDF as a ready-to-use source (bytes + working password) plus its page count. */
export async function loadPdfSource(meta: FileMeta): Promise<(PdfSource & { pageCount: number }) | null> {
  const lib = useLibrary()
  const opened = await openWithPassword(await lib.bytesOf(meta.id), meta.name)
  if (!opened) return null
  const pageCount = opened.doc.numPages
  await destroyDoc(opened.doc)
  return { ...opened.source, pageCount }
}
