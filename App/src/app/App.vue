<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { openedFiles, useLibrary } from '@/entities/file'
import { App as CapApp } from '@capacitor/app'
import { router } from './router'
import { isNative } from '@/shared/lib/platform'
import { DialogHost, toast } from '@/shared/ui'
import { errorMessage } from '@/shared/lib/error'
import { BannerAd } from '@/features/ads'
import { bannerPossible, fullScreenShowing, noteDocumentOpened, onAppStateChange, overlaysOpen, watchAdClicks } from '@/shared/ads'
import { markBegun } from '@/features/onboarding'

const lib = useLibrary()
const route = useRoute()

// Banner strip (design-note/ads-plan.md 4.5): reserved from the first frame on the screens that have a banner,
// whatever the ad is doing, so nothing shifts when it loads. The banner itself hides while a sheet, dialog,
// keyboard or full-screen ad is up; the strip stays.
const BANNER_HEIGHT = 50
const bannerStrip = computed(() => bannerPossible && route.meta.banner === true)
const typing = ref(false)
const bannerVisible = computed(() => bannerStrip.value && overlaysOpen.value === 0 && !fullScreenShowing.value && !typing.value)
watchEffect(() => {
  const root = document.documentElement.style
  if (bannerStrip.value) root.setProperty('--ad-inset', `calc(${BANNER_HEIGHT}px + env(safe-area-inset-bottom, 0px))`)
  else root.removeProperty('--ad-inset')
})

// The soft keyboard pushes the banner up over the content, so the banner steps aside while a field has focus.
const isField = (el: EventTarget | null) => el instanceof HTMLElement && el.matches('input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable]')
const onFocusIn = (e: FocusEvent) => { typing.value = isField(e.target) }
const onFocusOut = () => { setTimeout(() => { typing.value = isField(document.activeElement) }) }

// No app-open ad when returning to these screens: first run, the launch screens themselves, and the camera.
const NO_RESUME_AD = ['language', 'onboarding', 'launch', 'begin', 'scan']

onMounted(() => {
  void lib.start().catch(error => toast(errorMessage(error), true))
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  if (isNative()) {
    // Files other apps open with us ("Open with"); a cold start is replayed once this listener exists.
    // Leaving /launch for the document cancels the launch ad, and the arrival itself never shows one.
    // It also counts as having started, so Back from the document goes home rather than to /launch.
    void openedFiles((target) => { noteDocumentOpened(); markBegun(); void router.push(target) })
    // "Open with" while the app is running: arrives before the app resumes, so no app-open ad is shown.
    void CapApp.addListener('appUrlOpen', () => noteDocumentOpened())
    void watchAdClicks()
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      onAppStateChange(isActive, () => !NO_RESUME_AD.includes(String(router.currentRoute.value.name)))
    })
    // Android back button: go back in history, exit at the root.
    void CapApp.addListener('backButton', () => {
      if (fullScreenShowing.value) return
      const root = ['home', 'history', 'favorites', 'begin', 'launch'].includes(String(router.currentRoute.value.name))
      if (window.history.length > 1 && !root) router.back()
      else void CapApp.exitApp()
    })
  }
})
onBeforeUnmount(() => {
  lib.stop()
  document.removeEventListener('focusin', onFocusIn)
  document.removeEventListener('focusout', onFocusOut)
})
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="min-h-0 flex-1">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </div>
    <div
      v-if="bannerStrip"
      data-ad-strip
      class="flex-none border-t border-line bg-card"
      :style="{ height: `calc(${BANNER_HEIGHT}px + env(safe-area-inset-bottom, 0px))` }"
      aria-hidden="true"
    />
  </div>
  <BannerAd v-if="bannerPossible" :visible="bannerVisible" />
  <DialogHost />
</template>
