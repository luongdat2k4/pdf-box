import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * Lets a fixed, bottom-anchored floating button be dragged up and down (vertical only).
 * Position is the offset from the default bottom spot, kept inside the viewport and
 * remembered in localStorage. A drag never turns into a click.
 * Bind `style` on the button; the button needs `touch-action: none` (class `touch-none`).
 */
export function useDragFab(target: Ref<HTMLElement | null>, storageKey: string, margin = 12) {
  const offset = ref(0) // px moved upward from the default position (>= 0 is up)
  const style = ref<Record<string, string>>({})
  let dragging = false
  let startY = 0
  let startOffset = 0
  let moved = 0
  let range = { min: 0, max: 0 }

  function measure() {
    const el = target.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const home = rect.bottom + offset.value // un-offset bottom edge
    // offset > 0 moves up; top edge must stay >= margin, bottom edge <= innerHeight - margin
    range = { min: Math.min(0, home - (window.innerHeight - margin)), max: Math.max(0, home - rect.height - margin) }
  }

  function apply() {
    offset.value = Math.min(range.max, Math.max(range.min, offset.value))
    style.value = { transform: `translateY(${-offset.value}px)` }
  }

  function onDown(e: PointerEvent) {
    const el = target.value
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return
    measure()
    dragging = true
    moved = 0
    startY = e.clientY
    startOffset = offset.value
    el.setPointerCapture(e.pointerId)
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return
    const dy = e.clientY - startY
    moved = Math.max(moved, Math.abs(dy))
    if (moved <= 5) return
    offset.value = startOffset - dy
    apply()
  }

  function onUp() {
    if (!dragging) return
    dragging = false
    if (moved > 5) localStorage.setItem(storageKey, String(Math.round(offset.value)))
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
    offset.value = Number(localStorage.getItem(storageKey)) || 0
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
