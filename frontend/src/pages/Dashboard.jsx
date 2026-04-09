import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value ?? '—'}</p>
        <p className="text-sm font-medium text-slate-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [quincena, setQuincena] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const q = await api.get('/quincenas/activa')
        setQuincena(q.data)
        const r = await api.get(`/quincenas/${q.data.id}/resumen`)
        setResumen(r.data)
      } catch {
        // No hay quincena activa
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const fmt = (n) => n != null
    ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
    : '—'

  const fmtFecha = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          Buenos días, {usuario?.nombre}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Quincena activa */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-1/4 mb-3"></div>
          <div className="h-6 bg-slate-200 rounded w-1/2"></div>
        </div>
      ) : quincena ? (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 mb-6 text-white shadow-lg shadow-blue-500/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wide mb-1">Quincena activa</p>
              <p className="text-xl font-bold">
                {fmtFecha(quincena.fecha_inicio)} — {fmtFecha(quincena.fecha_fin)}
              </p>
              <p className="text-blue-200 text-sm mt-1">Ciclo {quincena.ciclo}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-medium capitalize">
                {quincena.estado}
              </span>
              <button
                onClick={() => navigate('/quincenas')}
                className="px-4 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
              >
                Ver detalle
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 mb-6 text-center">
          <p className="text-slate-400 text-sm">No hay quincena activa.</p>
          {['director_cap_humano', 'cap_humano'].includes(usuario?.rol) && (
            <button
              onClick={() => navigate('/quincenas')}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Crear nueva quincena →
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Docentes activos"
          value={resumen?.total_docentes}
          color="bg-blue-50"
          icon={<svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>}
        />
        <StatCard
          label="Total honorarios"
          value={fmt(resumen?.total_honorarios)}
          sub="Quincena activa"
          color="bg-emerald-50"
          icon={<svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>}
        />
        <StatCard
          label="Total a pagar"
          value={fmt(resumen?.total_a_pagar)}
          color="bg-violet-50"
          icon={<svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>}
        />
        <StatCard
          label="Pendientes revisión"
          value={resumen?.pendientes_revision}
          color="bg-amber-50"
          icon={<svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>}
        />
      </div>

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {['director_cap_humano', 'cap_humano'].includes(usuario?.rol) && (
            <button
              onClick={() => navigate('/docentes')}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <p className="font-semibold text-slate-700 group-hover:text-blue-600">Gestionar docentes</p>
              <p className="text-xs text-slate-400 mt-0.5">Alta, baja, modificación y carga masiva</p>
            </button>
          )}
          {['director_cap_humano', 'cap_humano', 'finanzas'].includes(usuario?.rol) && (
            <button
              onClick={() => navigate('/quincenas')}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <p className="font-semibold text-slate-700 group-hover:text-blue-600">Quincenas</p>
              <p className="text-xs text-slate-400 mt-0.5">Crear, abrir, cerrar y exportar</p>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
