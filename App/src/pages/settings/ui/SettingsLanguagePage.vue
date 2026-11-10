<script setup lang="ts">
import { t } from '@/shared/i18n'
import { ToolBar } from '@/shared/ui'
import { LanguageList } from '@/features/language'
</script>

<template>
  <!-- Full-screen language list opened from Settings; the route reserves the banner strip below it. -->
  <div class="flex h-full flex-col bg-card">
    <ToolBar :title="t('settings.language')" />
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <LanguageList />
    </div>
  </div>
</template>
