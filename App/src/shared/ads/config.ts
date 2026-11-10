import { Capacitor } from '@capacitor/core'
import { ALF, type Config } from '@alf/app-sdk'

// Google's official test app IDs. With `settings.testAds` the SDK requests Google's test ad units for every
// format (banner, native, interstitial, app open), so ads fill without a real AdMob account. It is on while
// PDF Toolbox has no ad units of its own. Before shipping: replace both app IDs, fill in the ad units below,
// and set `dev` and `testAds` to false.
// The Android app ID must also match `ADMOB_APP_ID` in android/app/build.gradle (the manifest placeholder).
const TEST_APP_ID = {
  android: 'ca-app-pub-3940256099942544~3347511713',
  ios: 'ca-app-pub-3940256099942544~1458002511',
}

export const adsConfig: Config = {
  settings: {
    dev: true,
    testAds: true,
    isGame: false,
    isApp: true,
    appName: 'PDF Toolbox',
    appVersion: '0.1.0',
    environment: import.meta.env.PROD ? 'production' : 'dev',
  },
  keys: {
    // AppLovin MAX serves banner, MREC and interstitial (PDF Toolbox's own Android units). While `testAds` is on,
    // MAX registers the device as a test device, so these real units still only return test ads.
    applovin: {
      android: {
        sdkKey: 'eQt0q3679KmUyKeNcSzqC01eB-lILmfTnJoufGxpSn__n1NVhHLeMgxZOaICke451El4ZBfuZum9Qw4WxzpW52',
        banner: 'bc3c55441ed976de',
        mrec: '95b47fbeec437b11',
        interstitial: '1c39bd37a52aa9aa',
        rewarded: '808e3a3d698a7385',
        appOpen: '6b789db169cce90d',
      },
      ios: { sdkKey: '', banner: '', mrec: '', interstitial: '', rewarded: '', appOpen: '' },
    },
    admob: {
      android: { appId: TEST_APP_ID.android, banner: '', interstitial: '', rewarded: '', openApp: '', native: '' },
      ios: { appId: TEST_APP_ID.ios, banner: '', interstitial: '', rewarded: '', openApp: '', native: '' },
    },
  },
}

let initialization: Promise<boolean> | undefined
/** Resolves once AdMob has finished starting; resolved already when it is not needed to show ads. */
export let adMobReady: Promise<void> = Promise.resolve()

// Ads only: the rest of the framework (analytics, push, i18n, IAP) is not initialised, so booting it cannot prompt or
// log anything the app didn't ask for.
async function initAds(): Promise<void> {
  const alf = ALF.Instance
  await alf.initControllers()
  alf.Config.set(adsConfig)
  // MAX serves the banner, MREC and interstitials, so only it is waited for. AdMob starts alongside and is only
  // awaited when the AdMob test units are in use (testAds) or an app-open unit is loaded.
  adMobReady = alf.Ads.initAdMob()
  adMobReady.catch(() => {})
  // Ads.init() starts AppLovin and throws without an SDK key, which would also take AdMob down with it.
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
  const hasMax = Boolean(adsConfig.keys.applovin?.[platform].sdkKey)
  if (hasMax) await alf.Ads.init()
  if (!hasMax || adsConfig.settings?.testAds === true) await adMobReady
}

export function initAdsSdk(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(false)
  const platform = Capacitor.getPlatform()
  if (platform !== 'android' && platform !== 'ios') return Promise.resolve(false)
  const hasAdMob = Boolean(adsConfig.keys.admob?.[platform].appId)
  const hasMax = Boolean(adsConfig.keys.applovin?.[platform].sdkKey)
  if (!hasAdMob && !hasMax) return Promise.resolve(false)

  initialization ??= initAds()
    .then(() => true)
    .catch((error: unknown) => {
      console.error('ALF SDK initialization failed', error)
      return false
    })
  return initialization
}

export async function getAds() {
  return (await initAdsSdk()) ? ALF.Instance.Ads : null
}
