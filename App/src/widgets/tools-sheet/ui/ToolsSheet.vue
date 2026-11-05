<script setup lang="ts">
import { useRouter } from 'vue-router'
import { BottomSheet, Ic } from '@/shared/ui'
import { TOOLS } from '../model/tools'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; import: [] }>()
const router = useRouter()

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
          Import files
          <span class="absolute -top-2.5 right-3 grid size-[52px] place-items-center rounded-2xl bg-white text-primary shadow-md shadow-primary/25"><Ic name="upload" :size="26" /></span>
        </button>
      </li>
      <li v-for="t in TOOLS" :key="t.to">
        <button class="relative flex h-14 w-full items-center rounded-2xl bg-gradient-to-r from-surface-strong to-[#e4f0ff] pr-16 pl-5 text-left text-[16px] text-ink-strong active:brightness-95" @click="go(t.to)">
          <span class="truncate">{{ t.label }}</span>
          <span class="absolute -top-2.5 right-3 grid size-[52px] place-items-center rounded-2xl bg-white shadow-md shadow-primary/15" :class="t.color"><Ic :name="t.icon" :size="26" /></span>
        </button>
      </li>
    </ul>
  </BottomSheet>
</template>
