import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { syncStatusBarWithRoutes } from './lib/status-bar'
import { initAdsSdk } from '@/features/ads'
import './styles/index.css'

async function bootstrap() {
  await initAdsSdk()
  syncStatusBarWithRoutes(router)
  createApp(App).use(createPinia()).use(router).mount('#app')
}

void bootstrap()
