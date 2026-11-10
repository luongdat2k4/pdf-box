<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { LANGUAGES, flagUrl, locale, setLocale, t, type Locale } from '@/shared/i18n'
import { BottomSheet, Ic } from '@/shared/ui'

// Settings shows one row with the current language; tapping it opens the full list in a sheet.
const open = ref(false)
const list = ref<HTMLElement | null>(null)
const current = computed(() => LANGUAGES.find((l) => l.code === locale.value) ?? LANGUAGES[0])

async function choose(code: Locale) {
  open.value = false
  await setLocale(code)
}

// Bring the current language into view when the sheet opens (it may be far down the list).
watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  list.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <section>
    <h2 class="mb-3 text-sm font-semibold text-ink-strong">{{ t('settings.language') }}</h2>

    <!-- Rows list languages rather than text in the current one, so they stay left to right in every language. -->
    <button
      class="flex w-full items-center gap-3 rounded-2xl border border-line/60 p-3 text-left [direction:ltr] active:bg-surface"
      aria-haspopup="dialog"
      @click="open = true"
    >
      <img :src="flagUrl(current.flag)" alt="" class="size-7 flex-none rounded-full object-cover" draggable="false" />
      <span class="min-w-0 flex-1 text-left text-[15px] font-medium text-ink-strong [unicode-bidi:plaintext]">{{ current.name }}</span>
      <Ic name="next" :size="20" class="flex-none text-ink/40" />
    </button>

    <BottomSheet :open="open" :title="t('settings.language')" @close="open = false">
      <div ref="list" role="radiogroup" :aria-label="t('settings.language')" class="space-y-2">
        <button
          v-for="l in LANGUAGES"
          :key="l.code"
          role="radio"
          :aria-checked="locale === l.code"
          class="flex w-full items-center gap-3 rounded-2xl border p-3 text-left [direction:ltr]"
          :class="locale === l.code ? 'border-primary bg-primary/5' : 'border-line/60'"
          @click="choose(l.code)"
        >
          <img :src="flagUrl(l.flag)" alt="" class="size-7 flex-none rounded-full object-cover" draggable="false" />
          <span class="min-w-0 flex-1 text-left text-[15px] font-medium text-ink-strong [unicode-bidi:plaintext]">{{ l.name }}</span>
          <span class="grid size-5 flex-none place-items-center rounded-full border-2" :class="locale === l.code ? 'border-primary' : 'border-line'">
            <span v-if="locale === l.code" class="size-2.5 rounded-full bg-primary" />
          </span>
        </button>
      </div>
    </BottomSheet>
  </section>
</template>
