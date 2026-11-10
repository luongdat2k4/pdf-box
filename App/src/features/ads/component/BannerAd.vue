<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import type { BannerInitOptions } from '@alf/app-sdk'
import { getAds } from '@/shared/ads'

// One banner for the whole app (mounted once by the app shell). `visible` hides and shows the same native
// view instead of recreating it, so it keeps its loaded ad between screens.
const props = withDefaults(defineProps<BannerInitOptions & { visible?: boolean }>(), {
  position: 'BOTTOM_CENTER',
  visible: true,
})
let active = true
let created = false
let queue: Promise<void> = Promise.resolve()

function apply(visible: boolean) {
  queue = queue.then(async () => {
    const ads = await getAds()
    if (!ads || !active) return
    if (!visible) { if (created) await ads.HideBannerAd(); return }
    if (!created) {
      created = true
      await ads.InitBannerAd({ position: props.position, size: props.size, collapsible: props.collapsible })
    } else {
      await ads.ShowBannerAd()
    }
  }).catch(() => {})
}

watch(() => props.visible, apply, { immediate: true })

onUnmounted(() => {
  active = false
  void queue.then(async () => { if (created) await (await getAds())?.DestroyBannerAd() })
})
</script>

<template>
  <span style="display: none" aria-hidden="true" />
</template>
