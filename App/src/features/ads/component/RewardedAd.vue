<script setup lang="ts">
import { onMounted } from 'vue'
import type { RewardResult } from '@alf/app-sdk'
import { getAds } from '../config'

const props = defineProps<{ placement?: string; preload?: boolean }>()
const emit = defineEmits<{ closed: [result: RewardResult] }>()

async function preload() {
  const ads = await getAds()
  await ads?.LoadRewardedVideo()
}

async function show() {
  const ads = await getAds()
  await ads?.ShowRewardedVideo((result) => emit('closed', result), props.placement)
}

onMounted(() => { if (props.preload) void preload() })
defineExpose({ preload, show })
</script>

<template>
  <span style="display: none" aria-hidden="true" />
</template>
