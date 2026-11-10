<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { AdViewPosition } from '@alf/app-sdk'
import { getAds } from '@/shared/ads'

const props = withDefaults(defineProps<{ position?: AdViewPosition }>(), {
  position: 'BOTTOM_CENTER',
})
let active = true

onMounted(async () => {
  const ads = await getAds()
  if (!ads || !active) return
  await ads.InitMRECAd(props.position)
  if (!active) await ads.DestroyMRECAd()
})

onUnmounted(() => {
  active = false
  void getAds().then((ads) => ads?.DestroyMRECAd())
})
</script>

<template>
  <span style="display: none" aria-hidden="true" />
</template>
