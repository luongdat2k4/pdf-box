<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BEGIN_SECONDS, markBegun } from '@/features/onboarding'
import { BannerAd, NativeAd } from '@/features/ads'
import { t } from '@/shared/i18n'
import { isNative } from '@/shared/lib/platform'

// Opening screen for returning users: the button counts down, then becomes "Continue".
// The wait is the slot for the native and banner ads below (they render nothing without ad units).
const route = useRoute()
const router = useRouter()
const secondsLeft = ref(BEGIN_SECONDS)
const ads = isNative()
const logo = `${import.meta.env.BASE_URL}avatar.png`
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    secondsLeft.value--
    if (secondsLeft.value <= 0) clearInterval(timer)
  }, 1000)
})
onBeforeUnmount(() => clearInterval(timer))

function enter() {
  markBegun()
  const next = route.query.next
  const destination = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    && router.resolve(next).name !== 'begin' ? next : '/'
  void router.replace(destination)
}
</script>

<template>
  <main class="begin" :class="{ 'with-banner': ads }">
    <div class="hero">
      <div class="logo" aria-hidden="true">
        <span class="glow" />
        <img :src="logo" alt="" width="116" height="116" />
      </div>
      <h1>PDF Toolbox</h1>
      <p>{{ t('begin.subtitle') }}</p>
    </div>

    <div v-if="ads" class="native-slot">
      <NativeAd template="medium" :height="250" />
    </div>

    <button class="enter" :disabled="secondsLeft > 0" @click="enter">
      <span v-if="secondsLeft > 0" class="count" aria-live="polite">{{ secondsLeft }}</span>
      <template v-else>{{ t('begin.continue') }}</template>
    </button>

    <BannerAd v-if="ads" size="BANNER" />
  </main>
</template>

<style scoped>
.begin { min-height: 100%; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; padding: max(48px, calc(env(safe-area-inset-top) + 32px)) 24px max(28px, calc(env(safe-area-inset-bottom) + 20px)); background: radial-gradient(ellipse 90% 45% at 50% 0%, #dcd8fb 0, transparent 70%), linear-gradient(180deg, #efedfd 0%, #f8f7ff 50%, #ffffff 100%); color: #181818; text-align: center; }
/* Room for the 50px banner the SDK draws over the bottom of the WebView. */
.begin.with-banner { padding-bottom: max(78px, calc(env(safe-area-inset-bottom) + 70px)); }
.hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 240px; }
.logo { position: relative; width: 116px; height: 116px; }
.glow { position: absolute; inset: -28px; border-radius: 50%; background: radial-gradient(circle, #4f45d926 0, transparent 70%); z-index: -1; }
/* The PNG has black corners outside its rounded square, so the rounding here clips them off. */
.logo img { display: block; width: 100%; height: 100%; border-radius: 26%; box-shadow: 0 18px 40px #1a4fd040; }
h1 { margin: 26px 0 0; font-size: 30px; line-height: 1.15; letter-spacing: -.8px; font-weight: 700; }
p { margin: 10px 0 0; max-width: 300px; font-size: 14px; line-height: 1.55; color: #777; }
.native-slot { width: min(100%, 360px); margin-top: 16px; }
.enter { width: min(100%, 360px); min-height: 54px; margin-top: 24px; border: 0; border-radius: 30px; background: #4f45d9; color: #fff; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; box-shadow: 0 10px 24px #4f45d940; transition: opacity .3s, transform .2s; }
.enter:disabled { opacity: .5; cursor: default; box-shadow: none; }
.enter:active:enabled { transform: scale(.98); }
.count { font-variant-numeric: tabular-nums; font-size: 17px; }
button:focus-visible { outline: 3px solid #4f45d9; outline-offset: 4px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
