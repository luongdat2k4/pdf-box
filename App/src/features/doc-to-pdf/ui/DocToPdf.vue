<script setup lang="ts">
import { t } from '@/shared/i18n'
import { computed, nextTick, ref } from 'vue'
import { ToolBar, BottomAction } from '@/shared/ui'
import { FileSelect, ResultSheet, useLibrary, savePdf, useRunner } from '@/entities/file'
import { elementToPdf } from '../model/element-to-pdf'
import { officeToHtml } from '@/entities/office'
import { stripExt } from '@/shared/lib/format'

const lib = useLibrary()
const { busy, progress, result, run } = useRunner()
const ids = ref<string[]>([])
const html = ref('')
const stage = ref<HTMLElement | null>(null)
const files = computed(() => lib.documents.filter((f) => f.kind !== 'ppt'))
const accept = '.doc,.docx,.dot,.dotx,.dotm,.xls,.xlsx,.xlt,.xltx,.xltm,.xlsm,.txt,.md,.markdown'

function convert() {
  const f = ids.value[0] ? lib.find(ids.value[0]) : undefined
  if (!f) return
  void run(async () => {
    progress.value = t('doc2pdf.reading')
    html.value = await officeToHtml(f.kind, await lib.blobOf(f.id), f.name)
    await nextTick()
    progress.value = t('doc2pdf.rendering')
    await new Promise((r) => setTimeout(r, 150)) // let images/fonts settle
    const out = await elementToPdf(stage.value!)
    html.value = ''
    return [await savePdf(stripExt(f.name), out)]
  })
}
</script>

<template>
  <div class="flex h-full flex-col bg-card">
    <ToolBar :title="t('doc2pdf.title')" :subtitle="t('doc2pdf.subtitle')" />
    <FileSelect v-model="ids" :files="files" :accept="accept" :empty-text="t('doc2pdf.empty')" />
    <p class="flex-none px-4 pb-1 text-center text-xs text-ink/50">{{ t('doc2pdf.note') }}</p>
    <BottomAction :label="busy ? progress || t('common.converting') : t('doc2pdf.action')" :busy="busy" :disabled="!ids.length" @click="convert" />
    <!-- off-screen render target for html2canvas -->
    <div ref="stage" class="office-body light-tokens pointer-events-none fixed top-0 -left-[10000px] w-[794px] bg-white p-12 text-black" v-html="html" />
    <ResultSheet :files="result" :title="t('pdf2img.success')" @close="result = []; ids = []" />
  </div>
</template>
