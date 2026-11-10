<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { LANGUAGES, flagUrl, locale, setLocale, t } from '@/shared/i18n'
import { Ic } from '@/shared/ui'
import { NativeAd } from '@/features/ads'
import { nativePossible } from '@/shared/ads'

const route = useRoute()
const router = useRouter()
// Native ads must not sit in a scrolling area: the slot only exists where the screen fits it without scrolling.
const nativeSlot = nativePossible && window.innerHeight >= 700

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

    <!-- Small native ad, reserved from the first frame and kept 48px+ clear of Continue (design-note/ads-plan.md 4.6). -->
    <div v-if="nativeSlot" class="native-slot">
      <NativeAd slot="language" template="small" :height="96" />
    </div>

    <button class="continue" @click="next">{{ t('onboarding.continue') }}</button>
  </main>
</template>

<style scoped>
.language { min-height: 100%; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; padding: max(56px, calc(env(safe-area-inset-top) + 40px)) 24px max(28px, calc(env(safe-area-inset-bottom) + 20px)); background: radial-gradient(ellipse 90% 45% at 50% 0%, #dcd8fb 0, transparent 70%), linear-gradient(180deg, #efedfd 0%, #f8f7ff 50%, #ffffff 100%); color: #181818; text-align: center; }
h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -.6px; font-weight: 700; }
.hero { position: relative; width: 240px; height: 220px; margin: 28px 0 24px; display: grid; place-items: center; }
.ring { position: absolute; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, #4f45d91f 0, transparent 62%); border: 1px solid #4f45d926; box-shadow: 0 0 60px #4f45d91f; }
.globe { position: relative; display: grid; place-items: center; width: 112px; height: 112px; border-radius: 34px; background: linear-gradient(145deg, #8b85ea, #4f45d9 55%, #3d36a9); color: #fff; box-shadow: 0 20px 40px #3d36a940, inset 2px 3px 10px #ffffff66, inset -4px -6px 14px #231d7a55; transform: rotate(-8deg); }
.bubble { position: absolute; top: 34px; right: 26px; display: flex; align-items: baseline; gap: 2px; padding: 8px 12px; border-radius: 16px 16px 16px 4px; background: #fff; color: #3d36a9; font-size: 18px; font-weight: 800; box-shadow: 0 12px 24px #3d36a933; transform: rotate(8deg); }
.bubble span { font-size: 15px; color: #ff6f9c; }
.orb { position: absolute; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff, #c9c5f7 45%, #4f45d9); }
.orb-1 { width: 12px; height: 12px; top: 18px; right: 34px; }
.orb-2 { width: 8px; height: 8px; bottom: 26px; left: 30px; }
.orb-3 { width: 6px; height: 6px; top: 60px; left: 14px; opacity: .7; }
.options { display: grid; gap: 12px; width: min(100%, 360px); margin-bottom: 32px; }
.option { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid #e6e4f2; border-radius: 18px; background: #fff; color: #181818; text-align: left; cursor: pointer; font: inherit; transition: border-color .2s, background .2s; }
.option img { border-radius: 50%; object-fit: cover; }
.option strong { flex: 1; font-size: 16px; font-weight: 600; }
.option.selected { border-color: #4f45d9; background: #efedfd; }
.radio { display: grid; place-items: center; width: 22px; height: 22px; border: 1.5px solid #d0cde6; border-radius: 50%; }
.selected .radio { background: #4f45d9; border-color: #4f45d9; color: #fff; }
.native-slot { flex: none; width: min(100%, 360px); margin-bottom: 48px; border-radius: 16px; overflow: hidden; background: #f4f2fd; }
.continue { width: min(100%, 360px); min-height: 54px; margin-top: auto; border: 0; border-radius: 30px; background: #4f45d9; color: #fff; font: inherit; font-weight: 600; font-size: 15px; box-shadow: 0 10px 24px #4f45d940; cursor: pointer; transition: transform .2s, opacity .2s; }
.continue:active { transform: scale(.98); opacity: .9; }
button:focus-visible { outline: 3px solid #4f45d9; outline-offset: 4px; }
@media (max-height: 820px) { .language { padding-top: max(36px, calc(env(safe-area-inset-top) + 24px)); } .hero { height: 150px; margin: 16px 0; } .ring { width: 140px; height: 140px; } .globe { width: 84px; height: 84px; border-radius: 26px; } .globe svg { width: 46px; height: 46px; } .bubble { top: 8px; right: 34px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
