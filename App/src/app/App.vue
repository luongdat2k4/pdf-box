<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { openedFiles, useLibrary } from '@/entities/file'
import { App as CapApp } from '@capacitor/app'
import { router } from './router'
import { isNative } from '@/shared/lib/platform'
import { DialogHost } from '@/shared/ui'

const lib = useLibrary()
let stopWatchingRemovals: (() => void) | undefined
let disposed = false

onMounted(() => {
  void lib.load()
  if (isNative()) {
    void lib.watchRemovals().then(stop => {
      if (disposed) stop()
      else stopWatchingRemovals = stop
    }).catch(error => console.warn('Library removal listener failed', error))
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
onBeforeUnmount(() => { disposed = true; stopWatchingRemovals?.() })
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Component" />
  </RouterView>
  <DialogHost />
</template>
