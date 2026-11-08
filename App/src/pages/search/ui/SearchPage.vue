<script setup lang="ts">
import { t } from '@/shared/i18n'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Ic, VirtualList } from '@/shared/ui'
import { FileRow, useLibrary, useFileSearch, openRoute, type FileMeta } from '@/entities/file'

const router = useRouter()
const lib = useLibrary()
const q = ref('')
const input = ref<HTMLInputElement | null>(null)

const hasQuery = computed(() => !!q.value.trim())
const { results, searching } = useFileSearch(() => lib.all, q, () => lib.searchRevision)

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
        <button class="grid size-10 place-items-center rounded-full active:bg-surface" :aria-label="t('common.back')" @click="router.back()"><Ic name="back" /></button>
        <div class="flex h-10 flex-1 items-center gap-2 rounded-full bg-surface px-3">
          <Ic name="search" :size="18" class="text-ink/40" />
          <input ref="input" v-model="q" class="min-w-0 flex-1 bg-transparent text-sm outline-none" :placeholder="t('search.placeholder')" />
          <button v-if="q" :aria-label="t('common.clear')" @click="q = ''"><Ic name="close" :size="18" class="text-ink/40" /></button>
        </div>
      </div>
    </header>
    <p v-if="searching" role="status" class="px-4 py-3 text-sm text-ink/50">{{ t('search.working') }}</p>
    <p v-else-if="hasQuery" role="status" class="px-4 py-2 text-xs text-ink/50">{{ t('search.count', { n: results.length }) }}</p>
    <VirtualList :items="results" :reset-key="q" :bottom-space="12" class="px-2" :aria-busy="searching" :aria-label="t('home.searchFiles')">
      <template #empty>
        <p v-if="hasQuery && !searching" class="mt-24 text-center text-sm text-ink/50">{{ t('search.none', { q }) }}</p>
        <p v-else-if="!hasQuery" class="mt-24 text-center text-sm text-ink/40">{{ t('search.hint') }}</p>
      </template>
      <template #default="{ item: f }"><FileRow :file="f" @click="open(f)" /></template>
    </VirtualList>
  </div>
</template>
