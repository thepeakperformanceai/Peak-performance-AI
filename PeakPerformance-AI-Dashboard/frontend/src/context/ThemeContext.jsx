import React, { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ theme: 'dark', toggle: () => {} })

const apply = (t) => {
  document.documentElement.setAttribute('data-theme', t)
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('pp_theme') || 'light' } catch { return 'light' }
  })
  useEffect(() => {
    apply(theme)
    try { localStorage.setItem('pp_theme', theme) } catch {}
  }, [theme])
  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

// A small sun/moon toggle button.
export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
      className={`flex items-center justify-center rounded-lg border transition-colors ${className}`}
      style={{
        width: 40, height: 40,
        borderColor: 'var(--pp-border)',
        background: 'transparent',
        color: 'var(--pp-text)',
        cursor: 'pointer',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
        {dark ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  )
}