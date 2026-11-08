<script setup lang="ts">
import { ref, shallowRef, watch, computed } from 'vue'
import { Ic } from '@/shared/ui'
import { slideDocument } from '../lib/slide-document'
import type { PresentationSession } from '../lib/read-presentation'
import type { RenderedSlide } from '../lib/presentation-protocol'

const props = defineProps<{ session: PresentationSession; index: number }>()
const slide = shallowRef<RenderedSlide | null>(null)
const failed = ref(false)
const document = computed(() => slide.value ? slideDocument(slide.value.svg) : '')
watch([() => props.session, () => props.index], async (_value, _old, clean) => {
  const controller = new AbortController()
  clean(() => controller.abort())
  slide.value = null; failed.value = false
  try {
    const result = await props.session.slide(props.index, controller.signal, false)
    if (!controller.signal.aborted) slide.value = result
  }
  catch { if (!controller.signal.aborted) failed.value = true }
}, { immediate: true })
</script>

<template>
  <div class="grid h-full w-full place-items-center overflow-hidden rounded-md border border-line bg-white">
    <iframe v-if="slide" :srcdoc="document" sandbox="allow-same-origin" tabindex="-1" aria-hidden="true" title=""
      class="pointer-events-none h-full w-full border-0" />
    <Ic v-else :name="failed ? 'warn' : 'loading'" :spin="!failed" :size="18" class="text-ink/30" />
  </div>
</template>
