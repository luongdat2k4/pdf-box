<script setup lang="ts">
import { t } from '@/shared/i18n'
import { ref } from 'vue'
import { tp } from '@/shared/i18n'
import { ToolBar, BottomAction, askConfirm, toast } from '@/shared/ui'
import { FileSelect, useLibrary, ACCEPT_ALL } from '@/entities/file'

const lib = useLibrary()
const ids = ref<string[]>([])

async function remove() {
  const n = ids.value.length
  if (!(await askConfirm(t('delete.confirmTitle'), tp('delete.confirmMsg', n), t('common.delete'), true))) return
  await lib.remove(ids.value)
  ids.value = []
  toast(t('delete.success'))
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar :title="t('delete.title')" :subtitle="t('delete.selected', { n: ids.length })" />
    <FileSelect v-model="ids" :files="lib.all" :accept="ACCEPT_ALL" multiple :empty-text="t('delete.empty')" />
    <BottomAction :label="t('common.delete')" :disabled="!ids.length" @click="remove" />
  </div>
</template>
