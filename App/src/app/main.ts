import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { syncStatusBarWithRoutes } from './lib/status-bar'
import { initAdsSdk } from '@/shared/ads'
import './styles/index.css'

async function bootstrap() {
  // Ads start in the background: the app never waits for them (the launch screen waits at most 5s).
  void initAdsSdk()
  syncStatusBarWithRoutes(router)
  createApp(App).use(createPinia()).use(router).mount('#app')
}

void bootstrap()
