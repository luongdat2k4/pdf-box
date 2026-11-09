<script setup lang="ts">
import { ToolBar, toast } from '@/shared/ui'
import { t } from '@/shared/i18n'
import { LanguagePicker } from '@/features/language'
import { SaveLocation } from '@/features/save-location'
import { useLibrary } from '@/entities/file'
import { isNative } from '@/shared/lib/platform'
import { errorMessage } from '@/shared/lib/error'

const lib = useLibrary()
const device = isNative()
async function rescan() {
  try { await lib.syncDeviceFiles(true, true) }
  catch (error) { toast(errorMessage(error), true) }
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar :title="t('settings.title')" />
    <div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
      <LanguagePicker />
      <SaveLocation />
      <section v-if="device" class="space-y-3">
        <h2 class="text-sm font-semibold text-ink">{{ t('settings.library') }}</h2>
        <p class="text-xs leading-relaxed text-ink/60">{{ t('settings.rescanHint') }}</p>
        <button class="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40" :disabled="lib.scanning || lib.updating" @click="rescan">
          {{ t(lib.scanning ? 'home.scanning' : 'settings.rescanLibrary') }}
        </button>
      </section>
    </div>
  </div>
</template>
