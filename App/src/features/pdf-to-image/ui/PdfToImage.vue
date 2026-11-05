<script setup lang="ts">
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
const qualities = [{ label: 'Standard', w: 1080 }, { label: 'High', w: 1600 }, { label: 'Max', w: 2400 }]

function convert() {
  const f = ids.value[0] ? lib.find(ids.value[0]) : undefined
  if (!f) return
  void run(async () => {
    const opened = await openWithPassword(await lib.bytesOf(f.id), f.name)
    if (!opened) return null
    try {
      const blobs = await pdfToImages(opened.doc, {
        width: width.value, mode: mode.value,
        onProgress: (d, t) => (progress.value = `Page ${d} / ${t}`),
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
  <div class="flex h-full flex-col bg-white">
    <ToolBar title="PDF to Image" subtitle="Export pages as JPEG" />
    <FileSelect v-model="ids" :files="lib.pdfs" :accept="ACCEPT_PDF" empty-text="No PDF files yet. Use Import to add some." />
    <div class="flex-none space-y-3 border-t border-line/50 px-4 py-3">
      <div>
        <p class="mb-2 text-xs font-medium text-ink/55">Output</p>
        <div class="flex gap-2">
          <button class="flex-1 rounded-xl py-2 text-sm font-medium" :class="mode === 'pages' ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="mode = 'pages'">One image per page</button>
          <button class="flex-1 rounded-xl py-2 text-sm font-medium" :class="mode === 'long' ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="mode = 'long'">One long image</button>
        </div>
      </div>
      <div>
        <p class="mb-2 text-xs font-medium text-ink/55">Quality</p>
        <div class="flex gap-2">
          <button v-for="q in qualities" :key="q.w" class="flex-1 rounded-xl py-2 text-sm font-medium" :class="width === q.w ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="width = q.w">{{ q.label }}</button>
        </div>
      </div>
    </div>
    <BottomAction :label="busy ? progress || 'Converting…' : 'Convert'" :busy="busy" :disabled="!ids.length" @click="convert" />
    <ResultSheet :files="result" title="Converted successfully" @close="result = []; ids = []" />
  </div>
</template>
