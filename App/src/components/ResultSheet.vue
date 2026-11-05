<script setup lang="ts">
import { useRouter } from 'vue-router'
import BottomSheet from './BottomSheet.vue'
import Ic from './Ic.vue'
import type { FileMeta } from '@/lib/types'
import { useLibrary } from '@/stores/library'
import { saveToDevice, shareFile } from '@/lib/platform'
import { errorMessage, toast } from '@/lib/dialogs'

/** "Success" dialog shown after every tool: open the result, share it or save a copy. */
const props = defineProps<{ files: FileMeta[]; title?: string }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const lib = useLibrary()

function open(f: FileMeta) {
  emit('close')
  void router.push(f.kind === 'pdf' ? `/reader/${f.id}` : f.kind === 'image' ? '/' : `/office/${f.id}`)
}

async function share(f: FileMeta) {
  try { await shareFile(f.name, await lib.blobOf(f.id)) } catch (e) { if ((e as Error).name !== 'AbortError') toast(errorMessage(e), true) }
}

async function save(f: FileMeta) {
  try { toast(`Saved: ${await saveToDevice(f.name, await lib.blobOf(f.id))}`) } catch (e) { toast(errorMessage(e), true) }
}
</script>

<template>
  <BottomSheet :open="files.length > 0" @close="emit('close')">
    <div class="flex flex-col items-center pb-2 text-center">
      <div class="grid size-14 place-items-center rounded-full bg-green-50 text-green-600"><Ic name="ok" :size="30" /></div>
      <h2 class="mt-2 text-lg font-semibold text-ink-strong">{{ title ?? 'Done' }}</h2>
      <p class="text-xs text-ink/55">Saved to your library.</p>
    </div>
    <ul class="mt-3 space-y-2">
      <li v-for="f in props.files.slice(0, 6)" :key="f.id" class="flex items-center gap-2 rounded-2xl bg-surface p-2.5">
        <p class="min-w-0 flex-1 truncate pl-1 text-sm font-medium">{{ f.name }}</p>
        <button class="grid size-9 place-items-center rounded-full text-primary active:bg-white" aria-label="Share" @click="share(f)"><Ic name="share" :size="19" /></button>
        <button class="grid size-9 place-items-center rounded-full text-primary active:bg-white" aria-label="Save to device" @click="save(f)"><Ic name="download" :size="19" /></button>
        <button v-if="f.kind !== 'image'" class="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white" @click="open(f)">Open</button>
      </li>
    </ul>
    <p v-if="props.files.length > 6" class="mt-2 text-center text-xs text-ink/50">+ {{ props.files.length - 6 }} more in your library</p>
    <button class="mt-4 h-11 w-full rounded-2xl bg-surface-strong text-sm font-semibold text-primary" @click="emit('close')">Done</button>
  </BottomSheet>
</template>
