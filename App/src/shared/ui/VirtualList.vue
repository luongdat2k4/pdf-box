<script setup lang="ts" generic="T extends { id: string }">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { virtualWindow } from '@/shared/lib/virtual-window'

const props = withDefaults(defineProps<{
  items: readonly T[]
  rowHeight?: number
  resetKey?: string
  bottomSpace?: number
  initialIndex?: number
}>(), { rowHeight: 64, bottomSpace: 0, initialIndex: 0 })
defineSlots<{ default(props: { item: T; index: number }): unknown; empty(): unknown }>()
const viewport = ref<HTMLElement | null>(null)
const height = ref(0)
const top = ref(0)
let observer: ResizeObserver | undefined
let frame = 0
const range = computed(() => virtualWindow(props.items.length, props.rowHeight, top.value, height.value))
const visible = computed(() => props.items.slice(range.value.start, range.value.end))

function measure() {
  if (!viewport.value) return
  height.value = viewport.value.clientHeight
  top.value = viewport.value.scrollTop
}
function scroll() {
  if (frame) return
  frame = requestAnimationFrame(() => { frame = 0; measure() })
}
watch(() => props.resetKey, () => {
  if (viewport.value) viewport.value.scrollTop = 0
  top.value = 0
}, { flush: 'post' })
watch(() => props.items.length, async () => {
  await nextTick()
  measure()
})
onMounted(() => {
  if (viewport.value && props.initialIndex > 0) viewport.value.scrollTop = Math.max(0, Math.min(props.initialIndex, props.items.length - 1)) * props.rowHeight
  measure()
  observer = new ResizeObserver(measure)
  if (viewport.value) observer.observe(viewport.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame) cancelAnimationFrame(frame)
})

/** Arrow navigation can reach rows outside the mounted window without losing keyboard focus. */
async function navigate(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-virtual-index]')
  if (!row || !viewport.value) return
  event.preventDefault()
  const current = Number(row.dataset.virtualIndex)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? props.items.length - 1
    : Math.max(0, Math.min(props.items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))
  const offset = index * props.rowHeight
  if (offset < top.value) viewport.value.scrollTop = offset
  else if (offset + props.rowHeight > top.value + height.value) {
    viewport.value.scrollTop = offset + props.rowHeight - height.value
  }
  measure()
  await nextTick()
  viewport.value?.querySelector<HTMLElement>(`[data-virtual-index="${index}"] [role="button"]`)?.focus({ preventScroll: true })
}
</script>

<template>
  <div ref="viewport" role="list" tabindex="0" class="min-h-0 flex-1 overflow-y-auto overscroll-contain" @scroll.passive="scroll" @keydown="navigate">
    <div v-if="items.length" class="relative" :style="{ height: `${items.length * rowHeight + bottomSpace}px` }">
      <div v-for="(item, offset) in visible" :key="item.id" role="listitem"
        :aria-posinset="range.start + offset + 1" :aria-setsize="items.length"
        :data-virtual-index="range.start + offset"
        class="absolute inset-x-0 top-0"
        :style="{ height: `${rowHeight}px`, transform: `translateY(${(range.start + offset) * rowHeight}px)` }">
        <slot :item="item" :index="range.start + offset" />
      </div>
    </div>
    <slot v-else name="empty" />
  </div>
</template>
