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
import SyncBadge from '../components/SyncBadge'

const API = import.meta.env.VITE_API_URL || ''

// ── Helpers ──────────────────────────────────────────────────────────────────

const DIAS = { lunes:'Lun', martes:'Mar', miercoles:'Mié',
               jueves:'Jue', viernes:'Vie', sabado:'Sáb' }

function estadoBadge(estado, esContin) {
  if (estado === 'pagado')
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold
        bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`}>
        ✅ Pagado{esContin && <span className="opacity-70 text-[10px]"> continuidad</span>}
      </span>
    )
  if (estado === 'no_pagado')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold
        bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
        ❌ No pagado
      </span>
    )
  // virtual
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold
      bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
      💻 Virtual
    </span>
  )
}

function overrideBadge(override) {
  if (!override) return null
  return (
    <span className={`ml-1 text-[10px] px-1 rounded font-bold
      ${override === 'pagar'
        ? 'bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100'
        : 'bg-orange-200 text-orange-900 dark:bg-orange-800 dark:text-orange-100'}`}>
      {override === 'pagar' ? '▲ Manual' : '▼ Manual'}
    </span>
  )
}

// ── Componente fila-docente ───────────────────────────────────────────────────

function DocenteRow({ docente, expandido, toggleExpand }) {
  const { nombre, chec_id, resumen, bloques } = docente
  const { bloques_programados, bloques_pagados, horas_programadas, horas_pagadas } = resumen
  const pctColor = bloques_programados === 0
    ? ''
    : bloques_pagados / bloques_programados >= 0.8
      ? 'text-green-700 dark:text-green-400'
      : bloques_pagados / bloques_programados >= 0.5
        ? 'text-yellow-700 dark:text-yellow-400'
        : 'text-red-700 dark:text-red-400'

  const presenciales = bloques.filter(b => !b.es_virtual)
  const noPageados   = presenciales.filter(b => b.estado === 'no_pagado')

  return (
    <>
      {/* Fila resumen del docente */}
      <tr
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 border-b
                   dark:border-gray-700 transition-colors"
        onClick={toggleExpand}
      >
        <td className="px-3 py-2 font-medium dark:text-gray-100">
          <span className="mr-1 text-gray-400">{expandido ? '▼' : '▶'}</span>
          {nombre}
          {chec_id && (
            <span className="ml-2 text-xs text-gray-400">#{chec_id}</span>
          )}
        </td>
        <td className="px-3 py-2 text-sm dark:text-gray-300">
          {horas_programadas}h prog.
        </td>
        <td className={`px-3 py-2 text-sm font-semibold ${pctColor}`}>
          {bloques_pagados}/{bloques_programados} bloques
          <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
            ({horas_pagadas}h)
          </span>
        </td>
        <td className="px-3 py-2">
          {noPageados.length > 0 ? (
            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300
                             px-2 py-0.5 rounded font-semibold">
              {noPageados.length} falta{noPageados.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-xs text-green-600 dark:text-green-400">Sin faltas</span>
          )}
        </td>
      </tr>

      {/* Filas de bloques expandidas */}
      {expandido && bloques.map((b, idx) => (
        <tr
          key={idx}
          className={`text-xs border-b dark:border-gray-700
            ${b.estado === 'no_pagado'
              ? 'bg-red-50 dark:bg-red-950'
              : b.es_virtual
                ? 'bg-blue-50 dark:bg-blue-950'
                : 'bg-gray-50 dark:bg-gray-800'}`}
        >
          <td className="pl-8 pr-3 py-1.5 text-gray-500 dark:text-gray-400">
            {DIAS[b.dia_semana] ?? b.dia_semana} {b.fecha.slice(5)}
          </td>
          <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">
            {b.hora_inicio}–{b.hora_fin} ({b.horas_bloque}h)
            <span className="ml-1 text-gray-400">{b.programa}</span>
          </td>
          <td className="px-3 py-1.5">
            {estadoBadge(b.estado, b.es_continuidad)}
            {overrideBadge(b.override)}
          </td>
          <td className="px-3 py-1.5 text-gray-400">
            {!b.es_virtual && (
              <>
                <span className={b.tiene_entrada
                  ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                  {b.tiene_entrada ? '↵E' : '✗E'}
                </span>
                {' / '}
                <span className={b.tiene_salida
                  ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                  {b.tiene_salida ? '↵S' : '✗S'}
                </span>
              </>
            )}
          </td>
        </tr>
      ))}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AsistenciaClasificada() {
  const { id: quincenaId } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [quincena, setQuincena]       = useState(null)
  const [docentes, setDocentes]       = useState([])
  const [cargando, setCargando]       = useState(true)
  const [error, setError]             = useState(null)
  const [busqueda, setBusqueda]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')  // todos|con_faltas|sin_faltas
  const [expandidos, setExpandidos]   = useState(new Set())
  const [expandirTodos, setExpandirTodos] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }

      const [qRes, aRes] = await Promise.all([
        fetch(`${API}/quincenas/${quincenaId}`, { headers }),
        fetch(`${API}/quincenas/${quincenaId}/asistencia-clasificada`, { headers }),
      ])

      if (!qRes.ok || !aRes.ok) throw new Error('Error cargando datos')

      setQuincena(await qRes.json())
      setDocentes(await aRes.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [quincenaId, token])

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
    const tienefaltas = d.resumen.bloques_no_pagados > 0
    const matchEstado =
      filtroEstado === 'todos' ? true :
      filtroEstado === 'con_faltas' ? tienefaltas :
      !tienefaltas
    return matchBusqueda && matchEstado
  })

  // Stats globales
  const stats = docentes.reduce((acc, d) => {
    acc.totalBloques    += d.resumen.bloques_programados
    acc.bloquesPagados  += d.resumen.bloques_pagados
    acc.bloquesNoPagados+= d.resumen.bloques_no_pagados
    acc.horasProg       += d.resumen.horas_programadas
    acc.horasPagadas    += d.resumen.horas_pagadas
    return acc
  }, { totalBloques:0, bloquesPagados:0, bloquesNoPagados:0, horasProg:0, horasPagadas:0 })

  // ── Render ──────────────────────────────────────────────────────────────────

  if (cargando) return (
    <div className="flex items-center justify-center h-64 dark:text-gray-300">
      <span className="animate-spin mr-3 text-2xl">⟳</span> Clasificando asistencia...
    </div>
  )

  if (error) return (
    <div className="p-6 text-red-600 dark:text-red-400">
      Error: {error}
      <button onClick={cargar} className="ml-4 underline">Reintentar</button>
    </div>
  )

  return (
    <div className="p-4 max-w-6xl mx-auto dark:text-gray-100">

      {/* Encabezado */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <button
            onClick={() => navigate(`/quincenas/${quincenaId}`)}
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm mb-1 block"
          >
            ← Volver a la quincena
          </button>
          <h1 className="text-xl font-bold">Asistencia Clasificada por Bloques</h1>
          {quincena && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {quincena.ciclo} · {quincena.fecha_inicio} – {quincena.fecha_fin}
              {' · '}
              <span className="capitalize">{quincena.razon_social}</span>
            </p>
          )}
        </div>
        <SyncBadge variant="compact" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Docentes', val: docentes.length },
          { label: 'Bloques programados', val: stats.totalBloques },
          { label: 'Bloques pagados', val: stats.bloquesPagados,
            color: 'text-green-700 dark:text-green-400' },
          { label: 'Bloques no pagados', val: stats.bloquesNoPagados,
            color: stats.bloquesNoPagados > 0
              ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400' },
        ].map(({ label, val, color }) => (
          <div key={label}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 text-center">
            <div className={`text-2xl font-bold ${color ?? ''}`}>{val}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          placeholder="Buscar docente..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-52
                     dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm
                     dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        >
          <option value="todos">Todos los docentes</option>
          <option value="con_faltas">Con bloques no pagados</option>
          <option value="sin_faltas">Sin faltas</option>
        </select>
        <button
          onClick={toggleExpandirTodos}
          className="text-sm border rounded px-3 py-1.5
                     hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600
                     dark:text-gray-300"
        >
          {expandirTodos ? '▲ Colapsar todos' : '▼ Expandir todos'}
        </button>
        <button
          onClick={cargar}
          className="text-sm border rounded px-3 py-1.5
                     hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600
                     dark:text-gray-300"
        >
          ↻ Actualizar
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
          {docentesFiltrados.length} / {docentes.length} docentes
        </span>
      </div>

      {/* Nota informativa */}
      <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800
                      border dark:border-gray-700 rounded p-2 mb-4">
        <strong>Reglas de pago:</strong>{' '}
        Bloque pagado = entrada en ventana ±10 min del inicio{' '}
        + salida desde min(<em>horas×10</em>, 20) antes del fin.{' '}
        Cadenas back-to-back: primera entrada + última salida cubren toda la cadena.{' '}
        Los bloques virtuales se evalúan por Educación Virtual (no biométrico).
      </div>

      {/* Tabla */}
      {docentesFiltrados.length === 0 ? (
        <p className="text-center text-gray-400 py-12">No hay docentes que coincidan con el filtro.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700 text-left text-xs font-semibold
                             text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                <th className="px-3 py-2">Docente</th>
                <th className="px-3 py-2">Horas</th>
                <th className="px-3 py-2">Bloques</th>
                <th className="px-3 py-2">Faltas</th>
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
