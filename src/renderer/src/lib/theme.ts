import { watch } from 'vue'
import { api } from './api'
import { app } from '@/stores/app'

const media = window.matchMedia('(prefers-color-scheme: dark)')

function apply(): void {
  const pref = app.prefs?.theme ?? 'system'
  const dark = pref === 'dark' || (pref === 'system' && media.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // Windows caption buttons sit on the top bar; match its colours.
  api.setTitleBarColors(dark ? '#1c1d1f' : '#ffffff', dark ? '#e4e4e7' : '#3f3f46')
}

export function initTheme(): void {
  apply()
  media.addEventListener('change', apply)
  watch(() => app.prefs?.theme, apply)
}

export function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}
