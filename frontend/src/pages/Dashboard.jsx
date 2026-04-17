import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import SyncBadge, { useSyncInfo } from '../components/SyncBadge'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => n != null
  ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
  : '—'

const fmtFecha = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX',
      { day: '2-digit', month: 'short', year: 'numeric' })
  : '—'

function fmtRelativo(minutos) {
  if (minutos === null) return null
  if (minutos < 1)   return 'Ahora mismo'
  if (minutos === 1) return 'hace 1 min'
  if (minutos < 60)  return `hace ${minutos} min`
  const hrs = Math.floor(minutos / 60)
  const min = minutos % 60
  if (min === 0) return `hace ${hrs} h`
  return `hace ${hrs} h ${min} min`
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

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

// ── Tarjeta estado del checador ───────────────────────────────────────────────

const COLORES_SYNC = {
  fresco:    { bg: '#f0fdf4', border: '#bbf7d0', dot: '#10b981', text: '#065f46', etiqueta: 'Checador al día',         pulse: true  },
  actualizando: { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', text: '#92400e', etiqueta: 'Próxima sync en breve', pulse: false },
  inactivo:  { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', text: '#78350f', etiqueta: 'Sin actividad reciente',  pulse: false },
  error:     { bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', text: '#991b1b', etiqueta: 'Sin conexión',             pulse: false },
  sin_datos: { bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8', text: '#64748b', etiqueta: 'Sin datos aún',           pulse: false },
}

function colorPorMinutos(min) {
  if (min === null)  return COLORES_SYNC.sin_datos
  if (min <= 30)     return COLORES_SYNC.fresco
  if (min <= 60)     return COLORES_SYNC.actualizando
  if (min <= 240)    return COLORES_SYNC.inactivo
  return COLORES_SYNC.error
}

function CheckadorCard() {
  const { ultimoSync, total, cargando, minutos } = useSyncInfo()

  const cfg = colorPorMinutos(minutos)

  // Hora legible del último sync
  const horaSync = ultimoSync
    ? new Date(ultimoSync).toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'America/Mexico_City',
      })
    : null

  const fechaSync = ultimoSync
    ? (() => {
        const d = new Date(ultimoSync)
        const hoyMX  = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
        const fechaMX = d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
        if (fechaMX === hoyMX) return `hoy ${horaSync}`
        return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short',
          timeZone: 'America/Mexico_City' }) + ` ${horaSync}`
      })()
    : null

  return (
    <div
      className="rounded-xl border p-4 flex items-center gap-4 transition-colors"
      style={{ background: cfg.bg, borderColor: cfg.border }}
    >
      {/* Indicador animado */}
      <div className="relative flex-shrink-0">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center`}
          style={{ background: cfg.dot + '22' }}
        >
          {cargando ? (
            <svg className="w-5 h-5 animate-spin" style={{ color: cfg.dot }}
              fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" style={{ color: cfg.dot }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          )}
        </div>
        {/* Dot pulsante */}
        {cfg.pulse && (
          <span
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white animate-pulse"
            style={{ background: cfg.dot }}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: cfg.text }}>
            {cfg.etiqueta}
          </span>
          {!cargando && fechaSync && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: cfg.dot + '18', color: cfg.text }}>
              {fechaSync}
              {minutos !== null && minutos > 1 && (
                <span className="ml-1 opacity-70">· {fmtRelativo(minutos)}</span>
              )}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: cfg.text, opacity: 0.7 }}>
          {cargando
            ? 'Consultando estado del checador biométrico…'
            : total !== null
              ? `${total.toLocaleString('es-MX')} checadas almacenadas · sincronización automática cada 30 min`
              : 'Checador biométrico MB360 · sincronización automática cada 30 min'
          }
        </p>
      </div>

      {/* Cifra total */}
      {!cargando && total !== null && (
        <div className="text-right flex-shrink-0 hidden sm:block">
          <p className="text-xl font-bold" style={{ color: cfg.text }}>
            {total.toLocaleString('es-MX')}
          </p>
          <p className="text-xs" style={{ color: cfg.text, opacity: 0.65 }}>
            registros
          </p>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [quincena, setQuincena] = useState(null)
  const [resumen, setResumen]   = useState(null)
  const [loading, setLoading]   = useState(true)

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

  const saludar = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {saludar()}, {usuario?.nombre?.split(' ')[0]}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('es-MX', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>
        <SyncBadge />
      </div>

      {/* ── Tarjeta checador biométrico ─────────────────────────────────── */}
      <div className="mb-5">
        <CheckadorCard />
      </div>

      {/* ── Quincena activa ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-5 animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-1/4 mb-3" />
          <div className="h-6 bg-slate-200 rounded w-1/2" />
        </div>
      ) : quincena ? (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 mb-5 text-white shadow-lg shadow-blue-500/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wide mb-1">
                Quincena activa
              </p>
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
                className="px-4 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white
                           text-sm font-medium transition-colors"
              >
                Ver detalle
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 mb-5 text-center">
          <p className="text-slate-400 text-sm">No hay quincena activa.</p>
          {['superadmin', 'director_cap_humano', 'cap_humano'].includes(usuario?.rol) && (
            <button
              onClick={() => navigate('/quincenas')}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Crear nueva quincena →
            </button>
          )}
        </div>
      )}

      {/* ── Stats de la quincena ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Docentes activos"
          value={resumen?.total_docentes}
          color="bg-blue-50"
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total honorarios"
          value={fmt(resumen?.total_honorarios)}
          sub="Quincena activa"
          color="bg-emerald-50"
          icon={
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total a pagar"
          value={fmt(resumen?.total_a_pagar)}
          color="bg-violet-50"
          icon={
            <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label="Pendientes revisión"
          value={resumen?.pendientes_revision}
          color="bg-amber-50"
          icon={
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* ── Accesos rápidos ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {['superadmin', 'director_cap_humano', 'cap_humano'].includes(usuario?.rol) && (
            <button
              onClick={() => navigate('/docentes')}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left
                         hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <p className="font-semibold text-slate-700 group-hover:text-blue-600">
                Gestionar docentes
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Alta, baja, modificación y carga masiva</p>
            </button>
          )}
          {['superadmin', 'director_cap_humano', 'cap_humano', 'finanzas'].includes(usuario?.rol) && (
            <button
              onClick={() => navigate('/quincenas')}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left
                         hover:border-blue-300 hover:shadow-md transition-all group"
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
