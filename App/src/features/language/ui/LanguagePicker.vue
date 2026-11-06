<script setup lang="ts">
import { LANGUAGES, flagUrl, locale, setLocale, t } from '@/shared/i18n'
</script>

<template>
  <section>
    <h2 class="mb-3 text-sm font-semibold text-ink-strong">{{ t('settings.language') }}</h2>

    <button
      v-for="l in LANGUAGES"
      :key="l.code"
      class="mb-2 flex w-full items-center gap-3 rounded-2xl border p-3 text-left"
      :class="locale === l.code ? 'border-primary bg-primary/5' : 'border-line/60'"
      :aria-pressed="locale === l.code"
      @click="setLocale(l.code)"
    >
      <img :src="flagUrl(l.flag)" :alt="''" class="size-7 flex-none rounded-full object-cover" draggable="false" />
      <span class="min-w-0 flex-1 text-[15px] font-medium text-ink-strong">{{ l.name }}</span>
      <span class="grid size-5 flex-none place-items-center rounded-full border-2" :class="locale === l.code ? 'border-primary' : 'border-line'">
        <span v-if="locale === l.code" class="size-2.5 rounded-full bg-primary" />
      </span>
    </button>
  </section>
</template>
