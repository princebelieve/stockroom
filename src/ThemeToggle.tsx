import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

function savedTheme(): Theme {
  try { return localStorage.getItem('stockroom-theme') === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.appTheme = next
    try { localStorage.setItem('stockroom-theme', next) } catch { /* Keep the selected theme for this session. */ }
  }

  return <button type="button" className="app-theme-toggle" role="switch" aria-checked={theme === 'dark'} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`} onClick={toggle}>
    <span className="app-theme-toggle-track" aria-hidden="true"><span className="app-theme-toggle-thumb">{theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}</span></span>
    <span className="app-theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
  </button>
}
