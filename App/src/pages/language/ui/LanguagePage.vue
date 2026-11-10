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
    <section class="card" :aria-label="t('language.choose')">
      <div class="hero" aria-hidden="true">
        <span class="halo" />
        <img class="flag flag-a" :src="flagUrl(LANGUAGES[0].flag)" alt="" />
        <img class="flag flag-b" :src="flagUrl(LANGUAGES[1].flag)" alt="" />
      </div>

      <h1>{{ t('language.choose') }}</h1>

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
          <img :src="flagUrl(l.flag)" alt="" width="36" height="36" />
          <strong>{{ l.name }}</strong>
          <span class="radio"><Ic v-if="locale === l.code" name="check" :size="14" /></span>
        </button>
      </div>

      <button class="continue" @click="next">
        <span>{{ t('onboarding.continue') }}</span><span class="arrow">→</span>
      </button>
    </section>
  </main>
</template>

<style scoped>
.language { min-height: 100%; min-height: 100dvh; display: grid; place-items: center; padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)); background: radial-gradient(ellipse at 90% 8%, #bfe9e4 0, transparent 50%), radial-gradient(ellipse at 6% 96%, #cfe3fb 0, transparent 52%), #eef7f6; color: #17302f; }
.card { width: min(100%, 420px); padding: 36px 26px 28px; border: 1px solid #ffffffe0; border-radius: 34px; background: #ffffffb8; box-shadow: 0 26px 80px #2a7c7714; text-align: center; }
.hero { position: relative; height: 150px; display: grid; place-items: center; }
.halo { position: absolute; width: 150px; height: 150px; border-radius: 50%; background: linear-gradient(145deg, #c9efe9, #d6e8fb); }
.flag { position: absolute; width: 74px; height: 74px; border-radius: 50%; object-fit: cover; border: 4px solid #fff; box-shadow: 0 10px 24px #2a7c7729; }
.flag-a { transform: translateX(-30px) rotate(-8deg); }
.flag-b { transform: translateX(30px) rotate(8deg); }
h1 { margin: 22px 0 22px; font-size: 26px; line-height: 1.2; letter-spacing: -.8px; font-weight: 750; }
.options { display: grid; gap: 10px; }
.option { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border: 1.5px solid #dbe9e7; border-radius: 18px; background: #fff; text-align: left; cursor: pointer; font: inherit; transition: border-color .2s, background .2s; }
.option img { border-radius: 50%; object-fit: cover; }
.option strong { flex: 1; font-size: 16px; font-weight: 650; }
.option.selected { border-color: #14a39a; background: #effaf8; }
.radio { display: grid; place-items: center; width: 22px; height: 22px; border: 1.5px solid #c3d6d3; border-radius: 50%; }
.selected .radio { background: #14a39a; border-color: #14a39a; color: #fff; }
.continue { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 26px; min-height: 54px; padding: 10px 12px 10px 24px; border: 0; border-radius: 30px; background: #14a39a; color: #fff; font: inherit; font-weight: 650; font-size: 14px; cursor: pointer; box-shadow: 0 10px 22px #14a39a38; transition: background .2s, transform .2s; }
.continue:hover { background: #0f8f87; transform: translateY(-2px); }
.arrow { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid #ffffff66; border-radius: 50%; font-size: 22px; }
button:focus-visible { outline: 3px solid #14a39a; outline-offset: 4px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
