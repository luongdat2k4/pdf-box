export { adsConfig, adMobReady, initAdsSdk, getAds } from './config'
export {
  adsPossible, bannerPossible, nativePossible, fullScreenShowing, watchAdClicks, overlaysOpen, holdAdsWhile,
  preloadInterstitial, showInterstitial, beforeOpenDocument,
  showLaunchAd, expectExternal, noteDocumentOpened, onAppStateChange,
} from './runtime'
export * from './placements'
