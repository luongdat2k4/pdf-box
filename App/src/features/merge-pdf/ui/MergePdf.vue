<script setup lang="ts">
import { t } from '@/shared/i18n'
import { computed, ref } from 'vue'
import { ToolBar, BottomAction, Ic, askConfirm, toast, VirtualList } from '@/shared/ui'
import { FileSelect, FileRow, ResultSheet, useLibrary, ACCEPT_PDF, savePdf, useRunner } from '@/entities/file'
import { type PdfSource, mergePdfs } from '@/entities/pdf'
import { loadPdfSource } from '../model/load-pdf-source'
import { timestamp } from '@/shared/lib/format'
import { onBeforeRouteLeave } from 'vue-router'

const lib = useLibrary()
const { busy, progress, result, run } = useRunner()
const step = ref<'select' | 'order'>('select')
const ids = ref<string[]>([])
const name = ref(`merged_${timestamp()}`)

const files = computed(() => ids.value.map((id) => lib.find(id)!).filter(Boolean))

function move(i: number, d: -1 | 1) {
  const j = i + d
  if (j < 0 || j >= ids.value.length) return
  const next = [...ids.value]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  ids.value = next
}

function merge() {
  void run(async () => {
    const sources: PdfSource[] = []
    for (const f of files.value) {
      progress.value = t('merge.reading', { name: f.name })
      const s = await loadPdfSource(f)
      if (!s) { toast(t('merge.cancelled')); return null }
      sources.push({ bytes: s.bytes, password: s.password })
    }
    progress.value = t('merge.merging')
    const out = await mergePdfs(sources)
    return [await savePdf(name.value.trim() || `merged_${timestamp()}`, out)]
  })
}

onBeforeRouteLeave(async () => {
  if (step.value === 'order' && ids.value.length && !result.value.length) {
    return askConfirm(t('merge.discardTitle'), t('merge.discardMsg'), t('merge.leave'))
  }
})
</script>

<template>
  <div class="flex h-full flex-col bg-card">
    <ToolBar :title="t('merge.title')" :subtitle="step === 'select' ? t('merge.selectTwo') : t('merge.reorder', { n: files.length })" />

    <template v-if="step === 'select'">
      <FileSelect v-model="ids" :files="lib.pdfs" :accept="ACCEPT_PDF" multiple ordered :empty-text="t('common.noPdf')" />
      <BottomAction :label="t('merge.next', { n: ids.length })" :disabled="ids.length < 2" :hint="t('merge.hint')" @click="step = 'order'" />
    </template>

    <template v-else>
      <VirtualList :items="files" class="px-2" :aria-label="t('merge.title')">
        <template #default="{ item: f, index: i }">
        <div class="flex h-16 items-center">
          <FileRow :file="f" :order="i + 1" class="flex-1" />
          <div class="flex flex-none flex-col">
            <button class="grid size-8 place-items-center text-ink/60 disabled:opacity-25" :disabled="i === 0" :aria-label="t('merge.moveUp')" @click="move(i, -1)"><Ic name="up" :size="18" /></button>
            <button class="grid size-8 place-items-center text-ink/60 disabled:opacity-25" :disabled="i === files.length - 1" :aria-label="t('merge.moveDown')" @click="move(i, 1)"><Ic name="down" :size="18" /></button>
          </div>
          <button class="grid size-9 place-items-center text-danger" :aria-label="t('merge.remove')" @click="ids = ids.filter((x) => x !== f.id); if (ids.length < 2) step = 'select'">
            <Ic name="close" :size="18" />
          </button>
        </div>
        </template>
      </VirtualList>
      <div class="flex-none border-t border-line/50 px-2 pb-3">
        <button class="mx-2 mt-2 flex h-11 w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-2xl border border-dashed border-primary text-sm font-medium text-primary" @click="step = 'select'">
          <Ic name="plus" :size="18" /> {{ t('merge.addFile') }}
        </button>
        <label class="mx-3 mt-5 block text-xs text-ink/55">{{ t('merge.outputName') }}</label>
        <input v-model="name" class="mx-3 mt-1 w-[calc(100%-1.5rem)] rounded-xl bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <BottomAction :label="busy ? progress || t('merge.merging') : t('merge.action')" :busy="busy" :disabled="files.length < 2" @click="merge" />
    </template>

    <ResultSheet :files="result" :title="t('merge.success')" @close="result = []; ids = []; step = 'select'" />
  </div>
</template>
