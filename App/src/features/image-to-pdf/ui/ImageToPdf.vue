<script setup lang="ts">
import { t } from '@/shared/i18n'
import { ref } from 'vue'
import { ToolBar, BottomAction } from '@/shared/ui'
import { FileSelect, ResultSheet, useLibrary, ACCEPT_IMAGE, savePdf, useRunner } from '@/entities/file'
import { PAGE_SIZES, type PageSizeKey, imagesToPdf, normalizeImage, type RasterImage } from '@/entities/pdf'
import { timestamp } from '@/shared/lib/format'

const lib = useLibrary()
const { busy, progress, result, run } = useRunner()
const ids = ref<string[]>([])
const size = ref<PageSizeKey>('A4')
const sizes = Object.keys(PAGE_SIZES) as PageSizeKey[]

function create() {
  void run(async () => {
    const images: RasterImage[] = []
    for (const [i, id] of ids.value.entries()) {
      progress.value = t('img2pdf.image', { i: i + 1, n: ids.value.length })
      images.push(await normalizeImage(await lib.blobOf(id)))
    }
    progress.value = t('img2pdf.building')
    return [await savePdf(`images_${timestamp()}`, await imagesToPdf(images, size.value))]
  })
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar :title="t('img2pdf.title')" :subtitle="t('img2pdf.selected', { n: ids.length })" />
    <FileSelect v-model="ids" :files="lib.images" :accept="ACCEPT_IMAGE" multiple ordered :empty-text="t('img2pdf.noImages')" />
    <div class="flex-none border-t border-line/50 px-4 py-3">
      <p class="mb-2 text-xs font-medium text-ink/55">{{ t('img2pdf.pageSize') }}</p>
      <div class="flex gap-2 overflow-x-auto">
        <button v-for="s in sizes" :key="s" class="flex-none rounded-full px-4 py-1.5 text-sm font-medium"
          :class="size === s ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="size = s">
          {{ s }}
        </button>
      </div>
    </div>
    <BottomAction :label="busy ? progress || t('common.working') : t('img2pdf.create')" :busy="busy" :disabled="!ids.length" @click="create" />
    <ResultSheet :files="result" :title="t('img2pdf.success')" @close="result = []; ids = []" />
  </div>
</template>
