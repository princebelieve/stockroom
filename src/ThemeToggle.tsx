import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyAppAppearance } from './lib/appAppearance'

type Theme = 'light' | 'dark'

function savedTheme(): Theme {
  try { return localStorage.getItem('stockroom-theme') === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

function savedAppColor() {
  try { return localStorage.getItem('stockroom-app-brand-color') || '#08b9f4' }
  catch { return '#08b9f4' }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(savedTheme)
  useEffect(() => {
    const sync = (event: Event) => setTheme((event as CustomEvent<{ theme: Theme }>).detail.theme)
    window.addEventListener('stockroom-app-appearance', sync)
    return () => window.removeEventListener('stockroom-app-appearance', sync)
  }, [])
  useEffect(() => { applyAppAppearance(theme, savedAppColor()) }, [theme])
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyAppAppearance(next, savedAppColor())
    try { localStorage.setItem('stockroom-theme', next) } catch { /* Keep the selected theme for this session. */ }
  }

  return <button type="button" className="app-theme-toggle" role="switch" aria-checked={theme === 'dark'} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`} onClick={toggle}>
    <span className="app-theme-toggle-track" aria-hidden="true"><span className="app-theme-toggle-thumb">{theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}</span></span>
    <span className="app-theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
  </button>
}
