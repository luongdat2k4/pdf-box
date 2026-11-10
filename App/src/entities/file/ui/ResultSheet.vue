<script setup lang="ts">
import { t } from '@/shared/i18n'
import { useRouter } from 'vue-router'
import { BottomSheet, Ic } from '@/shared/ui'
import { useFileActions } from '../model/use-file-actions'
import { openRoute } from '../lib/open-route'
import type { FileMeta } from '../model/types'

/** "Success" dialog shown after every tool: open the result, share it or save a copy. */
const props = defineProps<{ files: FileMeta[]; title?: string }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const actions = useFileActions()

function open(f: FileMeta) {
  emit('close')
  void router.push(openRoute(f))
}
</script>

<template>
  <BottomSheet :open="files.length > 0" @close="emit('close')">
    <div class="flex flex-col items-center pb-2 text-center">
      <div class="grid size-14 place-items-center rounded-full bg-green-500/12 text-green-600"><Ic name="ok" :size="30" /></div>
      <h2 class="mt-2 text-lg font-semibold text-ink-strong">{{ title ?? t('common.done') }}</h2>
      <p class="text-xs text-ink/55">{{ t('result.saved') }}</p>
    </div>
    <ul class="mt-3 space-y-2">
      <li v-for="f in props.files.slice(0, 6)" :key="f.id" class="flex items-center gap-2 rounded-2xl bg-surface p-2.5">
        <p class="min-w-0 flex-1 truncate pl-1 text-sm font-medium">{{ f.name }}</p>
        <button class="grid size-9 place-items-center rounded-full text-primary active:bg-card" :aria-label="t('common.share')" @click="actions.share(f)"><Ic name="share" :size="19" /></button>
        <button class="grid size-9 place-items-center rounded-full text-primary active:bg-card" :aria-label="t('common.saveToDevice')" @click="actions.saveCopy(f)"><Ic name="download" :size="19" /></button>
        <button v-if="f.kind !== 'image'" class="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white" @click="open(f)">{{ t('common.open') }}</button>
      </li>
    </ul>
    <p v-if="props.files.length > 6" class="mt-2 text-center text-xs text-ink/50">{{ t('result.more', { n: props.files.length - 6 }) }}</p>
    <button class="mt-4 h-11 w-full rounded-2xl bg-surface-strong text-sm font-semibold text-primary" @click="emit('close')">{{ t('common.done') }}</button>
  </BottomSheet>
</template>
