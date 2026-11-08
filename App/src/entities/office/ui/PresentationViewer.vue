<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { t } from '@/shared/i18n'
import { Ic, VirtualList } from '@/shared/ui'
import { slideDocument } from '../lib/slide-document'
import { presentationError } from '../lib/presentation-error'
import type { PresentationSession } from '../lib/read-presentation'
import type { RenderedSlide } from '../lib/presentation-protocol'
import PresentationThumbnail from './PresentationThumbnail.vue'

const props = defineProps<{ session: PresentationSession; fileId: string; initialPage?: number; initialZoom?: number | null }>()
const emit = defineEmits<{ progress: [value: { id: string; page: number; zoom: number; count: number }] }>()
const clamp = (index: number) => Math.max(0, Math.min(props.session.count - 1, Number.isFinite(index) ? Math.trunc(index) : 0))
const current = ref(clamp(props.initialPage ?? 0))
const zooms = [0.75, 1, 1.25, 1.5, 2, 3]
const zoom = ref(zooms.includes(props.initialZoom ?? 1) ? props.initialZoom ?? 1 : 1)
const pageInput = ref(current.value + 1)
const slide = shallowRef<RenderedSlide | null>(null)
const busy = ref(true)
const failed = ref(false)
const failureMessage = ref('')
const panel = ref<'slides' | 'text' | null>(null)
const stage = ref<HTMLElement | null>(null)
const width = ref(0)
const height = ref(0)
const fit = computed(() => Math.max(0.01, Math.min((width.value - 24) / props.session.width, (height.value - 24) / props.session.height)))
const slideWidth = computed(() => props.session.width * fit.value * zoom.value)
const slideHeight = computed(() => props.session.height * fit.value * zoom.value)
const document = computed(() => slide.value ? slideDocument(slide.value.svg) : '')
const pages = Array.from({ length: props.session.count }, (_, index) => ({ id: String(index), index }))
let observer: ResizeObserver | undefined
let progressTimer: ReturnType<typeof setTimeout> | undefined
let pointer: { x: number; y: number } | undefined

function saveProgress() {
  emit('progress', { id: props.fileId, page: current.value, zoom: zoom.value, count: props.session.count })
}
watch([current, zoom], () => {
  clearTimeout(progressTimer)
  progressTimer = setTimeout(saveProgress, 300)
}, { immediate: true })
watch(current, () => {
  pageInput.value = current.value + 1
  if (stage.value) { stage.value.scrollLeft = 0; stage.value.scrollTop = 0 }
})
watch(current, async (_page, _previous, clean) => {
  const controller = new AbortController()
  clean(() => controller.abort())
  busy.value = true; failed.value = false; slide.value = null
  try {
    const result = await props.session.slide(current.value, controller.signal)
    if (!controller.signal.aborted) slide.value = result
  } catch (error) {
    if (!controller.signal.aborted) { failed.value = true; failureMessage.value = presentationError(error, 'slides.renderFailed') }
  } finally { if (!controller.signal.aborted) busy.value = false }
}, { immediate: true })

function go(index: number) { current.value = clamp(index); pageInput.value = current.value + 1 }
function choose(index: number) { go(index); panel.value = null; void nextTick(() => stage.value?.focus()) }
function measure() { width.value = stage.value?.clientWidth ?? 0; height.value = stage.value?.clientHeight ?? 0 }
function key(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  if (panel.value) { if (event.key === 'Escape') panel.value = null; return }
  if (event.key === 'ArrowRight' || event.key === 'PageDown') go(current.value + 1)
  else if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(current.value - 1)
  else if (event.key === 'Home') go(0)
  else if (event.key === 'End') go(props.session.count - 1)
  else return
  event.preventDefault()
}
function swipe(event: PointerEvent) {
  if (!pointer || zoom.value > 1) { pointer = undefined; return }
  const dx = event.clientX - pointer.x
  const dy = event.clientY - pointer.y
  pointer = undefined
  if (Math.abs(dx) > 60 && Math.abs(dy) < 45) go(current.value + (dx < 0 ? 1 : -1))
}
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (stage.value) observer.observe(stage.value)
  measure()
})
onBeforeUnmount(() => { observer?.disconnect(); clearTimeout(progressTimer); saveProgress() })
</script>

<template>
  <section class="relative flex min-h-0 flex-1 flex-col bg-slate-100" @keydown="key">
    <div class="flex min-h-12 flex-none items-center gap-2 border-b border-line bg-white px-2">
      <button class="grid size-10 place-items-center rounded-lg text-ink/65 active:bg-surface" :aria-label="t('slides.list')" :aria-expanded="panel === 'slides'" @click="panel = 'slides'"><Ic name="thumbs" :size="20" /></button>
      <span class="flex-1 text-xs text-ink/60">{{ t('slides.position', { page: current + 1, total: session.count }) }}</span>
      <button class="grid size-10 place-items-center rounded-lg text-ink/65 disabled:opacity-30" :disabled="!slide" :aria-label="t('slides.text')" @click="panel = 'text'"><Ic name="doc" :size="20" /></button>
      <select v-model.number="zoom" class="min-h-9 rounded-lg border border-line bg-white px-2 text-xs" :aria-label="t('slides.zoom')">
        <option v-for="value in zooms" :key="value" :value="value">{{ value === 1 ? t('slides.fit') : `${value * 100}%` }}</option>
      </select>
    </div>
    <div ref="stage" tabindex="0" :aria-label="t('slides.canvas')" :aria-busy="busy"
      class="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      :style="{ touchAction: zoom <= 1 ? 'pan-y' : 'pan-x pan-y' }"
      @pointerdown="pointer = { x: $event.clientX, y: $event.clientY }" @pointerup="swipe" @pointercancel="pointer = undefined">
      <div v-if="busy" role="status" class="grid h-full place-items-center text-primary"><Ic name="loading" spin :size="30" /><span class="sr-only">{{ t('slides.loading') }}</span></div>
      <p v-else-if="failed" role="alert" class="p-8 text-center text-sm text-ink/60">{{ failureMessage }}</p>
      <div v-else-if="slide" class="flex items-center justify-center p-3"
        :style="{ width: `${Math.max(width, slideWidth + 24)}px`, minHeight: `${Math.max(height, slideHeight + 24)}px` }">
        <iframe :srcdoc="document" sandbox="allow-same-origin" tabindex="-1" :title="t('slides.position', { page: current + 1, total: session.count })"
          class="pointer-events-none shrink-0 border-0 bg-white shadow-md" :style="{ width: `${slideWidth}px`, height: `${slideHeight}px` }" />
      </div>
    </div>
    <footer class="safe-bottom flex min-h-14 flex-none items-center justify-between gap-3 border-t border-line bg-white px-4 py-2">
      <button class="flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm text-primary disabled:opacity-30" :disabled="current === 0" @click="go(current - 1)"><Ic name="back" :size="18" />{{ t('slides.previous') }}</button>
      <label class="flex items-center gap-1 text-xs text-ink/50"><span class="sr-only">{{ t('slides.goTo') }}</span>
        <input v-model.number="pageInput" type="number" inputmode="numeric" min="1" :max="session.count" class="h-9 w-16 rounded-lg border border-line text-center text-sm text-ink" :aria-label="t('slides.goTo')" @change="go(Number(pageInput) - 1)" @keydown.enter="go(Number(pageInput) - 1)" /> / {{ session.count }}
      </label>
      <button class="flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm text-primary disabled:opacity-30" :disabled="current === session.count - 1" @click="go(current + 1)">{{ t('slides.next') }}<Ic name="next" :size="18" /></button>
    </footer>
    <div v-if="panel" class="absolute inset-0 z-30 flex flex-col bg-white">
      <header class="flex min-h-14 flex-none items-center justify-between border-b border-line px-4">
        <h2 class="font-semibold">{{ t(panel === 'slides' ? 'slides.list' : 'slides.text') }}</h2>
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" :aria-label="t('slides.close')" @click="panel = null"><Ic name="close" /></button>
      </header>
      <VirtualList v-if="panel === 'slides'" :items="pages" :row-height="112" :initial-index="current" :aria-label="t('slides.list')" class="px-3">
        <template #default="{ item }">
          <button class="flex h-28 w-full items-center gap-4 rounded-xl p-2 text-left" :class="item.index === current ? 'bg-primary/10' : 'active:bg-surface'"
            :aria-label="t('slides.position', { page: item.index + 1, total: session.count })" :aria-current="item.index === current ? 'page' : undefined" @click="choose(item.index)">
            <span class="block h-24 w-40 max-w-[60%] flex-none"><PresentationThumbnail :session="session" :index="item.index" /></span>
            <span class="text-sm font-medium">{{ t('slides.number', { page: item.index + 1 }) }}</span>
          </button>
        </template>
      </VirtualList>
      <div v-else class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm select-text">
        <h3 class="mb-3 font-semibold text-primary">{{ t('slides.number', { page: current + 1 }) }}</h3>
        <p class="whitespace-pre-wrap break-words leading-relaxed">{{ slide?.text || t('slides.noText') }}</p>
        <template v-if="slide?.notes"><h3 class="mt-6 mb-2 font-semibold">{{ t('slides.notes') }}</h3><p class="whitespace-pre-wrap break-words leading-relaxed">{{ slide.notes }}</p></template>
      </div>
    </div>
  </section>
</template>
