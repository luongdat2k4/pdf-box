<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { NativeAdInitOptions, NativeAdRect } from '@alf/app-sdk'
import { getAds } from '../config'

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
  const bounds = rect()
  if (!active || !ads || !bounds) return false
  try {
    const shown = await ads.ShowAdMobNativeAd({
      slot,
      adUnitId: props.adUnitId,
      template: props.template,
      rect: bounds,
      video: props.video,
      mediaAspectRatio: props.mediaAspectRatio,
      style: props.adStyle,
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
  window.addEventListener('scroll', updateRect, true)
  window.addEventListener('resize', updateRect)
  void show()
})

onUnmounted(() => {
  active = false
  isShown = false
  observer?.disconnect()
  window.removeEventListener('scroll', updateRect, true)
  window.removeEventListener('resize', updateRect)
  void getAds().then((ads) => ads?.DestroyAdMobNativeAd(slot))
})

defineExpose({ show })
</script>

<template>
  <div ref="element" :style="{ height: `${height}px` }" />
</template>
