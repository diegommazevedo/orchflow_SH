/**
 * useTheme — controle de tema claro/escuro com transição suave.
 *
 * - Persiste em localStorage 'orchflow-theme'
 * - Aplica 'theme-dark' | 'theme-light' em document.documentElement
 * - Default: 'dark'
 * - Transição: 300ms no root antes de trocar, removida após
 *
 * Leis respeitadas:
 * - Zero chamadas ao banco (localStorage apenas)
 * - CORS não afetado
 */
import { useState, useEffect } from 'react'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'orchflow-theme'
const ROOT = document.documentElement

function getStored(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

function applyTheme(t: Theme) {
  // Ativa transição antes de trocar para suavizar a mudança de variáveis CSS
  ROOT.style.transition = 'background 0.3s ease, color 0.3s ease'
  ROOT.classList.remove('theme-dark', 'theme-light')
  ROOT.classList.add(`theme-${t}`)
  localStorage.setItem(THEME_KEY, t)
  // Remove a transição inline após 300ms para não interferir em animações normais
  const timer = setTimeout(() => {
    ROOT.style.transition = ''
  }, 300)
  return timer
}

export function useTheme(): {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
} {
  const [theme, setThemeState] = useState<Theme>(getStored)

  useEffect(() => {
    const timer = applyTheme(theme)
    return () => clearTimeout(timer)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggle   = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'))

  return { theme, toggle, setTheme }
}
