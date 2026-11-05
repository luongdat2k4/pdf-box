export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

export function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Parse "1-3,5,8-" style page lists into 0-based indices. Returns null when invalid. */
export function parsePageRanges(input: string, pageCount: number): number[] | null {
  const out = new Set<number>()
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return null
  for (const part of parts) {
    const m = /^(\d+)?\s*-\s*(\d+)?$/.exec(part)
    if (m && (m[1] || m[2])) {
      const a = m[1] ? Number(m[1]) : 1
      const b = m[2] ? Number(m[2]) : pageCount
      if (a < 1 || b > pageCount || a > b) return null
      for (let i = a; i <= b; i++) out.add(i - 1)
    } else if (/^\d+$/.test(part)) {
      const n = Number(part)
      if (n < 1 || n > pageCount) return null
      out.add(n - 1)
    } else return null
  }
  return [...out].sort((x, y) => x - y)
}
