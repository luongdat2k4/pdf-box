<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import ToolBar from '@/components/ToolBar.vue'
import FileSelect from '@/components/FileSelect.vue'
import BottomAction from '@/components/BottomAction.vue'
import ResultSheet from '@/components/ResultSheet.vue'
import { useLibrary } from '@/stores/library'
import { elementToPdf, officeToHtml } from '@/lib/office'
import { savePdf, useRunner } from '@/lib/useRunner'
import { stripExt } from '@/lib/format'

const lib = useLibrary()
const { busy, progress, result, run } = useRunner()
const ids = ref<string[]>([])
const html = ref('')
const stage = ref<HTMLElement | null>(null)
const files = computed(() => lib.documents.filter((f) => f.kind !== 'ppt'))
const accept = '.doc,.docx,.dot,.dotx,.dotm,.xls,.xlsx,.xlt,.xltx,.xltm,.xlsm,.txt'

function convert() {
  const f = ids.value[0] ? lib.find(ids.value[0]) : undefined
  if (!f) return
  void run(async () => {
    progress.value = 'Reading document…'
    html.value = await officeToHtml(f.kind, await lib.blobOf(f.id), f.name)
    await nextTick()
    progress.value = 'Rendering pages…'
    await new Promise((r) => setTimeout(r, 150)) // let images/fonts settle
    const out = await elementToPdf(stage.value!)
    html.value = ''
    return [await savePdf(stripExt(f.name), out)]
  })
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar title="Doc to PDF" subtitle="Word (.docx), Excel, TXT" />
    <FileSelect v-model="ids" :files="files" :accept="accept" empty-text="No Word, Excel or TXT files yet. Use Import to add some." />
    <p class="flex-none px-4 pb-1 text-center text-xs text-ink/50">The PDF is built from page images, so its text can't be selected or searched.</p>
    <BottomAction :label="busy ? progress || 'Converting…' : 'Convert to PDF'" :busy="busy" :disabled="!ids.length" @click="convert" />
    <!-- off-screen render target for html2canvas -->
    <div ref="stage" class="office-body pointer-events-none fixed top-0 -left-[10000px] w-[794px] bg-white p-12 text-black" v-html="html" />
    <ResultSheet :files="result" title="Converted successfully" @close="result = []; ids = []" />
  </div>
</template>
