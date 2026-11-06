<script setup lang="ts">
import { t } from '@/shared/i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { askConfirm, askText, BottomSheet, Ic, toast } from '@/shared/ui'
import { errorMessage } from '@/shared/lib/error'
import { destroyDoc, openWithPassword, PageThumb, PdfPage, type PDFDocumentProxy, type PdfSource } from '@/entities/pdf'
import { useFileActions, useLibrary } from '@/entities/file'
import { SearchBar, useDocSearch } from '@/features/pdf-search'
import { AnnotateBar, useAnnotations } from '@/features/pdf-annotate'

const props = defineProps<{ id: string }>()
const router = useRouter()
const lib = useLibrary()
const fileActions = useFileActions()

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

const search = useDocSearch(doc, (n) => goTo(n))
const mark = useAnnotations({ doc, source, file: () => file.value })

function openSearch() {
  mark.editing.value = false
  mark.tool.value = 'hand'
  search.open()
}
function toggleEdit() {
  if (search.isOpen.value) search.close()
  mark.toggle()
}

onBeforeRouteLeave(async () => {
  if (mark.dirty.value) return askConfirm(t('reader.discardTitle'), t('reader.discardMsg'), t('reader.discard'), true)
})

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
  const v = await askText(t('reader.jumpTitle'), t('reader.jumpMsg', { n: pageCount.value }), String(current.value), t('reader.go'))
  if (v === null) return
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > pageCount.value) return toast(t('reader.invalidPage'), true)
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
  if (!f) { error.value = t('common.fileGone'); loading.value = false; return }
  try {
    const opened = await openWithPassword(await lib.bytesOf(f.id), f.name)
    if (!opened) return void router.back()
    doc.value = opened.doc
    source.value = opened.source
    pageCount.value = opened.doc.numPages
    if (f.lastZoom) zoom.value = Math.min(3, Math.max(1, f.lastZoom))
    void lib.saveProgress(f.id, { pageCount: opened.doc.numPages, isEncrypted: opened.source.password !== undefined })
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
    // The scroll height is only right once every page size is known, so restore the position now.
    // Skipped if the user already moved on.
    await nextTick()
    if (current.value === 1 && f.lastPage > 1 && f.lastPage <= opened.doc.numPages) goTo(f.lastPage)
  } catch (e) { error.value = errorMessage(e); loading.value = false }
})

function rememberPosition() {
  if (doc.value && file.value) void lib.saveProgress(file.value.id, { lastPage: current.value, lastZoom: zoom.value })
}

onBeforeUnmount(() => { rememberPosition(); ro?.disconnect(); search.close(); void destroyDoc(doc.value) })

function menuAction(fn: (f: NonNullable<typeof file.value>) => unknown) {
  menuOpen.value = false
  if (file.value) void fn(file.value)
}
</script>

<template>
  <div class="relative flex h-full flex-col bg-neutral-200">
    <!-- top bar -->
    <header v-show="showBars" class="safe-top z-20 flex-none bg-white shadow-sm">
      <div v-if="!search.isOpen.value" class="flex h-14 items-center gap-1 px-2">
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" :aria-label="t('common.back')" @click="router.back()"><Ic name="back" /></button>
        <h1 class="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink-strong">{{ file?.name ?? 'PDF' }}</h1>
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" :aria-label="t('search.inDocument')" @click="openSearch"><Ic name="search" /></button>
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" :class="mark.editing.value ? 'bg-surface-strong text-primary' : ''" :aria-label="t('reader.annotate')" @click="toggleEdit"><Ic name="pen" /></button>
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" :aria-label="t('common.more')" @click="menuOpen = true"><Ic name="more" /></button>
      </div>
      <SearchBar
        v-else
        v-model="search.query.value"
        :searching="search.searching.value"
        :count="search.hits.value.length"
        :index="search.hitIndex.value"
        @submit="search.run"
        @close="search.close"
        @step="search.step"
      />
    </header>

    <!-- pages -->
    <div ref="scroller" class="min-h-0 flex-1 overflow-auto px-2 pt-2" @scroll.passive="onScroll" @click="mark.tool.value === 'hand' && !mark.editing.value && (showBars = !showBars)">
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
          :tool="mark.editing.value ? mark.tool.value : 'hand'"
          :color="mark.color.value"
          :annots="mark.annotsFor(n)"
          :hits="search.hitsFor(n)"
          :current-hit="search.currentHitLocal(n)"
          @add="mark.add"
        />
        <div class="h-24" />
      </template>
    </div>

    <!-- page pill + vertical seek bar -->
    <div v-if="doc && pageCount > 0" class="pointer-events-none absolute top-20 right-2 z-10 flex flex-col items-center gap-2" :class="showBars ? '' : 'opacity-0'">
      <span class="rounded-lg bg-black/55 px-2 py-0.5 text-xs font-medium text-white">{{ current }} / {{ pageCount }}</span>
      <input
        v-if="pageCount > 1"
        type="range" min="1" :max="pageCount" :value="current" :aria-label="t('reader.page')"
        class="pointer-events-auto h-[45vh] w-6 accent-primary [direction:rtl] [writing-mode:vertical-lr]"
        style="direction: ltr"
        @input="goTo(Number(($event.target as HTMLInputElement).value))"
      />
    </div>

    <!-- bottom bar: zoom + thumbnails (read mode) / annotate tools (edit mode) -->
    <footer v-if="doc && showBars" class="safe-bottom z-20 flex-none bg-white shadow-[0_-1px_6px_rgba(0,0,0,.08)]">
      <AnnotateBar
        v-if="mark.editing.value"
        v-model:tool="mark.tool.value"
        v-model:color="mark.color.value"
        :can-undo="mark.annots.value.length > 0"
        :can-redo="mark.undone.value.length > 0"
        :can-save="mark.annots.value.length > 0"
        :saving="mark.saving.value"
        @undo="mark.undo"
        @redo="mark.redo"
        @save="mark.save"
      />
      <div v-else class="flex h-12 items-center justify-between px-3">
        <button class="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink/70 active:bg-surface" @click="thumbsOpen = true"><Ic name="thumbs" :size="20" /> {{ t('reader.pages') }}</button>
        <div class="flex items-center gap-1">
          <button class="grid size-9 place-items-center rounded-full disabled:opacity-25 active:bg-surface" :disabled="zoom <= 1" :aria-label="t('reader.zoomOut')" @click="setZoom(zoom - 0.5)"><Ic name="zoomOut" :size="20" /></button>
          <span class="w-12 text-center text-xs text-ink/60">{{ Math.round(zoom * 100) }}%</span>
          <button class="grid size-9 place-items-center rounded-full disabled:opacity-25 active:bg-surface" :disabled="zoom >= 3" :aria-label="t('reader.zoomIn')" @click="setZoom(zoom + 0.5)"><Ic name="zoomIn" :size="20" /></button>
        </div>
        <button class="rounded-xl px-3 py-2 text-sm font-medium text-ink/70 active:bg-surface" @click="jump">{{ t('reader.goTo') }}</button>
      </div>
    </footer>

    <!-- thumbnail drawer -->
    <Teleport to="body">
      <div v-if="thumbsOpen && doc" class="fixed inset-0 z-40 flex bg-black/45" @click.self="thumbsOpen = false">
        <aside class="safe-top h-full w-[72%] max-w-xs overflow-y-auto bg-white p-3">
          <h2 class="mb-2 px-1 text-base font-semibold text-ink-strong">{{ t('reader.pages') }}</h2>
          <div class="grid grid-cols-2 gap-2">
            <PageThumb v-for="n in pageCount" :key="n" :doc="doc" :page-no="n" :current="n === current" @click="goTo(n); thumbsOpen = false" />
          </div>
        </aside>
      </div>
    </Teleport>

    <BottomSheet :open="menuOpen" :title="file?.name" @close="menuOpen = false">
      <div class="divide-y divide-line/40 text-sm">
        <button class="flex w-full items-center gap-3 py-3" @click="jump"><Ic name="next" :size="20" /> {{ t('reader.jump') }}</button>
        <button v-if="file" class="flex w-full items-center gap-3 py-3" @click="menuAction((f) => lib.toggleFavorite(f.id))"><Ic name="star" :size="20" /> {{ file.favorite ? t('common.removeFavourite') : t('common.addFavourite') }}</button>
        <button class="flex w-full items-center gap-3 py-3" @click="menuAction(fileActions.share)"><Ic name="share" :size="20" /> {{ t('common.share') }}</button>
        <button class="flex w-full items-center gap-3 py-3" @click="menuAction(fileActions.saveCopy)"><Ic name="download" :size="20" /> {{ t('common.saveToDevice') }}</button>
      </div>
    </BottomSheet>
  </div>
</template>
