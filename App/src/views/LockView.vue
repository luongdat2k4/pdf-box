<script setup lang="ts">
import { ref, watch } from 'vue'
import ToolBar from '@/components/ToolBar.vue'
import FileSelect from '@/components/FileSelect.vue'
import BottomAction from '@/components/BottomAction.vue'
import ResultSheet from '@/components/ResultSheet.vue'
import Ic from '@/components/Ic.vue'
import { useLibrary } from '@/stores/library'
import { ACCEPT_PDF } from '@/lib/types'
import { openWithPassword } from '@/lib/pdfAccess'
import { destroyDoc, openPdf, PasswordRequiredError } from '@/lib/pdfjs'
import { lockPdf, unlockPdf } from '@/lib/pdfOps'
import { savePdf, useRunner } from '@/lib/useRunner'
import { askText, errorMessage, toast } from '@/lib/dialogs'
import { stripExt } from '@/lib/format'

const lib = useLibrary()
const { busy, result, run } = useRunner()
const ids = ref<string[]>([])
const locked = ref<boolean | null>(null) // null = unknown / probing

// Detect whether the chosen file is already encrypted so the button reads Lock or Unlock.
watch(ids, async ([id]) => {
  locked.value = null
  if (!id) return
  try {
    const doc = await openPdf(await lib.bytesOf(id))
    await destroyDoc(doc)
    if (ids.value[0] === id) locked.value = false
  } catch (e) {
    if (e instanceof PasswordRequiredError) { if (ids.value[0] === id) locked.value = true }
    else toast(errorMessage(e), true)
  }
})

function go() {
  const f = ids.value[0] ? lib.find(ids.value[0]) : undefined
  if (!f) return
  void run(async () => {
    if (locked.value) {
      // Unlock: open with the right password, then write the document back without encryption.
      const opened = await openWithPassword(await lib.bytesOf(f.id), f.name)
      if (!opened) return null
      await destroyDoc(opened.doc)
      const out = await unlockPdf(opened.source)
      toast('Unlocked. A copy without a password was created.')
      return [await savePdf(`${stripExt(f.name)}_unlocked`, out)]
    }
    const pw = await askText('Set a password', 'Anyone opening this PDF will need it.', '', 'Lock')
    if (!pw) return null
    const out = await lockPdf({ bytes: await lib.bytesOf(f.id) }, pw)
    return [await savePdf(`${stripExt(f.name)}_locked`, out)]
  })
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar title="Lock / Unlock PDF" subtitle="AES-128 password protection" />
    <FileSelect v-model="ids" :files="lib.pdfs" :accept="ACCEPT_PDF" empty-text="No PDF files yet. Use Import to add some." />
    <div v-if="ids.length && locked !== null" class="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm text-ink/70">
      <Ic :name="locked ? 'lock' : 'unlock'" :size="18" class="text-primary" />
      {{ locked ? 'This file is password protected.' : 'This file is not protected.' }}
    </div>
    <BottomAction :label="locked ? 'Unlock' : 'Lock'" :busy="busy" :disabled="!ids.length || locked === null" @click="go" />
    <ResultSheet :files="result" :title="locked ? 'Unlocked' : 'Locked'" @close="result = []; ids = []" />
  </div>
</template>
