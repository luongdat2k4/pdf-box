<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Ic, toast } from '@/shared/ui'
import { errorMessage } from '@/shared/lib/error'
import { ACCEPT_ALL, FileRow, openRoute, useLibrary, type FileKind, type FileMeta } from '@/entities/file'
import { ToolsSheet } from '@/widgets/tools-sheet'
import { FileMenu } from '@/widgets/file-menu'

const router = useRouter()
const lib = useLibrary()

type Tab = 'home' | 'history' | 'favorites'
const tab = ref<Tab>('home')
const filter = ref<'all' | 'pdf' | 'office' | 'txt' | 'image'>('all')
const toolsOpen = ref(false)
const menuFile = ref<FileMeta | null>(null)
const picker = ref<HTMLInputElement | null>(null)

const tabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'history', label: 'History' },
  { id: 'favorites', label: 'Favorites' },
]
const chips = [
  { id: 'all', label: 'All' }, { id: 'pdf', label: 'PDF' }, { id: 'office', label: 'Office' },
  { id: 'txt', label: 'TXT' }, { id: 'image', label: 'Images' },
] as const
const officeKinds: FileKind[] = ['word', 'excel', 'ppt']

const list = computed(() => {
  const src = tab.value === 'home' ? lib.all : tab.value === 'history' ? lib.recent : lib.favorites
  switch (filter.value) {
    case 'pdf': return src.filter((f) => f.kind === 'pdf')
    case 'office': return src.filter((f) => officeKinds.includes(f.kind))
    case 'txt': return src.filter((f) => f.kind === 'txt')
    case 'image': return src.filter((f) => f.kind === 'image')
    default: return src
  }
})

const emptyText = computed(() =>
  tab.value === 'history' ? 'Files you open will show up here.'
  : tab.value === 'favorites' ? 'Tap the star on a file to keep it here.'
  : 'Your library is empty. Import PDF, Office, TXT or image files to get started.',
)

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
          @click="tab = t.id"
        >
          {{ t.label }}
          <span v-if="tab === t.id" class="absolute inset-x-1/3 bottom-0 h-[3px] rounded-full bg-primary" />
        </button>
      </nav>
    </header>

    <div class="flex flex-none gap-2 overflow-x-auto bg-surface px-3 py-2.5">
      <button
        v-for="c in chips"
        :key="c.id"
        class="flex-none rounded-full px-4 py-1.5 text-[13px] font-medium"
        :class="filter === c.id ? 'bg-primary text-white' : 'bg-white text-ink/70'"
        @click="filter = c.id"
      >
        {{ c.label }}
      </button>
    </div>

    <main class="min-h-0 flex-1 overflow-y-auto bg-white px-2 pb-28 pt-1">
      <div v-if="!list.length" class="grid h-full place-items-center px-10 text-center">
        <div>
          <Ic name="files" :size="56" class="mx-auto text-surface-strong" />
          <p class="mt-3 text-sm text-ink/55">{{ emptyText }}</p>
          <button v-if="tab === 'home' && !lib.items.length" class="mt-4 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white" @click="picker?.click()">
            Import files
          </button>
        </div>
      </div>
      <FileRow v-for="f in list" :key="f.id" :file="f" actions @click="open(f)" @star="lib.toggleFavorite(f.id)" @menu="menuFile = f" />
    </main>

    <button
      class="safe-bottom fixed right-5 bottom-5 grid size-14 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/40 active:bg-primary-dark"
      aria-label="Tools"
      @click="toolsOpen = true"
    >
      <Ic name="plus" :size="28" />
    </button>
    <input ref="picker" type="file" class="hidden" multiple :accept="ACCEPT_ALL" @change="onPicked" />

    <ToolsSheet :open="toolsOpen" @close="toolsOpen = false" @import="picker?.click()" />
    <FileMenu :file="menuFile" @close="menuFile = null" @open="open" />
  </div>
</template>
