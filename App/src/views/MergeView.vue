<script setup lang="ts">
import { computed, ref } from 'vue'
import ToolBar from '@/components/ToolBar.vue'
import FileSelect from '@/components/FileSelect.vue'
import FileRow from '@/components/FileRow.vue'
import BottomAction from '@/components/BottomAction.vue'
import ResultSheet from '@/components/ResultSheet.vue'
import Ic from '@/components/Ic.vue'
import { useLibrary } from '@/stores/library'
import { ACCEPT_PDF, type PdfSource } from '@/lib/types'
import { loadPdfSource } from '@/lib/pdfAccess'
import { mergePdfs } from '@/lib/pdfOps'
import { savePdf, useRunner } from '@/lib/useRunner'
import { askConfirm, toast } from '@/lib/dialogs'
import { timestamp } from '@/lib/format'
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
      progress.value = `Reading ${f.name}`
      const s = await loadPdfSource(f)
      if (!s) { toast('Merge cancelled'); return null }
      sources.push({ bytes: s.bytes, password: s.password })
    }
    progress.value = 'Merging…'
    const out = await mergePdfs(sources)
    return [await savePdf(name.value.trim() || `merged_${timestamp()}`, out)]
  })
}

onBeforeRouteLeave(async () => {
  if (step.value === 'order' && ids.value.length && !result.value.length) {
    return askConfirm('Discard changes?', 'Your selection will be lost.', 'Leave')
  }
})
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar title="Merge PDF" :subtitle="step === 'select' ? 'Select two or more files' : `${files.length} files · reorder with the arrows`" />

    <template v-if="step === 'select'">
      <FileSelect v-model="ids" :files="lib.pdfs" :accept="ACCEPT_PDF" multiple ordered empty-text="No PDF files yet. Use Import to add some." />
      <BottomAction :label="`Next (${ids.length})`" :disabled="ids.length < 2" hint="Files are merged in the order you tick them." @click="step = 'order'" />
    </template>

    <template v-else>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div v-for="(f, i) in files" :key="f.id" class="flex items-center">
          <FileRow :file="f" :order="i + 1" class="flex-1" />
          <div class="flex flex-none flex-col">
            <button class="grid size-8 place-items-center text-ink/60 disabled:opacity-25" :disabled="i === 0" aria-label="Move up" @click="move(i, -1)"><Ic name="up" :size="18" /></button>
            <button class="grid size-8 place-items-center text-ink/60 disabled:opacity-25" :disabled="i === files.length - 1" aria-label="Move down" @click="move(i, 1)"><Ic name="down" :size="18" /></button>
          </div>
          <button class="grid size-9 place-items-center text-danger" aria-label="Remove" @click="ids = ids.filter((x) => x !== f.id); if (ids.length < 2) step = 'select'">
            <Ic name="close" :size="18" />
          </button>
        </div>
        <button class="mx-2 mt-2 flex h-11 w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-2xl border border-dashed border-primary text-sm font-medium text-primary" @click="step = 'select'">
          <Ic name="plus" :size="18" /> Add file
        </button>
        <label class="mx-3 mt-5 block text-xs text-ink/55">Output name</label>
        <input v-model="name" class="mx-3 mt-1 w-[calc(100%-1.5rem)] rounded-xl bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <BottomAction :label="busy ? progress || 'Merging…' : 'Merge'" :busy="busy" :disabled="files.length < 2" @click="merge" />
    </template>

    <ResultSheet :files="result" title="Merged successfully" @close="result = []; ids = []; step = 'select'" />
  </div>
</template>
