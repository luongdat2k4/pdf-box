import { Capacitor, registerPlugin, SystemBarType, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import type { Router } from 'vue-router'

/** Local native plugin (android/.../WindowColorPlugin.java): colours the strip behind the status bar. */
const WindowColor = registerPlugin<{ setStatusBarColor(o: { color: string; background?: string }): Promise<void> }>('WindowColor')

type Rgb = [number, number, number]

/** Parse `rgb()/rgba()`; fully transparent -> null. */
function parse(css: string): Rgb | null {
  const m = css.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const [r = 0, g = 0, b = 0, a = 1] = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number)
  return a === 0 ? null : [r, g, b]
}

const hex = ([r, g, b]: Rgb) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const isLight = ([r, g, b]: Rgb) => (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6

/** Background colour of the view's title bar: the first visible <header> that has one, else the page background. */
function titleBarColor(): Rgb {
  for (const h of document.querySelectorAll<HTMLElement>('#app header')) {
    if (h.offsetParent === null && getComputedStyle(h).position !== 'fixed') continue // hidden (e.g. reader with bars off)
    const c = parse(getComputedStyle(h).backgroundColor)
    if (c) return c
    break // a header without its own background sits on the page
  }
  return pageColor()
}

/** The page background of the current theme (also shows behind the navigation bar). */
function pageColor(): Rgb {
  return parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255]
}

async function apply(): Promise<void> {
  const color = titleBarColor()
  try {
    const page = pageColor()
    await WindowColor.setStatusBarColor({ color: hex(color), background: hex(page) })
    // Dark bar -> white icons, light bar -> dark icons. SystemBars is what Capacitor 8 uses for edge-to-edge
    // and can override StatusBar, so set both to the same value.
    const light = isLight(color)
    await SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark, bar: SystemBarType.StatusBar })
    await StatusBar.setStyle({ style: light ? Style.Light : Style.Dark })
    await SystemBars.setStyle({ style: isLight(page) ? SystemBarsStyle.Light : SystemBarsStyle.Dark, bar: SystemBarType.NavigationBar })
  } catch {
    // plugin missing or colour rejected: leave the bar as it is
  }
}

/**
 * Keep the Android status bar the same colour as the current view's title bar.
 * Pages load lazily, so after each navigation watch the DOM briefly until the header has rendered.
 */
export function syncStatusBarWithRoutes(router: Router): void {
  if (!Capacitor.isNativePlatform()) return
  let last = ''
  const check = () => {
    const key = hex(titleBarColor()) + hex(pageColor())
    if (key !== last) { last = key; void apply() }
  }
  router.afterEach(() => {
    const obs = new MutationObserver(check)
    obs.observe(document.getElementById('app')!, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    setTimeout(() => obs.disconnect(), 1200)
    requestAnimationFrame(check)
  })
  // A theme change recolours the bars without a navigation.
  new MutationObserver(() => requestAnimationFrame(check))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}
