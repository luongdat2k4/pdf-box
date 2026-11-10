<script setup lang="ts">
import { t } from '@/shared/i18n'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Ic } from '@/shared/ui'
import type { IconName } from '@/shared/config/icons'
import type { FileMeta } from '../model/types'
import { formatDate, formatSize } from '@/shared/lib/format'
import { api } from '../api/native-api'

const props = defineProps<{
  file: FileMeta
  selectable?: boolean
  selected?: boolean
  /** shows the favourite star and the ⋮ menu button */
  actions?: boolean
  order?: number
}>()
const emit = defineEmits<{ click: []; menu: []; star: [] }>()
const thumbnailUrl = ref<string | null>(null)
let request = 0
watch(() => [props.file.id, props.file.thumbnailPath], async () => {
  const current = ++request
  if (thumbnailUrl.value) URL.revokeObjectURL(thumbnailUrl.value)
  thumbnailUrl.value = null
  if (props.file.kind !== 'image' || !props.file.thumbnailPath) return
  try {
    const blob = await api.readThumbnail(props.file.id)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    if (current === request) thumbnailUrl.value = url
    else URL.revokeObjectURL(url)
  } catch { /* A missing or unreadable cache keeps the icon visible. */ }
}, { immediate: true })
onBeforeUnmount(() => {
  request++
  if (thumbnailUrl.value) URL.revokeObjectURL(thumbnailUrl.value)
})

const icon = computed<{ name: IconName; cls: string }>(() => {
  switch (props.file.kind) {
    case 'pdf': return { name: 'doc', cls: 'bg-red-500/10 text-red-500' }
    case 'word': return { name: 'doc', cls: 'bg-blue-500/10 text-blue-500' }
    case 'excel': return { name: 'excel', cls: 'bg-green-500/10 text-green-600' }
    case 'ppt': return { name: 'ppt', cls: 'bg-orange-500/10 text-orange-500' }
    case 'md': return { name: 'code', cls: 'bg-slate-500/10 text-slate-500' }
    case 'image': return { name: 'fileImage', cls: 'bg-purple-500/10 text-purple-500' }
    default: return { name: 'file', cls: 'bg-surface text-ink/60' }
  }
})
</script>

<template>
  <div
    class="flex h-16 items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-surface"
    :class="selected ? 'bg-surface-strong' : ''"
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter="emit('click')"
  >
    <div v-if="selectable" class="grid size-5 flex-none place-items-center rounded-md border-2"
      :class="selected ? 'border-primary bg-primary text-white' : 'border-line bg-card'">
      <Ic v-if="selected" name="check" :size="14" />
    </div>
    <div class="grid size-11 flex-none place-items-center rounded-xl" :class="icon.cls">
      <img v-if="thumbnailUrl" :src="thumbnailUrl" alt="" class="size-11 rounded-xl object-cover" />
      <Ic v-else :name="icon.name" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-[15px] font-medium text-ink-strong">{{ file.name }}</p>
      <p class="truncate text-xs text-ink/55">{{ formatSize(file.size) }} · {{ file.modifiedAt ? formatDate(file.modifiedAt) : '—' }}</p>
    </div>
    <span v-if="order" class="grid size-6 flex-none place-items-center rounded-full bg-primary text-xs font-semibold text-white">
      {{ order }}
    </span>
    <template v-if="actions">
      <button class="grid size-9 place-items-center rounded-full active:bg-card" :aria-label="file.favorite ? t('file.unfavourite') : t('file.favourite')"
        :class="file.favorite ? 'text-amber-400' : 'text-ink/30'" @click.stop="emit('star')">
        <Ic name="star" :size="20" />
      </button>
      <button class="grid size-9 place-items-center rounded-full text-ink/60 active:bg-card" :aria-label="t('common.more')" @click.stop="emit('menu')">
        <Ic name="more" :size="20" />
      </button>
    </template>
  </div>
</template>
