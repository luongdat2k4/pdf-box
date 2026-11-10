import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { syncStatusBarWithRoutes } from './lib/status-bar'
import { initAdsSdk } from '@/shared/ads'
import { i18nReady } from '@/shared/i18n'
import { initTheme } from '@/shared/lib/theme'
import './styles/index.css'

async function bootstrap() {
  initTheme() // before anything renders, so there is no flash of the light theme
  // Ads start in the background: the app never waits for them (the launch screen waits at most 5s).
  void initAdsSdk()
  // The starting language is a small local file; mount once it is in so the first screen is not in English first.
  await i18nReady
  syncStatusBarWithRoutes(router)
  createApp(App).use(createPinia()).use(router).mount('#app')
}

void bootstrap()
