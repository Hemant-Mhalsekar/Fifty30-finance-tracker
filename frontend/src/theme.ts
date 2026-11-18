export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'fifty30-theme'
// The page background in each mode, used for the browser and installed-app title bar.
const BACKGROUND = { light: '#f6f6f8', dark: '#121316' } as const

/** The saved choice for this device. Storage can be blocked (private mode): then it is System. */
export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Not saved, but it still applies until the page is reloaded.
  }
  applyTheme(preference)
}

/**
 * Light or dark wins over the device setting through data-theme on <html>; System removes it so
 * the prefers-color-scheme rules in index.css decide. index.html runs the same check before the
 * first paint, so a saved choice never flashes the other theme.
 */
export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  const root = document.documentElement
  if (preference === 'system') delete root.dataset.theme
  else root.dataset.theme = preference

  // index.html has one theme-color tag per device mode; a forced theme sets both to its colour.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const mode = meta.media.includes('dark') ? 'dark' : 'light'
    meta.content = BACKGROUND[preference === 'system' ? mode : preference]
  }
}
