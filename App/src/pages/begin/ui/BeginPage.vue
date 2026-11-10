<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BEGIN_SECONDS, markBegun } from '@/features/onboarding'
import { NativeAd } from '@/features/ads'
import { t } from '@/shared/i18n'
import { bannerPossible, nativePossible } from '@/shared/ads'

// Opening screen for returning users: the button counts down, then becomes "Continue".
// The wait is the slot for the native ad here and the app's bottom banner (route meta `banner`).
// The native slot is reserved from the first frame; `medium` (~300dp) only where the screen is tall enough.
const route = useRoute()
const router = useRouter()
const secondsLeft = ref(BEGIN_SECONDS)
const ads = nativePossible
const banner = bannerPossible
// Native ads must not sit in a scrolling area, so the template is picked to fit the screen without scrolling.
const native = window.innerHeight >= 800 ? { template: 'medium' as const, height: 300 }
  : window.innerHeight >= 720 ? { template: 'mrec' as const, height: 228 }
  : { template: 'small' as const, height: 96 }
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
    && !['begin', 'launch'].includes(String(router.resolve(next).name)) ? next : '/'
  void router.replace(destination)
}
</script>

<template>
  <main class="begin" :class="{ banner }">
    <div class="hero">
      <div class="logo" aria-hidden="true">
        <span class="glow" />
        <img :src="logo" alt="" width="116" height="116" />
      </div>
      <h1>PDF Toolbox</h1>
      <p>{{ t('begin.subtitle') }}</p>
    </div>

    <div v-if="ads" class="native-slot">
      <NativeAd slot="begin" :template="native.template" :height="native.height" />
    </div>

    <button class="enter" :disabled="secondsLeft > 0" @click="enter">
      <span v-if="secondsLeft > 0" class="count" aria-live="polite">{{ secondsLeft }}</span>
      <template v-else>{{ t('begin.continue') }}</template>
    </button>

  </main>
</template>

<style scoped>
.begin { height: 100%; overflow: hidden; display: flex; flex-direction: column; align-items: center; padding: max(48px, calc(env(safe-area-inset-top) + 32px)) 24px max(28px, calc(env(safe-area-inset-bottom) + 20px)); background: radial-gradient(ellipse 90% 45% at 50% 0%, #dcd8fb 0, transparent 70%), linear-gradient(180deg, #efedfd 0%, #f8f7ff 50%, #ffffff 100%); color: #181818; text-align: center; }
/* The app's banner strip already covers the bottom safe area; keep Continue 48px+ clear of the banner. */
.begin.banner { padding-bottom: 48px; }
.hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 0; }
.logo { position: relative; width: 116px; height: 116px; }
.glow { position: absolute; inset: -28px; border-radius: 50%; background: radial-gradient(circle, #4f45d926 0, transparent 70%); z-index: -1; }
/* The PNG has black corners outside its rounded square, so the rounding here clips them off. */
.logo img { display: block; width: 100%; height: 100%; border-radius: 26%; box-shadow: 0 18px 40px #1a4fd040; }
h1 { margin: 26px 0 0; font-size: 30px; line-height: 1.15; letter-spacing: -.8px; font-weight: 700; }
p { margin: 10px 0 0; max-width: 300px; font-size: 14px; line-height: 1.55; color: #777; }
.native-slot { flex: none; width: min(100%, 360px); margin-top: 16px; border-radius: 16px; overflow: hidden; background: #efedfd; }
.enter { width: min(100%, 360px); min-height: 54px; margin-top: 48px; border: 0; border-radius: 30px; background: #4f45d9; color: #fff; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; box-shadow: 0 10px 24px #4f45d940; transition: opacity .3s, transform .2s; }
.enter:disabled { opacity: .5; cursor: default; box-shadow: none; }
.enter:active:enabled { transform: scale(.98); }
.count { font-variant-numeric: tabular-nums; font-size: 17px; }
button:focus-visible { outline: 3px solid #4f45d9; outline-offset: 4px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
