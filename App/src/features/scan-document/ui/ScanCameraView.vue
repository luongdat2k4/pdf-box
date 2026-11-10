<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { Ic, toast } from '@/shared/ui'
import { t, tp } from '@/shared/i18n'
import { errorMessage } from '@/shared/lib/error'
import { expectExternal } from '@/shared/ads'
import { ScanCamera } from '../lib/scan-camera'

defineProps<{ count: number; thumbnail?: string }>()
const emit = defineEmits<{ shot: [blob: Blob]; close: []; gallery: [] }>()
const viewport = ref<HTMLElement>()
const video = ref<HTMLVideoElement>()
const ready = ref(false)
const starting = ref(false)
const capturing = ref(false)
const denied = ref(false)
const failure = ref('')
const native = Capacitor.getPlatform() === 'android'
let stream: MediaStream | undefined
let disposed = false
let generation = 0
let observer: ResizeObserver | undefined
let appListener: PluginListenerHandle | undefined

function bounds() {
  const rect = viewport.value!.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: window.innerWidth }
}

async function start() {
  if (starting.value || disposed) return
  const attempt = ++generation
  starting.value = true
  denied.value = false
  failure.value = ''
  try {
    await nextTick()
    if (native) { expectExternal(); await ScanCamera.start(bounds()) } // may ask for camera permission
    else {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('scan.cameraUnavailable'))
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      if (disposed || attempt !== generation) { media.getTracks().forEach(track => track.stop()); return }
      stream = media
      video.value!.srcObject = media
      await video.value!.play()
    }
    if (!disposed && attempt === generation) {
      ready.value = true
      resize()
    }
  } catch (e) {
    if (disposed || attempt !== generation) return
    stream?.getTracks().forEach(track => track.stop())
    stream = undefined
    const code = e as { code?: string; name?: string }
    denied.value = code.code === 'PERMISSION_DENIED' || code.name === 'NotAllowedError'
    failure.value = denied.value ? t('scan.permissionDenied') : t('scan.cameraUnavailable')
  } finally { if (attempt === generation) starting.value = false }
}

async function capture() {
  if (!ready.value || capturing.value) return
  capturing.value = true
  try {
    let blob: Blob
    if (native) {
      const { base64 } = await ScanCamera.capture()
      blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob()
    } else {
      const source = video.value!
      const canvas = document.createElement('canvas')
      canvas.width = source.videoWidth
      canvas.height = source.videoHeight
      canvas.getContext('2d')!.drawImage(source, 0, 0)
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(t('scan.captureFailed'))), 'image/jpeg', 0.92))
    }
    if (!disposed) emit('shot', blob)
  } catch (e) { if (!disposed) toast(errorMessage(e), true) }
  finally { capturing.value = false }
}

function resize() {
  if (native && ready.value) void ScanCamera.resize(bounds()).catch(() => {})
}

function visibilityChanged() {
  if (native) return // CameraX follows the Activity lifecycle.
  if (document.hidden) {
    ++generation
    stream?.getTracks().forEach(track => track.stop())
    stream = undefined
    ready.value = false
    starting.value = false
  } else void start()
}

async function openSettings() {
  expectExternal()
  try { await ScanCamera.openSettings() } catch (e) { toast(errorMessage(e), true) }
}

onMounted(() => {
  observer = new ResizeObserver(resize)
  observer.observe(viewport.value!)
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', visibilityChanged)
  void start()
  if (native) {
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && denied.value && !starting.value) void start()
    }).then(handle => { if (disposed) void handle.remove(); else appListener = handle })
  }
})

onBeforeUnmount(() => {
  disposed = true
  ++generation
  observer?.disconnect()
  void appListener?.remove()
  window.removeEventListener('resize', resize)
  document.removeEventListener('visibilitychange', visibilityChanged)
  stream?.getTracks().forEach(track => track.stop())
  if (native) void ScanCamera.stop().catch(() => {})
})
</script>

<template>
  <section class="safe-top safe-bottom flex h-full flex-col bg-[#101318] text-white">
    <header class="flex flex-none items-center gap-3 px-4 py-4">
      <button class="grid size-11 place-items-center rounded-full bg-white/10" :aria-label="t('scan.review')" @click="emit('close')"><Ic name="back" /></button>
      <div class="flex-1"><h1 class="font-semibold">{{ t('scan.title') }}</h1><p class="text-xs text-white/60">{{ tp('scan.pages', count) }}</p></div>
      <Ic name="scan" :size="25" class="text-white/70" />
    </header>
    <div class="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/30 bg-black">
      <div ref="viewport" class="absolute inset-0">
        <video v-if="!native" ref="video" autoplay muted playsinline class="h-full w-full object-cover" />
      </div>
      <div v-if="!ready" class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#101318] px-6 text-center" role="status" aria-live="polite">
        <Ic :name="starting ? 'loading' : 'camera'" :spin="starting" :size="40" class="text-white/70" />
        <p class="text-sm text-white/80">{{ starting ? t('scan.cameraStarting') : failure }}</p>
        <template v-if="!starting">
          <button class="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black" @click="start">{{ t('scan.retryCamera') }}</button>
          <button v-if="denied && native" class="text-sm underline" @click="openSettings">{{ t('scan.openSettings') }}</button>
        </template>
      </div>
    </div>
    <footer class="flex-none px-5 pt-4 pb-6">
      <p class="mb-5 text-center text-xs text-white/65">{{ t('scan.alignDocument') }}</p>
      <div class="flex items-center justify-around gap-4">
        <button class="flex w-20 flex-col items-center gap-2 text-xs" @click="emit('gallery')"><Ic name="image" :size="26" />{{ t('scan.gallery') }}</button>
        <button class="grid size-20 place-items-center rounded-full border-4 border-white p-1 disabled:opacity-40" :disabled="!ready || capturing" :aria-label="t('scan.takePhoto')" @click="capture"><span class="grid size-full place-items-center rounded-full bg-white"><Ic v-if="capturing" name="loading" spin class="text-black" /></span></button>
        <button class="flex w-20 flex-col items-center gap-2 text-xs" @click="emit('close')"><img v-if="thumbnail" :src="thumbnail" class="size-9 rounded-md object-cover" alt="" /><Ic v-else name="files" :size="26" />{{ t('scan.review') }} ({{ count }})</button>
      </div>
    </footer>
  </section>
</template>
