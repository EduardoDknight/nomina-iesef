import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    // Preferencia guardada por el usuario; default: modo claro
    const saved = localStorage.getItem('nexo-theme')
    return saved === 'dark'
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
