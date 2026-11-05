import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history keeps deep links working inside the Capacitor WebView (no server rewrites).
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/search', name: 'search', component: () => import('./views/SearchView.vue') },
    { path: '/reader/:id', name: 'reader', component: () => import('./views/ReaderView.vue'), props: true },
    { path: '/office/:id', name: 'office', component: () => import('./views/OfficeView.vue'), props: true },
    { path: '/tool/merge', name: 'merge', component: () => import('./views/MergeView.vue') },
    { path: '/tool/split', name: 'split', component: () => import('./views/SplitView.vue') },
    { path: '/tool/lock', name: 'lock', component: () => import('./views/LockView.vue') },
    { path: '/tool/img2pdf', name: 'img2pdf', component: () => import('./views/ImageToPdfView.vue') },
    { path: '/tool/pdf2img', name: 'pdf2img', component: () => import('./views/PdfToImageView.vue') },
    { path: '/tool/doc2pdf', name: 'doc2pdf', component: () => import('./views/DocToPdfView.vue') },
    { path: '/tool/scan', name: 'scan', component: () => import('./views/ScanView.vue') },
    { path: '/tool/delete', name: 'delete', component: () => import('./views/DeleteView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
