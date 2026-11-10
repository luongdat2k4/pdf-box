<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { NativeAdInitOptions, NativeAdRect } from '@alf/app-sdk'
import { fullScreenShowing, getAds, overlaysOpen } from '@/shared/ads'
import { nativeAdStyle } from '@/shared/lib/theme'

let nextSlot = 0
const props = withDefaults(defineProps<{
  slot?: string
  adUnitId?: string
  template?: NativeAdInitOptions['template']
  height?: number
  video?: NativeAdInitOptions['video']
  mediaAspectRatio?: NativeAdInitOptions['mediaAspectRatio']
  adStyle?: NativeAdInitOptions['style']
}>(), { template: 'medium', height: 250 })
const emit = defineEmits<{ shown: []; failed: [error: unknown] }>()
const element = ref<HTMLElement | null>(null)
const slot = props.slot || `pdf-toolbox-native-${++nextSlot}`
let active = true
let isShown = false
let observer: ResizeObserver | undefined
// Native ads are views above the WebView: they hide while a sheet, dialog or full-screen ad is up.
const suspended = computed(() => overlaysOpen.value > 0 || fullScreenShowing.value)
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

function rect(): NativeAdRect | null {
  const bounds = element.value?.getBoundingClientRect()
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
}

async function updateRect() {
  if (!isShown) return
  const bounds = rect()
  const ads = await getAds()
  if (active && bounds && ads) await ads.UpdateAdMobNativeAdRect(bounds, slot)
}

async function show() {
  const ads = await getAds()
  if (!ads || !active || suspended.value) return false
  // Measure only once the route change and layout have settled (design-note/note/native-ad-slot-guide.md).
  await ads.WhenScreenSettled()
  await nextFrame(); await nextFrame()
  const bounds = rect()
  if (!active || !bounds || suspended.value) return false
  try {
    const shown = await ads.ShowAdMobNativeAd({
      slot,
      adUnitId: props.adUnitId,
      template: props.template,
      rect: bounds,
      video: props.video,
      mediaAspectRatio: props.mediaAspectRatio,
      style: props.adStyle ?? nativeAdStyle(), // follows the app theme unless a page sets its own
    })
    if (!active) await ads.DestroyAdMobNativeAd(slot)
    else if (shown) {
      emit('shown')
      isShown = true
    }
    return shown && active
  } catch (error) {
    emit('failed', error)
    return false
  }
}

onMounted(() => {
  if (element.value) {
    observer = new ResizeObserver(() => { void updateRect() })
    observer.observe(element.value)
  }
  // Only on layout changes, never on scroll: these slots sit on screens that do not scroll.
  window.addEventListener('resize', updateRect)
  void show()
})

watch(suspended, async (hide) => {
  const ads = await getAds()
  if (!ads || !active) return
  if (hide) { if (isShown) await ads.HideAdMobNativeAd(slot) }
  else void show() // shows the same view again
})

onUnmounted(() => {
  active = false
  isShown = false
  observer?.disconnect()
  window.removeEventListener('resize', updateRect)
  void getAds().then((ads) => ads?.DestroyAdMobNativeAd(slot))
})

defineExpose({ show })
</script>

<template>
  <div ref="element" :style="{ height: `${height}px` }" />
</template>
