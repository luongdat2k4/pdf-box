<script setup lang="ts">
import { t } from '@/shared/i18n'
import { ref, watch } from 'vue'
import { ToolBar, BottomAction, Ic, askText, toast } from '@/shared/ui'
import { FileSelect, ResultSheet, useLibrary, ACCEPT_PDF, savePdf, useRunner } from '@/entities/file'
import { openWithPassword, destroyDoc, openPdf, PasswordRequiredError, lockPdf, unlockPdf } from '@/entities/pdf'
import { errorMessage } from '@/shared/lib/error'
import { stripExt } from '@/shared/lib/format'

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
      toast(t('lock.unlockedToast'))
      return [await savePdf(`${stripExt(f.name)}_unlocked`, out)]
    }
    const pw = await askText(t('lock.setTitle'), t('lock.setMsg'), '', t('lock.lock'))
    if (!pw) return null
    const out = await lockPdf({ bytes: await lib.bytesOf(f.id) }, pw)
    return [await savePdf(`${stripExt(f.name)}_locked`, out)]
  })
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ToolBar :title="t('lock.title')" :subtitle="t('lock.subtitle')" />
    <FileSelect v-model="ids" :files="lib.pdfs" :accept="ACCEPT_PDF" :empty-text="t('common.noPdf')" />
    <div v-if="ids.length && locked !== null" class="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm text-ink/70">
      <Ic :name="locked ? 'lock' : 'unlock'" :size="18" class="text-primary" />
      {{ locked ? t('lock.isProtected') : t('lock.notProtected') }}
    </div>
    <BottomAction :label="locked ? t('lock.unlock') : t('lock.lock')" :busy="busy" :disabled="!ids.length || locked === null" @click="go" />
    <ResultSheet :files="result" :title="locked ? t('lock.unlocked') : t('lock.locked')" @close="result = []; ids = []" />
  </div>
</template>
