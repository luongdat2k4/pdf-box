<script setup lang="ts">
import { t } from '@/shared/i18n'
import { ref } from 'vue'
import { tp } from '@/shared/i18n'
import { ToolBar, BottomAction, askConfirm, toast } from '@/shared/ui'
import { FileSelect, useLibrary, ACCEPT_ALL, deletionErrorMessage } from '@/entities/file'

const lib = useLibrary()
const ids = ref<string[]>([])
const busy = ref(false)

async function remove() {
  if (busy.value || !ids.value.length) return
  busy.value = true
  try {
    const selected = [...ids.value]
    const n = selected.length
    if (!(await askConfirm(t('delete.confirmTitle'), tp('delete.confirmMsg', n), t('common.delete'), true))) return
    await lib.remove(selected)
    ids.value = []
    toast(t('delete.success'))
  } catch (e) {
    ids.value = ids.value.filter(id => lib.find(id))
    toast(deletionErrorMessage(e), true)
  } finally { busy.value = false }
}
</script>

<template>
  <div class="flex h-full flex-col bg-card">
    <ToolBar :title="t('delete.title')" :subtitle="t('delete.selected', { n: ids.length })" />
    <FileSelect v-model="ids" :files="lib.all" :accept="ACCEPT_ALL" multiple :empty-text="t('delete.empty')" />
    <BottomAction :label="t('common.delete')" :busy="busy" :disabled="busy || !ids.length" @click="remove" />
  </div>
</template>
