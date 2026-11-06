<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { toast } from '@/shared/ui'
import { t, type MessageKey } from '@/shared/i18n'
import { errorMessage } from '@/shared/lib/error'
import { isNative } from '@/shared/lib/platform'
import { libraryApi, type LibrarySettings } from '@/entities/file'

type Mode = LibrarySettings['saveMode']

const settings = ref<LibrarySettings>({ saveMode: 'app', saveFolderUri: null })
const busy = ref(false)
// Choosing where files go needs the Android pickers; the browser build only has app storage.
const native = isNative()

const modes: { id: Mode; title: MessageKey; hint: MessageKey }[] = [
  { id: 'app', title: 'settings.app.title', hint: 'settings.app.hint' },
  { id: 'ask', title: 'settings.ask.title', hint: 'settings.ask.hint' },
  { id: 'folder', title: 'settings.folder.title', hint: 'settings.folder.hint' },
]

onMounted(async () => {
  try { settings.value = await libraryApi.getSettings() } catch (e) { toast(errorMessage(e), true) }
})

async function run(job: () => Promise<LibrarySettings>) {
  if (busy.value) return
  busy.value = true
  try {
    settings.value = await job()
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast(errorMessage(e), true)
  } finally {
    busy.value = false
  }
}

function choose(mode: Mode) {
  if (mode === settings.value.saveMode) return
  // A folder needs its permission granted by the system picker, which only the native side can open.
  if (mode === 'folder') return void run(() => libraryApi.pickSaveFolder())
  void run(() => libraryApi.setSettings({ saveMode: mode }))
}

const disabled = (m: Mode) => !native && m !== 'app'
</script>

<template>
  <section>
      <h2 class="mb-1 text-sm font-semibold text-ink-strong">{{ t('settings.where') }}</h2>
      <p class="mb-3 text-xs text-ink/60">{{ t('settings.applies') }}</p>

      <button
        v-for="m in modes"
        :key="m.id"
        class="mb-2 flex w-full items-start gap-3 rounded-2xl border p-3 text-left disabled:opacity-40"
        :class="settings.saveMode === m.id ? 'border-primary bg-primary/5' : 'border-line/60'"
        :disabled="busy || disabled(m.id)"
        @click="choose(m.id)"
      >
        <span class="mt-0.5 grid size-5 flex-none place-items-center rounded-full border-2" :class="settings.saveMode === m.id ? 'border-primary' : 'border-line'">
          <span v-if="settings.saveMode === m.id" class="size-2.5 rounded-full bg-primary" />
        </span>
        <span class="min-w-0">
          <span class="block text-[15px] font-medium text-ink-strong">{{ t(m.title) }}</span>
          <span class="block text-xs text-ink/60">{{ t(m.hint) }}</span>
        </span>
      </button>

      <p v-if="settings.saveMode === 'folder' && settings.saveFolderUri" class="break-all rounded-xl bg-surface p-3 text-xs text-ink/70">
        {{ t('settings.folderLabel', { uri: decodeURIComponent(settings.saveFolderUri) }) }}
      </p>
      <button
        v-if="native && settings.saveMode === 'folder'"
        class="mt-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink-strong active:opacity-70"
        :disabled="busy"
        @click="run(() => libraryApi.pickSaveFolder())"
      >{{ t('settings.changeFolder') }}</button>

      <p v-if="!native" class="mt-3 text-xs text-ink/50">{{ t('settings.browserOnly') }}</p>
  </section>
</template>
