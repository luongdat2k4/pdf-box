<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Ic from './Ic.vue'
import type { PDFDocumentProxy } from '@/lib/pdfjs'
import { renderThumb } from '@/lib/render'

/** Lazily rendered page thumbnail (renders only once it scrolls into view). */
const props = defineProps<{ doc: PDFDocumentProxy; pageNo: number; selected?: boolean; selectable?: boolean; current?: boolean }>()
const emit = defineEmits<{ click: [] }>()

const url = ref('')
const root = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let dead = false

onMounted(() => {
  observer = new IntersectionObserver(async ([entry]) => {
    if (!entry?.isIntersecting || url.value) return
    observer?.disconnect()
    try {
      const u = await renderThumb(props.doc, props.pageNo)
      if (dead) URL.revokeObjectURL(u)
      else url.value = u
    } catch { /* document closed while rendering */ }
  }, { rootMargin: '200px' })
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  dead = true
  observer?.disconnect()
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>

<template>
  <button
    ref="root"
    class="relative block w-full rounded-xl p-1.5 text-center"
    :class="selected || current ? 'bg-surface-strong ring-2 ring-primary' : 'bg-surface'"
    @click="emit('click')"
  >
    <div class="grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-md bg-white">
      <img v-if="url" :src="url" class="h-full w-full object-contain" alt="" />
      <Ic v-else name="loading" spin class="text-line" />
    </div>
    <span class="mt-1 block text-xs text-ink/60">{{ pageNo }}</span>
    <span v-if="selectable" class="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-md border-2"
      :class="selected ? 'border-primary bg-primary text-white' : 'border-line bg-white/90'">
      <Ic v-if="selected" name="check" :size="14" />
    </span>
  </button>
</template>
