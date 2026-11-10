<script setup lang="ts">
import { t } from '@/shared/i18n'
import { useRouter } from 'vue-router'
import { BottomSheet } from '@/shared/ui'
import { TOOLS } from '../model/tools'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; import: [] }>()
const router = useRouter()
const icon = (name: string) => `${import.meta.env.BASE_URL}assets/icons/tool-${name}.webp`

function go(to: string) {
  emit('close')
  void router.push(to)
}
</script>

<template>
  <BottomSheet :open="open" soft @close="emit('close')">
    <ul class="flex flex-col gap-3.5 pt-3 pb-1">
      <li>
        <button class="relative flex h-14 w-full items-center rounded-2xl bg-primary pr-16 pl-5 text-left text-[16px] font-semibold text-white active:bg-primary-dark" @click="emit('import')">
          {{ t('home.importFiles') }}
          <span class="absolute -top-2.5 right-3 grid size-[52px] place-items-center rounded-2xl bg-white shadow-md shadow-primary/25"><img :src="icon('import')" alt="" class="size-9 object-contain" draggable="false" /></span>
        </button>
      </li>
      <li v-for="tool in TOOLS" :key="tool.to">
        <button class="relative flex h-14 w-full items-center rounded-2xl bg-gradient-to-r from-surface-strong to-surface pr-16 pl-5 text-left text-[16px] text-ink-strong active:brightness-95" @click="go(tool.to)">
          <span class="truncate">{{ t(tool.label) }}</span>
          <span class="absolute -top-2.5 right-3 grid size-[52px] place-items-center rounded-2xl bg-white shadow-md shadow-primary/15"><img :src="icon(tool.icon)" alt="" class="size-9 object-contain" draggable="false" /></span>
        </button>
      </li>
    </ul>
  </BottomSheet>
</template>
