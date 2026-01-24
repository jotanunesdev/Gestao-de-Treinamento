export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'gestao-treinamento:theme'

export function getStoredTheme(): Theme {
  if (typeof sessionStorage === 'undefined') {
    return 'light'
  }

  const stored = sessionStorage.getItem(STORAGE_KEY)
  return stored === 'dark' ? 'dark' : 'light'
}

export function setStoredTheme(theme: Theme) {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  sessionStorage.setItem(STORAGE_KEY, theme)
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}
