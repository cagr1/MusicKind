import * as React from 'react'
import es from './es.json'
import en from './en.json'

export type Lang = 'es' | 'en'

const DICTS: Record<Lang, unknown> = { es, en }

export const LANG_STORAGE_KEY = 'musickind-lang'

type Leaves<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : T extends object
    ? {
        [K in keyof T & string]: Leaves<
          T[K],
          `${Prefix}${Prefix extends '' ? '' : '.'}${K}` extends string
            ? `${Prefix}${Prefix extends '' ? '' : '.'}${K}`
            : never
        >
      }[keyof T & string]
    : never

export type TranslationKey = Leaves<typeof es>

function getByPath(dict: unknown, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
      dict,
    )
  return typeof value === 'string' ? value : path
}

function readInitialLang(): Lang {
  if (typeof window === 'undefined') return 'es'
  const stored = window.localStorage.getItem(LANG_STORAGE_KEY)
  return stored === 'en' ? 'en' : 'es'
}

interface I18nContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  toggleLang: () => void
  t: (key: TranslationKey) => string
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(readInitialLang)

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_STORAGE_KEY, next)
    }
  }, [])

  const toggleLang = React.useCallback(() => {
    setLang(lang === 'es' ? 'en' : 'es')
  }, [lang, setLang])

  const t = React.useCallback((key: TranslationKey) => getByPath(DICTS[lang], key), [lang])

  const value = React.useMemo<I18nContextValue>(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t],
  )

  React.useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider.')
  }
  return ctx
}

export function useT(): (key: TranslationKey) => string {
  return useI18n().t
}
