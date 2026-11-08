<script setup lang="ts">
import { t } from '@/shared/i18n'
import { computed, ref } from 'vue'
import FileRow from './FileRow.vue'
import { Ic, toast, VirtualList } from '@/shared/ui'
import { errorMessage } from '@/shared/lib/error'
import { useLibrary } from '../model/store'
import { acceptExts, type FileMeta } from '../model/types'
import { useFileSearch } from '../model/use-file-search'

/**
 * Library file picker shared by the tool screens: lists matching files, lets the user tick
 * one or many (selection order is kept), and imports new files from the device.
 */
const props = defineProps<{
  files: FileMeta[]
  accept: string
  multiple?: boolean
  modelValue: string[]
  emptyText?: string
  /** Show the 1,2,3… order badge (merge, images → pdf). */
  ordered?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()

const lib = useLibrary()
const query = ref('')

const { results: shown, searching } = useFileSearch(() => props.files, query, () => lib.searchRevision, true)
const selection = computed(() => new Map(props.modelValue.map((id, index) => [id, index + 1])))

function toggle(id: string) {
  const cur = props.modelValue
  if (!props.multiple) return emit('update:modelValue', cur[0] === id ? [] : [id])
  emit('update:modelValue', selection.value.has(id) ? cur.filter((x) => x !== id) : [...cur, id])
}

async function pick() {
  let res
  try {
    res = await lib.importFromDevice({ accept: acceptExts(props.accept), multiple: props.multiple })
  } catch (e) {
    return void toast(errorMessage(e), true)
  }
  const { added, skipped } = res
  if (!added.length && !skipped.length) return
  if (skipped.length) toast(t('file.skipped', { names: skipped.join(', ') }), true)
  const wanted = added.filter(matches)
  if (added.length > wanted.length) toast(t('file.someNotUsable'))
  const ids = wanted.map((a) => a.id)
  if (ids.length) emit('update:modelValue', props.multiple ? [...props.modelValue, ...ids] : [ids[0]!])
}

function matches(f: FileMeta) {
  const exts = props.accept.split(',').map((s) => s.trim().toLowerCase())
  const ext = '.' + (f.name.split('.').pop() ?? '').toLowerCase()
  return exts.includes(ext) || (f.kind === 'image' && props.accept.includes('image'))
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-2 px-3 py-2">
      <div class="flex h-10 flex-1 items-center gap-2 rounded-full bg-surface px-3">
        <Ic name="search" :size="18" class="text-ink/40" />
        <input v-model="query" class="min-w-0 flex-1 bg-transparent text-sm outline-none" :placeholder="t('file.searchPlaceholder')" />
      </div>
      <button class="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-white active:opacity-80"
        @click="pick">
        <Ic name="upload" :size="18" /> {{ t('file.import') }}
      </button>
    </div>

    <p v-if="searching" role="status" class="px-4 py-2 text-xs text-ink/50">{{ t('search.working') }}</p>
    <VirtualList :items="shown" :reset-key="query" :bottom-space="12" class="px-2" :aria-busy="searching" :aria-label="t('file.searchPlaceholder')">
      <template #empty>
      <div v-if="!searching" class="grid h-full place-items-center px-8 text-center text-sm text-ink/50">
        <div>
          <Ic name="files" :size="44" class="mx-auto mb-2 text-surface-strong" />
          {{ emptyText ?? t('common.importHint') }}
        </div>
      </div>
      </template>
      <template #default="{ item: f }">
      <FileRow
        :file="f"
        selectable
        :selected="selection.has(f.id)"
        :order="ordered ? selection.get(f.id) : undefined"
        @click="toggle(f.id)"
      />
      </template>
    </VirtualList>
  </div>
</template>
