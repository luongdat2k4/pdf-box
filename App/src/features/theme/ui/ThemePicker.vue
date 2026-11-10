<script setup lang="ts">
import { t } from '@/shared/i18n'
import { THEMES, setTheme, theme, type Theme } from '@/shared/lib/theme'

// Fixed preview colours (bg, ink, line, accent), so every card shows its own theme whatever theme is active.
const PREVIEW: Record<Theme, { bg: string; ink: string; line: string; accent: string }> = {
  light: { bg: '#ffffff', ink: '#181818', line: '#e6e4f2', accent: '#4f45d9' },
  sepia: { bg: '#fbf3e2', ink: '#4a3b2a', line: '#e5d7ba', accent: '#8b5e34' },
  dark: { bg: '#16161b', ink: '#e6e6ea', line: '#2d2d35', accent: '#7b72f0' },
  dimmed: { bg: '#2a2a2f', ink: '#b9b8be', line: '#3b3a41', accent: '#8c85dd' },
}
</script>

<template>
  <section>
    <h2 class="mb-3 text-sm font-semibold text-ink-strong">{{ t('settings.theme') }}</h2>
    <div role="radiogroup" :aria-label="t('settings.theme')" class="grid grid-cols-4 gap-2">
      <button
        v-for="id in THEMES"
        :key="id"
        role="radio"
        :aria-checked="theme === id"
        class="flex flex-col items-center gap-1.5 rounded-2xl border p-1.5 pb-2 transition"
        :class="theme === id ? 'border-primary bg-primary/5' : 'border-line/60'"
        @click="setTheme(id)"
      >
        <!-- A tiny page: title bar, a few text lines and an accent, in that theme's colours. -->
        <span
          class="flex aspect-[3/4] w-full flex-col gap-1 overflow-hidden rounded-xl p-1.5 ring-1 ring-black/5"
          :style="{ background: PREVIEW[id].bg }"
          aria-hidden="true"
        >
          <span class="h-1.5 w-3/5 rounded-full" :style="{ background: PREVIEW[id].ink }" />
          <span class="h-px w-full" :style="{ background: PREVIEW[id].line }" />
          <span class="h-1 w-full rounded-full opacity-60" :style="{ background: PREVIEW[id].ink }" />
          <span class="h-1 w-4/5 rounded-full opacity-60" :style="{ background: PREVIEW[id].ink }" />
          <span class="h-1 w-full rounded-full opacity-60" :style="{ background: PREVIEW[id].ink }" />
          <span class="mt-auto h-2 w-1/2 self-center rounded-full" :style="{ background: PREVIEW[id].accent }" />
        </span>
        <span class="flex items-center gap-1 text-xs" :class="theme === id ? 'font-semibold text-primary' : 'text-ink/70'">
          {{ t(`theme.${id}`) }}
        </span>
      </button>
    </div>
  </section>
</template>
