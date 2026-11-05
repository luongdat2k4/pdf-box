<script setup lang="ts">
defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-40 flex items-end bg-black/45" @click.self="emit('close')">
        <div class="safe-bottom max-h-[85%] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-6">
          <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
          <h2 v-if="title" class="mb-3 text-base font-semibold text-ink-strong">{{ title }}</h2>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
