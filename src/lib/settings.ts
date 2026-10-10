export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'

export interface Settings {
  lang: Lang
  theme: Theme
}

const KEY = 'bpn.settings.v1'

export function defaultSettings(navLang = ''): Settings {
  return { lang: navLang.toLowerCase().startsWith('uk') ? 'uk' : 'en', theme: 'auto' }
}

/** Parses stored settings, falling back to defaults for anything missing or invalid. */
export function parseSettings(raw: string | null, navLang = ''): Settings {
  const d = defaultSettings(navLang)
  if (!raw) return d
  try {
    const v = JSON.parse(raw) as Partial<Settings>
    return {
      lang: v.lang === 'en' || v.lang === 'uk' ? v.lang : d.lang,
      theme: v.theme === 'auto' || v.theme === 'light' || v.theme === 'dark' ? v.theme : d.theme,
    }
  } catch {
    return d
  }
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY), navigator.language)
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage unavailable: settings just won't persist
  }
}
