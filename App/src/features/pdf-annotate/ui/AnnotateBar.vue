<script setup lang="ts">
import { t } from '@/shared/i18n'
import { Ic } from '@/shared/ui'
import type { IconName } from '@/shared/config/icons'
import type { MarkTool } from '@/entities/pdf'
import { MARK_COLORS } from '../model/use-annotations'

defineProps<{ canUndo: boolean; canRedo: boolean; canSave: boolean; saving: boolean }>()
const tool = defineModel<MarkTool>('tool', { required: true })
const color = defineModel<string>('color', { required: true })
const emit = defineEmits<{ undo: []; redo: []; save: [] }>()

const tools: [MarkTool, IconName][] = [
  ['hand', 'thumbs'], ['highlight', 'highlight'], ['underline', 'underline'], ['strike', 'strike'], ['ink', 'pen'],
]
</script>

<template>
  <div class="px-3 py-2">
    <div class="flex items-center justify-between gap-1">
      <div class="flex gap-0.5">
        <button v-for="t in tools" :key="t[0]"
          class="grid size-9 place-items-center rounded-xl" :class="tool === t[0] ? 'bg-primary text-white' : 'text-ink/70 active:bg-surface'"
          :aria-label="t[0]" @click="tool = t[0]">
          <Ic :name="t[1]" :size="20" />
        </button>
      </div>
      <div class="flex items-center gap-0.5">
        <button class="grid size-9 place-items-center rounded-full disabled:opacity-25 active:bg-surface" :disabled="!canUndo" :aria-label="t('annotate.undo')" @click="emit('undo')"><Ic name="undo" :size="20" /></button>
        <button class="grid size-9 place-items-center rounded-full disabled:opacity-25 active:bg-surface" :disabled="!canRedo" :aria-label="t('annotate.redo')" @click="emit('redo')"><Ic name="redo" :size="20" /></button>
        <button class="ml-0.5 flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-white disabled:bg-primary/35" :disabled="!canSave || saving" @click="emit('save')">
          <Ic :name="saving ? 'loading' : 'save'" :spin="saving" :size="18" /> {{ t('common.save') }}
        </button>
      </div>
    </div>
    <div class="mt-2 flex items-center gap-3">
      <span class="text-xs text-ink/50">{{ tool === 'hand' ? t('annotate.scrollMode') : t('annotate.dragToMark') }}</span>
      <span class="flex-1" />
      <button v-for="c in MARK_COLORS" :key="c" class="size-6 rounded-full border-2" :style="{ background: c, borderColor: color === c ? '#2d75ed' : 'transparent' }" :aria-label="`Colour ${c}`" @click="color = c" />
    </div>
  </div>
</template>
