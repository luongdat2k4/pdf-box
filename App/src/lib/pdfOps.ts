import { LineCapStyle, PDFDocument, rgb } from '@cantoo/pdf-lib'
import { PAGE_SIZES, type PageSizeKey, type PdfSource } from './types'

/** Normalised annotation (0..1, origin top-left of the page). */
export interface Annotation {
  page: number // 0-based
  kind: 'highlight' | 'underline' | 'strike' | 'ink'
  color: string // #rrggbb
  /** highlight/underline/strike: two opposite corners. ink: the stroke polyline. */
  pts: [number, number][]
}

function loadDoc(src: PdfSource): Promise<PDFDocument> {
  return PDFDocument.load(src.bytes, { password: src.password })
}

/** Merge every page of each source, in order. Mirrors `mutool merge`. */
export async function mergePdfs(sources: PdfSource[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const src of sources) {
    const doc = await loadDoc(src)
    const pages = await out.copyPages(doc, doc.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return out.save()
}

/** Build a new PDF from the chosen 0-based pages (split = merge with a page selection). */
export async function extractPages(src: PdfSource, pageIndices: number[]): Promise<Uint8Array> {
  const doc = await loadDoc(src)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(doc, pageIndices)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

/** Encrypt with AES-128 and the same user/owner password (same scheme as the reference app). */
export async function lockPdf(src: PdfSource, password: string): Promise<Uint8Array> {
  const doc = await loadDoc(src)
  doc.encrypt({ userPassword: password, ownerPassword: password, algorithm: 'AES-128' })
  return doc.save()
}

/** Remove encryption. The document is loaded with its password and written back in the clear. */
export async function unlockPdf(src: PdfSource): Promise<Uint8Array> {
  const doc = await loadDoc(src)
  return doc.save()
}

export interface RasterImage {
  bytes: Uint8Array
  kind: 'jpg' | 'png'
}

/** Decode any browser-supported image and re-encode as JPEG/PNG so pdf-lib can embed it. */
export async function normalizeImage(blob: Blob): Promise<RasterImage> {
  if (blob.type === 'image/jpeg' || blob.type === 'image/png') {
    return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: blob.type === 'image/png' ? 'png' : 'jpg' }
  }
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const out = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Image encode failed'))), 'image/jpeg', 0.92),
  )
  return { bytes: new Uint8Array(await out.arrayBuffer()), kind: 'jpg' }
}

/** One image per page, scaled to fit the page and centred. */
export async function imagesToPdf(images: RasterImage[], size: PageSizeKey): Promise<Uint8Array> {
  const [pw, ph] = PAGE_SIZES[size]
  const doc = await PDFDocument.create()
  for (const img of images) {
    const embedded = img.kind === 'png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes)
    const s = Math.min(pw / embedded.width, ph / embedded.height)
    const w = embedded.width * s
    const h = embedded.height * s
    const page = doc.addPage([pw, ph])
    page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h })
  }
  return doc.save()
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Burn annotations into the PDF as vector drawing operations. */
export async function applyAnnotations(src: PdfSource, annotations: Annotation[]): Promise<Uint8Array> {
  const doc = await loadDoc(src)
  const pages = doc.getPages()
  for (const a of annotations) {
    const page = pages[a.page]
    if (!page || a.pts.length < 2) continue
    const { width: W, height: H } = page.getSize()
    const P = (p: [number, number]) => ({ x: p[0] * W, y: H - p[1] * H })
    const color = hexToRgb(a.color)
    if (a.kind === 'ink') {
      for (let i = 1; i < a.pts.length; i++) {
        page.drawLine({
          start: P(a.pts[i - 1]), end: P(a.pts[i]),
          thickness: 2.2, color, lineCap: LineCapStyle.Round,
        })
      }
      continue
    }
    const p1 = P(a.pts[0])
    const p2 = P(a.pts[1])
    const x = Math.min(p1.x, p2.x)
    const y = Math.min(p1.y, p2.y)
    const w = Math.abs(p1.x - p2.x)
    const h = Math.abs(p1.y - p2.y)
    if (a.kind === 'highlight') {
      page.drawRectangle({ x, y, width: w, height: h, color, opacity: 0.4 })
    } else {
      const ly = a.kind === 'underline' ? y : y + h / 2
      page.drawLine({ start: { x, y: ly }, end: { x: x + w, y: ly }, thickness: 1.5, color })
    }
  }
  // Loading with a password yields a decrypted document; keep protected files protected.
  if (src.password) doc.encrypt({ userPassword: src.password, ownerPassword: src.password, algorithm: 'AES-128' })
  return doc.save()
}
