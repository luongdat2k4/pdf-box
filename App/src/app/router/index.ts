import { START_LOCATION, createRouter, createWebHistory } from 'vue-router'
import { hasBegun, isOnboardingComplete } from '@/features/onboarding'
import { hasChosenLocale } from '@/shared/i18n'

declare module 'vue-router' {
  // `banner`: the screen has the bottom banner strip (design-note/ads-plan.md, section 3).
  interface RouteMeta { banner?: boolean }
}

// Clean URLs (no /#/). Capacitor's local server and the Vite dev server fall back to index.html for unknown paths;
// a static web host needs the same fallback (rewrite every path to /index.html).
// Pages are loaded lazily: each is its own chunk, reached only through the page's public API.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/language', name: 'language', component: () => import('@/pages/language').then((m) => m.LanguagePage) },
    { path: '/launch', name: 'launch', component: () => import('@/pages/launch').then((m) => m.LaunchPage) },
    { path: '/begin', name: 'begin', component: () => import('@/pages/begin').then((m) => m.BeginPage), meta: { banner: true } },
    { path: '/onboarding', name: 'onboarding', component: () => import('@/pages/onboarding').then((m) => m.OnboardingPage) },
    // Home tabs are routes of the same page (/, /history, /favorites); the type chip is the `?type=` query.
    { path: '/', alias: '/home', name: 'home', component: () => import('@/pages/home').then((m) => m.HomePage), meta: { banner: true } },
    { path: '/history', name: 'history', component: () => import('@/pages/home').then((m) => m.HomePage), meta: { banner: true } },
    { path: '/favorites', name: 'favorites', component: () => import('@/pages/home').then((m) => m.HomePage), meta: { banner: true } },
    { path: '/search', name: 'search', component: () => import('@/pages/search').then((m) => m.SearchPage), meta: { banner: true } },
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
    { path: '/trash', name: 'trash', component: () => import('@/pages/trash').then((m) => m.TrashPage), meta: { banner: true } },
    { path: '/settings', name: 'settings', component: () => import('@/pages/settings').then((m) => m.SettingsPage), meta: { banner: true } },
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
  // Every later launch goes /launch (app-open ad) then /begin, once. Only the app's first navigation is
  // redirected, so a file opened from another app during either screen still goes straight to it.
  if (to.name === 'launch' || to.name === 'begin') {
    // Already past them this session (e.g. Back from home): go on to where they were leading.
    if (!hasBegun()) return
    const next = to.query.next
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? { path: next, replace: true } : { name: 'home', replace: true }
  }
  if (!hasBegun() && from === START_LOCATION) return { name: 'launch', query: { next: to.fullPath }, replace: true }
})
