import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

export default function CambiarPassword() {
  const { usuario, marcarPasswordCambiado, logout } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', password_confirma: '' })
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (form.password_nueva !== form.password_confirma) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (form.password_nueva.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setGuardando(true)
    try {
      await api.post('/auth/cambiar-password', {
        password_actual:  form.password_actual,
        password_nueva:   form.password_nueva,
        password_confirma: form.password_confirma,
      })
      marcarPasswordCambiado()
      if (usuario?.rol === 'docente') navigate('/portal/docente', { replace: true })
      else if (usuario?.rol === 'trabajador') navigate('/portal/trabajador', { replace: true })
      else navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cambiar la contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  const inputCls = "w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Establece tu contraseña</h1>
          <p className="text-slate-500 text-sm mt-2">
            Es tu primer acceso. Por seguridad debes crear una contraseña personal.
          </p>
          {usuario?.nombre && (
            <p className="text-blue-600 text-sm font-medium mt-1">Hola, {usuario.nombre}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Contraseña actual (la que te dieron)
              </label>
              <input
                type="password"
                value={form.password_actual}
                onChange={e => set('password_actual', e.target.value)}
                className={inputCls}
                placeholder="Contraseña inicial"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={form.password_nueva}
                onChange={e => set('password_nueva', e.target.value)}
                className={inputCls}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Confirmar nueva contraseña
              </label>
              <input
                type="password"
                value={form.password_confirma}
                onChange={e => set('password_confirma', e.target.value)}
                className={inputCls}
                placeholder="Repite la contraseña"
                required
              />
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              {guardando ? 'Guardando...' : 'Guardar y entrar'}
            </button>
          </form>

          <button
            onClick={() => { logout(); navigate('/login') }}
            className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
