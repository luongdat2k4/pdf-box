import { t } from '@/shared/i18n'
import { ref, type Ref } from 'vue'
import type { PDFDocumentProxy, Rect } from '@/entities/pdf'
import { toast } from '@/shared/ui'
import { errorMessage } from '@/shared/lib/error'

interface Hit {
  page: number // 1-based
  rect: Rect
}

/**
 * Full-text search over a pdf.js document. Match boxes are computed from the text layer geometry;
 * widths are measured with canvas so proportional fonts highlight the right span.
 * Only text inside a single pdf.js text item is matched, and image-only PDFs have no text to find.
 */
export function useDocSearch(doc: Ref<PDFDocumentProxy | null>, goTo: (page: number) => void) {
  const isOpen = ref(false)
  const query = ref('')
  const searching = ref(false)
  const hits = ref<Hit[]>([])
  const hitIndex = ref(-1)
  let token = 0
  const measure = document.createElement('canvas').getContext('2d')!

  const hitsFor = (n: number): Rect[] => hits.value.filter((h) => h.page === n).map((h) => h.rect)
  const currentHitLocal = (n: number): number => {
    const h = hits.value[hitIndex.value]
    if (!h || h.page !== n) return -1
    return hits.value.filter((x) => x.page === n).indexOf(h)
  }

  async function run() {
    const d = doc.value
    const q = query.value.trim().toLowerCase()
    hits.value = []
    hitIndex.value = -1
    if (!d || !q) return
    const mine = ++token
    searching.value = true
    try {
      for (let p = 1; p <= d.numPages; p++) {
        if (mine !== token) return
        const page = await d.getPage(p)
        const vp = page.getViewport({ scale: 1 })
        const text = await page.getTextContent()
        for (const it of text.items) {
          if (!('str' in it) || !it.str) continue
          const s = it.str.toLowerCase()
          const [, , , , e, f] = it.transform as number[]
          let from = 0
          for (;;) {
            const at = s.indexOf(q, from)
            if (at < 0) break
            from = at + q.length
            measure.font = `${it.height || 12}px ${text.styles[it.fontName]?.fontFamily ?? 'sans-serif'}`
            const full = measure.measureText(it.str).width || 1
            const x1 = e! + (it.width * measure.measureText(it.str.slice(0, at)).width) / full
            const x2 = e! + (it.width * measure.measureText(it.str.slice(0, at + q.length)).width) / full
            const [a, b] = vp.convertToViewportPoint(x1, f! - it.height * 0.2) as number[]
            const [c, dd] = vp.convertToViewportPoint(x2, f! + it.height * 0.95) as number[]
            hits.value.push({
              page: p,
              rect: [Math.min(a!, c!) / vp.width, Math.min(b!, dd!) / vp.height, Math.max(a!, c!) / vp.width, Math.max(b!, dd!) / vp.height],
            })
          }
        }
        page.cleanup()
        if (hits.value.length && hitIndex.value < 0) {
          hitIndex.value = 0
          goTo(hits.value[0]!.page)
        }
      }
      if (!hits.value.length) toast(t('search.noMatches'))
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      if (mine === token) searching.value = false
    }
  }

  function step(d: 1 | -1) {
    if (!hits.value.length) return
    hitIndex.value = (hitIndex.value + d + hits.value.length) % hits.value.length
    goTo(hits.value[hitIndex.value]!.page)
  }

  function open() {
    isOpen.value = true
  }

  function close() {
    token++
    isOpen.value = false
    hits.value = []
    hitIndex.value = -1
    query.value = ''
    searching.value = false
  }

  return { isOpen, query, searching, hits, hitIndex, hitsFor, currentHitLocal, run, step, open, close }
}
