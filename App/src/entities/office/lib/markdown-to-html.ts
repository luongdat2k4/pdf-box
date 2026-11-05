import { marked } from 'marked'
import DOMPurify from 'dompurify'

// External links open outside the app (a new tab / the system browser); in-page anchors are left alone
// because the viewer scrolls to them itself (the app's router uses the URL hash).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const href = node.tagName === 'A' ? node.getAttribute('href') : null
  if (href && !href.startsWith('#')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** GitHub-style heading slug: lower case, punctuation dropped, spaces to hyphens, unicode letters kept. */
function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
}

/**
 * Render GitHub-flavoured Markdown to sanitised HTML. Raw HTML inside the document is allowed
 * but passes through DOMPurify, so scripts and event handlers are removed.
 */
export function markdownToHtml(source: string): string {
  const raw = marked.parse(source, { gfm: true, async: false })
  const clean = DOMPurify.sanitize(raw)
  const dom = new DOMParser().parseFromString(clean, 'text/html')
  const used = new Map<string, number>()
  dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const base = slug(h.textContent ?? '') || 'section'
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    h.id = n ? `${base}-${n}` : base
  })
  return dom.body.innerHTML
}
