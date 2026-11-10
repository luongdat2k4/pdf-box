<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { LANGUAGES, flagUrl, locale, t } from '@/shared/i18n'
import { Ic } from '@/shared/ui'

// Settings shows one row with the current language; tapping it opens the full-screen list (/settings/language).
const router = useRouter()
const current = computed(() => LANGUAGES.find((l) => l.code === locale.value) ?? LANGUAGES[0])
</script>

<template>
  <section>
    <h2 class="mb-3 text-sm font-semibold text-ink-strong">{{ t('settings.language') }}</h2>

    <!-- Rows list languages rather than text in the current one, so they stay left to right in every language. -->
    <button
      class="flex w-full items-center gap-3 rounded-2xl border border-line/60 p-3 text-left [direction:ltr] active:bg-surface"
      @click="router.push({ name: 'settings-language' })"
    >
      <img :src="flagUrl(current.flag)" alt="" class="size-7 flex-none rounded-full object-cover" draggable="false" />
      <span class="min-w-0 flex-1 text-left text-[15px] font-medium text-ink-strong [unicode-bidi:plaintext]">{{ current.name }}</span>
      <Ic name="next" :size="20" class="flex-none text-ink/40" />
    </button>
  </section>
</template>
