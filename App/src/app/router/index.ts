import { START_LOCATION, createRouter, createWebHistory } from 'vue-router'
import { hasBegun, isOnboardingComplete } from '@/features/onboarding'
import { hasChosenLocale } from '@/shared/i18n'

// Clean URLs (no /#/). Capacitor's local server and the Vite dev server fall back to index.html for unknown paths;
// a static web host needs the same fallback (rewrite every path to /index.html).
// Pages are loaded lazily: each is its own chunk, reached only through the page's public API.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/language', name: 'language', component: () => import('@/pages/language').then((m) => m.LanguagePage) },
    { path: '/begin', name: 'begin', component: () => import('@/pages/begin').then((m) => m.BeginPage) },
    { path: '/onboarding', name: 'onboarding', component: () => import('@/pages/onboarding').then((m) => m.OnboardingPage) },
    // Home tabs are routes of the same page (/, /history, /favorites); the type chip is the `?type=` query.
    { path: '/', alias: '/home', name: 'home', component: () => import('@/pages/home').then((m) => m.HomePage) },
    { path: '/history', name: 'history', component: () => import('@/pages/home').then((m) => m.HomePage) },
    { path: '/favorites', name: 'favorites', component: () => import('@/pages/home').then((m) => m.HomePage) },
    { path: '/search', name: 'search', component: () => import('@/pages/search').then((m) => m.SearchPage) },
    { path: '/reader/:id', name: 'reader', component: () => import('@/pages/reader').then((m) => m.ReaderPage), props: true },
    { path: '/office/:id', name: 'office', component: () => import('@/pages/office-viewer').then((m) => m.OfficeViewerPage), props: true },
    { path: '/tool/merge', name: 'merge', component: () => import('@/pages/merge-pdf').then((m) => m.MergePdfPage) },
    { path: '/tool/split', name: 'split', component: () => import('@/pages/split-pdf').then((m) => m.SplitPdfPage) },
    { path: '/tool/lock', name: 'lock', component: () => import('@/pages/lock-pdf').then((m) => m.LockPdfPage) },
    { path: '/tool/img2pdf', name: 'img2pdf', component: () => import('@/pages/image-to-pdf').then((m) => m.ImageToPdfPage) },
    { path: '/tool/pdf2img', name: 'pdf2img', component: () => import('@/pages/pdf-to-image').then((m) => m.PdfToImagePage) },
    { path: '/tool/doc2pdf', name: 'doc2pdf', component: () => import('@/pages/doc-to-pdf').then((m) => m.DocToPdfPage) },
    { path: '/tool/scan', name: 'scan', component: () => import('@/pages/scan-document').then((m) => m.ScanDocumentPage) },
    { path: '/tool/delete', name: 'delete', component: () => import('@/pages/delete-files').then((m) => m.DeleteFilesPage) },
    { path: '/trash', name: 'trash', component: () => import('@/pages/trash').then((m) => m.TrashPage) },
    { path: '/settings', name: 'settings', component: () => import('@/pages/settings').then((m) => m.SettingsPage) },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to, from) => {
  // First run: pick a language, then the intro screens, then the app.
  if (!isOnboardingComplete()) {
    const step = hasChosenLocale() ? 'onboarding' : 'language'
    if (to.name !== step) return { name: step, query: { next: to.fullPath }, replace: true }
    return
  }
  // Every later launch opens on /begin once. Only the app's first navigation is redirected, so a file
  // opened from another app while /begin is showing still goes straight to it.
  if (to.name === 'begin') {
    // Already past it this session (e.g. Back from home): go on to where it was leading.
    if (!hasBegun()) return
    const next = to.query.next
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? { path: next, replace: true } : { name: 'home', replace: true }
  }
  if (!hasBegun() && from === START_LOCATION) return { name: 'begin', query: { next: to.fullPath }, replace: true }
})
