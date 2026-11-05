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

/** Tool used to mark up a page in the viewer. 'hand' scrolls instead of drawing. */
export type MarkTool = 'hand' | 'highlight' | 'underline' | 'strike' | 'ink'
/** Normalised rectangle [x1, y1, x2, y2] with origin at the top-left of the page. */
export type Rect = [number, number, number, number]
