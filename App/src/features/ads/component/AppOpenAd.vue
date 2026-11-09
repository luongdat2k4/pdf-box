<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { getAds } from '../config'

const props = withDefaults(defineProps<{
  provider?: 'applovin' | 'admob'
  placement?: string
  preload?: boolean
}>(), { provider: 'applovin' })
const emit = defineEmits<{ closed: [] }>()
let active = true
let unsubscribe: (() => void) | undefined

async function preload() {
  const ads = await getAds()
  if (!ads) return
  if (props.provider === 'admob') await ads.LoadAdMobAppOpenAd()
  else await ads.LoadAppOpenAd()
}

async function show() {
  const ads = await getAds()
  if (!ads) return
  if (props.provider === 'admob') {
    await ads.ShowAdMobAppOpenAd()
  } else {
    await ads.ShowAppOpenAd(() => emit('closed'), props.placement)
  }
}

onMounted(async () => {
  if (props.provider === 'admob') {
    const ads = await getAds()
    if (active) unsubscribe = ads?.SetOnAdCloseHandler((event) => {
      if (event.format === 'openApp') emit('closed')
    })
  }
  if (active && props.preload) void preload()
})
onUnmounted(() => { active = false; unsubscribe?.() })
defineExpose({ preload, show })
</script>

<template>
  <span style="display: none" aria-hidden="true" />
</template>
