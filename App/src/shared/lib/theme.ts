import { ref } from 'vue'

/** App colour themes (Settings > Theme). The colours live in app/styles/index.css under `data-theme`. */
export const THEMES = ['light', 'sepia', 'dark', 'dimmed'] as const
export type Theme = (typeof THEMES)[number]

const STORAGE_KEY = 'pdftoolbox.theme'
const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme)

function saved(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isTheme(v) ? v : 'light'
  } catch {
    return 'light'
  }
}

export const theme = ref<Theme>(saved())

/** Reads a theme colour token (e.g. 'card') as the browser resolved it. */
export function themeColor(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim()
}

function apply(value: Theme) {
  const root = document.documentElement
  if (value === 'light') root.removeAttribute('data-theme')
  else root.dataset.theme = value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor('header'))
}

/** Call once before mounting so the first frame already has the saved theme. */
export function initTheme(): void {
  apply(theme.value)
}

export function setTheme(value: Theme): void {
  theme.value = value
  apply(value)
  try { localStorage.setItem(STORAGE_KEY, value) } catch { /* not remembered */ }
}

/** Colours for native ad templates, so a native ad matches the current theme instead of staying white. */
export function nativeAdStyle() {
  return {
    background: themeColor('card'),
    textColor: themeColor('ink-strong'),
    secondaryTextColor: themeColor('ink'),
    ctaBackground: themeColor('primary'),
    ctaTextColor: '#ffffff',
  }
}
