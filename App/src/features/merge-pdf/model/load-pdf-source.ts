import { destroyDoc, openWithPassword, type PdfSource } from '@/entities/pdf'
import { useLibrary, type FileMeta } from '@/entities/file'

/** Load a library PDF as a ready-to-use source (bytes + working password) plus its page count. */
export async function loadPdfSource(meta: FileMeta): Promise<(PdfSource & { pageCount: number }) | null> {
  const lib = useLibrary()
  const opened = await openWithPassword(await lib.bytesOf(meta.id), meta.name)
  if (!opened) return null
  const pageCount = opened.doc.numPages
  await destroyDoc(opened.doc)
  return { ...opened.source, pageCount }
}
