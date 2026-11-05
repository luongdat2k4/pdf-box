<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import Ic from '@/components/Ic.vue'
import PdfPage, { type MarkTool, type Rect } from '@/components/PdfPage.vue'
import PageThumb from '@/components/PageThumb.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { useLibrary } from '@/stores/library'
import { openWithPassword } from '@/lib/pdfAccess'
import { destroyDoc, type PDFDocumentProxy } from '@/lib/pdfjs'
import { applyAnnotations, type Annotation } from '@/lib/pdfOps'
import type { PdfSource } from '@/lib/types'
import { askConfirm, askText, errorMessage, toast } from '@/lib/dialogs'
import { saveToDevice, shareFile } from '@/lib/platform'

const props = defineProps<{ id: string }>()
const router = useRouter()
const lib = useLibrary()

const doc = shallowRef<PDFDocumentProxy | null>(null)
const source = shallowRef<PdfSource | null>(null)
const loading = ref(true)
const error = ref('')
const pageCount = ref(0)
const ratios = ref<number[]>([])
const current = ref(1)
const zoom = ref(1)
const scroller = ref<HTMLElement | null>(null)
const viewWidth = ref(360)
const showBars = ref(true)
const thumbsOpen = ref(false)
const menuOpen = ref(false)

const file = computed(() => lib.find(props.id))
const pageWidth = computed(() => Math.max(120, (viewWidth.value - 16) * zoom.value))
const ratioOf = (n: number) => ratios.value[n - 1] ?? ratios.value[0] ?? 1.414

// ---- edit mode ----------------------------------------------------------------------
const editing = ref(false)
const tool = ref<MarkTool>('hand')
const colors = ['#ffd400', '#3ddc84', '#ff4d4f', '#2d75ed', '#1d1d1d']
const color = ref(colors[0]!)
const annots = ref<Annotation[]>([])
const undone = ref<Annotation[]>([])
const dirty = ref(false)
const saving = ref(false)

const annotsFor = (n: number) => annots.value.filter((a) => a.page === n - 1)
function addAnnot(a: Annotation) { annots.value.push(a); undone.value = []; dirty.value = true }
function undo() { const a = annots.value.pop(); if (a) undone.value.push(a) }
function redo() { const a = undone.value.pop(); if (a) annots.value.push(a) }

async function save() {
  const src = source.value
  if (!src || !file.value || !annots.value.length) return
  saving.value = true
  try {
    const out = await applyAnnotations(src, annots.value)
    await lib.replaceBlob(file.value.id, new Blob([new Uint8Array(out)], { type: 'application/pdf' }))
    // Reload from the saved bytes so the burned-in marks are rendered by pdf.js and no longer editable.
    const bytes = await lib.bytesOf(file.value.id)
    const opened = await openWithPassword(bytes, file.value.name, src.password)
    if (opened) {
      const old = doc.value
      doc.value = opened.doc
      source.value = opened.source
      void destroyDoc(old)
    }
    annots.value = []; undone.value = []; dirty.value = false
    toast('Saved')
  } catch (e) { toast(errorMessage(e), true) } finally { saving.value = false }
}

onBeforeRouteLeave(async () => {
  if (dirty.value) return askConfirm('Discard annotations?', 'You have unsaved changes.', 'Discard', true)
})

// ---- search -------------------------------------------------------------------------
const searchOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
watch(searchOpen, async (open) => { if (open) { await nextTick(); searchInput.value?.focus() } })
const query = ref('')
const searching = ref(false)
const hits = ref<{ page: number; rect: Rect }[]>([])
const hitIndex = ref(-1)
let searchToken = 0
const mctx = document.createElement('canvas').getContext('2d')!

const hitsFor = (n: number) => hits.value.filter((h) => h.page === n).map((h) => h.rect)
const currentHitLocal = (n: number) => {
  const h = hits.value[hitIndex.value]
  if (!h || h.page !== n) return -1
  return hits.value.filter((x) => x.page === n).indexOf(h)
}

async function runSearch() {
  const d = doc.value
  const q = query.value.trim().toLowerCase()
  hits.value = []; hitIndex.value = -1
  if (!d || !q) return
  const token = ++searchToken
  searching.value = true
  try {
    for (let p = 1; p <= d.numPages; p++) {
      if (token !== searchToken) return
      const page = await d.getPage(p)
      const vp = page.getViewport({ scale: 1 })
      const text = await page.getTextContent()
      for (const it of text.items) {
        if (!('str' in it) || !it.str) continue
        const s = it.str.toLowerCase()
        const [, , , , e, f] = it.transform as number[]
        let from = 0
        for (;;) {
          const at = s.indexOf(q, from)
          if (at < 0) break
          from = at + q.length
          // Proportional fonts: measure prefix widths instead of assuming equal-width characters.
          mctx.font = `${it.height || 12}px ${text.styles[it.fontName]?.fontFamily ?? 'sans-serif'}`
          const full = mctx.measureText(it.str).width || 1
          const x1 = e! + (it.width * mctx.measureText(it.str.slice(0, at)).width) / full
          const x2 = e! + (it.width * mctx.measureText(it.str.slice(0, at + q.length)).width) / full
          const [a, b] = vp.convertToViewportPoint(x1, f! - it.height * 0.2) as number[]
          const [c, dd] = vp.convertToViewportPoint(x2, f! + it.height * 0.95) as number[]
          hits.value.push({
            page: p,
            rect: [Math.min(a!, c!) / vp.width, Math.min(b!, dd!) / vp.height, Math.max(a!, c!) / vp.width, Math.max(b!, dd!) / vp.height],
          })
        }
      }
      page.cleanup()
      if (hits.value.length && hitIndex.value < 0) { hitIndex.value = 0; goTo(hits.value[0]!.page) }
    }
    if (!hits.value.length) toast('No matches. Scanned (image-only) PDFs have no searchable text.')
  } catch (e) { toast(errorMessage(e), true) } finally { if (token === searchToken) searching.value = false }
}

function stepHit(d: 1 | -1) {
  if (!hits.value.length) return
  hitIndex.value = (hitIndex.value + d + hits.value.length) % hits.value.length
  goTo(hits.value[hitIndex.value]!.page)
}

function closeSearch() { searchToken++; searchOpen.value = false; hits.value = []; hitIndex.value = -1; query.value = '' }

// ---- navigation ---------------------------------------------------------------------
function goTo(n: number) {
  const el = scroller.value?.querySelector<HTMLElement>(`[data-page="${n}"]`)
  if (el && scroller.value) scroller.value.scrollTo({ top: el.offsetTop - 8, behavior: 'auto' })
  current.value = n
}

let raf = 0
function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const sc = scroller.value
    if (!sc) return
    const mid = sc.scrollTop + sc.clientHeight * 0.35
    const els = sc.querySelectorAll<HTMLElement>('[data-page]')
    let best = current.value
    // binary search over page offsets (pages are laid out top to bottom)
    let lo = 0, hi = els.length - 1
    while (lo <= hi) {
      const m = (lo + hi) >> 1
      if (els[m]!.offsetTop <= mid) { best = m + 1; lo = m + 1 } else hi = m - 1
    }
    current.value = best
  })
}

async function jump() {
  menuOpen.value = false
  const v = await askText('Jump to page', `Enter a page from 1 to ${pageCount.value}`, String(current.value), 'Go')
  if (v === null) return
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > pageCount.value) return toast('Invalid page', true)
  goTo(n)
}

function setZoom(z: number) {
  const sc = scroller.value
  const ratio = sc ? (sc.scrollTop + sc.clientHeight / 2) / Math.max(1, sc.scrollHeight) : 0
  zoom.value = Math.min(3, Math.max(1, Math.round(z * 4) / 4))
  void nextTick(() => { if (sc) sc.scrollTop = ratio * sc.scrollHeight - sc.clientHeight / 2 })
}

// ---- lifecycle ----------------------------------------------------------------------
let ro: ResizeObserver | null = null

onMounted(async () => {
  if (!lib.loaded) await lib.load()
  const f = file.value
  if (!f) { error.value = 'This file no longer exists.'; loading.value = false; return }
  try {
    const opened = await openWithPassword(await lib.bytesOf(f.id), f.name)
    if (!opened) return void router.back()
    doc.value = opened.doc
    source.value = opened.source
    pageCount.value = opened.doc.numPages
    await lib.touch(f.id)
    loading.value = false
    await nextTick()
    if (scroller.value) {
      viewWidth.value = scroller.value.clientWidth
      ro = new ResizeObserver(() => scroller.value && (viewWidth.value = scroller.value.clientWidth))
      ro.observe(scroller.value)
    }
    // Page sizes are read in the background so the scroll height is right before pages render.
    const out: number[] = []
    for (let p = 1; p <= opened.doc.numPages; p++) {
      if (doc.value !== opened.doc) return
      const page = await opened.doc.getPage(p)
      const vp = page.getViewport({ scale: 1 })
      out.push(vp.height / vp.width)
      page.cleanup()
      if (p === 1 || p % 25 === 0 || p === opened.doc.numPages) ratios.value = [...out]
    }
  } catch (e) { error.value = errorMessage(e); loading.value = false }
})

onBeforeUnmount(() => { ro?.disconnect(); searchToken++; void destroyDoc(doc.value) })

async function share() {
  menuOpen.value = false
  const f = file.value
  if (!f) return
  try { await shareFile(f.name, await lib.blobOf(f.id)) } catch (e) { if ((e as Error).name !== 'AbortError') toast(errorMessage(e), true) }
}
async function saveCopy() {
  menuOpen.value = false
  const f = file.value
  if (!f) return
  try { toast(`Saved: ${await saveToDevice(f.name, await lib.blobOf(f.id))}`) } catch (e) { toast(errorMessage(e), true) }
}
function toggleEdit() { editing.value = !editing.value; tool.value = editing.value ? 'highlight' : 'hand'; searchOpen.value && closeSearch() }
</script>

<template>
  <div class="relative flex h-full flex-col bg-neutral-200">
    <!-- top bar -->
    <header v-show="showBars" class="safe-top z-20 flex-none bg-white shadow-sm">
      <div v-if="!searchOpen" class="flex h-14 items-center gap-1 px-2">
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" aria-label="Back" @click="router.back()"><Ic name="back" /></button>
        <h1 class="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink-strong">{{ file?.name ?? 'PDF' }}</h1>
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" aria-label="Search in document" @click="searchOpen = true; editing = false"><Ic name="search" /></button>
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" :class="editing ? 'bg-surface-strong text-primary' : ''" aria-label="Annotate" @click="toggleEdit"><Ic name="pen" /></button>
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" aria-label="More" @click="menuOpen = true"><Ic name="more" /></button>
      </div>
      <form v-else class="flex h-14 items-center gap-1 px-2" @submit.prevent="runSearch">
        <button type="button" class="grid size-10 place-items-center rounded-full active:bg-surface" aria-label="Close search" @click="closeSearch"><Ic name="back" /></button>
        <input ref="searchInput" v-model="query" placeholder="Search in document" class="h-10 min-w-0 flex-1 rounded-full bg-surface px-4 text-sm outline-none" />
        <span v-if="searching" class="px-1 text-primary"><Ic name="loading" spin :size="18" /></span>
        <span v-else-if="hits.length" class="px-1 text-xs whitespace-nowrap text-ink/60">{{ hitIndex + 1 }}/{{ hits.length }}</span>
        <button type="button" class="grid size-9 place-items-center rounded-full disabled:opacity-30 active:bg-surface" :disabled="!hits.length" aria-label="Previous match" @click="stepHit(-1)"><Ic name="up" :size="20" /></button>
        <button type="button" class="grid size-9 place-items-center rounded-full disabled:opacity-30 active:bg-surface" :disabled="!hits.length" aria-label="Next match" @click="stepHit(1)"><Ic name="down" :size="20" /></button>
      </form>
    </header>

    <!-- pages -->
    <div ref="scroller" class="min-h-0 flex-1 overflow-auto px-2 pt-2" @scroll.passive="onScroll" @click="tool === 'hand' && !editing && (showBars = !showBars)">
      <div v-if="loading" class="grid h-full place-items-center text-primary"><Ic name="loading" spin :size="34" /></div>
      <div v-else-if="error" class="mx-auto mt-24 max-w-xs text-center text-sm text-ink/60"><Ic name="warn" :size="40" class="mx-auto mb-2 text-amber-500" />{{ error }}</div>
      <template v-else-if="doc">
        <PdfPage
          v-for="n in pageCount"
          :key="n"
          :doc="doc"
          :page-no="n"
          :width="pageWidth"
          :ratio="ratioOf(n)"
          :tool="editing ? tool : 'hand'"
          :color="color"
          :annots="annotsFor(n)"
          :hits="hitsFor(n)"
          :current-hit="currentHitLocal(n)"
          @add="addAnnot"
        />
        <div class="h-24" />
      </template>
    </div>

    <!-- page pill + vertical seek bar -->
    <div v-if="doc && pageCount > 0" class="pointer-events-none absolute top-20 right-2 z-10 flex flex-col items-center gap-2" :class="showBars ? '' : 'opacity-0'">
      <span class="rounded-lg bg-black/55 px-2 py-0.5 text-xs font-medium text-white">{{ current }} / {{ pageCount }}</span>
      <input
        v-if="pageCount > 1"
        type="range" min="1" :max="pageCount" :value="current" aria-label="Page"
        class="pointer-events-auto h-[45vh] w-6 accent-primary [direction:rtl] [writing-mode:vertical-lr]"
        style="direction: ltr"
        @input="goTo(Number(($event.target as HTMLInputElement).value))"
      />
    </div>

    <!-- bottom bar: zoom + thumbnails (read mode) / annotate tools (edit mode) -->
    <footer v-if="doc && showBars" class="safe-bottom z-20 flex-none bg-white shadow-[0_-1px_6px_rgba(0,0,0,.08)]">
      <div v-if="editing" class="px-3 py-2">
        <div class="flex items-center justify-between gap-1">
          <div class="flex gap-0.5">
            <button v-for="t in ([['hand', 'thumbs'], ['highlight', 'highlight'], ['underline', 'underline'], ['strike', 'strike'], ['ink', 'pen']] as const)" :key="t[0]"
              class="grid size-9 place-items-center rounded-xl" :class="tool === t[0] ? 'bg-primary text-white' : 'text-ink/70 active:bg-surface'"
              :aria-label="t[0]" @click="tool = t[0]">
              <Ic :name="t[1]" :size="20" />
            </button>
          </div>
          <div class="flex items-center gap-0.5">
            <button class="grid size-9 place-items-center rounded-full disabled:opacity-25 active:bg-surface" :disabled="!annots.length" aria-label="Undo" @click="undo"><Ic name="undo" :size="20" /></button>
            <button class="grid size-9 place-items-center rounded-full disabled:opacity-25 active:bg-surface" :disabled="!undone.length" aria-label="Redo" @click="redo"><Ic name="redo" :size="20" /></button>
            <button class="ml-0.5 flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-white disabled:bg-primary/35" :disabled="!annots.length || saving" @click="save">
              <Ic :name="saving ? 'loading' : 'save'" :spin="saving" :size="18" /> Save
            </button>
          </div>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <span class="text-xs text-ink/50">{{ tool === 'hand' ? 'Scroll mode — pick a tool to mark' : 'Drag on the page to mark' }}</span>
          <span class="flex-1" />
          <button v-for="c in colors" :key="c" class="size-6 rounded-full border-2" :style="{ background: c, borderColor: color === c ? '#2d75ed' : 'transparent' }" :aria-label="`Colour ${c}`" @click="color = c" />
        </div>
      </div>
      <div v-else class="flex h-12 items-center justify-between px-3">
        <button class="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink/70 active:bg-surface" @click="thumbsOpen = true"><Ic name="thumbs" :size="20" /> Pages</button>
        <div class="flex items-center gap-1">
          <button class="grid size-9 place-items-center rounded-full disabled:opacity-25 active:bg-surface" :disabled="zoom <= 1" aria-label="Zoom out" @click="setZoom(zoom - 0.5)"><Ic name="zoomOut" :size="20" /></button>
          <span class="w-12 text-center text-xs text-ink/60">{{ Math.round(zoom * 100) }}%</span>
          <button class="grid size-9 place-items-center rounded-full disabled:opacity-25 active:bg-surface" :disabled="zoom >= 3" aria-label="Zoom in" @click="setZoom(zoom + 0.5)"><Ic name="zoomIn" :size="20" /></button>
        </div>
        <button class="rounded-xl px-3 py-2 text-sm font-medium text-ink/70 active:bg-surface" @click="jump">Go to…</button>
      </div>
    </footer>

    <!-- thumbnail drawer -->
    <Teleport to="body">
      <div v-if="thumbsOpen && doc" class="fixed inset-0 z-40 flex bg-black/45" @click.self="thumbsOpen = false">
        <aside class="safe-top h-full w-[72%] max-w-xs overflow-y-auto bg-white p-3">
          <h2 class="mb-2 px-1 text-base font-semibold text-ink-strong">Pages</h2>
          <div class="grid grid-cols-2 gap-2">
            <PageThumb v-for="n in pageCount" :key="n" :doc="doc" :page-no="n" :current="n === current" @click="goTo(n); thumbsOpen = false" />
          </div>
        </aside>
      </div>
    </Teleport>

    <BottomSheet :open="menuOpen" :title="file?.name" @close="menuOpen = false">
      <div class="divide-y divide-line/40 text-sm">
        <button class="flex w-full items-center gap-3 py-3" @click="jump"><Ic name="next" :size="20" /> Jump to page</button>
        <button v-if="file" class="flex w-full items-center gap-3 py-3" @click="lib.toggleFavorite(file.id); menuOpen = false"><Ic name="star" :size="20" /> {{ file.favorite ? 'Remove from favorites' : 'Add to favorites' }}</button>
        <button class="flex w-full items-center gap-3 py-3" @click="share"><Ic name="share" :size="20" /> Share</button>
        <button class="flex w-full items-center gap-3 py-3" @click="saveCopy"><Ic name="download" :size="20" /> Save to device</button>
      </div>
    </BottomSheet>
  </div>
</template>
