import type { PDFDocumentProxy, PDFPageProxy } from './pdfjs'

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 1): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Canvas export failed'))), type, quality))
}

/** Render a page so that its width in CSS pixels equals `cssWidth` (fit-width), at device pixel ratio. */
export async function renderPage(page: PDFPageProxy, canvas: HTMLCanvasElement, cssWidth: number, dpr = window.devicePixelRatio || 1) {
  const base = page.getViewport({ scale: 1 })
  // Keep canvases within what mobile WebViews can allocate (≈4096 px wide).
  const effectiveDpr = Math.max(1, Math.min(dpr, 4096 / cssWidth))
  const scale = (cssWidth / base.width) * effectiveDpr
  const viewport = page.getViewport({ scale })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${(base.height / base.width) * cssWidth}px`
  const task = page.render({ canvas, viewport })
  await task.promise
}

export async function renderToCanvas(doc: PDFDocumentProxy, pageNo: number, pixelWidth: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNo)
  const canvas = document.createElement('canvas')
  await renderPage(page, canvas, pixelWidth, 1)
  page.cleanup()
  return canvas
}

/** Small preview used in thumbnail strips / page pickers. Returns an object URL. */
export async function renderThumb(doc: PDFDocumentProxy, pageNo: number, width = 160): Promise<string> {
  const canvas = await renderToCanvas(doc, pageNo, width)
  return URL.createObjectURL(await canvasToBlob(canvas, 'image/jpeg', 0.8))
}

export interface PdfToImageOptions {
  /** Pixel width of every rendered page. */
  width: number
  /** 'long': stack all pages into one tall image. 'pages': one image per page. */
  mode: 'long' | 'pages'
  onProgress?: (done: number, total: number) => void
}

// Browsers cap canvas size (~16k px side on most engines, ~268M px area on Android WebView).
const MAX_SIDE = 16000

export async function pdfToImages(doc: PDFDocumentProxy, opts: PdfToImageOptions): Promise<Blob[]> {
  const total = doc.numPages
  const canvases: HTMLCanvasElement[] = []
  const out: Blob[] = []
  let maxW = 0
  let sumH = 0
  for (let i = 1; i <= total; i++) {
    const c = await renderToCanvas(doc, i, opts.width)
    opts.onProgress?.(i, total)
    if (opts.mode === 'pages') {
      out.push(await canvasToBlob(c, 'image/jpeg', 1))
    } else {
      canvases.push(c)
      maxW = Math.max(maxW, c.width)
      sumH += c.height
    }
  }
  if (opts.mode === 'pages') return out
  if (sumH > MAX_SIDE) {
    throw new Error(`The combined image would be ${sumH}px tall (limit ${MAX_SIDE}). Use "one image per page" or lower the quality.`)
  }
  const long = document.createElement('canvas')
  long.width = maxW
  long.height = sumH
  const ctx = long.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, maxW, sumH)
  let y = 0
  for (const c of canvases) {
    ctx.drawImage(c, 0, y)
    y += c.height
  }
  return [await canvasToBlob(long, 'image/jpeg', 1)]
}
