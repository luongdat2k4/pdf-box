<script setup lang="ts">
import { onMounted } from 'vue'
import { openedFiles, useLibrary } from '@/entities/file'
import { App as CapApp } from '@capacitor/app'
import { router } from './router'
import { isNative } from '@/shared/lib/platform'
import { DialogHost } from '@/shared/ui'

const lib = useLibrary()

onMounted(() => {
  void lib.load()
  if (isNative()) {
    // Files other apps open with us ("Open with"); a cold start is replayed once this listener exists.
    void openedFiles((route) => void router.push(route))
    // Android back button: go back in history, exit at the root.
    void CapApp.addListener('backButton', () => {
      const root = ['home', 'history', 'favorites'].includes(String(router.currentRoute.value.name))
      if (window.history.length > 1 && !root) router.back()
      else void CapApp.exitApp()
    })
  }
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Component" />
  </RouterView>
  <DialogHost />
</template>
