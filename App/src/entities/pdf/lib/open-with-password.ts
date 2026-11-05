import { askPassword } from '@/shared/ui'
import { openPdf, PasswordRequiredError, type PDFDocumentProxy } from './pdfjs'
import type { PdfSource } from '../model/types'

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
