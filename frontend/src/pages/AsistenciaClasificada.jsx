/**
 * AsistenciaClasificada — Vista detallada de asistencia por bloques
 * Para coordinaciones y Capital Humano.
 *
 * Muestra, para cada docente en una quincena, sus bloques de horario
 * con la clasificación automática: pagado / no_pagado / virtual.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import SyncBadge from '../components/SyncBadge'

// ── Helpers ──────────────────────────────────────────────────────────────────

const DIAS = { lunes:'Lun', martes:'Mar', miercoles:'Mié',
               jueves:'Jue', viernes:'Vie', sabado:'Sáb' }

function EstadoBadge({ estado, esContin }) {
  if (estado === 'pagado')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold
        bg-emerald-100 text-emerald-700 border border-emerald-200">
        Pagado
        {esContin && <span className="opacity-60 text-[10px] font-normal">continuidad</span>}
      </span>
    )
  if (estado === 'no_pagado')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold
        bg-red-100 text-red-700 border border-red-200">
        No pagado
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold
      bg-blue-100 text-blue-700 border border-blue-200">
      Virtual
    </span>
  )
}

function OverrideBadge({ override }) {
  if (!override) return null
  return (
    <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-bold border
      ${override === 'pagar'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
      {override === 'pagar' ? '↑ Manual' : '↓ Manual'}
    </span>
  )
}

// ── Íconos ────────────────────────────────────────────────────────────────────

const IconCheck = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)
const IconX = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

// ── Componente fila-docente ───────────────────────────────────────────────────

function DocenteRow({ docente, expandido, toggleExpand }) {
  const { nombre, chec_id, resumen, bloques } = docente
  const { bloques_programados, bloques_pagados, horas_programadas, horas_pagadas } = resumen

  const ratio = bloques_programados === 0 ? 1 : bloques_pagados / bloques_programados
  const pctColor = ratio >= 0.8
    ? 'text-emerald-700'
    : ratio >= 0.5
      ? 'text-amber-600'
      : 'text-red-600'

  const presenciales  = bloques.filter(b => !b.es_virtual)
  const noPageados    = presenciales.filter(b => b.estado === 'no_pagado')
  const hasFaltas     = noPageados.length > 0

  return (
    <>
      {/* Fila resumen del docente */}
      <tr
        className="cursor-pointer hover:bg-slate-50 border-b border-slate-100 transition-colors"
        onClick={toggleExpand}
      >
        <td className="px-4 py-2.5 text-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs w-3">{expandido ? '▼' : '▶'}</span>
            <span className="font-medium text-sm">{nombre}</span>
            {chec_id && (
              <span className="text-xs text-slate-400 font-normal">#{chec_id}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-sm text-slate-500">
          {horas_programadas}h
        </td>
        <td className={`px-4 py-2.5 text-sm font-semibold ${pctColor}`}>
          {bloques_pagados}/{bloques_programados}{' '}
          <span className="text-xs font-normal text-slate-400">
            ({horas_pagadas}h)
          </span>
        </td>
        <td className="px-4 py-2.5">
          {hasFaltas ? (
            <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700
                             border border-red-200 px-2 py-0.5 rounded-md font-semibold">
              {noPageados.length} falta{noPageados.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-xs text-emerald-600 font-medium">Sin faltas</span>
          )}
        </td>
      </tr>

      {/* Filas de bloques expandidas */}
      {expandido && bloques.map((b, idx) => {
        const rowBase = b.estado === 'no_pagado'
          ? 'bg-red-50 border-l-4 border-l-red-300'
          : b.es_virtual
            ? 'bg-blue-50 border-l-4 border-l-blue-300'
            : 'bg-slate-50 border-l-4 border-l-emerald-300'

        return (
          <tr key={idx} className={`text-xs border-b border-slate-100 ${rowBase}`}>
            <td className="pl-10 pr-4 py-2 text-slate-500 font-medium">
              {DIAS[b.dia_semana] ?? b.dia_semana}{' '}
              <span className="text-slate-400">{b.fecha.slice(5)}</span>
            </td>
            <td className="px-4 py-2 text-slate-600">
              {b.hora_inicio}–{b.hora_fin}{' '}
              <span className="text-slate-400">({b.horas_bloque}h)</span>
              <span className="ml-1.5 text-slate-400">{b.programa}</span>
            </td>
            <td className="px-4 py-2">
              <EstadoBadge estado={b.estado} esContin={b.es_continuidad} />
              <OverrideBadge override={b.override} />
            </td>
            <td className="px-4 py-2">
              {!b.es_virtual && (
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-0.5 text-xs font-medium
                    ${b.tiene_entrada ? 'text-emerald-600' : 'text-red-500'}`}>
                    {b.tiene_entrada ? <IconCheck /> : <IconX />} Entrada
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className={`inline-flex items-center gap-0.5 text-xs font-medium
                    ${b.tiene_salida ? 'text-emerald-600' : 'text-red-500'}`}>
                    {b.tiene_salida ? <IconCheck /> : <IconX />} Salida
                  </span>
                </div>
              )}
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
      {icon && (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color?.bg ?? 'bg-slate-100'}`}>
          <span className={`text-lg ${color?.icon ?? 'text-slate-500'}`}>{icon}</span>
        </div>
      )}
      <div>
        <div className={`text-2xl font-bold leading-tight ${color?.text ?? 'text-slate-800'}`}>{value}</div>
        <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AsistenciaClasificada() {
  const { id: quincenaId } = useParams()
  const navigate = useNavigate()
  const { usuario } = useAuth()

  const [quincena, setQuincena]       = useState(null)
  const [docentes, setDocentes]       = useState([])
  const [cargando, setCargando]       = useState(true)
  const [error, setError]             = useState(null)
  const [busqueda, setBusqueda]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [expandidos, setExpandidos]   = useState(new Set())
  const [expandirTodos, setExpandirTodos] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [qRes, aRes] = await Promise.all([
        api.get(`/quincenas/${quincenaId}`),
        api.get(`/quincenas/${quincenaId}/asistencia-clasificada`),
      ])
      setQuincena(qRes.data)
      setDocentes(aRes.data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setCargando(false)
    }
  }, [quincenaId])

  useEffect(() => { cargar() }, [cargar])

  const toggleExpand = (id) => {
    setExpandidos(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleExpandirTodos = () => {
    if (expandirTodos) {
      setExpandidos(new Set())
    } else {
      setExpandidos(new Set(docentes.map(d => d.docente_id)))
    }
    setExpandirTodos(t => !t)
  }

  // Filtros
  const docentesFiltrados = docentes.filter(d => {
    const matchBusqueda = d.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const tienefaltas   = d.resumen.bloques_no_pagados > 0
    const matchEstado   =
      filtroEstado === 'todos'      ? true :
      filtroEstado === 'con_faltas' ? tienefaltas : !tienefaltas
    return matchBusqueda && matchEstado
  })

  // Stats globales
  const stats = docentes.reduce((acc, d) => {
    acc.totalBloques     += d.resumen.bloques_programados
    acc.bloquesPagados   += d.resumen.bloques_pagados
    acc.bloquesNoPagados += d.resumen.bloques_no_pagados
    acc.horasProg        += d.resumen.horas_programadas
    acc.horasPagadas     += d.resumen.horas_pagadas
    return acc
  }, { totalBloques:0, bloquesPagados:0, bloquesNoPagados:0, horasProg:0, horasPagadas:0 })

  const pctGlobal = stats.totalBloques > 0
    ? Math.round((stats.bloquesPagados / stats.totalBloques) * 100)
    : 0

  // ── Render ──────────────────────────────────────────────────────────────────

  if (cargando) return (
    <div className="flex items-center justify-center h-64 text-slate-500">
      <svg className="animate-spin w-5 h-5 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Clasificando asistencia...
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{error}</span>
        <button onClick={cargar} className="ml-auto underline font-medium">Reintentar</button>
      </div>
    </div>
  )

  return (
    <div className="p-5 max-w-6xl mx-auto">

      {/* Encabezado */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-2">
        <div>
          <button
            onClick={() => navigate(`/quincenas/${quincenaId}`)}
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800
                       text-sm font-medium mb-2 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver a la quincena
          </button>
          <h1 className="text-xl font-bold text-slate-800">Asistencia Clasificada por Bloques</h1>
          {quincena && (
            <p className="text-sm text-slate-500 mt-0.5">
              {quincena.ciclo} · {quincena.fecha_inicio} – {quincena.fecha_fin}
              {' · '}
              <span className="capitalize">{quincena.razon_social}</span>
            </p>
          )}
        </div>
        <SyncBadge variant="compact" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Docentes"
          value={docentes.length}
          icon="👥"
          color={{ bg: 'bg-slate-100', icon: 'text-slate-600', text: 'text-slate-800' }}
        />
        <KpiCard
          label="Bloques programados"
          value={stats.totalBloques}
          icon="📅"
          color={{ bg: 'bg-indigo-50', icon: 'text-indigo-500', text: 'text-slate-800' }}
        />
        <KpiCard
          label={`Pagados (${pctGlobal}%)`}
          value={stats.bloquesPagados}
          icon="✓"
          color={{ bg: 'bg-emerald-50', icon: 'text-emerald-600', text: 'text-emerald-700' }}
        />
        <KpiCard
          label="No pagados"
          value={stats.bloquesNoPagados}
          icon="✕"
          color={{
            bg:   stats.bloquesNoPagados > 0 ? 'bg-red-50'      : 'bg-emerald-50',
            icon: stats.bloquesNoPagados > 0 ? 'text-red-500'   : 'text-emerald-600',
            text: stats.bloquesNoPagados > 0 ? 'text-red-700'   : 'text-emerald-700',
          }}
        />
      </div>

      {/* Barra de filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 mb-4
                      flex flex-wrap gap-2 items-center">
        {/* Buscador */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar docente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-52
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        </div>

        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white
                     focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-700"
        >
          <option value="todos">Todos los docentes</option>
          <option value="con_faltas">Con bloques no pagados</option>
          <option value="sin_faltas">Sin faltas</option>
        </select>

        <button
          onClick={toggleExpandirTodos}
          className="inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg
                     px-3 py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {expandirTodos
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
          {expandirTodos ? 'Colapsar todos' : 'Expandir todos'}
        </button>

        <button
          onClick={cargar}
          className="inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg
                     px-3 py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>

        <span className="text-xs text-slate-400 ml-auto">
          {docentesFiltrados.length} / {docentes.length} docentes
        </span>
      </div>

      {/* Nota informativa */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 mb-4 flex gap-2">
        <svg className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-indigo-700">
          <strong>Reglas de pago:</strong>{' '}
          Bloque pagado = entrada en ventana ±10 min del inicio
          + salida desde min(<em>horas×10</em>, 20) antes del fin.{' '}
          Cadenas back-to-back: primera entrada + última salida cubren toda la cadena.{' '}
          Los bloques virtuales se evalúan por Educación Virtual (no biométrico).
        </p>
      </div>

      {/* Tabla */}
      {docentesFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <svg className="w-8 h-8 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-slate-500 text-sm">No hay docentes que coincidan con el filtro.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Docente
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Horas prog.
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Bloques pagados
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Faltas
                </th>
              </tr>
            </thead>
            <tbody>
              {docentesFiltrados.map(d => (
                <DocenteRow
                  key={d.docente_id}
                  docente={d}
                  expandido={expandidos.has(d.docente_id)}
                  toggleExpand={() => toggleExpand(d.docente_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
