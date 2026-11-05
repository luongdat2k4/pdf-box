<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Ic from '@/components/Ic.vue'
import FileRow from '@/components/FileRow.vue'
import { useLibrary } from '@/stores/library'
import { openRoute } from '@/lib/tools'
import { stripExt } from '@/lib/format'
import type { FileMeta } from '@/lib/types'

const router = useRouter()
const lib = useLibrary()
const q = ref('')
const input = ref<HTMLInputElement | null>(null)

// Same matching rule as the reference app: case-insensitive substring of the name without its extension.
const results = computed(() => {
  const s = q.value.trim().toLowerCase()
  return s ? lib.items.filter((f) => stripExt(f.name).toLowerCase().includes(s)) : []
})

async function open(f: FileMeta) {
  await lib.touch(f.id)
  void router.push(f.kind === 'image' ? `/office/${f.id}` : openRoute(f))
}

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <header class="safe-top flex-none border-b border-line/60">
      <div class="flex h-14 items-center gap-1 px-2">
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" aria-label="Back" @click="router.back()"><Ic name="back" /></button>
        <div class="flex h-10 flex-1 items-center gap-2 rounded-full bg-surface px-3">
          <Ic name="search" :size="18" class="text-ink/40" />
          <input ref="input" v-model="q" class="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search by file name" />
          <button v-if="q" aria-label="Clear" @click="q = ''"><Ic name="close" :size="18" class="text-ink/40" /></button>
        </div>
      </div>
    </header>
    <main class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <p v-if="q && !results.length" class="mt-24 text-center text-sm text-ink/50">No files match "{{ q }}"</p>
      <p v-else-if="!q" class="mt-24 text-center text-sm text-ink/40">Type to search your library</p>
      <FileRow v-for="f in results" :key="f.id" :file="f" @click="open(f)" />
    </main>
  </div>
</template>
