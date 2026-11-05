import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import DOMPurify from 'dompurify'
import { markdownToHtml } from './markdown-to-html'

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/**
 * Convert an Office/TXT/Markdown file to sanitised HTML for display.
 * `kind` is the library file kind: 'txt' | 'md' | 'word' | 'excel' (anything else, e.g. PowerPoint, is rejected).
 */
export async function officeToHtml(kind: string, blob: Blob, name: string): Promise<string> {
  const ext = name.split('.').pop()?.toLowerCase()
  if (kind === 'txt') return `<pre class="whitespace-pre-wrap break-words">${esc(await blob.text())}</pre>`
  if (kind === 'md') return markdownToHtml(await blob.text())
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
