<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { completeOnboarding } from '@/features/onboarding'
import { LANGUAGES, flagUrl, locale, setLocale, t } from '@/shared/i18n'
import { Ic } from '@/shared/ui'

const route = useRoute()
const router = useRouter()
const step = ref(0)
const heading = ref<HTMLElement>()
const selectedLanguage = ref(false)
const steps = ['welcome', 'tools', 'language'] as const
const current = computed(() => steps[step.value]!)

async function goToStep(value: number) {
  step.value = value
  await nextTick()
  heading.value?.focus()
}

function advance() {
  if (step.value < 2) {
    void goToStep(step.value + 1)
    return
  }
  if (!selectedLanguage.value) return
  completeOnboarding()
  const next = route.query.next
  const destination = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    && router.resolve(next).name !== 'onboarding' ? next : '/'
  void router.replace(destination)
}
</script>

<template>
  <main class="onboarding" :class="`step-${current}`">
    <section class="onboarding-card" :aria-label="t('onboarding.label')">
      <header class="onboarding-header">
        <a class="brand" href="/onboarding" @click.prevent="goToStep(0)"><span class="brand-icon"><Ic name="files" :size="20" /></span> PDF Toolbox<span class="brand-dot">.</span></a>
        <button v-if="step < 2" class="skip" @click="goToStep(2)">{{ t('onboarding.skip') }} <Ic name="next" :size="14" /></button>
        <span v-else class="step-count">03 / 03</span>
      </header>

      <div class="onboarding-body">
        <div class="artwork" :key="current" aria-hidden="true">
          <div class="art-halo" />
          <span class="spark spark-one">✦</span><span class="spark spark-two">✦</span><span class="orb orb-one" /><span class="orb orb-two" />
          <template v-if="step === 0">
            <div class="paper paper-back" />
            <div class="paper paper-front"><div class="paper-fold" /><span class="pdf-label">PDF</span><span class="paper-line long" /><span class="paper-line" /><span class="paper-line short" /><div class="paper-preview"><span /><span /><span /></div></div>
            <div class="float-badge badge-read"><Ic name="doc" :size="21" /><span>{{ t('onboarding.read') }}</span></div>
            <div class="float-badge badge-check"><Ic name="check" :size="24" /></div>
          </template>
          <template v-else-if="step === 1">
            <div class="tool-tile tile-main"><Ic name="scan" :size="66" /></div>
            <div class="tool-tile tile-merge"><Ic name="merge" :size="34" /></div>
            <div class="tool-tile tile-image"><Ic name="image" :size="34" /></div>
            <div class="tool-tile tile-lock"><Ic name="lock" :size="30" /></div>
            <div class="float-badge badge-tools"><Ic name="check" :size="18" /> {{ t('onboarding.allInOne') }}</div>
          </template>
          <template v-else>
            <div class="globe"><span class="globe-meridian" /><span class="globe-equator" /></div>
            <div class="speech speech-hello">Hello<span>✦</span></div>
            <div class="speech speech-xinchao">Xin chào<span>♡</span></div>
          </template>
        </div>

        <div class="onboarding-content">
          <div class="progress" :aria-label="t('onboarding.progress', { step: step + 1, total: 3 })">
            <span v-for="(_, index) in steps" :key="index" :class="{ active: index === step }" :aria-current="index === step ? 'step' : undefined" />
          </div>
          <p class="eyebrow">{{ t(`onboarding.${current}.eyebrow`) }}</p>
          <h1 ref="heading" tabindex="-1">{{ t(`onboarding.${current}.title`) }}</h1>
          <p class="description">{{ t(`onboarding.${current}.description`) }}</p>

          <div v-if="step === 2" class="language-options" role="group" :aria-label="t('settings.language')">
            <button v-for="language in LANGUAGES" :key="language.code" class="language-option" :class="{ selected: locale === language.code && selectedLanguage }" :aria-pressed="locale === language.code && selectedLanguage" @click="setLocale(language.code); selectedLanguage = true">
              <img :src="flagUrl(language.flag)" alt="" width="32" height="32" />
              <span><strong>{{ language.name }}</strong><small>{{ language.code === 'vi' ? 'Vietnamese' : 'English' }}</small></span>
              <span class="radio"><Ic v-if="locale === language.code && selectedLanguage" name="check" :size="14" /></span>
            </button>
          </div>

          <div class="navigation">
            <button v-if="step > 0" class="back" :aria-label="t('onboarding.back')" @click="goToStep(step - 1)"><Ic name="back" :size="20" /></button>
            <button class="continue" :disabled="step === 2 && !selectedLanguage" @click="advance"><span>{{ t(step === 2 ? 'onboarding.start' : 'onboarding.continue') }}</span><span class="continue-arrow">→</span></button>
          </div>
          <p class="footer-note">{{ t(step === 2 ? 'onboarding.changeLater' : 'onboarding.footer') }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.onboarding { min-height: 100%; min-height: 100dvh; display: grid; place-items: center; padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)); background: radial-gradient(ellipse at 4% 12%, #e3dff9 0, transparent 47%), radial-gradient(ellipse at 92% 16%, #fbdde5 0, transparent 48%), radial-gradient(ellipse at 40% 100%, #fff1c9 0, transparent 50%), #f8f5f7; color: #25222e; }
.onboarding-card { width: min(100%, 1000px); padding: 32px 38px; border: 1px solid #ffffffd9; border-radius: 36px; background: #ffffffa8; box-shadow: 0 28px 90px #7560800d; }
.onboarding-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.brand { display: flex; align-items: center; font-size: 15px; font-weight: 750; text-decoration: none; color: inherit; letter-spacing: -.5px; white-space: nowrap; }
.brand-icon { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; color: #ed4678; background: #fce4ed; margin-right: 9px; }.brand-dot { color: #ed4678; }
button { cursor: pointer; font: inherit; }button:focus-visible, a:focus-visible { outline: 3px solid #9b71df; outline-offset: 5px; }
.skip { display: flex; align-items: center; gap: 8px; padding: 9px 15px; border: 1px solid #d8d2dc; border-radius: 24px; font-size: 12px; font-weight: 600; background: transparent; }.step-count { font-size: 12px; letter-spacing: 2px; color: #8a8295; }
.onboarding-body { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 38px; padding: 50px 0 28px; }
.artwork { position: relative; height: 380px; display: grid; place-items: center; animation: appear .4s ease both; }.art-halo { position: absolute; width: 318px; height: 318px; border-radius: 50%; background: linear-gradient(145deg, #fbe0e9, #f7e9ed88); }.step-tools .art-halo { background: linear-gradient(145deg, #eee5fd, #e6e9fb88); }.step-language .art-halo { background: linear-gradient(145deg, #e8e0fa, #fae7f088); }
.paper { position: absolute; width: 158px; height: 208px; border-radius: 17px; }.paper-back { background: linear-gradient(120deg, #b0a0e4, #d8cdf3); transform: rotate(-18deg) translate(-24px, -8px); box-shadow: 0 15px 30px #7960aa22; }.paper-front { background: linear-gradient(120deg, #fff, #fff8f9); transform: rotate(9deg) translate(14px, 4px); box-shadow: 12px 22px 30px #b3587930, inset -3px -3px 6px #efdee6; padding: 25px 22px; }.paper-fold { position: absolute; right: 0; top: 0; width: 37px; height: 37px; border-radius: 0 14px 0 10px; background: linear-gradient(45deg,#f3ccd9 50%, #fff0f5 51%); }.pdf-label { display: inline-block; color: #fff; font-size: 21px; font-weight: 800; letter-spacing: 1px; padding: 5px 13px; background: linear-gradient(135deg, #ff80a1, #ee3b73); border-radius: 8px; margin: 12px 0 18px -33px; box-shadow: 0 7px 13px #ef457544; }.paper-line { display: block; height: 5px; border-radius: 4px; background: #e5dfe9; margin-bottom: 9px; width: 80%; }.paper-line.long { width: 100%; }.paper-line.short { width: 58%; }.paper-preview { display: flex; align-items: end; gap: 8px; height: 48px; padding: 6px 9px 0; background: #f8edf3; border-radius: 7px; margin-top: 17px; }.paper-preview span { flex: 1; background: #ef91b0; height: 55%; border-radius: 4px 4px 0 0; }.paper-preview span:nth-child(2) { height: 90%; background: #b6a0e3; }.paper-preview span:nth-child(3) { height: 72%; background: #f8c587; }
.float-badge { position: absolute; display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #ffffffed; box-shadow: 0 10px 24px #78647e15; border-radius: 16px; font-size: 12px; font-weight: 600; }.badge-read { bottom: 64px; left: 12px; color: #8863be; transform: rotate(-8deg); }.badge-check { right: 18px; top: 76px; color: #fff; background: linear-gradient(145deg, #a28ada, #7653bb); width: 49px; height: 49px; justify-content: center; padding: 0; transform: rotate(12deg); }
.spark { position: absolute; font-size: 28px; color: #db92b2; }.spark-one { left: 22px; top: 62px; }.spark-two { right: 30px; bottom: 55px; font-size: 19px; color: #af9bd7; }.orb { position: absolute; border-radius: 50%; background: #f0cadb; }.orb-one { width: 12px; height: 12px; right: 52px; top: 42px; }.orb-two { width: 8px; height: 8px; left: 41px; bottom: 100px; background: #cfc0ed; }
.tool-tile { position: absolute; display: grid; place-items: center; border: 3px solid #ffffff80; box-shadow: 8px 18px 25px #8f68b42b, inset 2px 2px 8px #ffffff99; border-radius: 25px; }.tile-main { width: 143px; height: 143px; background: linear-gradient(135deg,#bfaaec,#8664ce); color: white; transform: rotate(-10deg); }.tile-merge { width: 76px; height: 76px; top: 45px; right: 30px; background: linear-gradient(135deg,#ffc1d2,#f17c9f); color: #a23963; transform: rotate(12deg); }.tile-image { width: 78px; height: 78px; left: 5px; top: 100px; color: #b27c37; background: linear-gradient(135deg,#fff0c7,#fbd38f); transform: rotate(-18deg); }.tile-lock { width: 73px; height: 73px; right: 29px; bottom: 60px; color: #47797b; background: linear-gradient(135deg,#d2f1e9,#95d3cc); transform: rotate(14deg); }.badge-tools { bottom: 52px; left: 16px; color: #8461ba; transform: rotate(5deg); }
.globe { position: absolute; width: 194px; height: 194px; border-radius: 50%; border: 3px solid #b29bdc; background: radial-gradient(circle at 30% 25%, #f9f3ff, #d5c2f0 65%, #b29bdc); box-shadow: 12px 23px 30px #8a65ad25, inset 8px 8px 14px #ffffff99; overflow: hidden; }.globe-meridian { position: absolute; inset: -3px 48px; border: 2px solid #b29bdc; border-radius: 50%; }.globe-equator { position: absolute; inset: 51px -3px; border: 2px solid #b29bdc; border-radius: 50%; }.speech { position: absolute; padding: 16px 22px; border-radius: 18px 18px 18px 4px; font-weight: 750; font-size: 24px; box-shadow: 0 12px 24px #9d71932b; }.speech span { margin-left: 10px; font-size: 18px; }.speech-hello { top: 59px; left: 9px; transform: rotate(-9deg); background: linear-gradient(135deg, #fff, #fff4f7); color: #a665aa; }.speech-xinchao { bottom: 61px; right: -1px; transform: rotate(8deg); color: #fff; background: linear-gradient(135deg, #ff94b0, #ee4f82); }
.onboarding-content { text-align: left; padding-right: 12px; }.progress { display: flex; gap: 6px; margin-bottom: 27px; }.progress span { width: 7px; height: 7px; border-radius: 8px; background: #eed7e1; transition: width .25s; }.progress span.active { width: 27px; background: #ed497c; }.eyebrow { text-transform: uppercase; font-size: 10px; letter-spacing: 2.3px; font-weight: 750; color: #b04c74; margin: 0 0 12px; }h1 { font-size: clamp(29px, 3.4vw, 39px); line-height: 1.18; letter-spacing: -1.5px; font-weight: 750; margin: 0; white-space: pre-line; }h1:focus { outline: none; }.description { font-size: 14px; line-height: 1.85; color: #77717e; margin: 19px 0 0; max-width: 350px; }.navigation { display: flex; align-items: center; gap: 14px; margin-top: 30px; }.continue { display: flex; align-items: center; justify-content: space-between; gap: 28px; border: none; background: #ec4377; color: white; padding: 10px 12px 10px 23px; min-height: 53px; min-width: 190px; border-radius: 30px; box-shadow: 0 8px 20px #ec437729; font-weight: 600; font-size: 13px; transition: background .2s, transform .2s; }.continue:hover:enabled { background: #da3266; transform: translateY(-2px); }.continue:disabled { opacity: .45; cursor: default; box-shadow: none; }.continue-arrow { display: grid; place-items: center; border-radius: 50%; border: 1px solid #ffffff60; width: 33px; height: 33px; font-size: 23px; font-weight: 400; }.back { display: grid; place-items: center; width: 45px; height: 45px; border-radius: 50%; border: 1px solid #ded5e2; background: transparent; color: #776c80; }.footer-note { margin: 20px 0 0; font-size: 10px; color: #918695; line-height: 1.6; }
.language-options { display: grid; gap: 9px; margin-top: 22px; }.language-option { display: flex; align-items: center; gap: 12px; border: 1px solid #e7dfe9; border-radius: 15px; background: #ffffff9c; padding: 12px 14px; text-align: left; transition: border-color .2s, background .2s; }.language-option.selected { border-color: #e85a89; background: #fff1f6; }.language-option img { border-radius: 50%; object-fit: cover; }.language-option strong { display: block; font-size: 13px; font-weight: 650; }.language-option small { display: block; font-size: 10px; color: #8d8293; margin-top: 3px; }.radio { display: grid; place-items: center; margin-left: auto; border: 1px solid #d9cede; border-radius: 50%; width: 20px; height: 20px; }.selected .radio { background: #ec4377; border-color: #ec4377; color: white; }
@keyframes appear { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 700px) { .onboarding { padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)); }.onboarding-card { max-width: 440px; padding: 22px 24px; border-radius: 30px; }.onboarding-body { display: flex; flex-direction: column; gap: 0; padding: 8px 0 0; }.artwork { height: 296px; width: 100%; flex-shrink: 0; transform-origin: center; }.art-halo { width: 258px; height: 258px; }.paper { scale: .9; }.badge-read { bottom: 28px; left: 0; }.badge-check { top: 40px; right: 8px; }.spark-one { top: 33px; left: 10px; }.spark-two { bottom: 30px; right: 8px; }.orb-one { top: 20px; }.tile-merge { top: 19px; right: 8px; }.tile-image { top: 72px; left: 0; }.tile-lock { bottom: 28px; right: 4px; }.badge-tools { bottom: 14px; left: 0; }.globe { width: 172px; height: 172px; }.speech { font-size: 21px; padding: 14px 18px; }.speech-hello { top: 29px; left: 0; }.speech-xinchao { bottom: 28px; right: 0; }.onboarding-content { text-align: center; padding: 5px 0 0; width: 100%; }.progress { justify-content: center; margin-bottom: 24px; }h1 { font-size: 31px; letter-spacing: -1.2px; }.description { margin: 15px auto 0; font-size: 13px; max-width: 310px; }.navigation { justify-content: center; margin-top: 26px; }.footer-note { margin-top: 19px; }.language-options { text-align: left; margin-top: 18px; }.step-language .artwork { height: 248px; }.step-language .art-halo { width: 222px; height: 222px; }.step-language .speech-hello { top: 7px; }.step-language .speech-xinchao { bottom: 7px; }.step-language .progress { margin-bottom: 18px; }.step-language h1 { font-size: 28px; }.step-language .description { margin-top: 10px; } }
@media (max-width: 360px) { .onboarding-card { padding: 18px; }.brand { font-size: 13px; }.skip { padding: 8px 10px; }.artwork { height: 258px; }.art-halo { width: 230px; height: 230px; }h1 { font-size: 28px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
</style>
