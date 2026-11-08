<script setup lang="ts">
import { t } from '@/shared/i18n'
import { computed, watch, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { ToolBar, Ic } from '@/shared/ui'
import { useLibrary } from '@/entities/file'
import { officeToHtml, readSpreadsheet, SpreadsheetViewer, type SpreadsheetBook,
  readPresentation, PresentationViewer, type PresentationSession, PRESENTATION_LIMITS, assertPresentationSize, presentationError } from '@/entities/office'
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
const spreadsheet = shallowRef<SpreadsheetBook | null>(null)
const presentation = shallowRef<PresentationSession | null>(null)
const file = computed(() => lib.find(props.id))

watch(() => props.id, async (_id, _previous, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => {
    controller.abort()
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  })
  loading.value = true; error.value = ''; html.value = ''; sourceHtml.value = ''; imageUrl.value = ''
  spreadsheet.value = null; presentation.value = null; mode.value = 'preview'
  try {
    // The library may still be loading when this route is opened directly.
    if (!lib.loaded) await lib.load()
    controller.signal.throwIfAborted()
    const f = file.value
    if (!f) throw new Error(t('common.fileGone'))
    if (f.kind === 'ppt') assertPresentationSize(f.size)
    const blob = await lib.blobOf(f.id, f.kind === 'ppt' ? PRESENTATION_LIMITS.maxFileBytes : undefined)
    controller.signal.throwIfAborted()
    if (f.kind === 'image') imageUrl.value = URL.createObjectURL(blob)
    else if (f.kind === 'excel') spreadsheet.value = await readSpreadsheet(blob, controller.signal)
    else if (f.kind === 'ppt') presentation.value = await readPresentation(blob, controller.signal)
    else {
      const content = await officeToHtml(f.kind, blob, f.name)
      controller.signal.throwIfAborted()
      html.value = content
      if (f.kind === 'md') {
        const source = await officeToHtml('txt', blob, f.name)
        controller.signal.throwIfAborted()
        sourceHtml.value = source
      }
    }
  } catch (e) {
    if (!controller.signal.aborted) {
      error.value = file.value?.kind === 'ppt'
        ? presentationError(e)
        : errorMessage(e)
    }
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}, { immediate: true })

/** In-document links (#section) scroll inside the page; never let them navigate (they would change the URL). */
function onArticleClick(e: MouseEvent) {
  const a = (e.target as Element).closest('a')
  const href = a?.getAttribute('href')
  if (!a || !href?.startsWith('#')) return
  e.preventDefault()
  const id = decodeURIComponent(href.slice(1))
  article.value?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })
}

</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar :title="file?.name ?? t('office.document')" :subtitle="file ? file.kind.toUpperCase() : undefined">
      <template v-if="file && file.kind !== 'image' && file.kind !== 'ppt'" #actions>
        <div v-if="file.kind === 'md'" class="mr-1 flex rounded-full bg-surface p-0.5 text-xs font-medium" role="tablist">
          <button v-for="m in (['preview', 'source'] as const)" :key="m" role="tab" :aria-selected="mode === m" class="rounded-full px-3 py-1" :class="mode === m ? 'bg-primary text-white' : 'text-ink/60'" @click="mode = m">{{ m === 'preview' ? t('office.preview') : t('office.source') }}</button>
        </div>
        <button class="rounded-full px-3 py-1.5 text-sm font-medium text-primary active:bg-surface" @click="router.push('/tool/doc2pdf')">{{ t('office.toPdf') }}</button>
      </template>
    </ToolBar>
    <SpreadsheetViewer v-if="spreadsheet && !loading && !error" :book="spreadsheet" />
    <PresentationViewer v-else-if="presentation && file && !loading && !error" :session="presentation" :file-id="file.id" :initial-page="file.lastPage" :initial-zoom="file.lastZoom"
      @progress="({ id, page, zoom, count }) => lib.saveProgress(id, { lastPage: page, lastZoom: zoom, pageCount: count })" />
    <main v-else class="min-h-0 flex-1 overflow-auto bg-surface p-3">
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
