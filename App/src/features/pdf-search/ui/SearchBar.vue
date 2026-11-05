<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Ic } from '@/shared/ui'

defineProps<{ searching: boolean; count: number; index: number }>()
const query = defineModel<string>({ required: true })
const emit = defineEmits<{ submit: []; close: []; step: [direction: 1 | -1] }>()

const input = ref<HTMLInputElement | null>(null)
onMounted(() => input.value?.focus())
</script>

<template>
  <form class="flex h-14 items-center gap-1 px-2" @submit.prevent="emit('submit')">
    <button type="button" class="grid size-10 place-items-center rounded-full active:bg-surface" aria-label="Close search" @click="emit('close')"><Ic name="back" /></button>
    <input ref="input" v-model="query" placeholder="Search in document" class="h-10 min-w-0 flex-1 rounded-full bg-surface px-4 text-sm outline-none" />
    <span v-if="searching" class="px-1 text-primary"><Ic name="loading" spin :size="18" /></span>
    <span v-else-if="count" class="px-1 text-xs whitespace-nowrap text-ink/60">{{ index + 1 }}/{{ count }}</span>
    <button type="button" class="grid size-9 place-items-center rounded-full disabled:opacity-30 active:bg-surface" :disabled="!count" aria-label="Previous match" @click="emit('step', -1)"><Ic name="up" :size="20" /></button>
    <button type="button" class="grid size-9 place-items-center rounded-full disabled:opacity-30 active:bg-surface" :disabled="!count" aria-label="Next match" @click="emit('step', 1)"><Ic name="down" :size="20" /></button>
  </form>
</template>
