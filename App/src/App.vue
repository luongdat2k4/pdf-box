<script setup lang="ts">
import { onMounted } from 'vue'
import { useLibrary } from '@/stores/library'
import { App as CapApp } from '@capacitor/app'
import { router } from '@/router'
import { isNative } from '@/lib/platform'
import DialogHost from '@/components/DialogHost.vue'

const lib = useLibrary()

onMounted(() => {
  void lib.load()
  if (isNative()) {
    // Android back button: go back in history, exit at the root.
    void CapApp.addListener('backButton', () => {
      if (window.history.length > 1 && router.currentRoute.value.name !== 'home') router.back()
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
