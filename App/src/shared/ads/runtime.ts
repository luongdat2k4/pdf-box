import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { ALFAdMob } from '@alf/app-sdk'
import { adMobReady, adsConfig, getAds, initAdsSdk } from './config'
import { FULL_SCREEN_GAP_MS, LAUNCH_DEADLINE_MS, MAX_FULL_SCREEN_PER_SESSION, OPEN_DOCUMENT_EVERY,
  RESUME_MIN_BACKGROUND_MS, type Placement } from './placements'

// Ad scheduling for the whole app (design-note/ads-plan.md). Every full-screen ad goes through here, so the
// spacing between them, the per-session cap and "never over a sheet or a system screen" hold everywhere.
// Nothing here ever blocks the user: a missing, slow or failed ad means the flow simply carries on.

const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
const testAds = adsConfig.settings?.testAds === true
/** Google's sample app-open units, used with `testAds`. */
const TEST_APP_OPEN = { android: 'ca-app-pub-3940256099942544/9257395921', ios: 'ca-app-pub-3940256099942544/5575463023' }

/**
 * True on a phone build that has ad keys. Decided synchronously at start-up, so ad space can be reserved
 * from the first frame and never appears or disappears as ads load (design-note/note/ad-layout-stability.md).
 */
export const adsPossible = Capacitor.isNativePlatform() && Boolean(
  adsConfig.keys.admob?.[platform].appId || adsConfig.keys.applovin?.[platform].sdkKey)
const admobUnits = adsConfig.keys.admob?.[platform]
const maxUnits = adsConfig.keys.applovin?.[platform]
/** A banner can fill (test ads, or an AdMob or MAX banner unit): only then is the bottom strip reserved. */
export const bannerPossible = adsPossible && (testAds || Boolean(admobUnits?.banner || (maxUnits?.sdkKey && maxUnits.banner)))
/** A native ad can fill (test ads, or an AdMob native unit): only then are native slots reserved. */
export const nativePossible = adsPossible && (testAds || Boolean(admobUnits?.native))

/** A full-screen ad (interstitial or app open) is on screen. */
export const fullScreenShowing = ref(false)
/**
 * Number of sheets, dialogs and drawers open. Banner and native ads are native views drawn above the
 * WebView, so they would cover these; page ads hide while this is above zero.
 */
export const overlaysOpen = ref(0)

/** Count `open` as an overlay while it is true (and until the calling component unmounts). */
export function holdAdsWhile(open: Ref<boolean>): void {
  let held = false
  const hold = (on: boolean) => {
    if (on === held) return
    held = on
    overlaysOpen.value += on ? 1 : -1
  }
  watch(open, hold, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => hold(false))
}

let lastFullScreenAt = 0
let fullScreenCount = 0
let interstitialLoaded = false
let interstitialLoading: Promise<void> | undefined

function fullScreenAllowed(): boolean {
  return adsPossible && !fullScreenShowing.value && !document.hidden && overlaysOpen.value === 0
    && fullScreenCount < MAX_FULL_SCREEN_PER_SESSION && Date.now() - lastFullScreenAt >= FULL_SCREEN_GAP_MS
}

function wait<T>(operation: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  return Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('ad timed out')), Math.max(0, ms))
    abort = () => reject(new Error('ad cancelled'))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })]).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', abort) })
}

/** Load the interstitial in the background so it is ready at the next natural break. */
export function preloadInterstitial(): Promise<void> {
  if (!adsPossible || interstitialLoaded) return Promise.resolve()
  return interstitialLoading ??= (async () => {
    try {
      const ads = await getAds()
      if (!ads) return
      await ads.LoadInterstitial()
      interstitialLoaded = true // the SDK only resolves once loaded (or logs and resolves on no fill; show checks again)
    } catch { /* no fill: the next break tries again */ } finally { interstitialLoading = undefined }
  })()
}

/**
 * Shows the interstitial if one is loaded and the spacing allows it, and resolves once it has been closed
 * (or straight away when nothing was shown). Returns whether an ad was shown.
 */
export async function showInterstitial(placement: Placement): Promise<boolean> {
  if (!fullScreenAllowed()) return false
  if (!interstitialLoaded) { void preloadInterstitial(); return false }
  const ads = await getAds()
  if (!ads || !fullScreenAllowed()) return false
  interstitialLoaded = false
  fullScreenShowing.value = true
  let closed = false
  let shown = false
  let onClosed = () => {}
  const dismissed = new Promise<void>((resolve) => { onClosed = () => { closed = true; resolve() } })
  try {
    await ads.ShowInterstitial(onClosed, placement)
    // The SDK returns quietly when no ad was ready; its scheduler only reports a full-screen ad once one opened.
    shown = closed || ads.GetPerfStats().fullscreenOpen
    if (!shown) return false
    await wait(dismissed, 120_000) // watchdog in case the close callback is lost
    return true
  } catch {
    return false
  } finally {
    // The spacing counts from when the ad was closed.
    if (shown) { lastFullScreenAt = Date.now(); fullScreenCount++ }
    fullScreenShowing.value = false
    void preloadInterstitial()
  }
}

// ---- open a document ---------------------------------------------------------------------------------------

let documentOpens = 0
/** Before opening a document from a list: the first open of a session is free, then every 2nd shows an ad. */
export async function beforeOpenDocument(): Promise<void> {
  documentOpens++
  if (documentOpens === 1 || documentOpens % OPEN_DOCUMENT_EVERY !== 0) { void preloadInterstitial(); return }
  await showInterstitial('open_document')
}

// ---- app open: cold start and returning from the background -------------------------------------------------

function appOpenUnit(): string | undefined {
  return testAds ? TEST_APP_OPEN[platform] : adsConfig.keys.admob?.[platform].openApp || undefined
}

/** Shows an AdMob app-open ad that loads within `deadline`, and resolves once it is closed. */
async function showAppOpen(placement: Placement, deadline: number, signal: AbortSignal): Promise<boolean> {
  const adUnitId = appOpenUnit()
  const left = () => deadline - Date.now()
  if (!adUnitId) {
    // No app-open unit: an interstitial that is already loaded (or loads in time) takes the moment instead.
    await wait(preloadInterstitial(), left(), signal).catch(() => {})
    if (signal.aborted || left() <= 0 || openingDocument()) return false
    return showInterstitial(placement)
  }
  let listener: { remove: () => unknown } | undefined
  let owns = false
  try {
    await wait(adMobReady, left(), signal)
    await wait(ALFAdMob.loadOpenAppAd({ adUnitId }), left(), signal)
    const { ready } = await wait(ALFAdMob.isOpenAppAdReady({ adUnitId }), left(), signal)
    if (!ready || !fullScreenAllowed()) return false
    let onClosed = () => {}
    const dismissed = new Promise<void>((resolve) => { onClosed = resolve })
    listener = await wait(ALFAdMob.addListener('OnOpenAppAdDismissedEvent', (e) => { if (e.adUnitId === adUnitId) onClosed() }), left(), signal)
    // A late answer must never put an ad over the next screen.
    if (signal.aborted || left() <= 0 || !fullScreenAllowed() || openingDocument()) return false
    owns = true
    fullScreenShowing.value = true
    await ALFAdMob.showOpenAppAd({ adUnitId })
    await wait(dismissed, 120_000, signal)
    return true
  } catch {
    return false
  } finally {
    void listener?.remove()
    if (owns) {
      lastFullScreenAt = Date.now()
      fullScreenCount++
      fullScreenShowing.value = false
    }
  }
}

/** Cold start (after onboarding): one app-open ad within LAUNCH_DEADLINE_MS, or nothing. */
export async function showLaunchAd(signal: AbortSignal): Promise<void> {
  if (!adsPossible || signal.aborted) return
  // Started by "Open with": the intent carries the file's URI.
  const launch = await CapApp.getLaunchUrl().catch(() => undefined)
  if (launch?.url) { noteDocumentOpened(); return }
  const deadline = Date.now() + LAUNCH_DEADLINE_MS
  const ready = await wait(initAdsSdk(), LAUNCH_DEADLINE_MS, signal).catch(() => false)
  if (!ready || signal.aborted) return
  await showAppOpen('app_launch', deadline, signal)
}

// The app leaves the screen on its own for the file picker, share sheet, save copy, folder picker, the
// file-access settings and camera permission. Coming back from those is not "returning to the app".
let externalUntilResume = false
/** Call right before the app opens a system screen, so coming back from it shows no app-open ad. */
export function expectExternal(): void {
  externalUntilResume = true
}

// A document opened from another app ("Open with") must never wait behind an ad. Capacitor's `appUrlOpen`
// fires for that intent before the app resumes, and before the file has been imported.
let openedFromOtherApp = 0
export function noteDocumentOpened(): void {
  openedFromOtherApp = Date.now()
}
const openingDocument = () => Date.now() - openedFromOtherApp < 5000

let backgroundSince = 0
let resumeController: AbortController | undefined
/** App state from @capacitor/app: call with `isActive` on every change. */
export function onAppStateChange(isActive: boolean, canShow: () => boolean): void {
  // A full-screen ad runs in its own activity, which pauses the app: that is not the user leaving.
  if (fullScreenShowing.value) return
  if (!isActive) {
    backgroundSince = Date.now()
    resumeController?.abort()
    return
  }
  const external = externalUntilResume
  externalUntilResume = false
  const away = backgroundSince ? Date.now() - backgroundSince : 0
  backgroundSince = 0
  if (!adsPossible || external || away < RESUME_MIN_BACKGROUND_MS) return
  resumeController = new AbortController()
  const signal = resumeController.signal
  // "Open with" from another app also resumes the app; its event arrives just after. Give it a moment.
  setTimeout(() => {
    if (signal.aborted || openingDocument() || !canShow()) return
    void showAppOpen('app_resume', Date.now() + LAUNCH_DEADLINE_MS, signal)
  }, 400)
}

/**
 * Tapping a banner or native ad opens the advertiser's page outside the app; coming back from it is not
 * "returning to the app". Called once the SDK is up.
 */
export async function watchAdClicks(): Promise<void> {
  const ads = await getAds()
  ads?.SetOnNativeAdEventHandler((event) => { if (event.type === 'clicked') expectExternal() })
}
