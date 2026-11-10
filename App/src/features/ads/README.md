# Ads

The placement plan is `design-note/ads-plan.md`.

- `@/shared/ads` holds the configuration (`config.ts`, keys written in the file like the Pulse app) and the
  scheduling every screen shares (`runtime.ts`, `placements.ts`): which formats can fill, the 60s gap between
  full-screen ads, the per-session cap, the launch and resume app-open ads, the interstitials at a finished
  tool (`useRunner`) and when opening a document from a list (`beforeOpenDocument`), and `expectExternal()`
  for the system screens the app opens itself. It lives in `shared` so tool features and entities can use it.
- The SDK starts in the background (`initAdsSdk` from `app/main.ts`); the app never waits for it.
- Slots are reserved only when that format can fill (`bannerPossible`, `nativePossible`), so a build with
  empty ad units shows no empty boxes.
- One banner for the whole app, mounted by `app/App.vue` on routes with `meta.banner`; it hides while a sheet,
  dialog, keyboard or full-screen ad is up (`holdAdsWhile`, `overlaysOpen`).

Before shipping: replace the AdMob app IDs and ad units, fill in the MAX keys, and set `ADMOB_APP_ID` for
the Android build (see `android/app/build.gradle`) to the same Android app ID. `testAds` is on for now (Google's test ads in every
format); set it, and `dev`, to false once real units are in.

Import components from `@/features/ads`:

- `BannerAd` and `MrecAd` show anchored native ads while mounted.
- `NativeAd` reserves a rectangle in the page and follows it on scroll and resize.
- `InterstitialAd`, `RewardedAd`, and `AppOpenAd` expose `preload()` and `show()`
  through a Vue template ref. Pass `preload` to load on mount. They emit `closed`;
  rewarded also supplies `'rewarded'` or `'skipped'`.

Example:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { InterstitialAd } from '@/features/ads'

const interstitial = ref<InstanceType<typeof InterstitialAd> | null>(null)
async function showAd() { await interstitial.value?.show() }
</script>

<template>
  <InterstitialAd ref="interstitial" preload placement="reader_open" />
  <button @click="showAd">Show ad</button>
</template>
```

Banner and MREC are single native placements managed by the SDK, so mount only
one instance of each at a time. The SDK needs the relevant ad unit IDs in
production. Run `npx cap sync android` after changing native dependencies.
