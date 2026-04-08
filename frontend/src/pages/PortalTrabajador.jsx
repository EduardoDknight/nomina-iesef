import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const fmtFecha = (d) => d ? new Date(d + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Tab: Mi Asistencia ────────────────────────────────────────────────────────
function TabAsistencia() {
  const [periodos, setPeriodos] = useState([])
  const [periodoId, setPeriodoId] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/portal/periodos-disponibles').then(r => {
      setPeriodos(r.data)
      if (r.data.length > 0) setPeriodoId(r.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!periodoId) return
    setLoading(true)
    api.get('/portal/mi-asistencia', { params: { periodo_id: periodoId } })
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [periodoId])

  return (
    <div>
      {periodos.length > 0 && (
        <div className="mb-4">
          <select
            value={periodoId || ''}
            onChange={e => setPeriodoId(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Cargando...</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Días con registro', val: data.resumen?.dias_con_registro ?? 0, cls: 'text-blue-600' },
              { label: 'Completos', val: data.resumen?.presentes ?? 0, cls: 'text-emerald-600' },
              { label: 'Incompletos', val: data.resumen?.incompletos ?? 0, cls: 'text-orange-500' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className={`text-2xl font-bold ${s.cls}`}>{s.val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {data.dias?.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">Sin registros en este período.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Día</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Entrada</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Salida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.dias.map((d, i) => {
                    const incompleto = !d.entrada || !d.salida
                    return (
                      <tr key={i} className={incompleto ? 'bg-orange-50/40' : 'hover:bg-slate-50'}>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">{d.fecha}</td>
                        <td className="px-4 py-3 text-slate-500 capitalize">{d.dia_semana}</td>
                        <td className="px-4 py-3 text-center font-mono text-slate-700">{d.entrada || <span className="text-red-400">—</span>}</td>
                        <td className="px-4 py-3 text-center font-mono text-slate-700">{d.salida || <span className="text-red-400">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-slate-400 text-sm">Selecciona un período.</div>
      )}
    </div>
  )
}

// ── Tab: Mi Cuenta ────────────────────────────────────────────────────────────
function TabCuenta() {
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', password_confirma: '' })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (form.password_nueva !== form.password_confirma) { setMsg({ tipo: 'error', texto: 'Las contraseñas no coinciden.' }); return }
    if (form.password_nueva.length < 6) { setMsg({ tipo: 'error', texto: 'Mínimo 6 caracteres.' }); return }
    setGuardando(true)
    try {
      await api.post('/auth/cambiar-password', form)
      setMsg({ tipo: 'ok', texto: 'Contraseña actualizada.' })
      setForm({ password_actual: '', password_nueva: '', password_confirma: '' })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al cambiar.' })
    } finally { setGuardando(false) }
  }

  const inputCls = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {['password_actual', 'password_nueva', 'password_confirma'].map((k, i) => (
          <div key={k}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {['Contraseña actual', 'Nueva contraseña', 'Confirmar nueva'][i]}
            </label>
            <input type="password" value={form[k]} onChange={e => set(k, e.target.value)}
              className={inputCls} required />
          </div>
        ))}
        {msg && (
          <div className={`px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.texto}
          </div>
        )}
        <button type="submit" disabled={guardando}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  )
}

// ── Portal Principal ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'asistencia', label: 'Mi Asistencia', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'cuenta',     label: 'Mi Cuenta',     icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

export default function PortalTrabajador() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('asistencia')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">IE</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-none">{usuario?.nombre}</p>
              <p className="text-xs text-slate-400 mt-0.5">Portal Administrativo</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login') }}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Salir
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        {tab === 'asistencia' && <TabAsistencia />}
        {tab === 'cuenta'     && <TabCuenta />}
      </main>
    </div>
  )
}
