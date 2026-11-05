<script setup lang="ts">
import { ref } from 'vue'
import ToolBar from '@/components/ToolBar.vue'
import FileSelect from '@/components/FileSelect.vue'
import BottomAction from '@/components/BottomAction.vue'
import ResultSheet from '@/components/ResultSheet.vue'
import { useLibrary } from '@/stores/library'
import { ACCEPT_IMAGE, PAGE_SIZES, type PageSizeKey } from '@/lib/types'
import { imagesToPdf, normalizeImage, type RasterImage } from '@/lib/pdfOps'
import { savePdf, useRunner } from '@/lib/useRunner'
import { timestamp } from '@/lib/format'

const lib = useLibrary()
const { busy, progress, result, run } = useRunner()
const ids = ref<string[]>([])
const size = ref<PageSizeKey>('A4')
const sizes = Object.keys(PAGE_SIZES) as PageSizeKey[]

function create() {
  void run(async () => {
    const images: RasterImage[] = []
    for (const [i, id] of ids.value.entries()) {
      progress.value = `Image ${i + 1} / ${ids.value.length}`
      images.push(await normalizeImage(await lib.blobOf(id)))
    }
    progress.value = 'Building PDF…'
    return [await savePdf(`images_${timestamp()}`, await imagesToPdf(images, size.value))]
  })
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar title="Image to PDF" :subtitle="`${ids.length} selected`" />
    <FileSelect v-model="ids" :files="lib.images" :accept="ACCEPT_IMAGE" multiple ordered empty-text="No images yet. Use Import to add some." />
    <div class="flex-none border-t border-line/50 px-4 py-3">
      <p class="mb-2 text-xs font-medium text-ink/55">Page size</p>
      <div class="flex gap-2 overflow-x-auto">
        <button v-for="s in sizes" :key="s" class="flex-none rounded-full px-4 py-1.5 text-sm font-medium"
          :class="size === s ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="size = s">
          {{ s }}
        </button>
      </div>
    </div>
    <BottomAction :label="busy ? progress || 'Working…' : 'Create PDF'" :busy="busy" :disabled="!ids.length" @click="create" />
    <ResultSheet :files="result" title="PDF created" @close="result = []; ids = []" />
  </div>
</template>
