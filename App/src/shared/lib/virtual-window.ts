/** Fixed-height rows: clamp after filtering/deleting, and mount only a viewport plus a small buffer. */
export function virtualWindow(count: number, rowHeight: number, scrollTop: number, height: number, overscan = 5) {
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, count * rowHeight - height)))
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((top + height) / rowHeight) + overscan)
  return { start, end, top }
}
