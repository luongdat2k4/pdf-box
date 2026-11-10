<script setup lang="ts">
import Ic from './Ic.vue'

defineProps<{ label: string; disabled?: boolean; busy?: boolean; hint?: string }>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <div class="safe-bottom flex-none border-t border-line/50 bg-card px-4 pt-3 pb-3">
    <p v-if="hint" class="mb-2 text-center text-xs text-ink/55">{{ hint }}</p>
    <button
      class="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition"
      :class="disabled || busy ? 'bg-primary/35' : 'bg-primary active:bg-primary-dark'"
      :disabled="disabled || busy"
      @click="emit('click')"
    >
      <Ic v-if="busy" name="loading" spin :size="20" />
      {{ label }}
    </button>
  </div>
</template>
