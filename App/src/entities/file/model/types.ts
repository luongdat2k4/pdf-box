export type FileKind = 'pdf' | 'word' | 'excel' | 'ppt' | 'txt' | 'md' | 'image'

export interface FileMeta {
  id: string
  name: string
  kind: FileKind
  size: number
  mime: string
  addedAt: number
  openedAt: number | null
  favorite: boolean
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

export function kindOf(name: string): FileKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_KIND[ext] ?? null
}
