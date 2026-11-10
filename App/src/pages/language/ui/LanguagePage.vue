<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { LANGUAGES, flagUrl, locale, setLocale, t } from '@/shared/i18n'
import { Ic } from '@/shared/ui'

const route = useRoute()
const router = useRouter()

// A language is preselected from the device setting; choosing is one tap and Continue.
function next() {
  setLocale(locale.value) // stores the choice, which also marks this screen as done
  const query = typeof route.query.next === 'string' ? { next: route.query.next } : {}
  void router.replace({ name: 'onboarding', query })
}
</script>

<template>
  <main class="language">
    <h1>{{ t('language.choose') }}</h1>

    <div class="hero" aria-hidden="true">
      <span class="ring" />
      <!-- A globe rather than flags, so the art stays right however many languages are added. -->
      <span class="globe">
        <svg viewBox="0 0 24 24" width="62" height="62" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9M12 3C9.4 5.6 8.2 8.6 8.2 12s1.2 6.4 3.8 9" />
        </svg>
      </span>
      <span class="bubble">A<span>文</span></span>
      <span class="orb orb-1" /><span class="orb orb-2" /><span class="orb orb-3" />
    </div>

    <div class="options" role="radiogroup" :aria-label="t('settings.language')">
      <button
        v-for="l in LANGUAGES"
        :key="l.code"
        class="option"
        :class="{ selected: locale === l.code }"
        role="radio"
        :aria-checked="locale === l.code"
        @click="setLocale(l.code)"
      >
        <img :src="flagUrl(l.flag)" alt="" width="34" height="34" />
        <strong>{{ l.name }}</strong>
        <span class="radio"><Ic v-if="locale === l.code" name="check" :size="14" /></span>
      </button>
    </div>

    <button class="continue" @click="next">{{ t('onboarding.continue') }}</button>
  </main>
</template>

<style scoped>
.language { min-height: 100%; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; padding: max(56px, calc(env(safe-area-inset-top) + 40px)) 24px max(28px, calc(env(safe-area-inset-bottom) + 20px)); background: radial-gradient(ellipse 90% 45% at 50% 0%, #d2e6ff 0, transparent 70%), linear-gradient(180deg, #f0f7ff 0%, #f8fbff 50%, #ffffff 100%); color: #1d1d1d; text-align: center; }
h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -.6px; font-weight: 700; }
.hero { position: relative; width: 240px; height: 220px; margin: 28px 0 24px; display: grid; place-items: center; }
.ring { position: absolute; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, #2d75ed1f 0, transparent 62%); border: 1px solid #2d75ed26; box-shadow: 0 0 60px #2d75ed1f; }
.globe { position: relative; display: grid; place-items: center; width: 112px; height: 112px; border-radius: 34px; background: linear-gradient(145deg, #6ea8ff, #2d75ed 55%, #1753e1); color: #fff; box-shadow: 0 20px 40px #1753e140, inset 2px 3px 10px #ffffff66, inset -4px -6px 14px #0d3a8a55; transform: rotate(-8deg); }
.bubble { position: absolute; top: 34px; right: 26px; display: flex; align-items: baseline; gap: 2px; padding: 8px 12px; border-radius: 16px 16px 16px 4px; background: #fff; color: #1753e1; font-size: 18px; font-weight: 800; box-shadow: 0 12px 24px #1753e133; transform: rotate(8deg); }
.bubble span { font-size: 15px; color: #ff6f9c; }
.orb { position: absolute; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff, #9cc3ff 45%, #2d75ed); }
.orb-1 { width: 12px; height: 12px; top: 18px; right: 34px; }
.orb-2 { width: 8px; height: 8px; bottom: 26px; left: 30px; }
.orb-3 { width: 6px; height: 6px; top: 60px; left: 14px; opacity: .7; }
.options { display: grid; gap: 12px; width: min(100%, 360px); margin-bottom: 32px; }
.option { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid #dfe6f0; border-radius: 18px; background: #fff; color: #1d1d1d; text-align: left; cursor: pointer; font: inherit; transition: border-color .2s, background .2s; }
.option img { border-radius: 50%; object-fit: cover; }
.option strong { flex: 1; font-size: 16px; font-weight: 600; }
.option.selected { border-color: #2d75ed; background: #f0f7ff; }
.radio { display: grid; place-items: center; width: 22px; height: 22px; border: 1.5px solid #c4cfdf; border-radius: 50%; }
.selected .radio { background: #2d75ed; border-color: #2d75ed; color: #fff; }
.continue { width: min(100%, 360px); min-height: 54px; margin-top: auto; border: 0; border-radius: 30px; background: #2d75ed; color: #fff; font: inherit; font-weight: 600; font-size: 15px; box-shadow: 0 10px 24px #2d75ed40; cursor: pointer; transition: transform .2s, opacity .2s; }
.continue:active { transform: scale(.98); opacity: .9; }
button:focus-visible { outline: 3px solid #2d75ed; outline-offset: 4px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
