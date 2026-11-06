<script setup lang="ts">
import { t } from '../../i18n'
import { nextTick, ref, watch } from 'vue'
import { dialogState, toasts } from './model'
import Ic from '../Ic.vue'

const text = ref('')
const input = ref<HTMLInputElement | null>(null)
const show = ref(false)

watch(dialogState, async (s) => {
  if (s?.kind === 'prompt') text.value = s.value
  else text.value = ''
  show.value = false
  if (s && (s.kind === 'prompt' || s.kind === 'password')) {
    await nextTick()
    input.value?.focus()
  }
})

function cancel() {
  const s = dialogState.value
  if (!s) return
  dialogState.value = null
  if (s.kind === 'confirm') s.resolve(false)
  else s.resolve(null)
}

function ok() {
  const s = dialogState.value
  if (!s) return
  if (s.kind !== 'confirm' && !text.value) return
  dialogState.value = null
  if (s.kind === 'confirm') s.resolve(true)
  else s.resolve(text.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogState" class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" @click.self="cancel">
      <div class="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true">
        <h2 class="text-base font-semibold text-ink-strong">{{ dialogState.title }}</h2>
        <p v-if="dialogState.kind === 'confirm'" class="mt-2 text-sm text-ink/70">{{ dialogState.message }}</p>
        <p v-if="dialogState.kind === 'password' && dialogState.message" class="mt-2 text-sm text-ink/70">
          {{ dialogState.message }}
        </p>

        <form v-if="dialogState.kind !== 'confirm'" class="mt-3" @submit.prevent="ok">
          <label v-if="dialogState.kind === 'prompt'" class="mb-1 block text-xs text-ink/60">{{ dialogState.label }}</label>
          <div class="relative">
            <input
              ref="input"
              v-model="text"
              :type="dialogState.kind === 'password' && !show ? 'password' : 'text'"
              :placeholder="dialogState.kind === 'password' ? t('dialog.password') : ''"
              autocomplete="off"
              class="w-full rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              :class="dialogState.kind === 'password' && dialogState.error ? 'border-danger' : 'border-transparent'"
            />
            <button
              v-if="dialogState.kind === 'password'"
              type="button"
              class="absolute inset-y-0 right-2 px-2 text-xs font-medium text-primary"
              @click="show = !show"
            >
              {{ show ? t('dialog.hide') : t('dialog.show') }}
            </button>
          </div>
          <p v-if="dialogState.kind === 'password' && dialogState.error" class="mt-1 text-xs text-danger">
            {{ t('dialog.wrongPassword') }}
          </p>
        </form>

        <div class="mt-5 flex justify-end gap-2">
          <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink/70 active:bg-surface" @click="cancel">
            {{ t('common.cancel') }}
          </button>
          <button
            class="rounded-xl px-4 py-2 text-sm font-semibold text-white active:opacity-80"
            :class="dialogState.kind === 'confirm' && dialogState.danger ? 'bg-danger' : 'bg-primary'"
            @click="ok"
          >
            {{ dialogState.kind === 'password' ? t('common.open') : dialogState.confirmText }}
          </button>
        </div>
      </div>
    </div>

    <div class="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-6">
      <div
        v-for="item in toasts"
        :key="item.id"
        class="flex max-w-sm items-start gap-2 rounded-2xl px-4 py-2.5 text-sm text-white shadow-lg"
        :class="item.error ? 'bg-danger' : 'bg-ink-strong/90'"
        role="status"
      >
        <Ic :name="item.error ? 'warn' : 'ok'" :size="18" class="mt-0.5 flex-none" />
        <span>{{ item.text }}</span>
      </div>
    </div>
  </Teleport>
</template>
