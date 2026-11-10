<script setup lang="ts">
import { toRef } from 'vue'
import { holdAdsWhile } from '../ads'
import Ic from './Ic.vue'

/** `soft` = tinted sheet with a close button instead of the grab handle and title. */
const props = defineProps<{ open: boolean; title?: string; soft?: boolean }>()
// Banner and native ads are drawn above the WebView; they step aside while the sheet is open.
holdAdsWhile(toRef(props, 'open'))
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
        <div class="safe-bottom max-h-[88%] w-full overflow-y-auto rounded-t-3xl p-4 pb-6" :class="soft ? 'bg-surface' : 'bg-white'">
          <div v-if="soft" class="mb-1 flex justify-end">
            <button class="grid size-9 place-items-center rounded-full text-ink/70 active:bg-black/5" aria-label="Close" @click="emit('close')"><Ic name="close" :size="22" /></button>
          </div>
          <template v-else>
            <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <h2 v-if="title" class="mb-3 text-base font-semibold text-ink-strong">{{ title }}</h2>
          </template>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
