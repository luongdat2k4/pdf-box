import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

type Offset = { x: number; y: number }

/**
 * Lets a fixed floating button be dragged anywhere on screen.
 * Position is the offset from its default spot (x > 0 is left, y > 0 is up), kept inside the
 * viewport and above the banner strip, and remembered in localStorage. A drag never turns into a click.
 * Bind `style` on the button; the button needs `touch-action: none` (class `touch-none`).
 */
export function useDragFab(target: Ref<HTMLElement | null>, storageKey: string, margin = 12) {
  const offset = ref<Offset>({ x: 0, y: 0 })
  const style = ref<Record<string, string>>({})
  let dragging = false
  let start = { x: 0, y: 0 }
  let startOffset: Offset = { x: 0, y: 0 }
  let moved = 0
  let range = { minX: 0, maxX: 0, minY: 0, maxY: 0 }

  function measure() {
    const el = target.value
    if (!el) return
    // Edges of the default (un-offset) spot. offsetLeft/Top ignore the transform, so this holds
    // even before the last move has been rendered.
    const rect = { width: el.offsetWidth, height: el.offsetHeight }
    const homeRight = el.offsetLeft + rect.width
    const homeBottom = el.offsetTop + rect.height
    // The app's banner strip (if any) is off limits too.
    const floor = window.innerHeight - (document.querySelector('[data-ad-strip]')?.getBoundingClientRect().height ?? 0)
    range = {
      minX: Math.min(0, homeRight - (window.innerWidth - margin)),
      maxX: Math.max(0, homeRight - rect.width - margin),
      minY: Math.min(0, homeBottom - (floor - margin)),
      maxY: Math.max(0, homeBottom - rect.height - margin),
    }
  }

  function apply() {
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
    offset.value = { x: clamp(offset.value.x, range.minX, range.maxX), y: clamp(offset.value.y, range.minY, range.maxY) }
    style.value = { transform: `translate(${-offset.value.x}px, ${-offset.value.y}px)` }
  }

  function load(): Offset {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { x: 0, y: 0 }
    try {
      const v = JSON.parse(raw) as unknown
      if (typeof v === 'number') return { x: 0, y: v } // saved by the older, vertical-only version
      if (v && typeof v === 'object') {
        const { x, y } = v as Partial<Offset>
        return { x: Number(x) || 0, y: Number(y) || 0 }
      }
    } catch { /* ignore a broken value */ }
    return { x: 0, y: 0 }
  }

  function onDown(e: PointerEvent) {
    const el = target.value
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return
    measure()
    dragging = true
    moved = 0
    start = { x: e.clientX, y: e.clientY }
    startOffset = { ...offset.value }
    el.setPointerCapture(e.pointerId)
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    moved = Math.max(moved, Math.hypot(dx, dy))
    if (moved <= 5) return
    offset.value = { x: startOffset.x - dx, y: startOffset.y - dy }
    apply()
  }

  function onUp() {
    if (!dragging) return
    dragging = false
    if (moved > 5) {
      try { localStorage.setItem(storageKey, JSON.stringify({ x: Math.round(offset.value.x), y: Math.round(offset.value.y) })) }
      catch { /* storage unavailable: the position just is not remembered */ }
    }
  }

  function onClickCapture(e: MouseEvent) {
    if (moved > 5) {
      e.stopPropagation()
      e.preventDefault()
    }
    moved = 0
  }

  function onResize() {
    measure()
    apply()
  }

  onMounted(() => {
    const el = target.value
    if (!el) return
    try { offset.value = load() } catch { /* storage unavailable */ }
    measure()
    apply()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', onClickCapture, true)
    window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
    const el = target.value
    el?.removeEventListener('pointerdown', onDown)
    el?.removeEventListener('pointermove', onMove)
    el?.removeEventListener('pointerup', onUp)
    el?.removeEventListener('pointercancel', onUp)
    el?.removeEventListener('click', onClickCapture, true)
    window.removeEventListener('resize', onResize)
  })

  return { style }
}
