<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PDFDocumentProxy } from '../lib/pdfjs'
import { renderPage } from '../lib/render'
import type { Annotation } from '../lib/ops'
import type { MarkTool, Rect } from '../model/types'

const props = defineProps<{
  doc: PDFDocumentProxy
  pageNo: number
  width: number // css px
  ratio: number // height / width
  tool: MarkTool
  color: string
  annots: Annotation[]
  hits: Rect[]
  currentHit: number // index into hits, -1 for none
}>()
const emit = defineEmits<{ add: [a: Annotation] }>()

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const height = computed(() => props.width * props.ratio)

let visible = false
let version = 0
let chain: Promise<void> = Promise.resolve()
let observer: IntersectionObserver | null = null

function schedule() {
  const mine = ++version
  chain = chain.then(async () => {
    if (!visible || mine !== version || !canvas.value) return
    try {
      const page = await props.doc.getPage(props.pageNo)
      if (mine !== version || !canvas.value) { page.cleanup(); return }
      await renderPage(page, canvas.value, props.width)
      page.cleanup()
    } catch {
      /* document destroyed or render cancelled */
    }
  })
}

function release() {
  version++
  if (canvas.value) { canvas.value.width = 1; canvas.value.height = 1 }
}

onMounted(() => {
  observer = new IntersectionObserver(([e]) => {
    const now = !!e?.isIntersecting
    if (now === visible) return
    visible = now
    if (now) schedule()
    else release()
  }, { rootMargin: '900px 0px' })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => { observer?.disconnect(); release() })
watch(() => [props.width, props.doc], () => visible && schedule())

// ---- annotation drawing -------------------------------------------------------------
const drag = ref<{ a: [number, number]; b: [number, number]; pts: [number, number][] } | null>(null)

function norm(e: PointerEvent): [number, number] {
  const r = svg.value!.getBoundingClientRect()
  return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
}
function down(e: PointerEvent) {
  if (props.tool === 'hand') return
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  const p = norm(e)
  drag.value = { a: p, b: p, pts: [p] }
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const p = norm(e)
  d.b = p
  if (props.tool === 'ink') d.pts.push(p)
}
function up() {
  const d = drag.value
  drag.value = null
  if (!d) return
  if (props.tool === 'ink') {
    if (d.pts.length > 1) emit('add', { page: props.pageNo - 1, kind: 'ink', color: props.color, pts: d.pts })
  } else if (props.tool !== 'hand' && Math.abs(d.a[0] - d.b[0]) > 0.005 && Math.abs(d.a[1] - d.b[1]) > 0.003) {
    emit('add', { page: props.pageNo - 1, kind: props.tool, color: props.color, pts: [d.a, d.b] })
  }
}

interface Shape { kind: Annotation['kind']; color: string; pts: [number, number][] }
const shapes = computed<Shape[]>(() => {
  const list: Shape[] = props.annots.map((a) => ({ kind: a.kind, color: a.color, pts: a.pts }))
  const d = drag.value
  if (d && props.tool !== 'hand') list.push({ kind: props.tool, color: props.color, pts: props.tool === 'ink' ? d.pts : [d.a, d.b] })
  return list
})
const box = (s: Shape) => {
  const [a, b] = s.pts as [[number, number], [number, number]]
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) }
}
</script>

<template>
  <div ref="root" class="relative mx-auto mb-3 bg-white shadow-sm" :style="{ width: `${width}px`, height: `${height}px` }" :data-page="pageNo">
    <canvas ref="canvas" class="absolute inset-0" />
    <svg
      ref="svg"
      class="absolute inset-0 size-full"
      :class="tool === 'hand' ? 'pointer-events-none' : 'touch-none'"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <rect v-for="(h, i) in hits" :key="`h${i}`" :x="h[0]" :y="h[1]" :width="h[2] - h[0]" :height="h[3] - h[1]"
        :fill="i === currentHit ? '#ff8a00' : '#ffd400'" :fill-opacity="i === currentHit ? 0.5 : 0.4" />
      <template v-for="(s, i) in shapes" :key="i">
        <polyline v-if="s.kind === 'ink'" :points="s.pts.map((p) => p.join(',')).join(' ')" fill="none" :stroke="s.color"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <rect v-else-if="s.kind === 'highlight'" :x="box(s).x" :y="box(s).y" :width="box(s).w" :height="box(s).h" :fill="s.color" fill-opacity="0.4" />
        <line v-else :x1="box(s).x" :x2="box(s).x + box(s).w" :y1="s.kind === 'underline' ? box(s).y + box(s).h : box(s).y + box(s).h / 2"
          :y2="s.kind === 'underline' ? box(s).y + box(s).h : box(s).y + box(s).h / 2" :stroke="s.color" stroke-width="1.8" vector-effect="non-scaling-stroke" />
      </template>
    </svg>
  </div>
</template>
