<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'
import { errorMessage } from '@/shared/lib/error'
import { Ic, ToolBar, toast } from '@/shared/ui'
import { libraryApi, useLibrary, type DocumentRecord } from '@/entities/file'

const lib = useLibrary()
const files = ref<DocumentRecord[]>([])
const busy = ref<string | null>(null)

async function load() {
  try { files.value = await libraryApi.listTrash() }
  catch (e) { toast(errorMessage(e), true) }
}

async function restore(id: string) {
  if (busy.value) return
  busy.value = id
  try {
    await libraryApi.restoreDocuments([id])
    files.value = files.value.filter(f => f.id !== id)
    await lib.load()
    toast(t('trash.restored'))
  } catch (e) { toast(errorMessage(e), true) }
  finally { busy.value = null }
}

onMounted(load)
</script>

<template>
  <div class="flex h-full flex-col bg-card">
    <ToolBar :title="t('trash.title')" />
    <div v-if="!files.length" class="grid flex-1 place-items-center text-sm text-ink/55">{{ t('trash.empty') }}</div>
    <div v-else class="flex-1 overflow-y-auto px-4 py-2">
      <div v-for="f in files" :key="f.id" class="flex items-center gap-3 border-b border-line/60 py-3">
        <Ic name="files" :size="24" class="shrink-0 text-primary" />
        <span class="min-w-0 flex-1 truncate text-sm">{{ f.displayName }}</span>
        <button class="rounded-full px-3 py-2 text-sm font-semibold text-primary disabled:opacity-40" :disabled="!!busy" @click="restore(f.id)">{{ t('trash.restore') }}</button>
      </div>
    </div>
  </div>
</template>
