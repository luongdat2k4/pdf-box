import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import DOMPurify from 'dompurify'
import type { FileKind } from './types'
import { canvasToBlob } from './render'
import { imagesToPdf, type RasterImage } from './pdfOps'

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** Convert an Office/TXT file to an HTML string for display. */
export async function officeToHtml(kind: FileKind, blob: Blob, name: string): Promise<string> {
  const ext = name.split('.').pop()?.toLowerCase()
  if (kind === 'txt') return `<pre class="whitespace-pre-wrap break-words">${esc(await blob.text())}</pre>`
  if (kind === 'word') {
    if (ext !== 'docx' && ext !== 'dotx' && ext !== 'dotm') {
      throw new Error('Legacy .doc files cannot be previewed in this build. Re-save the file as .docx.')
    }
    const res = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
    return DOMPurify.sanitize(res.value)
  }
  if (kind === 'excel') {
    const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
    return DOMPurify.sanitize(wb.SheetNames.map(
      (n) => `<h3 class="sheet-title">${esc(n)}</h3>${XLSX.utils.sheet_to_html(wb.Sheets[n]!, { header: '', footer: '' })}`,
    ).join(''))
  }
  throw new Error('PowerPoint preview is not supported in this build.')
}

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
