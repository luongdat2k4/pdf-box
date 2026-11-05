<script setup lang="ts">
import { computed } from 'vue'
import Ic from './Ic.vue'
import type { IconName } from '@/lib/icons'
import type { FileMeta } from '@/lib/types'
import { formatDate, formatSize } from '@/lib/format'

const props = defineProps<{
  file: FileMeta
  selectable?: boolean
  selected?: boolean
  /** shows the favourite star and the ⋮ menu button */
  actions?: boolean
  order?: number
}>()
const emit = defineEmits<{ click: []; menu: []; star: [] }>()

const icon = computed<{ name: IconName; cls: string }>(() => {
  switch (props.file.kind) {
    case 'pdf': return { name: 'doc', cls: 'bg-red-50 text-red-500' }
    case 'word': return { name: 'doc', cls: 'bg-blue-50 text-blue-600' }
    case 'excel': return { name: 'excel', cls: 'bg-green-50 text-green-600' }
    case 'ppt': return { name: 'ppt', cls: 'bg-orange-50 text-orange-500' }
    case 'image': return { name: 'fileImage', cls: 'bg-purple-50 text-purple-500' }
    default: return { name: 'file', cls: 'bg-surface text-ink/60' }
  }
})
</script>

<template>
  <div
    class="flex items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-surface"
    :class="selected ? 'bg-surface-strong' : ''"
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter="emit('click')"
  >
    <div v-if="selectable" class="grid size-5 flex-none place-items-center rounded-md border-2"
      :class="selected ? 'border-primary bg-primary text-white' : 'border-line bg-white'">
      <Ic v-if="selected" name="check" :size="14" />
    </div>
    <div class="grid size-11 flex-none place-items-center rounded-xl" :class="icon.cls">
      <Ic :name="icon.name" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-[15px] font-medium text-ink-strong">{{ file.name }}</p>
      <p class="truncate text-xs text-ink/55">{{ formatSize(file.size) }} · {{ formatDate(file.addedAt) }}</p>
    </div>
    <span v-if="order" class="grid size-6 flex-none place-items-center rounded-full bg-primary text-xs font-semibold text-white">
      {{ order }}
    </span>
    <template v-if="actions">
      <button class="grid size-9 place-items-center rounded-full active:bg-white" :aria-label="file.favorite ? 'Remove favourite' : 'Add favourite'"
        :class="file.favorite ? 'text-amber-400' : 'text-ink/30'" @click.stop="emit('star')">
        <Ic name="star" :size="20" />
      </button>
      <button class="grid size-9 place-items-center rounded-full text-ink/60 active:bg-white" aria-label="More" @click.stop="emit('menu')">
        <Ic name="more" :size="20" />
      </button>
    </template>
  </div>
</template>
