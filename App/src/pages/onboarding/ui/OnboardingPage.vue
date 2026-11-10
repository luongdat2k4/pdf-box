<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { completeOnboarding } from '@/features/onboarding'
import { useLibrary } from '@/entities/file'
import { t } from '@/shared/i18n'
import { isNative } from '@/shared/lib/platform'
import { askConfirm } from '@/shared/ui'

const route = useRoute()
const router = useRouter()

const icon = (name: string) => `${import.meta.env.BASE_URL}assets/icons/${name}.webp`

// Each slide: the big icon in the middle of the ring and the smaller ones floating around it.
const slides = [
  { key: 'read', main: 'pdf', around: ['word', 'excel', 'ppt', 'image'] },
  { key: 'convert', main: 'tool-doc2pdf', around: ['tool-img2pdf', 'tool-pdf2img', 'txt'] },
  { key: 'organize', main: 'tool-scan', around: ['tool-merge', 'tool-split', 'tool-lock'] },
] as const

const track = ref<HTMLElement>()
const index = ref(0)
const isLast = () => index.value === slides.length - 1

function onScroll() {
  const el = track.value
  if (el) index.value = Math.round(el.scrollLeft / el.clientWidth)
}

function goTo(i: number) {
  const el = track.value
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
  index.value = i
}

function advance() {
  if (isLast()) finish()
  else goTo(index.value + 1)
}

const lib = useLibrary()

async function finish() {
  completeOnboarding()
  const next = route.query.next
  const destination = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    && router.resolve(next).name !== 'onboarding' ? next : '/'
  await router.replace(destination)
  await offerDeviceAccess()
}

// Ask in the app first; the system "All files access" screen opens only if the user agrees.
async function offerDeviceAccess() {
  if (!isNative()) return
  await lib.start().catch(() => {})
  if (lib.libraryAccess.hasAccess) return
  const yes = await askConfirm(t('onboarding.access.title'), t('onboarding.access.message'),
    t('onboarding.access.allow'), false, t('onboarding.access.later'))
  if (yes) await lib.syncDeviceFiles(true).catch(() => {})
}
</script>

<template>
  <main class="onboarding" :aria-label="t('onboarding.label')">
    <button class="skip" :class="{ hidden: isLast() }" :tabindex="isLast() ? -1 : 0" @click="finish">{{ t('onboarding.skip') }}</button>

    <div ref="track" class="track" @scroll.passive="onScroll">
      <section
        v-for="(s, i) in slides"
        :key="s.key"
        class="slide"
        :class="`slide-${s.key}`"
        :aria-hidden="i !== index"
        :inert="i !== index"
      >
        <h1>{{ t(`onboarding.${s.key}.title`) }}</h1>
        <p class="description">{{ t(`onboarding.${s.key}.description`) }}</p>

        <div class="art" aria-hidden="true">
          <span class="ring" />
          <span class="ring ring-inner" />
          <img class="main" :src="icon(s.main)" alt="" />
          <img v-for="(name, n) in s.around" :key="name" class="sat" :class="`sat-${n + 1}`" :src="icon(name)" alt="" />
          <span class="orb orb-1" /><span class="orb orb-2" /><span class="orb orb-3" />
        </div>
      </section>
    </div>

    <footer class="footer">
      <div class="dots" role="tablist" :aria-label="t('onboarding.progress', { step: index + 1, total: slides.length })">
        <button
          v-for="(s, i) in slides"
          :key="s.key"
          role="tab"
          :class="{ active: i === index }"
          :aria-selected="i === index"
          :aria-label="t('onboarding.progress', { step: i + 1, total: slides.length })"
          @click="goTo(i)"
        />
      </div>
      <button class="primary" @click="advance">{{ t(isLast() ? 'onboarding.start' : 'onboarding.continue') }}</button>
    </footer>
  </main>
</template>

<style scoped>
.onboarding { position: relative; height: 100%; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: radial-gradient(ellipse 90% 45% at 50% 0%, #d2e6ff 0, transparent 70%), linear-gradient(180deg, #f0f7ff 0%, #f8fbff 50%, #ffffff 100%); color: #1d1d1d; }
button { font: inherit; cursor: pointer; }
button:focus-visible { outline: 3px solid #2d75ed; outline-offset: 4px; }

.skip { position: absolute; z-index: 2; top: max(14px, calc(env(safe-area-inset-top) + 8px)); right: 16px; padding: 8px 12px; border: 0; background: transparent; color: #5f6673; font-size: 14px; font-weight: 500; transition: opacity .2s; }
.skip.hidden { opacity: 0; pointer-events: none; }

.track { flex: 1; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }
.track::-webkit-scrollbar { display: none; }
.slide { flex: 0 0 100%; min-width: 0; scroll-snap-align: center; scroll-snap-stop: always; display: flex; flex-direction: column; align-items: center; padding: max(64px, calc(env(safe-area-inset-top) + 52px)) 28px 0; text-align: center; }

h1 { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: -.8px; font-weight: 700; }
.description { margin: 12px 0 0; max-width: 300px; font-size: 14px; line-height: 1.55; color: #5f6673; }

.art { position: relative; flex: 1; width: 100%; max-width: 340px; min-height: 260px; display: grid; place-items: center; }
.ring { position: absolute; width: min(72vw, 260px); aspect-ratio: 1; border-radius: 50%; background: conic-gradient(from 200deg, #8cc4ff, #2d75ed, #5fb2ff, #a9d1ff, #8cc4ff); -webkit-mask: radial-gradient(circle, transparent 57%, #000 58%, #000 70%, transparent 71%); mask: radial-gradient(circle, transparent 57%, #000 58%, #000 70%, transparent 71%); filter: drop-shadow(0 0 18px #2d75ed55); opacity: .85; animation: spin 24s linear infinite; }
.ring-inner { width: min(46vw, 168px); background: radial-gradient(circle, #2d75ed26 0, transparent 70%); -webkit-mask: none; mask: none; filter: blur(6px); animation: none; }
.main { position: relative; width: 116px; height: 116px; filter: drop-shadow(0 18px 26px #1753e14d); animation: bob 4s ease-in-out infinite; }
.sat { position: absolute; width: 64px; height: 64px; filter: drop-shadow(0 12px 18px #1753e140); animation: bob 5s ease-in-out infinite; }
.sat-1 { top: 10%; left: 6%; transform: rotate(-12deg); animation-delay: -1s; }
.sat-2 { top: 14%; right: 4%; transform: rotate(10deg); animation-delay: -2.4s; }
.sat-3 { bottom: 10%; right: 10%; transform: rotate(-6deg); animation-delay: -3.2s; }
.sat-4 { bottom: 12%; left: 8%; transform: rotate(8deg); animation-delay: -.6s; }
.slide-convert .sat-3, .slide-organize .sat-3 { bottom: 8%; right: auto; left: 50%; margin-left: -32px; }
.slide-convert .sat-1, .slide-organize .sat-1 { top: 18%; }
.slide-convert .sat-2, .slide-organize .sat-2 { top: 18%; }
.orb { position: absolute; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff, #9cc3ff 45%, #2d75ed); }
.orb-1 { width: 14px; height: 14px; top: 6%; left: 46%; }
.orb-2 { width: 9px; height: 9px; bottom: 26%; left: 2%; }
.orb-3 { width: 7px; height: 7px; top: 44%; right: 0; opacity: .7; }

.footer { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 8px 24px max(28px, calc(env(safe-area-inset-bottom) + 20px)); }
.dots { display: flex; gap: 6px; }
.dots button { width: 7px; height: 7px; padding: 0; border: 0; border-radius: 4px; background: #d2e6ff; transition: width .25s, background .25s; }
.dots button.active { width: 26px; background: #2d75ed; }
.primary { width: min(100%, 360px); min-height: 54px; border: 0; border-radius: 30px; background: #2d75ed; color: #fff; font-weight: 600; font-size: 15px; box-shadow: 0 10px 24px #2d75ed40; transition: transform .2s, opacity .2s; }
.primary:active { transform: scale(.98); opacity: .9; }

@keyframes spin { to { rotate: 360deg; } }
@keyframes bob { 50% { translate: 0 -8px; } }
@media (max-height: 640px) { .slide { padding-top: max(48px, calc(env(safe-area-inset-top) + 40px)); } h1 { font-size: 26px; } .main { width: 96px; height: 96px; } .sat { width: 52px; height: 52px; } .art { min-height: 220px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
</style>
