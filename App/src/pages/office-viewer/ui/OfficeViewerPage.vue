<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ToolBar, Ic } from '@/shared/ui'
import { useLibrary } from '@/entities/file'
import { officeToHtml } from '@/entities/office'
import { errorMessage } from '@/shared/lib/error'

const props = defineProps<{ id: string }>()
const router = useRouter()
const lib = useLibrary()

const html = ref('')
const sourceHtml = ref('') // Markdown only: the raw text for the Source tab
const mode = ref<'preview' | 'source'>('preview')
const article = ref<HTMLElement | null>(null)
const imageUrl = ref('')
const error = ref('')
const loading = ref(true)
const file = computed(() => lib.find(props.id))

onMounted(async () => {
  // The library store may still be loading when the route is opened directly.
  if (!lib.loaded) await lib.load()
  const f = file.value
  if (!f) { error.value = 'This file no longer exists.'; loading.value = false; return }
  try {
    const blob = await lib.blobOf(f.id)
    if (f.kind === 'image') imageUrl.value = URL.createObjectURL(blob)
    else {
      html.value = await officeToHtml(f.kind, blob, f.name)
      if (f.kind === 'md') sourceHtml.value = await officeToHtml('txt', blob, f.name)
    }
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
})

/** In-document links (#section) scroll inside the page; the router also lives in the URL hash, so never let them navigate. */
function onArticleClick(e: MouseEvent) {
  const a = (e.target as Element).closest('a')
  const href = a?.getAttribute('href')
  if (!a || !href?.startsWith('#')) return
  e.preventDefault()
  const id = decodeURIComponent(href.slice(1))
  article.value?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })
}

onBeforeUnmount(() => imageUrl.value && URL.revokeObjectURL(imageUrl.value))
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar :title="file?.name ?? 'Document'" :subtitle="file ? file.kind.toUpperCase() : undefined">
      <template v-if="file && file.kind !== 'image'" #actions>
        <div v-if="file.kind === 'md'" class="mr-1 flex rounded-full bg-surface p-0.5 text-xs font-medium" role="tablist">
          <button v-for="m in (['preview', 'source'] as const)" :key="m" role="tab" :aria-selected="mode === m" class="rounded-full px-3 py-1 capitalize" :class="mode === m ? 'bg-primary text-white' : 'text-ink/60'" @click="mode = m">{{ m }}</button>
        </div>
        <button class="rounded-full px-3 py-1.5 text-sm font-medium text-primary active:bg-surface" @click="router.push('/tool/doc2pdf')">To PDF</button>
      </template>
    </ToolBar>
    <main class="min-h-0 flex-1 overflow-auto bg-surface p-3">
      <div v-if="loading" class="grid h-full place-items-center text-primary"><Ic name="loading" spin :size="32" /></div>
      <div v-else-if="error" class="mx-auto mt-24 max-w-xs text-center text-sm text-ink/60">
        <Ic name="warn" :size="40" class="mx-auto mb-2 text-amber-500" />
        {{ error }}
      </div>
      <img v-else-if="imageUrl" :src="imageUrl" class="mx-auto max-w-full rounded-lg bg-white" alt="" />
      <article v-else ref="article" class="office-body mx-auto min-h-full max-w-3xl rounded-xl bg-white p-4 shadow-sm" @click="onArticleClick" v-html="mode === 'source' ? sourceHtml : html" />
    </main>
  </div>
</template>
