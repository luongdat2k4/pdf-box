<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Ic from '@/components/Ic.vue'
import FileRow from '@/components/FileRow.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { useLibrary } from '@/stores/library'
import { ACCEPT_ALL, type FileKind, type FileMeta } from '@/lib/types'
import { TOOLS, openRoute } from '@/lib/tools'
import { askConfirm, askText, errorMessage, toast } from '@/lib/dialogs'
import { formatDate, formatSize } from '@/lib/format'
import { saveToDevice, shareFile } from '@/lib/platform'

const router = useRouter()
const lib = useLibrary()

type Tab = 'home' | 'history' | 'favorites'
const tab = ref<Tab>('home')
const filter = ref<'all' | 'pdf' | 'office' | 'txt' | 'image'>('all')
const toolsOpen = ref(false)
const menuFile = ref<FileMeta | null>(null)
const detailsFile = ref<FileMeta | null>(null)
const picker = ref<HTMLInputElement | null>(null)

const tabs: { id: Tab; label: string; icon: 'home' | 'history' | 'star' }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'favorites', label: 'Favorites', icon: 'star' },
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

async function rename(f: FileMeta) {
  menuFile.value = null
  const base = f.name.includes('.') ? f.name.slice(0, f.name.lastIndexOf('.')) : f.name
  const name = (await askText('Rename file', 'File name', base, 'Rename'))?.trim()
  if (name) await lib.rename(f.id, name)
}

async function remove(f: FileMeta) {
  menuFile.value = null
  if (await askConfirm('Delete file?', `"${f.name}" will be permanently removed from the library.`, 'Delete', true)) {
    await lib.remove([f.id])
    toast('Deleted')
  }
}

async function share(f: FileMeta) {
  menuFile.value = null
  try { await shareFile(f.name, await lib.blobOf(f.id)) } catch (e) { if ((e as Error).name !== 'AbortError') toast(errorMessage(e), true) }
}

async function save(f: FileMeta) {
  menuFile.value = null
  try { toast(`Saved: ${await saveToDevice(f.name, await lib.blobOf(f.id))}`) } catch (e) { toast(errorMessage(e), true) }
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

    <BottomSheet :open="toolsOpen" title="Add & tools" @close="toolsOpen = false">
      <button class="mb-3 flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3.5 text-left text-white active:bg-primary-dark" @click="picker?.click()">
        <Ic name="upload" /> <span class="text-sm font-semibold">Import files from device</span>
      </button>
      <div class="grid grid-cols-2 gap-2.5">
        <button
          v-for="t in TOOLS"
          :key="t.to"
          class="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left active:bg-surface-strong"
          @click="toolsOpen = false; router.push(t.to)"
        >
          <span class="grid size-10 flex-none place-items-center rounded-xl" :class="t.color"><Ic :name="t.icon" /></span>
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold text-ink-strong">{{ t.label }}</span>
            <span class="block truncate text-[11px] text-ink/55">{{ t.desc }}</span>
          </span>
        </button>
      </div>
    </BottomSheet>

    <BottomSheet :open="!!menuFile" :title="menuFile?.name" @close="menuFile = null">
      <template v-if="menuFile">
        <div class="divide-y divide-line/40">
          <button class="flex w-full items-center gap-3 py-3 text-sm" @click="open(menuFile); menuFile = null"><Ic name="next" :size="20" /> Open</button>
          <button class="flex w-full items-center gap-3 py-3 text-sm" @click="rename(menuFile)"><Ic name="rename" :size="20" /> Rename</button>
          <button class="flex w-full items-center gap-3 py-3 text-sm" @click="lib.toggleFavorite(menuFile.id); menuFile = null"><Ic name="star" :size="20" /> {{ menuFile.favorite ? 'Remove from favorites' : 'Add to favorites' }}</button>
          <button class="flex w-full items-center gap-3 py-3 text-sm" @click="share(menuFile)"><Ic name="share" :size="20" /> Share</button>
          <button class="flex w-full items-center gap-3 py-3 text-sm" @click="save(menuFile)"><Ic name="download" :size="20" /> Save to device</button>
          <button class="flex w-full items-center gap-3 py-3 text-sm" @click="detailsFile = menuFile; menuFile = null"><Ic name="info" :size="20" /> Details</button>
          <button class="flex w-full items-center gap-3 py-3 text-sm text-danger" @click="remove(menuFile)"><Ic name="trash" :size="20" /> Delete</button>
        </div>
      </template>
    </BottomSheet>

    <BottomSheet :open="!!detailsFile" title="File detail" @close="detailsFile = null">
      <dl v-if="detailsFile" class="space-y-2 text-sm">
        <div class="flex justify-between gap-4"><dt class="text-ink/55">File name</dt><dd class="break-all text-right font-medium">{{ detailsFile.name }}</dd></div>
        <div class="flex justify-between"><dt class="text-ink/55">File size</dt><dd class="font-medium">{{ formatSize(detailsFile.size) }}</dd></div>
        <div class="flex justify-between"><dt class="text-ink/55">Type</dt><dd class="font-medium uppercase">{{ detailsFile.kind }}</dd></div>
        <div class="flex justify-between"><dt class="text-ink/55">Added</dt><dd class="font-medium">{{ formatDate(detailsFile.addedAt) }}</dd></div>
      </dl>
    </BottomSheet>
  </div>
</template>
