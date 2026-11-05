import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { syncStatusBarWithRoutes } from './lib/status-bar'
import './styles/index.css'

syncStatusBarWithRoutes(router)

createApp(App).use(createPinia()).use(router).mount('#app')
