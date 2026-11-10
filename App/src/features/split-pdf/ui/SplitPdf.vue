<script setup lang="ts">
import { t, tp } from '@/shared/i18n'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { ToolBar, BottomAction, toast } from '@/shared/ui'
import { FileSelect, ResultSheet, useLibrary, ACCEPT_PDF, savePdf, useRunner } from '@/entities/file'
import { PageThumb, type PdfSource, openWithPassword, destroyDoc, type PDFDocumentProxy, extractPages } from '@/entities/pdf'
import { errorMessage } from '@/shared/lib/error'
import { parsePageRanges, stripExt, timestamp } from '@/shared/lib/format'

const lib = useLibrary()
const { busy, result, run } = useRunner()
const ids = ref<string[]>([])
const doc = shallowRef<PDFDocumentProxy | null>(null)
const source = shallowRef<PdfSource | null>(null)
const selected = ref<number[]>([]) // 1-based, kept sorted
const rangeText = ref('')
const loading = ref(false)

const file = computed(() => (ids.value[0] ? lib.find(ids.value[0]) : undefined))
const pageCount = computed(() => doc.value?.numPages ?? 0)

async function next() {
  if (!file.value) return
  loading.value = true
  try {
    const opened = await openWithPassword(await lib.bytesOf(file.value.id), file.value.name)
    if (!opened) return
    doc.value = opened.doc
    source.value = opened.source
    selected.value = []
  } catch (e) { toast(errorMessage(e), true) } finally { loading.value = false }
}

function toggle(n: number) {
  selected.value = selected.value.includes(n) ? selected.value.filter((x) => x !== n) : [...selected.value, n].sort((a, b) => a - b)
}

function applyRange() {
  const idx = parsePageRanges(rangeText.value, pageCount.value)
  if (!idx) return toast(t('split.invalidRange'), true)
  selected.value = idx.map((i) => i + 1)
}

function split() {
  const src = source.value
  const f = file.value
  if (!src || !f) return
  void run(async () => {
    const out = await extractPages(src, selected.value.map((n) => n - 1))
    return [await savePdf(`${stripExt(f.name)}_split_${timestamp()}`, out)]
  })
}

function reset() {
  void destroyDoc(doc.value)
  doc.value = null
  source.value = null
  selected.value = []
}

onBeforeUnmount(reset)
</script>

<template>
  <div class="flex h-full flex-col bg-card">
    <ToolBar :title="t('split.title')" :subtitle="doc ? t('split.subtitle', { name: file?.name ?? '', n: pageCount }) : t('split.choose')">
      <template v-if="doc" #actions>
        <button class="rounded-full px-3 py-1.5 text-sm font-medium text-primary active:bg-surface" @click="selected = selected.length === pageCount ? [] : Array.from({ length: pageCount }, (_, i) => i + 1)">
          {{ selected.length === pageCount ? t('common.clear') : t('common.all') }}
        </button>
      </template>
    </ToolBar>

    <template v-if="!doc">
      <FileSelect v-model="ids" :files="lib.pdfs" :accept="ACCEPT_PDF" :empty-text="t('common.noPdf')" />
      <BottomAction :label="t('common.next')" :busy="loading" :disabled="!ids.length" @click="next" />
    </template>

    <template v-else>
      <div class="flex flex-none gap-2 px-3 py-2">
        <input v-model="rangeText" :placeholder="t('split.placeholder')" class="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" @keydown.enter="applyRange" />
        <button class="rounded-xl bg-surface-strong px-4 text-sm font-semibold text-primary" @click="applyRange">{{ t('common.select') }}</button>
      </div>
      <div class="grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto px-3 pb-3">
        <PageThumb v-for="n in pageCount" :key="n" :doc="doc" :page-no="n" selectable :selected="selected.includes(n)" @click="toggle(n)" />
      </div>
      <BottomAction :label="tp('split.action', selected.length)" :busy="busy" :disabled="!selected.length" @click="split" />
    </template>

    <ResultSheet :files="result" :title="t('split.success')" @close="result = []; reset(); ids = []" />
  </div>
</template>
