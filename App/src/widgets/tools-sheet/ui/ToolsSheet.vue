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
  <BottomSheet :open="open" title="Add & tools" @close="emit('close')">
    <button class="mb-3 flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3.5 text-left text-white active:bg-primary-dark" @click="emit('import')">
      <Ic name="upload" /> <span class="text-sm font-semibold">Import files from device</span>
    </button>
    <div class="grid grid-cols-2 gap-2.5">
      <button
        v-for="t in TOOLS"
        :key="t.to"
        class="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left active:bg-surface-strong"
        @click="go(t.to)"
      >
        <span class="grid size-10 flex-none place-items-center rounded-xl" :class="t.color"><Ic :name="t.icon" /></span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-ink-strong">{{ t.label }}</span>
          <span class="block truncate text-[11px] text-ink/55">{{ t.desc }}</span>
        </span>
      </button>
    </div>
  </BottomSheet>
</template>
