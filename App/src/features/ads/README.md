# Ads

`config.ts` holds the ad configuration and initializes the ALF SDK before the app mounts
(`initAdsSdk`, called from `app/main.ts`). Keys are written in the file itself, the same way as the
Pulse app: Google's test AdMob app IDs by default, and empty AppLovin MAX keys to fill in once PDF
Toolbox's own MAX ad units exist. Web builds, and native builds with no AdMob app ID and no MAX SDK key,
skip ad initialization. `settings.testAds` makes the SDK serve Google's test ads.

Before shipping: replace the AdMob app IDs and ad units, fill in the MAX keys, and set `ADMOB_APP_ID` for
the Android build (see `android/app/build.gradle`) to the same Android app ID.

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
import { BannerAd, InterstitialAd } from '@/features/ads'

const interstitial = ref<InstanceType<typeof InterstitialAd> | null>(null)
async function showAd() { await interstitial.value?.show() }
</script>

<template>
  <BannerAd />
  <InterstitialAd ref="interstitial" preload placement="reader_open" />
  <button @click="showAd">Show ad</button>
</template>
```

Banner and MREC are single native placements managed by the SDK, so mount only
one instance of each at a time. The SDK needs the relevant ad unit IDs in
production. Run `npx cap sync android` after changing native dependencies.
