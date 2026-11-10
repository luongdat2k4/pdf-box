import { ref } from 'vue'
import en from './languages/en.json'

/**
 * Languages the user can pick, each named in its own language. `flag` is the file name in
 * public/assets/flag/<flag>.svg. `rtl` languages lay the app out right to left.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', flag: 'en' },
  { code: 'vi', name: 'Tiếng Việt', flag: 'vi' },
  { code: 'ar', name: 'العربية', flag: 'ar', rtl: true },
  { code: 'bn', name: 'বাংলা', flag: 'bn' },
  { code: 'de', name: 'Deutsch', flag: 'de' },
  { code: 'es', name: 'Español', flag: 'es' },
  { code: 'fr', name: 'Français', flag: 'fr' },
  { code: 'hi', name: 'हिन्दी', flag: 'hi' },
  { code: 'id', name: 'Bahasa Indonesia', flag: 'id' },
  { code: 'it', name: 'Italiano', flag: 'it' },
  { code: 'ja', name: '日本語', flag: 'ja' },
  { code: 'ko', name: '한국어', flag: 'ko' },
  { code: 'nl', name: 'Nederlands', flag: 'nl' },
  { code: 'pl', name: 'Polski', flag: 'pl' },
  { code: 'pt', name: 'Português', flag: 'pt' },
  { code: 'ru', name: 'Русский', flag: 'ru' },
  { code: 'th', name: 'ไทย', flag: 'th' },
  { code: 'tr', name: 'Türkçe', flag: 'tr' },
  { code: 'ur', name: 'اردو', flag: 'ur', rtl: true },
  { code: 'zh', name: '简体中文', flag: 'zh' },
] as const

export type Locale = (typeof LANGUAGES)[number]['code']
export type MessageKey = keyof typeof en
/** The part before `.one` / `.other` of a plural message, e.g. `home.imported`. */
export type PluralKey = Extract<MessageKey, `${string}.other`> extends `${infer B}.other` ? B : never

type Dictionary = Record<string, string>
// English ships in the main bundle (it is the fallback for every missing key); the others load on demand.
const dictionaries: Partial<Record<Locale, Dictionary>> = { en }
const loaders = import.meta.glob<Dictionary>(['./languages/*.json', '!./languages/en.json'], { import: 'default' })
const STORAGE_KEY = 'pdftoolbox.language'

const isLocale = (code: unknown): code is Locale => LANGUAGES.some((l) => l.code === code)

/** The saved choice, else the device language when we have it, else English. */
function initial(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  // Until the user picks a language, the app starts in English (the device language is not used).
  return isLocale(saved) ? saved : 'en'
}

async function load(code: Locale): Promise<void> {
  if (dictionaries[code]) return
  const loader = loaders[`./languages/${code}.json`]
  if (loader) dictionaries[code] = await loader()
}

function applyToDocument(code: Locale) {
  document.documentElement.lang = code
  document.documentElement.dir = LANGUAGES.find((l) => l.code === code && 'rtl' in l) ? 'rtl' : 'ltr'
}

/** Reactive, so every `t()` call inside a template or computed re-runs when the language changes. */
export const locale = ref<Locale>('en')

/** Loads the starting language; the app mounts once this resolves (app/main.ts). */
export const i18nReady: Promise<void> = (async () => {
  const code = initial()
  await load(code).catch(() => {})
  locale.value = dictionaries[code] ? code : 'en'
  applyToDocument(locale.value)
})()

/** True once the user has picked a language (as opposed to the one guessed from the device). */
export function hasChosenLocale(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null
}

/** Switches language once its strings have loaded, and remembers the choice. */
export async function setLocale(code: Locale): Promise<void> {
  localStorage.setItem(STORAGE_KEY, code)
  await load(code)
  if (localStorage.getItem(STORAGE_KEY) !== code) return // another language was picked meanwhile
  locale.value = code
  applyToDocument(code)
}

function fill(text: string, params?: Record<string, string | number>): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text
}

/** Translate a key; falls back to English, then to the key itself. `{name}` placeholders are filled from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return fill(dictionaries[locale.value]?.[key] ?? en[key] ?? key, params)
}

/** Plural message: uses `<base>.one` for 1 and `<base>.other` otherwise. `{n}` is the count. */
export function tp(base: PluralKey, n: number, params: Record<string, string | number> = {}): string {
  const key = `${base}.${n === 1 ? 'one' : 'other'}` as MessageKey
  return t(key, { n, ...params })
}

export function flagUrl(flag: string): string {
  return `${import.meta.env.BASE_URL}assets/flag/${flag}.svg`
}
