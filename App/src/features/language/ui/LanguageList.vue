<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { LANGUAGES, flagUrl, locale, setLocale, t } from '@/shared/i18n'

/** Every language as a radio list; choosing one switches the app language right away. */
const list = ref<HTMLElement | null>(null)

// The current language may be far down the list: bring it into view.
onMounted(async () => {
  await nextTick()
  list.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <!-- Rows list languages rather than text in the current one, so they stay left to right in every language. -->
  <div ref="list" role="radiogroup" :aria-label="t('settings.language')" class="space-y-2">
    <button
      v-for="l in LANGUAGES"
      :key="l.code"
      role="radio"
      :aria-checked="locale === l.code"
      class="flex w-full items-center gap-3 rounded-2xl border p-3 text-left [direction:ltr]"
      :class="locale === l.code ? 'border-primary bg-primary/5' : 'border-line/60 active:bg-surface'"
      @click="setLocale(l.code)"
    >
      <img :src="flagUrl(l.flag)" alt="" class="size-7 flex-none rounded-full object-cover" draggable="false" />
      <span class="min-w-0 flex-1 text-left text-[15px] font-medium text-ink-strong [unicode-bidi:plaintext]">{{ l.name }}</span>
      <span class="grid size-5 flex-none place-items-center rounded-full border-2" :class="locale === l.code ? 'border-primary' : 'border-line'">
        <span v-if="locale === l.code" class="size-2.5 rounded-full bg-primary" />
      </span>
    </button>
  </div>
</template>
