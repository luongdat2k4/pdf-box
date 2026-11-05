import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/**
 * Makes a horizontally overflowing element easy to scroll without a touchscreen:
 * drag with the mouse, or use the wheel (vertical wheel movement scrolls sideways).
 * Touch keeps its native scrolling. A drag never turns into a click on the child under the pointer.
 */
export function useDragScroll(target: Ref<HTMLElement | null>) {
  let dragging = false
  let startX = 0
  let startLeft = 0
  let moved = 0

  const canScroll = (el: HTMLElement) => el.scrollWidth > el.clientWidth

  function onDown(e: PointerEvent) {
    const el = target.value
    if (!el || e.pointerType !== 'mouse' || e.button !== 0 || !canScroll(el)) return
    dragging = true
    moved = 0
    startX = e.clientX
    startLeft = el.scrollLeft
  }

  function onMove(e: PointerEvent) {
    const el = target.value
    if (!dragging || !el) return
    const dx = e.clientX - startX
    moved = Math.max(moved, Math.abs(dx))
    el.scrollLeft = startLeft - dx
  }

  function onUp() {
    dragging = false
  }

  function onWheel(e: WheelEvent) {
    const el = target.value
    if (!el || !canScroll(el) || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
    el.scrollLeft += e.deltaY
    e.preventDefault()
  }

  // Runs in the capture phase so a finished drag does not click the chip it ended on.
  function onClickCapture(e: MouseEvent) {
    if (moved > 5) {
      e.stopPropagation()
      e.preventDefault()
    }
    moved = 0
  }

  onMounted(() => {
    const el = target.value
    if (!el) return
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('click', onClickCapture, true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  })

  onBeforeUnmount(() => {
    const el = target.value
    el?.removeEventListener('pointerdown', onDown)
    el?.removeEventListener('wheel', onWheel)
    el?.removeEventListener('click', onClickCapture, true)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  })
}
