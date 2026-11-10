<script setup lang="ts">
import { t } from '../i18n'
import { useRouter } from 'vue-router'
import Ic from './Ic.vue'

defineProps<{ title: string; subtitle?: string }>()
const router = useRouter()
const back = () => (window.history.length > 1 ? router.back() : router.replace('/'))
</script>

<template>
  <header class="safe-top flex-none border-b border-line/60 bg-card">
    <div class="flex h-14 items-center gap-1 px-2">
      <button class="grid size-10 place-items-center rounded-full active:bg-surface" :aria-label="t('common.back')" @click="back">
        <Ic name="back" />
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-[17px] font-semibold text-ink-strong">{{ title }}</h1>
        <p v-if="subtitle" class="truncate text-xs text-ink/60">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </div>
    <slot />
  </header>
</template>
