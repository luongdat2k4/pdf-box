<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showLaunchAd } from '@/shared/ads'

// Short loading scene for returning users: waits for an app-open ad (at most LAUNCH_DEADLINE_MS, SDK start-up
// included), then moves on to /begin. Leaving early (a file opened from another app) cancels the ad.
const route = useRoute()
const router = useRouter()
const controller = new AbortController()
const logo = `${import.meta.env.BASE_URL}avatar.png`
let sceneTimer: ReturnType<typeof setTimeout> | undefined

onMounted(async () => {
  await Promise.all([
    showLaunchAd(controller.signal),
    new Promise<void>((resolve) => { sceneTimer = setTimeout(resolve, 700) }), // let the scene paint
  ])
  if (controller.signal.aborted) return
  void router.replace({ name: 'begin', query: route.query })
})
onBeforeUnmount(() => { controller.abort(); clearTimeout(sceneTimer) })
</script>

<template>
  <main class="launch" role="status" aria-live="polite">
    <img class="logo" :src="logo" alt="" width="104" height="104" />
    <h1>PDF Toolbox</h1>
    <span class="spinner" aria-hidden="true" />
  </main>
</template>

<style scoped>
.launch { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(ellipse 90% 45% at 50% 0%, var(--color-surface-strong) 0, transparent 70%), linear-gradient(180deg, var(--color-surface) 0%, color-mix(in oklab, var(--color-surface) 40%, var(--color-card)) 50%, var(--color-card) 100%); color: var(--color-ink); }
/* The PNG has black corners outside its rounded square, so the rounding here clips them off. */
.logo { display: block; border-radius: 26%; box-shadow: 0 18px 40px #1a4fd040; }
h1 { margin: 22px 0 0; font-size: 26px; letter-spacing: -.6px; font-weight: 700; }
.spinner { position: absolute; bottom: max(56px, calc(env(safe-area-inset-bottom) + 40px)); width: 28px; height: 28px; border-radius: 50%; border: 3px solid color-mix(in oklab, var(--color-primary) 20%, transparent); border-top-color: var(--color-primary); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
</style>
