import { Capacitor } from '@capacitor/core'
import { ALF, initSDK, type Config } from '@alf/app-sdk'

const env = import.meta.env

export const adsConfig: Config = {
  settings: {
    dev: env.DEV,
    testAds: env.DEV,
    isGame: false,
    isApp: true,
    appName: 'PDF Toolbox',
    appVersion: '0.1.0',
    environment: env.PROD ? 'production' : 'dev',
  },
  keys: {
    admob: {
      android: {
        appId: env.VITE_ALF_ADMOB_ANDROID_APP_ID || '',
        banner: env.VITE_ALF_ADMOB_ANDROID_BANNER || '',
        interstitial: env.VITE_ALF_ADMOB_ANDROID_INTERSTITIAL || '',
        rewarded: env.VITE_ALF_ADMOB_ANDROID_REWARDED || '',
        openApp: env.VITE_ALF_ADMOB_ANDROID_APP_OPEN || '',
        native: env.VITE_ALF_ADMOB_ANDROID_NATIVE || '',
      },
      ios: {
        appId: env.VITE_ALF_ADMOB_IOS_APP_ID || '',
        banner: env.VITE_ALF_ADMOB_IOS_BANNER || '',
        interstitial: env.VITE_ALF_ADMOB_IOS_INTERSTITIAL || '',
        rewarded: env.VITE_ALF_ADMOB_IOS_REWARDED || '',
        openApp: env.VITE_ALF_ADMOB_IOS_APP_OPEN || '',
        native: env.VITE_ALF_ADMOB_IOS_NATIVE || '',
      },
    },
    applovin: {
      android: {
        sdkKey: env.VITE_ALF_MAX_ANDROID_SDK_KEY || '',
        banner: env.VITE_ALF_MAX_ANDROID_BANNER || '',
        mrec: env.VITE_ALF_MAX_ANDROID_MREC || '',
        interstitial: env.VITE_ALF_MAX_ANDROID_INTERSTITIAL || '',
        rewarded: env.VITE_ALF_MAX_ANDROID_REWARDED || '',
        appOpen: env.VITE_ALF_MAX_ANDROID_APP_OPEN || '',
      },
      ios: {
        sdkKey: env.VITE_ALF_MAX_IOS_SDK_KEY || '',
        banner: env.VITE_ALF_MAX_IOS_BANNER || '',
        mrec: env.VITE_ALF_MAX_IOS_MREC || '',
        interstitial: env.VITE_ALF_MAX_IOS_INTERSTITIAL || '',
        rewarded: env.VITE_ALF_MAX_IOS_REWARDED || '',
        appOpen: env.VITE_ALF_MAX_IOS_APP_OPEN || '',
      },
    },
  },
}

let initialization: Promise<boolean> | undefined

export function initAdsSdk(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(false)
  const platform = Capacitor.getPlatform()
  if (platform !== 'android' && platform !== 'ios') return Promise.resolve(false)
  const hasAdMob = Boolean(adsConfig.keys.admob?.[platform].appId)
  const hasMax = Boolean(adsConfig.keys.applovin?.[platform].sdkKey)
  if (!hasAdMob && !hasMax) return Promise.resolve(false)

  initialization ??= initSDK(adsConfig)
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
