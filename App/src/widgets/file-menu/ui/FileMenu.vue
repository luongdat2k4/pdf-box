<script setup lang="ts">
import { ref } from 'vue'
import { BottomSheet, Ic } from '@/shared/ui'
import { formatDate, formatSize } from '@/shared/lib/format'
import { useFileActions, useLibrary, type FileMeta } from '@/entities/file'

/** Per-file action sheet (open, rename, favourite, share, save, details, delete) plus its detail sheet. */
const props = defineProps<{ file: FileMeta | null }>()
const emit = defineEmits<{ close: []; open: [file: FileMeta] }>()

const lib = useLibrary()
const actions = useFileActions()
const details = ref<FileMeta | null>(null)

// Run an action, then close the menu. The file is captured first because closing clears the prop.
function run(fn: (f: FileMeta) => unknown) {
  const f = props.file
  if (!f) return
  emit('close')
  void fn(f)
}
</script>

<template>
  <BottomSheet :open="!!file" :title="file?.name" @close="emit('close')">
    <div v-if="file" class="divide-y divide-line/40">
      <button class="flex w-full items-center gap-3 py-3 text-sm" @click="run((f) => emit('open', f))"><Ic name="next" :size="20" /> Open</button>
      <button class="flex w-full items-center gap-3 py-3 text-sm" @click="run(actions.rename)"><Ic name="rename" :size="20" /> Rename</button>
      <button class="flex w-full items-center gap-3 py-3 text-sm" @click="run((f) => lib.toggleFavorite(f.id))"><Ic name="star" :size="20" /> {{ file.favorite ? 'Remove from favorites' : 'Add to favorites' }}</button>
      <button class="flex w-full items-center gap-3 py-3 text-sm" @click="run(actions.share)"><Ic name="share" :size="20" /> Share</button>
      <button class="flex w-full items-center gap-3 py-3 text-sm" @click="run(actions.saveCopy)"><Ic name="download" :size="20" /> Save to device</button>
      <button class="flex w-full items-center gap-3 py-3 text-sm" @click="run((f) => (details = f))"><Ic name="info" :size="20" /> Details</button>
      <button class="flex w-full items-center gap-3 py-3 text-sm text-danger" @click="run(actions.remove)"><Ic name="trash" :size="20" /> Delete</button>
    </div>
  </BottomSheet>

  <BottomSheet :open="!!details" title="File detail" @close="details = null">
    <dl v-if="details" class="space-y-2 text-sm">
      <div class="flex justify-between gap-4"><dt class="text-ink/55">File name</dt><dd class="break-all text-right font-medium">{{ details.name }}</dd></div>
      <div class="flex justify-between"><dt class="text-ink/55">File size</dt><dd class="font-medium">{{ formatSize(details.size) }}</dd></div>
      <div class="flex justify-between"><dt class="text-ink/55">Type</dt><dd class="font-medium uppercase">{{ details.kind }}</dd></div>
      <div class="flex justify-between"><dt class="text-ink/55">Added</dt><dd class="font-medium">{{ formatDate(details.addedAt) }}</dd></div>
    </dl>
  </BottomSheet>
</template>
