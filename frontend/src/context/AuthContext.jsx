import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => {
    const u = localStorage.getItem('usuario')
    return u ? JSON.parse(u) : null
  })

  const login = (data) => {
    localStorage.setItem('token', data.access_token)
    const u = {
      id:                    data.usuario_id,
      nombre:                data.nombre,
      rol:                   data.rol,
      programa_id:           data.programa_id,
      debe_cambiar_password: data.debe_cambiar_password ?? false,
    }
    localStorage.setItem('usuario', JSON.stringify(u))
    setUsuario(u)
  }

  const marcarPasswordCambiado = () => {
    setUsuario(prev => {
      const updated = { ...prev, debe_cambiar_password: false }
      localStorage.setItem('usuario', JSON.stringify(updated))
      return updated
    })
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, marcarPasswordCambiado }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
