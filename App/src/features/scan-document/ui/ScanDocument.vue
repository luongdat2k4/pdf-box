<script setup lang="ts">
import { t, tp } from '@/shared/i18n'
import { onBeforeUnmount, ref } from 'vue'
import ScanCameraView from './ScanCameraView.vue'
import { ToolBar, BottomAction, Ic } from '@/shared/ui'
import { ResultSheet, savePdf, useRunner } from '@/entities/file'
import { imagesToPdf, type RasterImage, PAGE_SIZES, type PageSizeKey, canvasToBlob } from '@/entities/pdf'
import { timestamp } from '@/shared/lib/format'
import { expectExternal } from '@/shared/ads'

interface Shot { id: number; blob: Blob; url: string }

const { busy, progress, result, run } = useRunner()
const shots = ref<Shot[]>([])
const size = ref<PageSizeKey>('A4')
const sizes = Object.keys(PAGE_SIZES) as PageSizeKey[]
const cameraOpen = ref(true)
const galleryInput = ref<HTMLInputElement | null>(null)
// The gallery picker leaves the app; coming back from it shows no app-open ad.
function pickFromGallery() {
  expectExternal()
  galleryInput.value?.click()
}
let nextId = 1

function add(blob: Blob) {
  shots.value.push({ id: nextId++, blob, url: URL.createObjectURL(blob) })
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  for (const f of input.files ?? []) add(f)
  input.value = ''
}

function clearShots() {
  shots.value.forEach((s) => URL.revokeObjectURL(s.url))
  shots.value = []
}

function remove(id: number) {
  const s = shots.value.find((x) => x.id === id)
  if (s) URL.revokeObjectURL(s.url)
  shots.value = shots.value.filter((x) => x.id !== id)
}

function move(i: number, d: -1 | 1) {
  const j = i + d
  if (j < 0 || j >= shots.value.length) return
  const next = [...shots.value]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  shots.value = next
}

/**
 * One scanned page, in colour and upright. Camera JPEGs keep the sensor's landscape pixels plus an EXIF
 * rotation that pdf-lib ignores, so the photo is redrawn with that rotation applied; a page that is still
 * wider than tall is then turned a quarter clockwise, so every page comes out portrait.
 */
async function toPortrait(blob: Blob): Promise<RasterImage> {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  const maxSide = 2200
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  const turn = w > h
  const c = document.createElement('canvas')
  c.width = turn ? h : w
  c.height = turn ? w : h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  if (turn) {
    ctx.translate(c.width, 0)
    ctx.rotate(Math.PI / 2)
  }
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return { bytes: new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.9)).arrayBuffer()), kind: 'jpg' }
}

function create() {
  void run(async () => {
    const images: RasterImage[] = []
    for (const [i, s] of shots.value.entries()) {
      progress.value = t('scan.page', { i: i + 1, n: shots.value.length })
      images.push(await toPortrait(s.blob))
    }
    return [await savePdf(`scan_${timestamp()}`, await imagesToPdf(images, size.value))]
  })
}

onBeforeUnmount(() => shots.value.forEach((s) => URL.revokeObjectURL(s.url)))
</script>

<template>
  <ScanCameraView v-if="cameraOpen" :count="shots.length" :thumbnail="shots[shots.length - 1]?.url" @shot="add" @close="cameraOpen = false" @gallery="cameraOpen = false; pickFromGallery()" />
  <div v-else class="flex h-full flex-col bg-card">
    <ToolBar :title="t('scan.title')" :subtitle="tp('scan.pages', shots.length)" />

    <main class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-if="!shots.length" class="grid h-full place-items-center px-8 text-center text-sm text-ink/50">
        <div>
          <Ic name="scan" :size="56" class="mx-auto text-surface-strong" />
          <p class="mt-3">{{ t('scan.intro') }}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div v-for="(s, i) in shots" :key="s.id" class="relative rounded-2xl bg-surface p-2">
          <img :src="s.url" class="aspect-[3/4] w-full rounded-lg bg-white object-contain" alt="" />
          <span class="absolute top-3 left-3 rounded-full bg-primary px-2 text-xs font-semibold text-white">{{ i + 1 }}</span>
          <div class="mt-1.5 flex items-center justify-between">
            <button class="grid size-8 place-items-center rounded-full text-ink/60 disabled:opacity-25 active:bg-card" :disabled="i === 0" :aria-label="t('scan.moveEarlier')" @click="move(i, -1)"><Ic name="back" :size="18" /></button>
            <button class="grid size-8 place-items-center rounded-full text-danger active:bg-card" :aria-label="t('scan.deletePage')" @click="remove(s.id)"><Ic name="trash" :size="18" /></button>
            <button class="grid size-8 place-items-center rounded-full text-ink/60 disabled:opacity-25 active:bg-card" :disabled="i === shots.length - 1" :aria-label="t('scan.moveLater')" @click="move(i, 1)"><Ic name="next" :size="18" /></button>
          </div>
        </div>
      </div>
    </main>

    <div class="flex-none space-y-3 border-t border-line/50 px-4 py-3">
      <div class="flex gap-2">
        <button class="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-strong text-sm font-semibold text-primary active:opacity-80" @click="cameraOpen = true"><Ic name="camera" :size="20" /> {{ t('scan.camera') }}</button>
        <button class="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-semibold text-primary active:opacity-80" @click="pickFromGallery()"><Ic name="image" :size="20" /> {{ t('scan.gallery') }}</button>
      </div>
      <div class="flex items-center gap-2">
        <p class="flex-1 text-xs font-medium text-ink/55">{{ t('img2pdf.pageSize') }}</p>
        <button v-for="s in sizes.slice(0, 3)" :key="s" class="rounded-full px-3 py-1.5 text-sm font-medium" :class="size === s ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="size = s">{{ s }}</button>
      </div>
    </div>
    <BottomAction :label="busy ? progress || t('common.working') : t('img2pdf.create')" :busy="busy" :disabled="!shots.length" @click="create" />

    <ResultSheet :files="result" :title="t('scan.saved')" @close="result = []; clearShots()" />
  </div>
  <input ref="galleryInput" type="file" accept="image/*" multiple class="hidden" @change="onFiles" />
</template>
