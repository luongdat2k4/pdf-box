<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Ic, toast } from '@/shared/ui'
import { errorMessage } from '@/shared/lib/error'
import { useDragScroll } from '@/shared/lib/use-drag-scroll'
import { useDragFab } from '@/shared/lib/use-drag-fab'
import { ACCEPT_ALL, FileRow, openRoute, useLibrary, type FileKind, type FileMeta } from '@/entities/file'
import { ToolsSheet } from '@/widgets/tools-sheet'
import { FileMenu } from '@/widgets/file-menu'

const router = useRouter()
const route = useRoute()
const lib = useLibrary()

type Tab = 'home' | 'history' | 'favorites'
// Tab and type filter live in the URL: /, /history, /favorites and ?type=pdf|word|...
const tab = computed<Tab>(() => (route.name === 'history' || route.name === 'favorites' ? route.name : 'home'))
const filter = computed<'all' | FileKind>(() => {
  const t = String(route.query.type ?? '')
  return chips.some((c) => c.id === t && t !== 'all') ? (t as FileKind) : 'all'
})
function go(t: Tab, type: 'all' | FileKind) {
  void router.replace({ name: t, query: type === 'all' ? {} : { type } })
}
const toolsOpen = ref(false)
const menuFile = ref<FileMeta | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const chipsEl = ref<HTMLElement | null>(null)
useDragScroll(chipsEl)
const fabEl = ref<HTMLElement | null>(null)
const fab = useDragFab(fabEl, 'pdftoolbox.fabOffset')

const tabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'history', label: 'History' },
  { id: 'favorites', label: 'Favorites' },
]
const base = import.meta.env.BASE_URL
// `icon` = file name in public/assets/icons/<icon>.webp
const chips: { id: 'all' | FileKind; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'all' }, { id: 'pdf', label: 'PDF', icon: 'pdf' }, { id: 'word', label: 'Word', icon: 'word' },
  { id: 'excel', label: 'Excel', icon: 'excel' }, { id: 'ppt', label: 'PPT', icon: 'ppt' }, { id: 'txt', label: 'TXT', icon: 'txt' },
  { id: 'md', label: 'MD', icon: 'md' }, { id: 'image', label: 'Images', icon: 'image' },
]

function selectChip(id: 'all' | FileKind, e: MouseEvent) {
  go(tab.value, id)
  // Keep the chosen chip visible when it sits at the edge of the scroller.
  ;(e.currentTarget as HTMLElement).scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
}

const list = computed(() => {
  const src = tab.value === 'home' ? lib.all : tab.value === 'history' ? lib.recent : lib.favorites
  return filter.value === 'all' ? src : src.filter((f) => f.kind === filter.value)
})

const emptyText = computed(() => {
  if (filter.value !== 'all') {
    const label = chips.find((c) => c.id === filter.value)?.label
    return `Nothing in “${label}” yet.`
  }
  return tab.value === 'history' ? 'Files you open will show up here.'
    : tab.value === 'favorites' ? 'Tap the star on a file to keep it here.'
    : 'Your library is empty. Import PDF, Word, Excel, PPT, TXT, Markdown or image files to get started.'
})

async function open(f: FileMeta) {
  if (f.kind === 'image') return void router.push(`/office/${f.id}`)
  await lib.touch(f.id)
  void router.push(openRoute(f))
}

async function onPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  toolsOpen.value = false
  if (!files.length) return
  try {
    const { added, skipped } = await lib.importFiles(files)
    if (added.length) toast(`Imported ${added.length} file${added.length > 1 ? 's' : ''}`)
    if (skipped.length) toast(`Unsupported: ${skipped.join(', ')}`, true)
  } catch (err) { toast(errorMessage(err), true) }
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <header class="safe-top flex-none bg-header text-white">
      <div class="flex h-14 items-center gap-2 px-4">
        <h1 class="flex-1 text-lg font-bold tracking-tight">PDF Toolbox</h1>
        <button class="grid size-10 place-items-center rounded-full active:bg-white/15" aria-label="Search files" @click="router.push('/search')">
          <Ic name="search" />
        </button>
      </div>
      <nav class="flex px-2" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.id"
          role="tab"
          :aria-selected="tab === t.id"
          class="relative flex-1 pb-2.5 pt-1 text-center transition"
          :class="tab === t.id ? 'text-[18px] font-semibold text-white' : 'text-[14px] text-white/60'"
          @click="go(t.id, filter)"
        >
          {{ t.label }}
          <span v-if="tab === t.id" class="absolute inset-x-1/3 bottom-0 h-[3px] rounded-full bg-primary" />
        </button>
      </nav>
    </header>

    <div ref="chipsEl" class="flex flex-none cursor-grab gap-1 overflow-x-auto bg-surface px-2 py-2 select-none active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        v-for="c in chips"
        :key="c.id"
        class="group flex w-[68px] flex-none flex-col items-center gap-1 rounded-2xl py-1"
        :aria-pressed="filter === c.id"
        @click="selectChip(c.id, $event)"
      >
        <span
          class="grid size-12 place-items-center rounded-full transition"
          :class="filter === c.id ? 'bg-primary/15 ring-2 ring-primary/40' : 'bg-white'"
        >
          <img :src="`${base}assets/icons/${c.icon}.webp`" :alt="''" class="size-8 object-contain" draggable="false" />
        </span>
        <span class="text-[12px] leading-none" :class="filter === c.id ? 'font-semibold text-primary' : 'text-ink/65'">{{ c.label }}</span>
      </button>
    </div>

    <main class="min-h-0 flex-1 overflow-y-auto bg-white px-2 pb-28 pt-1">
      <div v-if="!list.length" class="grid h-full place-items-center px-10 text-center">
        <div>
          <Ic name="files" :size="56" class="mx-auto text-surface-strong" />
          <p class="mt-3 text-sm text-ink/55">{{ emptyText }}</p>
          <button v-if="tab === 'home' && !lib.items.length && filter === 'all'" class="mt-4 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white" @click="picker?.click()">
            Import files
          </button>
        </div>
      </div>
      <FileRow v-for="f in list" :key="f.id" :file="f" actions @click="open(f)" @star="lib.toggleFavorite(f.id)" @menu="menuFile = f" />
    </main>

    <button
      ref="fabEl"
      class="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] grid size-14 touch-none place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/40 select-none active:bg-primary-dark"
      :style="fab.style.value"
      aria-label="Open tools"
      @click="toolsOpen = true"
    >
      <Ic name="tools" :size="26" />
    </button>
    <input ref="picker" type="file" class="hidden" multiple :accept="ACCEPT_ALL" @change="onPicked" />

    <ToolsSheet :open="toolsOpen" @close="toolsOpen = false" @import="picker?.click()" />
    <FileMenu :file="menuFile" @close="menuFile = null" @open="open" />
  </div>
</template>
