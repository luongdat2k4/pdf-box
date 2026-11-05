<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import ToolBar from '@/components/ToolBar.vue'
import BottomAction from '@/components/BottomAction.vue'
import ResultSheet from '@/components/ResultSheet.vue'
import Ic from '@/components/Ic.vue'
import { imagesToPdf, normalizeImage, type RasterImage } from '@/lib/pdfOps'
import { PAGE_SIZES, type PageSizeKey } from '@/lib/types'
import { canvasToBlob } from '@/lib/render'
import { isNative } from '@/lib/platform'
import { savePdf, useRunner } from '@/lib/useRunner'
import { errorMessage, toast } from '@/lib/dialogs'
import { timestamp } from '@/lib/format'

interface Shot { id: number; blob: Blob; url: string }

const { busy, progress, result, run } = useRunner()
const shots = ref<Shot[]>([])
const size = ref<PageSizeKey>('A4')
const sizes = Object.keys(PAGE_SIZES) as PageSizeKey[]
const mode = ref<'color' | 'document'>('document')
const cameraInput = ref<HTMLInputElement | null>(null)
const galleryInput = ref<HTMLInputElement | null>(null)
let nextId = 1

function add(blob: Blob) {
  shots.value.push({ id: nextId++, blob, url: URL.createObjectURL(blob) })
}

async function capture() {
  if (!isNative()) return void cameraInput.value?.click()
  try {
    const photo = await Camera.getPhoto({ quality: 92, resultType: CameraResultType.Uri, source: CameraSource.Camera, correctOrientation: true })
    if (photo.webPath) add(await (await fetch(photo.webPath)).blob())
  } catch (e) {
    // The user pressing back/cancel in the camera is not an error.
    if (!/cancel/i.test(errorMessage(e))) toast(errorMessage(e), true)
  }
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

/** "Document" look: grayscale + contrast stretch so paper turns white and ink turns dark. */
async function enhance(blob: Blob): Promise<RasterImage> {
  const bmp = await createImageBitmap(blob)
  const maxSide = 2200
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000
    d[i] = d[i + 1] = d[i + 2] = g
    hist[g | 0]!++
  }
  // Clip 1% of the darkest / brightest pixels, then stretch.
  const total = c.width * c.height
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc > total * 0.01) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]!; if (acc > total * 0.08) { hi = v; break } }
  const span = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i]! - lo) / span) * 255))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return { bytes: new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.9)).arrayBuffer()), kind: 'jpg' }
}

function create() {
  void run(async () => {
    const images: RasterImage[] = []
    for (const [i, s] of shots.value.entries()) {
      progress.value = `Page ${i + 1} / ${shots.value.length}`
      images.push(mode.value === 'document' ? await enhance(s.blob) : await normalizeImage(s.blob))
    }
    return [await savePdf(`scan_${timestamp()}`, await imagesToPdf(images, size.value))]
  })
}

onBeforeUnmount(() => shots.value.forEach((s) => URL.revokeObjectURL(s.url)))
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar title="Scan to PDF" :subtitle="`${shots.length} page${shots.length === 1 ? '' : 's'}`" />

    <main class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-if="!shots.length" class="grid h-full place-items-center px-8 text-center text-sm text-ink/50">
        <div>
          <Ic name="scan" :size="56" class="mx-auto text-surface-strong" />
          <p class="mt-3">Take photos of your pages or add them from the gallery, then create a PDF.</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div v-for="(s, i) in shots" :key="s.id" class="relative rounded-2xl bg-surface p-2">
          <img :src="s.url" class="aspect-[3/4] w-full rounded-lg bg-white object-contain" alt="" />
          <span class="absolute top-3 left-3 rounded-full bg-primary px-2 text-xs font-semibold text-white">{{ i + 1 }}</span>
          <div class="mt-1.5 flex items-center justify-between">
            <button class="grid size-8 place-items-center rounded-full text-ink/60 disabled:opacity-25 active:bg-white" :disabled="i === 0" aria-label="Move earlier" @click="move(i, -1)"><Ic name="back" :size="18" /></button>
            <button class="grid size-8 place-items-center rounded-full text-danger active:bg-white" aria-label="Delete page" @click="remove(s.id)"><Ic name="trash" :size="18" /></button>
            <button class="grid size-8 place-items-center rounded-full text-ink/60 disabled:opacity-25 active:bg-white" :disabled="i === shots.length - 1" aria-label="Move later" @click="move(i, 1)"><Ic name="next" :size="18" /></button>
          </div>
        </div>
      </div>
    </main>

    <div class="flex-none space-y-3 border-t border-line/50 px-4 py-3">
      <div class="flex gap-2">
        <button class="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-strong text-sm font-semibold text-primary active:opacity-80" @click="capture"><Ic name="camera" :size="20" /> Camera</button>
        <button class="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-semibold text-primary active:opacity-80" @click="galleryInput?.click()"><Ic name="image" :size="20" /> Gallery</button>
      </div>
      <div class="flex items-center gap-2">
        <button class="rounded-full px-3.5 py-1.5 text-sm font-medium" :class="mode === 'document' ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="mode = 'document'">Document</button>
        <button class="rounded-full px-3.5 py-1.5 text-sm font-medium" :class="mode === 'color' ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="mode = 'color'">Colour</button>
        <span class="flex-1" />
        <button v-for="s in sizes.slice(0, 3)" :key="s" class="rounded-full px-3 py-1.5 text-sm font-medium" :class="size === s ? 'bg-primary text-white' : 'bg-surface text-ink/70'" @click="size = s">{{ s }}</button>
      </div>
    </div>
    <BottomAction :label="busy ? progress || 'Working…' : 'Create PDF'" :busy="busy" :disabled="!shots.length" @click="create" />

    <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFiles" />
    <input ref="galleryInput" type="file" accept="image/*" multiple class="hidden" @change="onFiles" />
    <ResultSheet :files="result" title="Scan saved" @close="result = []; clearShots()" />
  </div>
</template>
