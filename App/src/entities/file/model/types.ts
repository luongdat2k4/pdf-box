export type FileKind = 'pdf' | 'word' | 'excel' | 'ppt' | 'txt' | 'md' | 'image'

export interface FileMeta {
  id: string
  name: string
  kind: FileKind
  size: number
  mime: string
  addedAt: number
  modifiedAt: number | null
  openedAt: number | null
  favorite: boolean
  /** Reading position, restored when a PDF or PowerPoint file is reopened. */
  lastPage: number
  lastZoom: number | null
  pageCount: number | null
  isEncrypted: boolean
}

export const EXT_KIND: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', dot: 'word', dotx: 'word', dotm: 'word',
  xls: 'excel', xlsx: 'excel', xlt: 'excel', xltx: 'excel', xltm: 'excel', xlsm: 'excel',
  ppt: 'ppt', pptx: 'ppt', pot: 'ppt', pptm: 'ppt', potx: 'ppt', potm: 'ppt',
  txt: 'txt',
  md: 'md', markdown: 'md',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image', webp: 'image',
}

export const ACCEPT_ALL = Object.keys(EXT_KIND).map((e) => `.${e}`).join(',')
export const ACCEPT_PDF = '.pdf,application/pdf'
export const ACCEPT_IMAGE = 'image/*,.jpg,.jpeg,.png,.gif,.bmp,.webp'

/** Turns an `<input accept>` string into the bare extension list the native picker wants. */
export function acceptExts(accept: string): string[] {
  const exts = accept.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('.')).map((s) => s.slice(1))
  return exts.length ? exts : Object.keys(EXT_KIND)
}

export function kindOf(name: string): FileKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_KIND[ext] ?? null
}
