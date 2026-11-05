<script setup lang="ts">
import { ref } from 'vue'
import ToolBar from '@/components/ToolBar.vue'
import FileSelect from '@/components/FileSelect.vue'
import BottomAction from '@/components/BottomAction.vue'
import { useLibrary } from '@/stores/library'
import { ACCEPT_ALL } from '@/lib/types'
import { askConfirm, toast } from '@/lib/dialogs'

const lib = useLibrary()
const ids = ref<string[]>([])

async function remove() {
  const n = ids.value.length
  if (!(await askConfirm('Delete files?', `${n} file${n > 1 ? 's' : ''} will be permanently removed. This can't be undone.`, 'Delete', true))) return
  await lib.remove(ids.value)
  ids.value = []
  toast('Deleted successfully')
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar title="Delete files" :subtitle="`${ids.length} selected`" />
    <FileSelect v-model="ids" :files="lib.all" :accept="ACCEPT_ALL" multiple empty-text="Your library is empty." />
    <BottomAction label="Delete" :disabled="!ids.length" @click="remove" />
  </div>
</template>
