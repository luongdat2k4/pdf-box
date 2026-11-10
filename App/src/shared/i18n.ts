import { ref } from 'vue'
import en from './languages/en.json'
import vi from './languages/vi.json'

/** Languages the user can pick. `flag` is the file name in public/assets/flag/<flag>.svg. */
export const LANGUAGES = [
  { code: 'en', name: 'English', flag: 'en' },
  { code: 'vi', name: 'Tiếng Việt', flag: 'vi' },
] as const

export type Locale = (typeof LANGUAGES)[number]['code']
export type MessageKey = keyof typeof en
/** The part before `.one` / `.other` of a plural message, e.g. `home.imported`. */
export type PluralKey = Extract<MessageKey, `${string}.other`> extends `${infer B}.other` ? B : never

const dictionaries: Record<Locale, Record<string, string>> = { en, vi }
const STORAGE_KEY = 'pdftoolbox.language'

function initial(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (LANGUAGES.some((l) => l.code === saved)) return saved as Locale
  return navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

/** Reactive, so every `t()` call inside a template or computed re-runs when the language changes. */
export const locale = ref<Locale>(initial())
document.documentElement.lang = locale.value

/** True once the user has picked a language (as opposed to the one guessed from the device). */
export function hasChosenLocale(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null
}

export function setLocale(code: Locale): void {
  locale.value = code
  localStorage.setItem(STORAGE_KEY, code)
  document.documentElement.lang = code
}

function fill(text: string, params?: Record<string, string | number>): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text
}

/** Translate a key; falls back to English, then to the key itself. `{name}` placeholders are filled from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return fill(dictionaries[locale.value][key] ?? en[key] ?? key, params)
}

/** Plural message: uses `<base>.one` for 1 and `<base>.other` otherwise. `{n}` is the count. */
export function tp(base: PluralKey, n: number, params: Record<string, string | number> = {}): string {
  const key = `${base}.${n === 1 ? 'one' : 'other'}` as MessageKey
  return t(key, { n, ...params })
}

export function flagUrl(flag: string): string {
  return `${import.meta.env.BASE_URL}assets/flag/${flag}.svg`
}
