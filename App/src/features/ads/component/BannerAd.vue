<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { BannerInitOptions } from '@alf/app-sdk'
import { getAds } from '../config'

const props = withDefaults(defineProps<BannerInitOptions>(), {
  position: 'BOTTOM_CENTER',
})
let active = true

onMounted(async () => {
  const ads = await getAds()
  if (!ads || !active) return
  await ads.InitBannerAd({ position: props.position, size: props.size, collapsible: props.collapsible })
  if (!active) await ads.DestroyBannerAd()
})

onUnmounted(() => {
  active = false
  void getAds().then((ads) => ads?.DestroyBannerAd())
})
</script>

<template>
  <span style="display: none" aria-hidden="true" />
</template>
