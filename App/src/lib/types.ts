export type FileKind = 'pdf' | 'word' | 'excel' | 'ppt' | 'txt' | 'image'

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
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image', webp: 'image',
}

export const ACCEPT_ALL = Object.keys(EXT_KIND).map((e) => `.${e}`).join(',')
export const ACCEPT_PDF = '.pdf,application/pdf'
export const ACCEPT_IMAGE = 'image/*,.jpg,.jpeg,.png,.gif,.bmp,.webp'

export function kindOf(name: string): FileKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_KIND[ext] ?? null
}

export type PageSizeKey = 'A3' | 'A4' | 'A5' | 'A6' | 'B4' | 'B5'

/** Page sizes in PDF points (same table used by the reference app). */
export const PAGE_SIZES: Record<PageSizeKey, [number, number]> = {
  A3: [842, 1191],
  A4: [595, 842],
  A5: [420, 595],
  A6: [298, 420],
  B4: [709, 1001],
  B5: [499, 709],
}

export interface PdfSource {
  bytes: Uint8Array
  password?: string
}
