import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** How far (px, after resistance) the list must be pulled to trigger a refresh. */
export const PULL_THRESHOLD = 64
const MAX_PULL = 96
const MIN_SPIN_MS = 600

/**
 * Pull down at the top of a scrolling list to refresh, like social feeds.
 * `target` wraps the list; its scroller is the first `[role="list"]` inside (or `target` itself).
 * Touch only: `pull` is how far the indicator has moved, `refreshing` is true until `onRefresh` settles.
 */
export function usePullRefresh(target: Ref<HTMLElement | null>, onRefresh: () => Promise<unknown>, enabled: () => boolean) {
  const pull = ref(0)
  const refreshing = ref(false)
  const dragging = ref(false)
  let startY = 0
  let tracking = false

  const scroller = () => target.value?.querySelector<HTMLElement>('[role="list"]') ?? target.value

  function onStart(e: TouchEvent) {
    tracking = enabled() && !refreshing.value && e.touches.length === 1 && (scroller()?.scrollTop ?? 1) <= 0
    if (tracking) startY = e.touches[0].clientY
  }

  function onMove(e: TouchEvent) {
    if (!tracking) return
    const dy = e.touches[0].clientY - startY
    if (dy <= 0 || (scroller()?.scrollTop ?? 0) > 0) {
      pull.value = 0
      dragging.value = false
      return
    }
    // Hold the page still while pulling (no native overscroll glow or bounce).
    if (e.cancelable) e.preventDefault()
    dragging.value = true
    pull.value = Math.min(MAX_PULL, dy * 0.5)
  }

  async function onEnd() {
    if (!tracking) return
    tracking = false
    dragging.value = false
    if (pull.value < PULL_THRESHOLD) { pull.value = 0; return }
    pull.value = PULL_THRESHOLD
    refreshing.value = true
    const started = Date.now()
    try { await onRefresh() }
    finally {
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_SPIN_MS - (Date.now() - started))))
      refreshing.value = false
      pull.value = 0
    }
  }

  onMounted(() => {
    const el = target.value
    if (!el) return
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
  })
  onBeforeUnmount(() => {
    const el = target.value
    if (!el) return
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchmove', onMove)
    el.removeEventListener('touchend', onEnd)
    el.removeEventListener('touchcancel', onEnd)
  })

  return { pull, refreshing, dragging }
}
