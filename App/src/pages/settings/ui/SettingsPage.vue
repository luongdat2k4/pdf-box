<script setup lang="ts">
import { ToolBar } from '@/shared/ui'
import { t } from '@/shared/i18n'
import { LanguagePicker } from '@/features/language'
import { SaveLocation } from '@/features/save-location'
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar :title="t('settings.title')" />
    <div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
      <LanguagePicker />
      <SaveLocation />
    </div>
  </div>
</template>
