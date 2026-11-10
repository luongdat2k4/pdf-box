<script setup lang="ts">
import { t } from '@/shared/i18n'
import { ref } from 'vue'
import { ToolBar, BottomAction } from '@/shared/ui'
import { FileSelect, ResultSheet, useLibrary, ACCEPT_PDF, useRunner } from '@/entities/file'
import { openWithPassword, destroyDoc, pdfToImages } from '@/entities/pdf'
import { stripExt } from '@/shared/lib/format'

const lib = useLibrary()
const { busy, progress, result, run } = useRunner()
const ids = ref<string[]>([])
const mode = ref<'long' | 'pages'>('pages')
const width = ref(1600)
const qualities = [{ label: 'pdf2img.standard', w: 1080 }, { label: 'pdf2img.high', w: 1600 }, { label: 'pdf2img.max', w: 2400 }] as const

function convert() {
  const f = ids.value[0] ? lib.find(ids.value[0]) : undefined
  if (!f) return
  void run(async () => {
    const opened = await openWithPassword(await lib.bytesOf(f.id), f.name)
    if (!opened) return null
    try {
      const blobs = await pdfToImages(opened.doc, {
        width: width.value, mode: mode.value,
        onProgress: (d, total) => (progress.value = t('pdf2img.page', { d, t: total })),
      })
      const base = stripExt(f.name)
      const out = []
      for (const [i, b] of blobs.entries()) {
        out.push(await lib.addBlob(mode.value === 'long' ? `${base}.jpg` : `${base}_p${i + 1}.jpg`, b))
      }
      return out
    } finally { await destroyDoc(opened.doc) }
  })
}
</script>

<template>
  <div class="flex h-full flex-col bg-card">
    <ToolBar :title="t('pdf2img.title')" :subtitle="t('pdf2img.subtitle')" />
    <FileSelect v-model="ids" :files="lib.pdfs" :accept="ACCEPT_PDF" :empty-text="t('common.noPdf')" />
    <div class="flex-none space-y-3 border-t border-line/50 px-4 py-3">
      <div>
        <p class="mb-2 text-xs font-medium text-ink/55">{{ t('pdf2img.output') }}</p>
        <div class="flex gap-2">
          <button class="flex-1 rounded-xl py-2 text-sm font-medium" :class="mode === 'pages' ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="mode = 'pages'">{{ t('pdf2img.perPage') }}</button>
          <button class="flex-1 rounded-xl py-2 text-sm font-medium" :class="mode === 'long' ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="mode = 'long'">{{ t('pdf2img.long') }}</button>
        </div>
      </div>
      <div>
        <p class="mb-2 text-xs font-medium text-ink/55">{{ t('pdf2img.quality') }}</p>
        <div class="flex gap-2">
          <button v-for="q in qualities" :key="q.w" class="flex-1 rounded-xl py-2 text-sm font-medium" :class="width === q.w ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="width = q.w">{{ q.label }}</button>
        </div>
      </div>
    </div>
    <BottomAction :label="busy ? progress || t('common.converting') : t('pdf2img.action')" :busy="busy" :disabled="!ids.length" @click="convert" />
    <ResultSheet :files="result" :title="t('pdf2img.success')" @close="result = []; ids = []" />
  </div>
</template>
