# Ads

`config.ts` initializes ALF SDK before the app mounts. It reads ad IDs from Vite
environment variables; see `App/.env.example`. Web and native builds without an
AdMob app ID or AppLovin SDK key skip ad initialization. Development builds use
SDK test ads.

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
