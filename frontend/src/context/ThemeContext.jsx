import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    // 1. Preferencia guardada por el usuario
    const saved = localStorage.getItem('nexo-theme')
    if (saved) return saved === 'dark'
    // 2. Preferencia del sistema operativo
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Aplicar/quitar clase 'dark' en <html> cada vez que cambie
  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('nexo-theme', dark ? 'dark' : 'light')
  }, [dark])

  const toggle = () => setDark(v => !v)

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
