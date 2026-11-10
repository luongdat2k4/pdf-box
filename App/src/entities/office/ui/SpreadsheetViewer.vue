<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { t } from '@/shared/i18n'
import { Ic } from '@/shared/ui'
import { cellDetails, columnLabel, gridCells, sheetLayout, visibleRange, scrollAxis,
  ROW_HEIGHT, ROW_HEADER, COLUMN_HEADER, type GridCell, type SheetLayout, type SpreadsheetBook } from '../lib/spreadsheet'
import SpreadsheetCells from './SpreadsheetCells.vue'

const props = defineProps<{ book: SpreadsheetBook }>()
const sheetNames = computed(() => props.book.SheetNames.filter((name) =>
  !props.book.Workbook?.Sheets?.find((sheet) => sheet.name === name)?.Hidden))
const active = ref(sheetNames.value[0] ?? '')
const layouts = new WeakMap<SheetLayout['sheet'], SheetLayout>()
const layout = computed(() => {
  const sheet = props.book.Sheets[active.value]
  if (!sheet) return null
  let result = layouts.get(sheet)
  if (!result) { result = sheetLayout(sheet); layouts.set(sheet, result) }
  return result
})
const viewport = ref<HTMLElement | null>(null)
const width = ref(0)
const height = ref(0)
const physicalLeft = ref(0)
const physicalTop = ref(0)
const zoomPercent = ref(100)
const zoom = computed(() => zoomPercent.value / 100)
const freezeRow = ref(false)
const freezeColumn = ref(false)
const expanded = ref(false)
const selection = ref({ row: 0, column: 0 })
const saved = new Map<string, { left: number; top: number; row: number; column: number }>()
const xAxis = computed(() => scrollAxis(ROW_HEADER + (layout.value?.offsets.at(-1) ?? 0) * zoom.value, width.value, physicalLeft.value))
const yAxis = computed(() => scrollAxis(COLUMN_HEADER + (layout.value?.rows ?? 0) * ROW_HEIGHT * zoom.value, height.value, physicalTop.value))
const left = computed(() => xAxis.value.offset)
const top = computed(() => yAxis.value.offset)
const range = computed(() => layout.value ? visibleRange(layout.value, left.value, top.value,
  Math.max(0, width.value - ROW_HEADER), Math.max(0, height.value - COLUMN_HEADER), zoom.value) : null)
const cells = computed(() => layout.value && range.value ? gridCells(layout.value, range.value) : [])
const firstRow = computed(() => layout.value && range.value && freezeRow.value
  ? gridCells(layout.value, { s: { r: 0, c: range.value.s.c }, e: { r: 0, c: range.value.e.c } }) : [])
const firstColumn = computed(() => layout.value && range.value && freezeColumn.value
  ? gridCells(layout.value, { s: { r: range.value.s.r, c: 0 }, e: { r: range.value.e.r, c: 0 } }) : [])
const corner = computed(() => layout.value && freezeColumn.value && freezeRow.value
  ? [cellDetails(layout.value, 0, 0)] : [])
const frozenWidth = computed(() => (layout.value?.offsets[1] ?? 0) * zoom.value)
const selected = computed(() => layout.value ? cellDetails(layout.value, selection.value.row, selection.value.column) : null)
const columns = computed(() => range.value ? Array.from({ length: Math.max(0, range.value.e.c - range.value.s.c + 1) }, (_, i) => i + range.value!.s.c) : [])
const rows = computed(() => range.value ? Array.from({ length: Math.max(0, range.value.e.r - range.value.s.r + 1) }, (_, i) => i + range.value!.s.r) : [])
let observer: ResizeObserver | undefined
let frame = 0

function measure() {
  const el = viewport.value
  if (!el) return
  width.value = el.clientWidth; height.value = el.clientHeight
  physicalLeft.value = el.scrollLeft; physicalTop.value = el.scrollTop
}
function onScroll() {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure() })
}
function position(x: number, y: number) {
  if (!viewport.value) return
  viewport.value.scrollLeft = x / xAxis.value.ratio
  viewport.value.scrollTop = y / yAxis.value.ratio
  measure()
}
function select(cell: GridCell) {
  selection.value = { row: cell.row, column: cell.column }
  viewport.value?.focus({ preventScroll: true })
}
async function changeSheet(name: string) {
  saved.set(active.value, { left: left.value, top: top.value, ...selection.value })
  active.value = name
  expanded.value = false
  await nextTick()
  const state = saved.get(name)
  const start = layout.value?.range?.s ?? { r: 0, c: 0 }
  selection.value = { row: state?.row ?? start.r, column: state?.column ?? start.c }
  position(state?.left ?? (layout.value?.offsets[start.c] ?? 0) * zoom.value,
    state?.top ?? start.r * ROW_HEIGHT * zoom.value)
}
watch(zoom, async (value, previous) => {
  const x = scrollAxis(ROW_HEADER + (layout.value?.offsets.at(-1) ?? 0) * previous, width.value, physicalLeft.value).offset / previous * value
  const y = scrollAxis(COLUMN_HEADER + (layout.value?.rows ?? 0) * ROW_HEIGHT * previous, height.value, physicalTop.value).offset / previous * value
  await nextTick()
  position(x, y)
})
async function onKey(event: KeyboardEvent) {
  if (!layout.value || !selected.value) return
  const current = selected.value
  let row = current.row
  let column = current.column
  if (event.key === 'ArrowDown') row += current.rowSpan
  else if (event.key === 'ArrowUp') row--
  else if (event.key === 'ArrowRight') column += current.colSpan
  else if (event.key === 'ArrowLeft') column--
  else if (event.key === 'Home') column = 0
  else if (event.key === 'End') column = layout.value.columns - 1
  else if (event.key === 'Enter') { expanded.value = !expanded.value; event.preventDefault(); return }
  else return
  event.preventDefault()
  row = Math.max(0, Math.min(layout.value.rows - 1, row))
  column = Math.max(0, Math.min(layout.value.columns - 1, column))
  selection.value = { row, column }
  const target = selected.value!
  let x = left.value
  let y = top.value
  const px = target.left * zoom.value
  const py = target.top * zoom.value
  if (!(freezeColumn.value && target.column === 0)) {
    if (px < x + (freezeColumn.value ? frozenWidth.value : 0)) x = Math.max(0, px - (freezeColumn.value ? frozenWidth.value : 0))
    else if (px + target.width * zoom.value > x + width.value - ROW_HEADER) x = px + target.width * zoom.value - width.value + ROW_HEADER
  }
  if (!(freezeRow.value && target.row === 0)) {
    if (py < y + (freezeRow.value ? ROW_HEIGHT * zoom.value : 0)) y = Math.max(0, py - (freezeRow.value ? ROW_HEIGHT * zoom.value : 0))
    else if (py + target.height * zoom.value > y + height.value - COLUMN_HEADER) y = py + target.height * zoom.value - height.value + COLUMN_HEADER
  }
  await nextTick()
  position(x, y)
}
onMounted(async () => {
  observer = new ResizeObserver(measure)
  if (viewport.value) observer.observe(viewport.value)
  measure()
  const start = layout.value?.range?.s ?? { r: 0, c: 0 }
  selection.value = { row: start.r, column: start.c }
  await nextTick()
  position((layout.value?.offsets[start.c] ?? 0) * zoom.value, start.r * ROW_HEIGHT * zoom.value)
})
onBeforeUnmount(() => { observer?.disconnect(); if (frame) cancelAnimationFrame(frame) })
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-card">
    <div class="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-3 py-1.5 text-xs">
      <label class="flex min-h-9 items-center gap-1.5"><input v-model="freezeRow" type="checkbox" class="accent-emerald-600" />{{ t('sheet.freezeRow') }}</label>
      <label class="flex min-h-9 items-center gap-1.5"><input v-model="freezeColumn" type="checkbox" class="accent-emerald-600" />{{ t('sheet.freezeColumn') }}</label>
      <label class="ml-auto flex min-h-9 items-center gap-1"><span class="sr-only">{{ t('sheet.zoom') }}</span>
        <select v-model.number="zoomPercent" class="rounded border border-line bg-card px-1 py-1.5" :aria-label="t('sheet.zoom')">
          <option v-for="value in [50, 75, 100, 125, 150, 200]" :key="value" :value="value">{{ value }}%</option>
        </select>
      </label>
    </div>
    <div v-if="selected" class="flex-none border-b border-line">
      <button class="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm" :aria-expanded="expanded" :aria-label="t('sheet.cellDetails')" @click="expanded = !expanded">
        <span class="rounded bg-emerald-50 px-2 py-1 font-mono text-xs font-semibold text-emerald-700">{{ selected.address }}</span>
        <span class="min-w-0 flex-1 truncate text-ink/70">{{ selected.text || (selected.formula ? t('sheet.noCachedValue') : t('sheet.emptyCell')) }}</span>
        <Ic :name="expanded ? 'up' : 'down'" :size="16" />
      </button>
      <div v-if="expanded" class="max-h-[28vh] overflow-auto border-t border-line/50 bg-surface px-4 py-3 text-sm select-text">
        <p class="whitespace-pre-wrap break-words">{{ selected.text || (selected.formula ? t('sheet.noCachedValue') : t('sheet.emptyCell')) }}</p>
        <p v-if="selected.formula" class="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-ink/60">{{ selected.formula }}</p>
      </div>
    </div>
    <div v-if="layout" class="relative min-h-0 flex-1 overflow-hidden bg-surface">
      <div ref="viewport" role="grid" tabindex="0" :aria-label="active" :aria-readonly="true" :aria-rowcount="layout.rows" :aria-colcount="layout.columns"
        class="absolute inset-0 z-0 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        @scroll.passive="onScroll" @keydown="onKey">
        <div class="relative" :style="{ width: `${xAxis.extent}px`, height: `${yAxis.extent}px` }">
          <SpreadsheetCells :cells="cells" :zoom="zoom" :left="ROW_HEADER + physicalLeft - left" :top="COLUMN_HEADER + physicalTop - top" :selected="selected?.address ?? ''" @select="select" />
        </div>
      </div>
      <div aria-hidden="true" class="pointer-events-none absolute top-0 right-0 z-30 overflow-hidden border-b border-line bg-surface" :style="{ left: `${ROW_HEADER}px`, height: `${COLUMN_HEADER}px` }">
        <div v-for="column in columns" :key="column" class="absolute top-0 grid h-full place-items-center border-r border-line text-xs text-ink/60"
          :style="{ left: `${layout.offsets[column]! * zoom - left}px`, width: `${(layout.offsets[column + 1]! - layout.offsets[column]!) * zoom}px` }">{{ columnLabel(column) }}</div>
        <div v-if="freezeColumn" class="absolute inset-y-0 left-0 grid place-items-center border-r border-line bg-surface text-xs" :style="{ width: `${frozenWidth}px` }">A</div>
      </div>
      <div aria-hidden="true" class="pointer-events-none absolute bottom-0 left-0 z-30 overflow-hidden border-r border-line bg-surface" :style="{ top: `${COLUMN_HEADER}px`, width: `${ROW_HEADER}px` }">
        <div v-for="row in rows" :key="row" class="absolute left-0 grid w-full place-items-center border-b border-line text-[11px] text-ink/60"
          :style="{ top: `${row * ROW_HEIGHT * zoom - top}px`, height: `${ROW_HEIGHT * zoom}px` }">{{ row + 1 }}</div>
        <div v-if="freezeRow" class="absolute top-0 left-0 grid w-full place-items-center border-b border-line bg-surface text-[11px]" :style="{ height: `${ROW_HEIGHT * zoom}px` }">1</div>
      </div>
      <div aria-hidden="true" class="pointer-events-none absolute top-0 left-0 z-40 border-r border-b border-line bg-surface" :style="{ width: `${ROW_HEADER}px`, height: `${COLUMN_HEADER}px` }" />
      <div v-if="freezeRow" aria-hidden="true" class="absolute right-0 z-10 overflow-hidden border-b-2 border-emerald-700/30" :style="{ top: `${COLUMN_HEADER}px`, left: `${ROW_HEADER}px`, height: `${ROW_HEIGHT * zoom}px` }">
        <SpreadsheetCells :cells="firstRow" :zoom="zoom" :left="-left" :top="0" :selected="selected?.address ?? ''" @select="select" />
      </div>
      <div v-if="freezeColumn" aria-hidden="true" class="absolute bottom-0 z-10 overflow-hidden border-r-2 border-emerald-700/30" :style="{ top: `${COLUMN_HEADER}px`, left: `${ROW_HEADER}px`, width: `${frozenWidth}px` }">
        <SpreadsheetCells :cells="firstColumn" :zoom="zoom" :left="0" :top="-top" :selected="selected?.address ?? ''" @select="select" />
      </div>
      <div v-if="freezeRow && freezeColumn" aria-hidden="true" class="absolute z-20 overflow-hidden border-r-2 border-b-2 border-emerald-700/30" :style="{ top: `${COLUMN_HEADER}px`, left: `${ROW_HEADER}px`, width: `${frozenWidth}px`, height: `${ROW_HEIGHT * zoom}px` }">
        <SpreadsheetCells :cells="corner" :zoom="zoom" :left="0" :top="0" :selected="selected?.address ?? ''" @select="select" />
      </div>
    </div>
    <p v-else class="flex-1 p-6 text-center text-sm text-ink/50">{{ t('sheet.noSheets') }}</p>
    <footer class="safe-bottom flex-none border-t border-line bg-card">
      <nav role="tablist" :aria-label="t('sheet.sheets')" class="flex gap-1 overflow-x-auto px-2 py-1">
        <button v-for="name in sheetNames" :key="name" role="tab" :aria-selected="active === name" class="min-h-11 max-w-56 flex-none truncate rounded-lg px-4 text-sm font-medium"
          :class="active === name ? 'bg-emerald-50 text-emerald-700' : 'text-ink/60'" @click="changeSheet(name)">{{ name }}</button>
      </nav>
      <p v-if="layout" class="px-3 pb-1 text-[11px] text-ink/45">{{ layout.range ? t('sheet.dimensions', { rows: layout.rows, columns: layout.columns }) : t('sheet.emptySheet') }}</p>
    </footer>
  </section>
</template>
