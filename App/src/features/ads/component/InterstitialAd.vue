<script setup lang="ts">
import { onMounted } from 'vue'
import { getAds } from '@/shared/ads'

const props = defineProps<{ placement?: string; preload?: boolean }>()
const emit = defineEmits<{ closed: [] }>()

async function preload() {
  const ads = await getAds()
  await ads?.LoadInterstitial()
}

async function show() {
  const ads = await getAds()
  await ads?.ShowInterstitial(() => emit('closed'), props.placement)
}

onMounted(() => { if (props.preload) void preload() })
defineExpose({ preload, show })
</script>

<template>
  <span style="display: none" aria-hidden="true" />
</template>
