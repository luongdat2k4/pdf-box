import html2canvas from 'html2canvas'
import { canvasToBlob, imagesToPdf, type RasterImage } from '@/entities/pdf'

/**
 * Rasterise an HTML element to an A4 PDF. Like the reference app, the result is image-only:
 * text in the produced PDF is not selectable or searchable.
 */
export async function elementToPdf(el: HTMLElement): Promise<Uint8Array> {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const pageH = Math.floor(canvas.width * (842 / 595))
  const images: RasterImage[] = []
  for (let y = 0; y < canvas.height; y += pageH) {
    const h = Math.min(pageH, canvas.height - y)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = pageH
    const ctx = slice.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    const blob = await canvasToBlob(slice, 'image/jpeg', 0.92)
    images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'jpg' })
  }
  return imagesToPdf(images, 'A4')
}
