import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import api from '../api/client'
import SyncBadge from '../components/SyncBadge'
import { HorariosDocentePanel } from './Docentes'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => n != null
  ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
  : '—'

const fmtFecha = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX',
      { day: '2-digit', month: 'short', year: 'numeric' })
  : '—'

const ESTADO_CFG = {
  abierta:     { label: 'Abierta',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  en_revision: { label: 'En revisión', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  cerrada:     { label: 'Cerrada',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pagada:      { label: 'Pagada',      cls: 'bg-blue-100 text-blue-700 border-blue-200' },
}

const TIPO_INC = { falta: 'Falta', retardo: 'Retardo', suplencia: 'Suplencia' }
const TIPO_COLOR = {
  falta:    'bg-red-100 text-red-700 border border-red-200',
  retardo:  'bg-amber-100 text-amber-700 border border-amber-200',
  suplencia:'bg-blue-100 text-blue-700 border border-blue-200',
}
const ESTADO_INC = {
  pendiente:      { label: 'Pendiente',       cls: 'bg-amber-100 text-amber-700' },
  validada_coord: { label: 'Validada Coord.', cls: 'bg-blue-100 text-blue-700' },
  aprobada:       { label: 'Aprobada',        cls: 'bg-emerald-100 text-emerald-700' },
  rechazada:      { label: 'Rechazada',       cls: 'bg-red-100 text-red-600' },
}

const CA_NOMBRES = ['Vinculación de actividades', 'Respeto secuencial',
                    'Congruencia contenido/actividades', 'Material de apoyo']
const EV_NOMBRES = ['Formato institucional', 'Instrumento de evaluación',
                    'Publicación de actividades', 'Evaluación de actividades']

// ── Tab: Nómina ───────────────────────────────────────────────────────────────

function TabNomina({ quincena, canEdit }) {
  const { usuario } = useAuth()
  const [nomina, setNomina] = useState([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [exportando, setExportando] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/nomina/quincenas/${quincena.id}`)
      setNomina(res.data)
    } catch {
      setNomina([])
    } finally {
      setLoading(false)
    }
  }, [quincena.id])

  useEffect(() => { cargar() }, [cargar])

  const calcular = async () => {
    if (!confirm('¿Calcular/recalcular nómina para todos los docentes?')) return
    setGenerando(true)
    setMsg(null)
    try {
      const res = await api.post(`/nomina/quincenas/${quincena.id}/generar`)
      setMsg({ tipo: 'ok', texto: `${res.data.procesados} docentes procesados. ${res.data.errores > 0 ? `${res.data.errores} errores.` : ''}` })
      cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al calcular.' })
    } finally {
      setGenerando(false)
    }
  }

  const exportarResumen = async () => {
    setExportando('resumen')
    try {
      const res = await api.get(`/exportar/quincenas/${quincena.id}/nomina_resumen`, {
        responseType: 'blob'
      })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      // Nombre: NOMINA_2026-01-01_2026-01-15.xlsx
      const ini = quincena.fecha_inicio?.replaceAll('-', '') ?? quincena.id
      const fin = quincena.fecha_fin?.replaceAll('-', '')   ?? ''
      a.download = `NOMINA_${ini}${fin ? '_' + fin : ''}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      // Intentar leer el mensaje de error del blob de respuesta
      try {
        const text = await err.response?.data?.text?.()
        const parsed = JSON.parse(text || '{}')
        setMsg({ tipo: 'error', texto: parsed.detail || 'Error al generar resumen de nómina.' })
      } catch {
        setMsg({ tipo: 'error', texto: 'Error al generar resumen de nómina.' })
      }
    } finally {
      setExportando(null)
    }
  }

  const nominaFiltrada = nomina.filter(n =>
    !busqueda || n.docente_nombre?.toLowerCase().includes(busqueda.toLowerCase())
  )
  const totalHonorarios = nomina.reduce((s, n) => s + (n.honorarios || 0), 0)
  const totalPagar      = nomina.reduce((s, n) => s + (n.total_final || 0), 0)

  return (
    <div>
      {/* Barra de acciones */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Nómina de docentes</h2>
          <p className="text-xs text-slate-500 mt-0.5">{nomina.length} docentes · Total honorarios {fmt(totalHonorarios)} · Total a pagar {fmt(totalPagar)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && ['abierta', 'en_revision'].includes(quincena.estado) && (
            <button onClick={calcular} disabled={generando}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {generando ? 'Calculando...' : nomina.length > 0 ? 'Recalcular' : 'Calcular nómina'}
            </button>
          )}
          {['en_revision', 'cerrada', 'pagada'].includes(quincena.estado)
            && ['superadmin', 'director_cap_humano', 'cap_humano', 'finanzas', 'coord_docente'].includes(usuario?.rol)
            && (
            <button onClick={exportarResumen} disabled={!!exportando}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              style={{
                background: exportando === 'resumen' ? '#1a7a3a' : '#217346',
                color: 'white',
                border: '1px solid #1a5c38',
              }}
              onMouseEnter={e => { if (!exportando) e.currentTarget.style.background = '#1a5c38' }}
              onMouseLeave={e => { if (!exportando) e.currentTarget.style.background = '#217346' }}
            >
              {/* Ícono Excel */}
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 17l2-3-2-3h1.6l1.2 2 1.2-2H14l-2 3 2 3h-1.6l-1.2-2-1.2 2H8.5z"/>
              </svg>
              {exportando === 'resumen' ? 'Generando...' : 'Exportar Nómina'}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {/* Buscador */}
      {nomina.length > 0 && (
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar docente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {nomina.length === 0 && !loading ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <svg className="w-8 h-8 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-slate-500 text-sm">Nómina no calculada aún.</p>
          {canEdit && <p className="text-xs text-slate-400 mt-1">Usa el botón "Calcular nómina" para generar el borrador.</p>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Docente</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">H. Pres.</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">H. Virt.</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-blue-500 uppercase tracking-wide" title="Horas de suplencia aprobadas">H. Sup.</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Honorarios</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">IVA</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">ISR</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : nominaFiltrada.flatMap(n => {
                const isOpen = expandedId === n.docente_id
                return [
                  <tr key={n.docente_id}
                    className={`transition-colors ${isOpen ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                    {/* Nombre — clic expande horarios */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedId(p => p === n.docente_id ? null : n.docente_id)}
                        className="flex items-center gap-1.5 text-left font-medium text-slate-800 hover:text-blue-600 transition-colors group"
                        title={isOpen ? 'Ocultar horarios' : 'Ver programas y horarios'}
                      >
                        <svg className={`w-3 h-3 text-slate-300 group-hover:text-blue-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                        {n.docente_nombre}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{n.horas_presenciales != null ? Math.round(n.horas_presenciales) : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{n.horas_virtuales != null ? Math.round(n.horas_virtuales) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {n.horas_suplencia > 0
                        ? <span className="text-blue-600 font-medium">{Math.round(n.horas_suplencia)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(n.honorarios)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500 text-xs">{fmt(n.iva)}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-500 text-xs">{fmt(n.retencion_isr)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{fmt(n.total_final)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 capitalize">
                        {n.estado}
                      </span>
                    </td>
                  </tr>,
                  isOpen && (
                    <tr key={`${n.docente_id}-horarios`}>
                      <HorariosDocentePanel docenteId={n.docente_id} />
                    </tr>
                  ),
                ].filter(Boolean)
              })}
            </tbody>
            {nomina.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                  <td className="px-4 py-3 text-slate-700">
                    Total ({nominaFiltrada.length}{busqueda ? ` de ${nomina.length}` : ''} docentes)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {Math.round(nominaFiltrada.reduce((s, n) => s + (n.horas_presenciales || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {Math.round(nominaFiltrada.reduce((s, n) => s + (n.horas_virtuales || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-600">
                    {(() => { const t = nominaFiltrada.reduce((s, n) => s + (n.horas_suplencia || 0), 0); return t > 0 ? Math.round(t) : '—' })()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(nominaFiltrada.reduce((s,n)=>s+(n.honorarios||0),0))}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 text-xs">
                    {fmt(nominaFiltrada.reduce((s, n) => s + (n.iva || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-red-500 text-xs">
                    {fmt(nominaFiltrada.reduce((s, n) => s + (n.retencion_isr || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">{fmt(nominaFiltrada.reduce((s,n)=>s+(n.total_final||0),0))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab: Asistencia ───────────────────────────────────────────────────────────

const ESTADO_CHECADA = {
  entrada_ok:        { label: 'OK',        cls: 'bg-emerald-100 text-emerald-700' },
  retardo:           { label: 'Retardo',   cls: 'bg-amber-100  text-amber-700'   },  // 1-10 min tarde, se paga
  falta:             { label: 'Falta',     cls: 'bg-red-100    text-red-600'     },  // >10 min tarde, no se paga
  salida_ok:         { label: 'OK',        cls: 'bg-emerald-100 text-emerald-700' },
  salida_anticipada: { label: 'Anticipada',cls: 'bg-orange-100 text-orange-700'  },
  salida_tarde:      { label: 'Tarde',     cls: 'bg-slate-100  text-slate-500'   },
}

const ESTADO_CLASE = {
  completa:                    { icon: '✓', cls: 'text-emerald-600 font-bold', title: 'Completa' },
  sin_salida:                  { icon: '↑', cls: 'text-amber-500 font-bold',   title: 'Sin salida registrada' },
  sin_entrada:                 { icon: '↓', cls: 'text-amber-500 font-bold',   title: 'Sin entrada registrada' },
  sin_checadas:                { icon: '✗', cls: 'text-red-500 font-bold',     title: 'Sin checadas — falta' },
  falta_con_registro:          { icon: '✗', cls: 'text-red-500 font-bold',     title: 'Falta — checó más de 20 min tarde (no se paga)' },
  asumida_por_continuidad:     { icon: '⟷', cls: 'text-amber-600 font-bold',  title: 'Pagada por continuidad — sin checada directa' },
  sin_entrada_continuidad:     { icon: '⟷', cls: 'text-amber-600 font-bold',  title: 'Pagada por continuidad — solo salida registrada' },
  sin_salida_continuidad:      { icon: '⟷', cls: 'text-amber-600 font-bold',  title: 'Pagada por continuidad — solo entrada registrada' },
  virtual:                     { icon: '○', cls: 'text-slate-400',             title: 'Sesión virtual — no requiere checada biométrica' },
}

function BadgeChk({ info }) {
  if (!info) return <span className="text-slate-300">—</span>
  const cfg = ESTADO_CHECADA[info.estado] || { label: info.estado, cls: 'bg-slate-100 text-slate-500' }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="tabular-nums font-medium text-slate-700">{info.ts}</span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>
    </span>
  )
}

// ── Modal de ajuste manual de pago por clase ─────────────────────────────────

const ROLES_OVERRIDE = new Set(['superadmin', 'director_cap_humano', 'cap_humano', 'coord_docente', 'admin'])

function OverrideModal({ clases, quincenaId, docenteId, docenteNombre, onClose, onSaved }) {
  // cambios: key="fecha_horario" → { decision, motivo }
  const [cambios, setCambios] = useState(() => {
    const init = {}
    clases.forEach(c => {
      if (c.override) init[`${c.fecha}_${c.horario}`] = {
        decision: c.override.decision,
        motivo:   c.override.motivo || '',
      }
    })
    return init
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState(null)

  const presenciales = clases.filter(c => !c.es_virtual)

  const getDecision = (c) => cambios[`${c.fecha}_${c.horario}`]?.decision
    ?? c.override?.decision ?? 'auto'
  const getMotivo = (c) => cambios[`${c.fecha}_${c.horario}`]?.motivo
    ?? c.override?.motivo ?? ''

  const set = (c, field, val) => {
    const k = `${c.fecha}_${c.horario}`
    setCambios(p => ({ ...p, [k]: { ...p[k], [field]: val } }))
  }

  const [savedMsg, setSavedMsg] = useState(false)

  const guardar = async () => {
    setGuardando(true); setError(null); setSavedMsg(false)
    try {
      const pendientes = presenciales.filter(c => {
        const k = `${c.fecha}_${c.horario}`
        if (!cambios[k]) return false
        const orig = c.override?.decision ?? 'auto'
        return cambios[k].decision !== orig || cambios[k].motivo !== (c.override?.motivo ?? '')
      })
      await Promise.all(pendientes.map(c => {
        const [hora_ini, hora_fin] = c.horario.split('-')
        return api.post(`/quincenas/${quincenaId}/asistencia/${docenteId}/override`, {
          fecha: c.fecha, hora_ini, hora_fin,
          decision: cambios[`${c.fecha}_${c.horario}`].decision,
          motivo:   cambios[`${c.fecha}_${c.horario}`].motivo || null,
        })
      }))
      setSavedMsg(true)
      setTimeout(() => onSaved(), 900)
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const nCambios = presenciales.filter(c => {
    const k = `${c.fecha}_${c.horario}`
    if (!cambios[k]) return false
    const orig = c.override?.decision ?? 'auto'
    return cambios[k].decision !== orig
  }).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-800">Ajuste manual de pago</h2>
            <p className="text-xs text-slate-400 mt-0.5">{docenteNombre}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Tabla de clases */}
        <div className="overflow-y-auto flex-1 text-sm">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr className="text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
                <th className="px-4 py-2.5 text-left font-medium">Materia · Grupo</th>
                <th className="px-4 py-2.5 text-center font-medium">Horario</th>
                <th className="px-4 py-2.5 text-center font-medium">Auto</th>
                <th className="px-4 py-2.5 text-center font-medium w-64">Decisión</th>
              </tr>
            </thead>
            <tbody>
              {presenciales.map((c, i) => {
                const decision = getDecision(c)
                const motivo   = getMotivo(c)
                const changed  = cambios[`${c.fecha}_${c.horario}`]?.decision !== undefined
                const autoEst  = ESTADO_CLASE[c.estado] || ESTADO_CLASE.sin_checadas
                const dt       = new Date(c.fecha + 'T00:00:00')
                const fechaFmt = dt.toLocaleDateString('es-MX', { weekday:'short', day:'2-digit', month:'short' })

                return (
                  <tr key={i} className={`border-b border-slate-100 ${changed ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">{fechaFmt}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-700">{c.materia}</span>
                      {c.grupo && <span className="text-slate-400 ml-1 text-xs">· {c.grupo}</span>}
                      {decision !== 'auto' && (
                        <div className="mt-1">
                          <input type="text" placeholder="Motivo (opcional)…"
                            value={motivo}
                            onChange={e => set(c, 'motivo', e.target.value)}
                            className="w-full text-xs px-2 py-1 border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:border-blue-400"
                          />
                        </div>
                      )}
                      {c.override && decision === 'auto' && (
                        <p className="text-xs text-slate-400 mt-0.5 italic">
                          Override anterior eliminado al guardar
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{c.horario}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-sm ${autoEst.cls}`} title={autoEst.title}>{autoEst.icon}</span>
                      {c.override && (
                        <span className="block text-[10px] text-violet-600 font-medium mt-0.5">override</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 justify-center">
                        {[
                          { val:'auto',     label:'Auto',      active: decision==='auto',     cls:'bg-slate-100 text-slate-600 border-slate-200' },
                          { val:'pagar',    label:'✓ Pagar',   active: decision==='pagar',    cls:'bg-emerald-100 text-emerald-700 border-emerald-300' },
                          { val:'no_pagar', label:'✗ No pagar',active: decision==='no_pagar', cls:'bg-red-100 text-red-600 border-red-200' },
                        ].map(opt => (
                          <button key={opt.val}
                            onClick={() => set(c, 'decision', opt.val)}
                            className={`px-2 py-1 rounded text-xs font-medium border transition-colors
                              ${opt.active ? opt.cls : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {nCambios > 0
              ? <span className="text-blue-600 font-medium">{nCambios} cambio{nCambios !== 1 ? 's' : ''} pendiente{nCambios !== 1 ? 's' : ''}</span>
              : 'Sin cambios pendientes'}
          </div>
          {error    && <p className="text-xs text-red-500 flex-1 text-center">{error}</p>}
          {savedMsg && <p className="text-xs text-emerald-600 flex-1 text-center font-medium">✓ Cambios guardados</p>}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg transition-colors">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando || nCambios === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors">
              {guardando ? 'Guardando…' : 'Guardar ajustes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Historial de checadas ─────────────────────────────────────────────────────

function HistorialChecadas({ quincenaId, quincena, usuario, docente, onAlerta, onHoras, onOverrideSaved }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [verMarcaciones, setVerMarcaciones] = useState(false)
  const [showOverride, setShowOverride] = useState(false)

  const canOverride = usuario && ROLES_OVERRIDE.has(usuario.rol)
    && ['abierta', 'en_revision'].includes(quincena?.estado)

  const cargar = useCallback(() => {
    api.get(`/quincenas/${quincenaId}/asistencia/${docente.id}/checadas`)
      .then(res => {
        setData(res.data)
        if (res.data.alerta_continuidad && onAlerta) onAlerta(docente.id)
        if (res.data.horas_totales != null && onHoras) onHoras(docente.id, res.data.horas_totales)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [quincenaId, docente.id])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <div className="px-6 py-4 text-xs text-slate-400 animate-pulse">Cargando checadas...</div>
  if (!data || data.total_clases === 0) return (
    <div className="px-6 py-4 text-xs text-slate-400">Sin clases registradas en el período.</div>
  )

  const ES_CONTINUIDAD = new Set([
    'asumida_por_continuidad', 'sin_entrada_continuidad', 'sin_salida_continuidad'
  ])
  const nContinuidad = data.clases?.filter(c => ES_CONTINUIDAD.has(c.estado)).length || 0
  const nMarcaciones = data.todas_marcaciones?.length || 0

  return (
    <div className="px-4 pb-4 pt-1">

      {/* Banner de continuidad */}
      {data.alerta_continuidad && (
        <div className="mb-2 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
          <span className="text-base leading-none mt-0.5">⟷</span>
          <div>
            <span className="font-semibold">
              {nContinuidad} clase{nContinuidad !== 1 ? 's' : ''} pagada{nContinuidad !== 1 ? 's' : ''} por continuidad
            </span>
            <span className="ml-1 text-amber-700">
              — El docente checó entrada al inicio y salida al final del bloque continuo, sin checar cada clase por separado.
              Se pagan por default; la Coord. Docente puede solicitar ajuste si es necesario.
            </span>
          </div>
        </div>
      )}

      {/* Resumen de horas + botón override */}
      <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Checadas: <span className="font-semibold text-slate-700">{data.horas_checadas}h</span></span>
          {data.horas_continuidad > 0 && (
            <span>Continuidad: <span className="font-semibold text-amber-600">{data.horas_continuidad}h</span></span>
          )}
          {data.horas_asumidas > 0 && (
            <span>Asumidas: <span className="font-semibold text-amber-600">{data.horas_asumidas}h</span></span>
          )}
          <span className="text-slate-700 font-semibold">Total: {data.horas_totales}h</span>
        </div>
        {canOverride && (
          <button onClick={() => setShowOverride(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Ajustar pagos
          </button>
        )}
      </div>

      {/* Modal override */}
      {showOverride && (
        <OverrideModal
          clases={data.clases}
          quincenaId={quincenaId}
          docenteId={docente.id}
          docenteNombre={data.docente_nombre}
          onClose={() => setShowOverride(false)}
          onSaved={() => { setShowOverride(false); cargar(); if (onOverrideSaved) onOverrideSaved() }}
        />
      )}

      <div className="bg-slate-50 rounded-lg border border-slate-100 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 bg-slate-100/60">
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">Materia · Grupo</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Horario</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Entrada</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Salida</th>
              <th className="px-3 py-2 text-center font-medium w-6"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.clases.map((cl, i) => {
              const dt         = new Date(cl.fecha + 'T00:00:00')
              const fechaStr   = dt.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
              const ecfg       = ESTADO_CLASE[cl.estado] || ESTADO_CLASE.sin_checadas
              const esCont     = ES_CONTINUIDAD.has(cl.estado)
              const virtual    = cl.estado === 'virtual'
              const rowBg      = virtual
                ? 'opacity-60'
                : esCont
                  ? 'bg-amber-50/50'
                  : (cl.estado === 'sin_checadas' || cl.estado === 'falta_con_registro')
                    ? 'bg-red-50/40'
                    : cl.alerta_cadena
                      ? 'bg-amber-50/20'
                      : ''
              return (
                <tr key={i} className={`transition-colors ${virtual ? rowBg : `hover:bg-white ${rowBg}`}`}>
                  <td className={`px-3 py-2 whitespace-nowrap ${virtual ? 'text-slate-400' : 'text-slate-500'}`}>{fechaStr}</td>
                  <td className="px-3 py-2">
                    <span className={`font-medium ${virtual ? 'text-slate-400' : esCont ? 'text-amber-800' : 'text-slate-700'}`}>{cl.materia}</span>
                    {cl.grupo && <span className={`ml-1 ${virtual ? 'text-slate-300' : 'text-slate-400'}`}>· {cl.grupo}</span>}
                    {esCont && (
                      <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">continuidad</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 tabular-nums whitespace-nowrap ${virtual ? 'text-slate-400' : 'text-slate-500'}`}>
                    {cl.horario}
                    <span className="ml-1 text-slate-300">({cl.horas}h)</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {virtual
                      ? <span className="text-slate-300 text-[11px] italic">virtual</span>
                      : cl.estado === 'asumida_por_continuidad'
                        ? <span className="text-amber-300 text-[11px]">—</span>
                        : <BadgeChk info={cl.entrada} />
                    }
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {virtual
                      ? <span className="text-slate-300 text-[11px] italic">virtual</span>
                      : cl.estado === 'asumida_por_continuidad'
                        ? <span className="text-amber-300 text-[11px]">—</span>
                        : <BadgeChk info={cl.salida} />
                    }
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-sm ${ecfg.cls}`} title={ecfg.title}>{ecfg.icon}</span>
                    {cl.override && (
                      <span
                        title={`Override: ${cl.override.decision === 'pagar' ? '✓ Forzado pagar' : '✗ Forzado no pagar'}${cl.override.motivo ? ` — ${cl.override.motivo}` : ''} (${cl.override.por ?? 'sistema'})`}
                        className={`block text-[9px] font-bold mt-0.5 leading-none ${cl.override.decision === 'pagar' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {cl.override.decision === 'pagar' ? '▲PAGAR' : '▼NO PAG'}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Ver todas las marcaciones */}
      {nMarcaciones > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setVerMarcaciones(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span className="text-[10px]">{verMarcaciones ? '▼' : '▶'}</span>
            <span>Ver todas las marcaciones biométricas ({nMarcaciones})</span>
          </button>
          {verMarcaciones && (
            <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wide font-medium">
                Marcaciones biométricas del período
              </div>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {data.todas_marcaciones.map((m, i) => {
                  const d = new Date(m.fecha + 'T00:00:00')
                  const fStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
                  return (
                    <div key={i} className={`flex items-center gap-3 px-3 py-1.5 text-xs ${m.asignada ? 'text-slate-600' : 'text-slate-400'}`}>
                      <span className="w-24 shrink-0">{fStr}</span>
                      <span className="tabular-nums font-medium w-10">{m.ts}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.tipo === 'E' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {m.tipo === 'E' ? 'Entrada' : 'Salida'}
                      </span>
                      {!m.asignada && (
                        <span className="text-slate-300 text-[10px]">sin clase asignada</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TabAsistencia({ quincena, usuario }) {
  const { dark } = useTheme()
  const [docentes, setDocentes] = useState([])
  const [programasCat, setProgramasCat] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroPrograma, setFiltroPrograma] = useState('todos')
  const [soloAlertas, setSoloAlertas] = useState(false)
  const [expandido, setExpandido] = useState(null)
  const [alertasContinuidad, setAlertasContinuidad] = useState(new Set())
  const [horasVivas, setHorasVivas] = useState({})

  const marcarAlerta = useCallback((docenteId) => {
    setAlertasContinuidad(prev => new Set([...prev, docenteId]))
  }, [])

  const registrarHoras = useCallback((docenteId, horas) => {
    setHorasVivas(prev => ({ ...prev, [docenteId]: horas }))
  }, [])

  const recargarDocentes = useCallback(() => {
    api.get(`/quincenas/${quincena.id}/asistencia`)
      .then(res => setDocentes(res.data))
      .catch(() => setDocentes([]))
  }, [quincena.id])

  useEffect(() => {
    recargarDocentes()
    setLoading(false)
    // Cargar catálogo completo de programas
    api.get('/catalogos/programas')
      .then(res => setProgramasCat((res.data || []).map(p => p.nombre).sort()))
      .catch(() => setProgramasCat([]))
  }, [quincena.id])

  const docentesFiltrados = docentes.filter(d => {
    const matchNombre = d.nombre_completo.toLowerCase().includes(busqueda.toLowerCase())
    const matchProg   = filtroPrograma === 'todos' || (d.programas || []).includes(filtroPrograma)
    const matchAlerta = !soloAlertas || alertasContinuidad.has(d.id)
    return matchNombre && matchProg && matchAlerta
  })

  const toggleExpandido = (id) => setExpandido(prev => prev === id ? null : id)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Asistencia del período</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtFecha(quincena.fecha_inicio)} — {fmtFecha(quincena.fecha_fin)} · Ciclo {quincena.ciclo}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text" placeholder="Buscar docente..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          />
          <select value={filtroPrograma} onChange={e => setFiltroPrograma(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="todos">Todos los programas</option>
            {programasCat.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {alertasContinuidad.size > 0 && (
            <button
              onClick={() => setSoloAlertas(v => !v)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors flex items-center gap-1.5 ${
                soloAlertas
                  ? 'bg-purple-100 border-purple-300 text-purple-700'
                  : 'border-slate-200 text-slate-500 hover:border-purple-300 hover:text-purple-600'
              }`}
              title="Mostrar solo docentes con clases asumidas por continuidad"
            >
              <span>⚠</span>
              <span>{alertasContinuidad.size} con alerta</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Docente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Programas</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">H/Sem.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <span title="Número de marcaciones biométricas en el período">Marcaciones</span>
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <span title="Horas presenciales. Se actualiza al expandir el docente o al calcular nómina.">H. Pres.</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado nómina</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : docentesFiltrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                  {docentes.length === 0 ? 'No hay docentes con checador para este ciclo.' : 'Sin resultados para esa búsqueda.'}
                </td>
              </tr>
            ) : docentesFiltrados.map(d => {
              const sinNomina = !d.nomina_estado
              const tieneDescuento = (d.horas_descuento || 0) > 0
              const tieneAlerta = alertasContinuidad.has(d.id)
              const isOpen = expandido === d.id
              return (
                <>
                  <tr key={d.id}
                    onClick={() => toggleExpandido(d.id)}
                    className="cursor-pointer transition-colors"
                    style={{
                      background: isOpen
                        ? (dark ? 'rgba(37,99,235,0.12)' : '#eff6ff')
                        : tieneAlerta
                          ? (dark ? 'rgba(124,58,237,0.10)' : 'rgba(233,213,255,0.4)')
                          : tieneDescuento
                            ? (dark ? 'rgba(239,68,68,0.10)' : 'rgba(254,226,226,0.4)')
                            : undefined,
                    }}
                    onMouseEnter={e => {
                      if (!isOpen) e.currentTarget.style.background = dark
                        ? (tieneAlerta ? 'rgba(124,58,237,0.18)' : tieneDescuento ? 'rgba(239,68,68,0.18)' : 'rgba(51,65,85,0.5)')
                        : (tieneAlerta ? 'rgba(233,213,255,0.7)' : tieneDescuento ? 'rgba(254,226,226,0.6)' : '#f8fafc')
                    }}
                    onMouseLeave={e => {
                      if (!isOpen) e.currentTarget.style.background = tieneAlerta
                        ? (dark ? 'rgba(124,58,237,0.10)' : 'rgba(233,213,255,0.4)')
                        : tieneDescuento
                          ? (dark ? 'rgba(239,68,68,0.10)' : 'rgba(254,226,226,0.4)')
                          : undefined
                    }}>
                    <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-1.5">
                      <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {d.nombre_completo}
                      {alertasContinuidad.has(d.id) && (
                        <span title="Tiene clases asumidas por continuidad — pendiente validación" className="ml-1 text-purple-500 text-sm leading-none">⚠</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(d.programas || []).map(p => (
                          <span key={p} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {d.horas_semana_total ? Math.round(d.horas_semana_total) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={`font-medium ${(d.total_checadas || 0) === 0 ? 'text-red-500' : 'text-slate-700'}`}>
                        {d.total_checadas ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {d.horas_presenciales != null
                        ? <span className="font-medium text-slate-700">{Math.round(d.horas_presenciales)}h</span>
                        : horasVivas[d.id] != null
                          ? <span className="text-blue-600 font-medium" title="Calculado del checador — expande para ver detalle">{Math.round(horasVivas[d.id])}h</span>
                          : <span className="text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {sinNomina ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-400">Sin calcular</span>
                      ) : tieneDescuento ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600">
                          {Math.round(d.horas_descuento ?? 0)} h descuento
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">OK</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${d.id}-detalle`}>
                      <td colSpan={6} className="p-0"
                        style={{ background: dark ? 'rgba(37,99,235,0.07)' : 'rgba(239,246,255,0.5)' }}>
                        <HistorialChecadas quincenaId={quincena.id} quincena={quincena} usuario={usuario} docente={d} onAlerta={marcarAlerta} onHoras={registrarHoras} onOverrideSaved={recargarDocentes} />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Evaluación Virtual ───────────────────────────────────────────────────

const CA_OPCIONES = [
  { valor: 0,    label: '0%',   pct: 0   },
  { valor: 0.05, label: '5%',   pct: 0.5 },
  { valor: 0.10, label: '10%',  pct: 1   },
]
const EV_OPCIONES = [
  { valor: 0,     label: '0%',    pct: 0   },
  { valor: 0.075, label: '7.5%', pct: 0.5 },
  { valor: 0.15,  label: '15%',  pct: 1   },
]

/**
 * CriterioBar — barra de 3 segmentos arrastrable/clickeable para criterios de evaluación.
 * Verde por defecto (max), amarillo para parcial, rojo para no cumple.
 * Soporta click y drag horizontal.
 */
function CriterioBar({ label, valor, opciones, onChange, disabled }) {
  const barRef = useRef(null)
  const dragging = useRef(false)

  const findIdx = (v) => {
    const i = opciones.findIndex(o => Math.abs(o.valor - (v ?? opciones[opciones.length - 1].valor)) < 0.001)
    return i >= 0 ? i : opciones.length - 1
  }
  const selectedIdx = findIdx(valor)

  const SEG_COLORS = {
    0: { filled: 'bg-red-400',     label: 'text-red-500' },
    1: { filled: 'bg-amber-400',   label: 'text-amber-600' },
    2: { filled: 'bg-emerald-500', label: 'text-emerald-600' },
  }
  const cfg = SEG_COLORS[selectedIdx] || SEG_COLORS[2]

  const getIdxFromX = (clientX) => {
    if (!barRef.current) return selectedIdx
    const rect = barRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width))
    return Math.floor(pct * opciones.length)
  }

  const applyAt = (clientX) => {
    const idx = getIdxFromX(clientX)
    if (idx !== selectedIdx) onChange(opciones[idx].valor)
  }

  const onMouseDown = (e) => {
    if (disabled) return
    e.preventDefault()
    dragging.current = true
    applyAt(e.clientX)
  }
  const onMouseMove = (e) => { if (dragging.current && !disabled) applyAt(e.clientX) }
  const onMouseUp   = () => { dragging.current = false }

  return (
    <div className={`mb-2 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] text-slate-600 leading-tight max-w-[80%]">{label}</span>
        <span className={`text-[10px] font-bold tabular-nums ${cfg.label}`}>
          {opciones[selectedIdx]?.label}
        </span>
      </div>
      <div
        ref={barRef}
        className={`flex gap-[2px] h-3.5 rounded overflow-hidden select-none ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {opciones.map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-[1px] transition-colors duration-100 ${
              i <= selectedIdx ? cfg.filled : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function AsignacionVirtualCard({ asig, quincenaId, quincenaEstado, usuario, onRecalc, semanasPeriodo }) {
  const { dark } = useTheme()
  // Default: max values (verde) para semanas sin capturar aún
  const [semanas, setSemanas] = useState(
    () => Array.from({ length: asig.n_semanas }, (_, i) => {
      const existing = asig.semanas.find(s => s.semana_num === i + 1)
      if (existing) return { ...existing, _confirmada: true }
      return {
        semana_num: i + 1,
        ca_1: 0.10, ca_2: 0.10, ca_3: 0.10, ca_4: 0.10,
        ev_1: 0.15, ev_2: 0.15, ev_3: 0.15, ev_4: 0.15,
        obs_ca: '', obs_ev: '',
        _confirmada: false,
      }
    })
  )
  const [saving, setSaving] = useState(false)
  const [savingCompleto, setSavingCompleto] = useState(null) // semana_num que está guardando
  const [error, setError] = useState('')

  const puedeCA = ['superadmin', 'coord_academica', 'director_cap_humano', 'cap_humano'].includes(usuario.rol)
  const puedeEV = ['superadmin', 'educacion_virtual', 'director_cap_humano', 'cap_humano'].includes(usuario.rol)
  const editable = quincenaEstado === 'abierta' || quincenaEstado === 'en_revision'

  const setCriterio = async (semanaNum, campo, valor) => {
    if (!editable) return
    const prevSemanas = semanas
    setSemanas(prev => prev.map(s =>
      s.semana_num === semanaNum ? { ...s, [campo]: valor, _confirmada: true } : s
    ))
    setSaving(true)
    setError('')
    try {
      await api.put(`/evaluacion/${quincenaId}/virtual/${asig.asignacion_id}/semana/${semanaNum}`,
        { [campo]: valor })
      onRecalc()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar')
      setSemanas(prevSemanas)
    } finally {
      setSaving(false)
    }
  }

  // Guarda todos los criterios de una semana como "completo" (max values)
  const marcarCompleto = async (semanaNum) => {
    if (!editable) return
    const payload = {}
    const sem = semanas.find(s => s.semana_num === semanaNum)
    if (puedeCA) { payload.ca_1 = 0.10; payload.ca_2 = 0.10; payload.ca_3 = 0.10; payload.ca_4 = 0.10 }
    if (puedeEV) { payload.ev_1 = 0.15; payload.ev_2 = 0.15; payload.ev_3 = 0.15; payload.ev_4 = 0.15 }
    if (sem?.obs_ca) payload.obs_ca = sem.obs_ca
    if (sem?.obs_ev) payload.obs_ev = sem.obs_ev
    setSavingCompleto(semanaNum)
    setError('')
    try {
      await api.put(`/evaluacion/${quincenaId}/virtual/${asig.asignacion_id}/semana/${semanaNum}`, payload)
      setSemanas(prev => prev.map(s =>
        s.semana_num === semanaNum ? { ...s, ...payload, _confirmada: true } : s
      ))
      onRecalc()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setSavingCompleto(null)
    }
  }

  // Fórmula local para feedback instantáneo
  // CA: max 0.10/criterio × 4 × n_sem → denom = n_sem × 0.40
  // EV: max 0.15/criterio × 4 × n_sem → denom = n_sem × 0.60
  // Solo contar semanas confirmadas para el cálculo visual
  const nSem = asig.n_semanas
  const confirmadasCount = semanas.filter(s => s._confirmada).length
  const caSum = semanas.filter(s => s._confirmada).reduce((acc, sem) =>
    acc + (Number(sem.ca_1) || 0) + (Number(sem.ca_2) || 0) +
           (Number(sem.ca_3) || 0) + (Number(sem.ca_4) || 0), 0)
  const evSum = semanas.filter(s => s._confirmada).reduce((acc, sem) =>
    acc + (Number(sem.ev_1) || 0) + (Number(sem.ev_2) || 0) +
           (Number(sem.ev_3) || 0) + (Number(sem.ev_4) || 0), 0)
  const denomCA = nSem * 0.40
  const denomEV = nSem * 0.60
  const caContrib = denomCA > 0 ? (caSum / denomCA) * 0.40 : 0
  const evContrib = denomEV > 0 ? (evSum / denomEV) * 0.60 : 0
  const pct = caContrib + evContrib
  const aprobada = pct > 0.60
  const todasConfirmadas = confirmadasCount === nSem

  const fmtFechaCorta = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
    : ''

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-3">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-slate-800">{asig.docente_nombre}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {asig.materia_nombre} · {asig.programa_nombre}
            {asig.grupo ? ` · ${asig.grupo}` : ''}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {asig.horas_semana} h/sem × {nSem} sem = {asig.horas_quincena} hrs · {fmt(asig.tarifa)}/hr · Base {fmt(asig.horas_quincena * asig.tarifa)}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saving && <span className="text-xs text-slate-400 animate-pulse">Guardando...</span>}
          {error && <span className="text-xs text-red-500">{error}</span>}
          {!todasConfirmadas && editable && (
            <span className="text-[10px] px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg">
              {confirmadasCount}/{nSem} sem. confirmadas
            </span>
          )}
          <div className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
            !todasConfirmadas
              ? 'bg-slate-50 text-slate-400 border-slate-200'
              : aprobada
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-600 border-red-200'
          }`}>
            {todasConfirmadas
              ? `${(pct * 100).toFixed(0)}% ${aprobada ? '✓ Se paga' : '✗ No se paga'}`
              : 'Pendiente captura'}
          </div>
        </div>
      </div>

      {/* Semanas */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${nSem}, 1fr)` }}>
        {semanas.map(sem => {
          const periodo = semanasPeriodo?.find(sp => sp.semana_num === sem.semana_num)
          const guardandoEsta = savingCompleto === sem.semana_num
          return (
            <div key={sem.semana_num}
              className={`rounded-lg p-3 border transition-colors ${
                sem._confirmada ? 'border-slate-200' : 'border-amber-200 border-dashed'
              }`}
              style={{
                background: sem._confirmada
                  ? (dark ? '#263548' : '#f8fafc')
                  : (dark ? 'rgba(245,158,11,0.08)' : 'rgba(255,251,235,0.6)'),
              }}>
              {/* Header semana */}
              <div className="flex items-start justify-between mb-2 gap-1">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Semana {sem.semana_num}</p>
                  {periodo && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {fmtFechaCorta(periodo.inicio)} – {fmtFechaCorta(periodo.fin)}
                    </p>
                  )}
                </div>
                {!sem._confirmada && editable && (
                  <button
                    onClick={() => marcarCompleto(sem.semana_num)}
                    disabled={guardandoEsta}
                    title="Guardar semana completa (todos en máximo)"
                    className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-medium disabled:opacity-50 transition-colors"
                  >
                    {guardandoEsta ? '...' : '✓ Todo cumple'}
                  </button>
                )}
              </div>

              {/* CA */}
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1.5">
                  Coord. Académica (40%)
                </p>
                {CA_NOMBRES.map((nombre, idx) => (
                  <CriterioBar
                    key={idx}
                    label={nombre}
                    valor={Number(sem[`ca_${idx + 1}`]) ?? 0.10}
                    opciones={CA_OPCIONES}
                    onChange={v => setCriterio(sem.semana_num, `ca_${idx + 1}`, v)}
                    disabled={!puedeCA || !editable}
                  />
                ))}
                {puedeCA && editable && (
                  <textarea
                    placeholder="Observaciones CA..."
                    value={sem.obs_ca || ''}
                    onChange={e => setSemanas(prev => prev.map(s =>
                      s.semana_num === sem.semana_num ? { ...s, obs_ca: e.target.value } : s))}
                    onBlur={e => setCriterio(sem.semana_num, 'obs_ca', e.target.value)}
                    rows={2}
                    className="w-full text-[10px] px-2 py-1 border border-slate-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 mt-1 bg-white"
                  />
                )}
                {!editable && sem.obs_ca && (
                  <p className="text-[10px] text-slate-500 italic mt-1">{sem.obs_ca}</p>
                )}
              </div>

              {/* EV */}
              <div className="border-t border-slate-200 pt-2">
                <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-1.5">
                  Educación Virtual (60%)
                </p>
                {EV_NOMBRES.map((nombre, idx) => (
                  <CriterioBar
                    key={idx}
                    label={nombre}
                    valor={Number(sem[`ev_${idx + 1}`]) ?? 0.15}
                    opciones={EV_OPCIONES}
                    onChange={v => setCriterio(sem.semana_num, `ev_${idx + 1}`, v)}
                    disabled={!puedeEV || !editable}
                  />
                ))}
                {puedeEV && editable && (
                  <textarea
                    placeholder="Observaciones EV..."
                    value={sem.obs_ev || ''}
                    onChange={e => setSemanas(prev => prev.map(s =>
                      s.semana_num === sem.semana_num ? { ...s, obs_ev: e.target.value } : s))}
                    onBlur={e => setCriterio(sem.semana_num, 'obs_ev', e.target.value)}
                    rows={2}
                    className="w-full text-[10px] px-2 py-1 border border-slate-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 mt-1 bg-white"
                  />
                )}
                {!editable && sem.obs_ev && (
                  <p className="text-[10px] text-slate-500 italic mt-1">{sem.obs_ev}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Resumen de % — solo si hay semanas confirmadas */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
        {todasConfirmadas ? (
          <>
            <span>CA: <strong className="text-blue-600">{(caContrib * 100).toFixed(1)}%</strong></span>
            <span>EV: <strong className="text-purple-600">{(evContrib * 100).toFixed(1)}%</strong></span>
            <span>Umbral: <strong>&gt;60%</strong></span>
            <span className="ml-auto font-medium">
              {aprobada
                ? `✓ Pagar ${Math.round(asig.horas_quincena)} hrs · ${fmt(asig.horas_quincena * asig.tarifa)}`
                : `✗ Descuento ${fmt(asig.horas_quincena * asig.tarifa)}`}
            </span>
          </>
        ) : (
          <span className="text-slate-400 italic">
            Confirma las {nSem} semanas para ver el % de cumplimiento. Las barras en verde indican "todo cumple" por defecto.
          </span>
        )}
      </div>
    </div>
  )
}

function TabVirtual({ quincena, usuario }) {
  const { dark } = useTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calculando, setCalculando] = useState(false)
  const [filtroPrograma, setFiltroPrograma] = useState('todos')
  const [filtroGrupo, setFiltroGrupo] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [expandidoVirt, setExpandidoVirt] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const res = await api.get(`/evaluacion/${quincena.id}/virtual`)
      setData(res.data)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [quincena.id])

  useEffect(() => { cargar() }, [cargar])

  const calcularResultados = async () => {
    setCalculando(true)
    try {
      await api.post(`/evaluacion/${quincena.id}/virtual/calcular`)
      cargar()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al calcular')
    } finally {
      setCalculando(false)
    }
  }

  if (loading) return <div className="py-10 text-center text-slate-400 text-sm">Cargando...</div>
  if (!data) return (
    <div className="py-10 text-center text-sm text-slate-400 bg-white rounded-xl border border-slate-200">
      No disponible — verifica que el endpoint de evaluación esté activo.
    </div>
  )

  const programas = [...new Set(data.asignaciones.map(a => a.programa_nombre))].sort()
  const grupos = [...new Set(data.asignaciones.filter(a => a.grupo).map(a => a.grupo))].sort()

  const asignacionesFiltradas = data.asignaciones.filter(a => {
    const matchProg = filtroPrograma === 'todos' || a.programa_nombre === filtroPrograma
    const matchGrupo = filtroGrupo === 'todos' || a.grupo === filtroGrupo
    const matchBusqueda = !busqueda ||
      a.docente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      a.materia_nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchProg && matchGrupo && matchBusqueda
  })

  // Agrupar por docente para vista de lista
  const docentesVirt = (() => {
    const mapa = {}
    for (const a of asignacionesFiltradas) {
      const key = a.docente_id ?? a.docente_nombre
      if (!mapa[key]) mapa[key] = { id: key, nombre: a.docente_nombre, asigs: [] }
      mapa[key].asigs.push(a)
    }
    return Object.values(mapa).sort((a, b) => a.nombre.localeCompare(b.nombre))
  })()

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Evaluación virtual</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.n_semanas} semanas · CA max 10%/criterio · EV max 15%/criterio · Umbral &gt;{(data.params.umbral_pago * 100).toFixed(0)}%
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text" placeholder="Buscar docente o materia..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
          {programas.length > 1 && (
            <select value={filtroPrograma}
              onChange={e => { setFiltroPrograma(e.target.value); setFiltroGrupo('todos') }}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="todos">Todos los programas</option>
              {programas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {grupos.length > 0 && (
            <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="todos">Todos los grupos</option>
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {['superadmin', 'director_cap_humano', 'cap_humano', 'educacion_virtual'].includes(usuario.rol) && (
            <button onClick={calcularResultados} disabled={calculando}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg disabled:opacity-50">
              {calculando ? 'Calculando...' : 'Guardar resultados'}
            </button>
          )}
        </div>
      </div>

      {docentesVirt.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-400 text-sm">
            {data.asignaciones.length === 0
              ? 'No hay asignaciones virtuales o mixtas para este ciclo.'
              : 'Sin resultados para esa búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Encabezado tabla */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>Docente</span>
            <span className="text-right w-32">Programas</span>
            <span className="text-right w-20">H. Virt.</span>
            <span className="text-right w-24">Materias</span>
            <span className="text-right w-20">Estado</span>
          </div>

          {docentesVirt.map(doc => {
            const abierto = expandidoVirt === doc.id
            const totalHoras = doc.asigs.reduce((s, a) => s + Math.round(a.horas_quincena), 0)
            const nAsigs = doc.asigs.length
            // Contar aprobadas/reprobadas/pendientes
            const aprobadas  = doc.asigs.filter(a => a.resultado?.aprobada === true).length
            const reprobadas = doc.asigs.filter(a => a.resultado?.aprobada === false).length
            const pendientes = nAsigs - aprobadas - reprobadas
            const progNames  = [...new Set(doc.asigs.map(a => a.programa_nombre))].join(', ')

            const estadoBadge = pendientes > 0
              ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">Pendiente</span>
              : reprobadas > 0 && aprobadas === 0
                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">No se paga</span>
                : reprobadas > 0
                  ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">Parcial</span>
                  : <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Aprobada</span>

            return (
              <div key={doc.id} className="border-b border-slate-100 last:border-0">
                {/* Fila resumen — clic para expandir */}
                <button
                  onClick={() => setExpandidoVirt(abierto ? null : doc.id)}
                  className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-3 text-left hover:bg-slate-50 transition-colors items-center"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-slate-400 leading-none shrink-0">{abierto ? '▼' : '▶'}</span>
                    <span className="font-medium text-sm text-slate-800 truncate">{doc.nombre}</span>
                  </span>
                  <span className="text-xs text-slate-500 text-right w-32 truncate" title={progNames}>
                    {[...new Set(doc.asigs.map(a => a.programa_nombre.split(' ').slice(-1)[0]))].join(' · ')}
                  </span>
                  <span className="text-sm font-semibold text-slate-700 text-right w-20">{totalHoras}h</span>
                  <span className="text-xs text-slate-500 text-right w-24">{nAsigs} materia{nAsigs !== 1 ? 's' : ''}</span>
                  <span className="flex justify-end w-20">{estadoBadge}</span>
                </button>

                {/* Detalle expandido: cards de evaluación */}
                {abierto && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100"
                    style={{ background: dark ? '#0f172a' : '#f8fafc' }}>
                    {doc.asigs.map(asig => (
                      <AsignacionVirtualCard
                        key={asig.asignacion_id}
                        asig={asig}
                        quincenaId={quincena.id}
                        quincenaEstado={quincena.estado}
                        usuario={usuario}
                        onRecalc={cargar}
                        semanasPeriodo={data.semanas_periodo}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab: Incidencias ──────────────────────────────────────────────────────────

function ModalIncidencia({ quincena, incidencia, onClose, onSaved }) {
  const esEdicion = !!incidencia
  const [docentes, setDocentes] = useState([])
  const [asignaciones, setAsignaciones] = useState([])
  const [form, setForm] = useState(() => esEdicion ? {
    tipo:               incidencia.tipo,
    docente_titular_id: String(incidencia.docente_titular_id),
    asignacion_id:      String(incidencia.asignacion_id),
    fecha:              incidencia.fecha,
    horas_afectadas:    incidencia.horas_afectadas,
    docente_suplente_id:incidencia.docente_suplente_id ? String(incidencia.docente_suplente_id) : '',
    horas_suplidas:     incidencia.horas_suplidas || '',
    notas:              incidencia.notas || '',
  } : {
    tipo: 'suplencia',   // default suplencia: la institución prioriza no perder la clase
    docente_titular_id: '', asignacion_id: '',
    fecha: quincena.fecha_inicio, horas_afectadas: 0,
    docente_suplente_id: '', horas_suplidas: '', notas: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/docentes?activo=true&limit=500')
      .then(res => setDocentes(res.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.docente_titular_id) { setAsignaciones([]); return }
    api.get('/catalogos/asignaciones', {
      params: { docente_id: form.docente_titular_id, ciclo: quincena.ciclo }
    })
      .then(res => setAsignaciones(res.data))
      .catch(() => setAsignaciones([]))
  }, [form.docente_titular_id, quincena.ciclo])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const payload = {
      ...form,
      docente_titular_id:  parseInt(form.docente_titular_id),
      asignacion_id:       parseInt(form.asignacion_id),
      horas_afectadas:     parseInt(form.horas_afectadas, 10) || 0,
      docente_suplente_id: form.tipo === 'suplencia' && form.docente_suplente_id
        ? parseInt(form.docente_suplente_id) : null,
      horas_suplidas: form.tipo === 'suplencia' && form.horas_suplidas
        ? parseInt(form.horas_suplidas, 10) : null,
    }
    try {
      if (esEdicion) {
        await api.put(`/quincenas/${quincena.id}/incidencias/${incidencia.id}`, payload)
      } else {
        await api.post(`/quincenas/${quincena.id}/incidencias`, payload)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">
            {esEdicion ? 'Editar incidencia' : 'Registrar incidencia'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
            <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inputCls}>
              <option value="falta">Falta</option>
              <option value="retardo">Retardo</option>
              <option value="suplencia">Suplencia</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Docente titular *</label>
            <select value={form.docente_titular_id} onChange={e => set('docente_titular_id', e.target.value)} required className={inputCls}>
              <option value="">Seleccionar docente...</option>
              {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre_completo}</option>)}
            </select>
          </div>
          {form.docente_titular_id && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Asignación *</label>
              <select value={form.asignacion_id} onChange={e => {
                set('asignacion_id', e.target.value)
                // Auto-rellenar horas afectadas con horas/semana de la asignación
                const asig = asignaciones.find(a => String(a.id) === e.target.value)
                if (asig && asig.horas_semana) set('horas_afectadas', asig.horas_semana)
              }} required className={inputCls}>
                <option value="">Seleccionar clase...</option>
                {asignaciones.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.materia_nombre}{a.grupo ? ` — ${a.grupo}` : ''}{a.programa_nombre ? ` (${a.programa_nombre})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha *</label>
              <input type="date" required value={form.fecha}
                min={quincena.fecha_inicio} max={quincena.fecha_fin}
                onChange={e => set('fecha', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Horas afectadas</label>
              <input type="number" min="1" step="1" value={form.horas_afectadas}
                onChange={e => set('horas_afectadas', e.target.value)} className={inputCls} />
            </div>
          </div>
          {form.tipo === 'suplencia' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Docente suplente</label>
                <select value={form.docente_suplente_id}
                  onChange={e => set('docente_suplente_id', e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {docentes.filter(d => d.id !== parseInt(form.docente_titular_id))
                    .map(d => <option key={d.id} value={d.id}>{d.nombre_completo}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Horas suplidas</label>
                <input type="number" min="1" step="1" value={form.horas_suplidas}
                  onChange={e => set('horas_suplidas', e.target.value)} className={inputCls} />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notas</label>
            <textarea value={form.notas} onChange={e => set('notas', e.target.value)}
              rows={2} className={inputCls} placeholder="Motivo o contexto..." />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg">
              {loading ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TabIncidencias({ quincena, usuario }) {
  const [incidencias, setIncidencias]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [editInc, setEditInc]           = useState(null)   // incidencia a editar
  const [busqueda, setBusqueda]         = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('todos')
  const [filtroPrograma, setFiltroPrograma] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [expandidos, setExpandidos]     = useState(new Set()) // semanas expandidas

  const cargar = useCallback(async () => {
    setLoading(true)
    api.get(`/quincenas/${quincena.id}/incidencias`)
      .then(res => { setIncidencias(res.data); setLoading(false) })
      .catch(() => { setIncidencias([]); setLoading(false) })
  }, [quincena.id])

  useEffect(() => { cargar() }, [cargar])

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      await api.patch(`/quincenas/${quincena.id}/incidencias/${id}/estado`, null,
        { params: { nuevo_estado: nuevoEstado } })
      cargar()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al actualizar.')
    }
  }

  const puedeRegistrar = ['director_cap_humano', 'cap_humano', 'coord_docente',
                          'superadmin', 'coord_academica', 'servicios_escolares'].includes(usuario.rol)
  const puedeAprobar   = ['superadmin', 'director_cap_humano', 'cap_humano', 'coord_docente'].includes(usuario.rol)

  // Derivar catálogo de programas únicos del listado cargado
  const programasEnLista = [...new Set(incidencias.map(i => i.programa_nombre).filter(Boolean))].sort()

  const filtradas = incidencias.filter(inc => {
    const q = busqueda.toLowerCase()
    if (filtroTipo !== 'todos' && inc.tipo !== filtroTipo) return false
    if (filtroEstado !== 'todos' && inc.estado !== filtroEstado) return false
    if (filtroPrograma !== 'todos' && inc.programa_nombre !== filtroPrograma) return false
    if (q && !(
      inc.docente_titular_nombre?.toLowerCase().includes(q) ||
      inc.materia_nombre?.toLowerCase().includes(q) ||
      inc.docente_suplente_nombre?.toLowerCase().includes(q) ||
      inc.grupo?.toLowerCase().includes(q) ||
      inc.notas?.toLowerCase().includes(q)
    )) return false
    return true
  })

  // Agrupar por semana (lunes de cada semana)
  const getLunes = (fecha) => {
    const d = new Date(fecha + 'T00:00:00')
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
    d.setDate(d.getDate() - dow)
    return d.toISOString().slice(0, 10)
  }
  const porSemana = filtradas.reduce((acc, inc) => {
    const lunes = getLunes(inc.fecha)
    if (!acc[lunes]) acc[lunes] = []
    acc[lunes].push(inc)
    return acc
  }, {})
  // Descendente: semana más reciente primero
  const semanasOrdenadas = Object.keys(porSemana).sort().reverse()

  // Stats
  const stats = {
    total:     incidencias.length,
    faltas:    incidencias.filter(i => i.tipo === 'falta').length,
    suplencias:incidencias.filter(i => i.tipo === 'suplencia').length,
    pendientes:incidencias.filter(i => i.estado === 'pendiente').length,
  }

  const fmtFecha = (f) => new Date(f + 'T00:00:00').toLocaleDateString('es-MX',
    { weekday: 'short', day: '2-digit', month: 'short' })
  const fmtSemana = (lunes) => {
    const l = new Date(lunes + 'T00:00:00')
    const s = new Date(lunes + 'T00:00:00'); s.setDate(s.getDate() + 5)
    return `Semana del ${l.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} ` +
           `al ${s.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}`
  }

  const toggleSemana = (lunes) => {
    setExpandidos(prev => {
      const n = new Set(prev)
      n.has(lunes) ? n.delete(lunes) : n.add(lunes)
      return n
    })
  }

  // Al cargar: expandir solo semanas con pendientes o validadas_coord.
  // Semanas totalmente aprobadas/rechazadas quedan contraídas (menos ruido visual).
  useEffect(() => {
    if (incidencias.length > 0) {
      const semConActividad = new Set(
        incidencias
          .filter(i => ['pendiente', 'validada_coord'].includes(i.estado))
          .map(i => getLunes(i.fecha))
      )
      setExpandidos(semConActividad)  // vacío = todo contraído si todo está aprobado
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidencias.length])

  const selectCls = "px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"

  return (
    <div className="space-y-4">

      {/* Stats */}
      {incidencias.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',      val: stats.total,      cls: 'bg-slate-50 border-slate-200 text-slate-700' },
            { label: 'Faltas',     val: stats.faltas,     cls: 'bg-red-50 border-red-200 text-red-700' },
            { label: 'Suplencias', val: stats.suplencias, cls: 'bg-blue-50 border-blue-200 text-blue-700' },
            { label: 'Pendientes', val: stats.pendientes, cls: 'bg-orange-50 border-orange-200 text-orange-700' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${s.cls}`}>
              <span className="text-2xl font-bold tabular-nums">{s.val}</span>
              <span className="text-sm font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Barra de filtros */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text" placeholder="Buscar docente, materia, grupo..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className={`${selectCls} w-56`}
          />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={selectCls}>
            <option value="todos">Todos los tipos</option>
            <option value="falta">Faltas</option>
            <option value="suplencia">Suplencias</option>
          </select>
          <select value={filtroPrograma} onChange={e => setFiltroPrograma(e.target.value)} className={selectCls}>
            <option value="todos">Todos los programas</option>
            {programasEnLista.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={selectCls}>
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="validada_coord">Validada coord.</option>
            <option value="aprobada">Aprobada</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{filtradas.length} de {incidencias.length}</span>
          {puedeRegistrar && (
            <button onClick={() => { setEditInc(null); setShowModal(true) }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nueva incidencia
            </button>
          )}
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="py-10 text-center text-slate-400 text-sm animate-pulse">Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-400 text-sm">
            {incidencias.length === 0 ? 'No hay incidencias registradas para esta quincena.' : 'Sin resultados para los filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {semanasOrdenadas.map(lunes => {
            const rows = porSemana[lunes]
            const nPendientes = rows.filter(r => r.estado === 'pendiente').length
            const abierta = expandidos.has(lunes)
            return (
              <div key={lunes} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Cabecera semana */}
                <button
                  onClick={() => toggleSemana(lunes)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${abierta ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-semibold text-slate-700">{fmtSemana(lunes)}</span>
                    <span className="text-xs text-slate-400">{rows.length} incidencia{rows.length !== 1 ? 's' : ''}</span>
                    {nPendientes > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                        {nPendientes} pendiente{nPendientes !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {['falta','suplencia','retardo'].map(t => {
                      const c = rows.filter(r => r.tipo === t).length
                      if (!c) return null
                      return <span key={t} className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLOR[t]}`}>{c} {TIPO_INC[t]}{c !== 1 ? 's' : ''}</span>
                    })}
                  </div>
                </button>

                {/* Tabla de la semana */}
                {abierta && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Fecha</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Docente titular</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Materia · Grupo</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Horario</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Tipo</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Hrs</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Suplente</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 max-w-xs">Observaciones</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Estado</th>
                          <th className="px-3 py-2 w-28" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {rows.map(inc => {
                          const estCfg = ESTADO_INC[inc.estado] || { label: inc.estado, cls: 'bg-slate-100 text-slate-600' }
                          const esPendiente = inc.estado === 'pendiente'
                          return (
                            <tr key={inc.id}
                              className={`hover:bg-slate-50/70 ${
                                inc.tipo === 'falta' ? 'bg-red-50/30' :
                                inc.tipo === 'suplencia' ? 'bg-blue-50/20' : ''
                              }`}
                            >
                              {/* Fecha */}
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 font-medium">
                                {fmtFecha(inc.fecha)}
                              </td>
                              {/* Docente titular */}
                              <td className="px-3 py-2.5">
                                <span className="font-medium text-slate-800 text-xs">{inc.docente_titular_nombre}</span>
                                <div className="text-xs text-slate-400">{inc.programa_nombre}</div>
                              </td>
                              {/* Materia · Grupo */}
                              <td className="px-3 py-2.5">
                                <span className="text-xs text-slate-700">{inc.materia_nombre}</span>
                                {inc.grupo && <span className="ml-1.5 text-xs text-slate-400">· {inc.grupo}</span>}
                              </td>
                              {/* Horario */}
                              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap font-mono">
                                {inc.horario_texto || '—'}
                              </td>
                              {/* Tipo */}
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLOR[inc.tipo] || 'bg-slate-100 text-slate-600'}`}>
                                  {TIPO_INC[inc.tipo] || inc.tipo}
                                </span>
                              </td>
                              {/* Horas */}
                              <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold text-slate-700">
                                {inc.horas_afectadas}h
                              </td>
                              {/* Suplente */}
                              <td className="px-3 py-2.5 text-xs">
                                {inc.tipo === 'suplencia' ? (
                                  inc.docente_suplente_nombre
                                    ? <span className="text-emerald-700 font-medium">{inc.docente_suplente_nombre}</span>
                                    : <span className="text-amber-500 italic">Sin asignar</span>
                                ) : <span className="text-slate-300">—</span>}
                                {inc.horas_suplidas && inc.tipo === 'suplencia' && (
                                  <span className="ml-1 text-slate-400">({inc.horas_suplidas}h)</span>
                                )}
                              </td>
                              {/* Notas */}
                              <td className="px-3 py-2.5 max-w-[200px]">
                                {inc.notas ? (
                                  <span className="text-xs text-slate-500 line-clamp-2" title={inc.notas}>{inc.notas}</span>
                                ) : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                              {/* Estado */}
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estCfg.cls}`}>
                                  {estCfg.label}
                                </span>
                              </td>
                              {/* Acciones */}
                              <td className="px-3 py-2.5">
                                <div className="flex gap-1 items-center">
                                  {puedeRegistrar && (
                                    <button
                                      onClick={() => { setEditInc(inc); setShowModal(true) }}
                                      className="p-1 text-slate-400 hover:text-blue-600 rounded"
                                      title="Editar"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                  )}
                                  {puedeAprobar && esPendiente && (
                                    <button onClick={() => cambiarEstado(inc.id, 'aprobada')}
                                      className="px-2 py-0.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded border border-emerald-200">
                                      Aprobar
                                    </button>
                                  )}
                                  {puedeAprobar && ['pendiente', 'validada_coord'].includes(inc.estado) && (
                                    <button onClick={() => cambiarEstado(inc.id, 'rechazada')}
                                      className="px-2 py-0.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded border border-red-200">
                                      Rechazar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <ModalIncidencia
          quincena={quincena}
          incidencia={editInc}
          onClose={() => { setShowModal(false); setEditInc(null) }}
          onSaved={() => { setShowModal(false); setEditInc(null); cargar() }}
        />
      )}
    </div>
  )
}

// ── Modal Agregar Supervisor Campo Clínico ────────────────────────────────────

function ModalAgregarSupervisor({ quincena, onClose, onSaved }) {
  const [docentes, setDocentes]   = useState([])
  const [busqueda, setBusqueda]   = useState('')
  const [seleccion, setSeleccion] = useState(null)
  const [monto, setMonto]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    api.get('/docentes?activo=true&limit=500')
      .then(r => setDocentes(r.data))
      .catch(() => {})
  }, [])

  const filtrados = docentes.filter(d =>
    !busqueda || d.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
    String(d.numero_docente || '').includes(busqueda)
  ).slice(0, 30)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!seleccion) { setError('Selecciona un docente'); return }
    setLoading(true); setError('')
    try {
      await api.post(`/quincenas/${quincena.id}/campo_clinico`, {
        docente_id: seleccion.id,
        monto: monto ? parseFloat(monto) : null,
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al agregar supervisor')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Agregar supervisor</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Búsqueda de docente */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Buscar docente</label>
            <input
              type="text" autoFocus
              placeholder="Nombre o número de docente..."
              value={busqueda} onChange={e => { setBusqueda(e.target.value); setSeleccion(null) }}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Lista de resultados */}
          {busqueda && !seleccion && (
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {filtrados.length === 0 ? (
                <div className="p-3 text-xs text-slate-400 text-center">Sin resultados</div>
              ) : filtrados.map(d => (
                <button key={d.id} type="button"
                  onClick={() => { setSeleccion(d); setBusqueda(d.nombre_completo) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 border-b border-slate-100 last:border-0"
                >
                  <span className="font-medium text-slate-800">{d.nombre_completo}</span>
                  {d.numero_docente && <span className="ml-2 text-xs text-slate-400">#{d.numero_docente}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Confirmación de selección */}
          {seleccion && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              <span className="text-sm text-teal-800 font-medium">{seleccion.nombre_completo}</span>
              <button type="button" onClick={() => { setSeleccion(null); setBusqueda('') }}
                className="ml-auto text-teal-400 hover:text-teal-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          )}

          {/* Monto opcional */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Monto quincenal <span className="font-normal text-slate-400">(dejar vacío = usar el del docente o $2,500 por defecto)</span>
            </label>
            <input
              type="number" step="50" min="0" placeholder="2500"
              value={monto} onChange={e => setMonto(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !seleccion}
              className="flex-1 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-300 text-white text-sm font-medium rounded-lg">
              {loading ? 'Agregando...' : 'Agregar supervisor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Tab Campo Clínico ─────────────────────────────────────────────────────────

function TabCampoClinico({ quincena, usuario }) {
  const [lista, setLista]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [editando, setEditando]   = useState({})
  const [guardando, setGuardando] = useState({})
  const [msg, setMsg]             = useState({})
  const [showAgregar, setShowAgregar] = useState(false)
  const [bajaLoading, setBajaLoading] = useState({})
  const [confirmarEliminar, setConfirmarEliminar] = useState(null) // { docente_id, nombre }

  const ROLES_EDIT = ['superadmin', 'director_cap_humano', 'cap_humano', 'coord_docente', 'admin']
  const puedeEditar = ROLES_EDIT.includes(usuario?.rol)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get(`/quincenas/${quincena.id}/campo_clinico`)
      setLista(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al cargar campo clínico')
    } finally {
      setLoading(false)
    }
  }, [quincena.id])

  useEffect(() => { cargar() }, [cargar])

  const iniciarEdicion = (d) => {
    setEditando(prev => ({
      ...prev,
      [d.docente_id]: { monto: d.monto, notas: d.notas || '', pagado: d.pagado }
    }))
    setMsg(prev => ({ ...prev, [d.docente_id]: null }))
  }

  const cancelarEdicion = (docente_id) => {
    setEditando(prev => { const s = { ...prev }; delete s[docente_id]; return s })
  }

  const guardar = async (docente_id) => {
    setGuardando(prev => ({ ...prev, [docente_id]: true }))
    setMsg(prev => ({ ...prev, [docente_id]: null }))
    try {
      await api.put(`/quincenas/${quincena.id}/campo_clinico/${docente_id}`, editando[docente_id])
      setMsg(prev => ({ ...prev, [docente_id]: { ok: true, text: 'Guardado' } }))
      cancelarEdicion(docente_id)
      cargar()
    } catch (e) {
      setMsg(prev => ({ ...prev, [docente_id]: { ok: false, text: e.response?.data?.detail || 'Error al guardar' } }))
    } finally {
      setGuardando(prev => ({ ...prev, [docente_id]: false }))
    }
  }

  const darBaja = async (docente_id) => {
    if (!confirm('¿Marcar como "Sin prácticas" esta quincena? El supervisor no recibirá pago.')) return
    setBajaLoading(prev => ({ ...prev, [docente_id]: true }))
    try {
      await api.patch(`/quincenas/${quincena.id}/campo_clinico/${docente_id}/baja`)
      cargar()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error al dar de baja')
    } finally {
      setBajaLoading(prev => ({ ...prev, [docente_id]: false }))
    }
  }

  const eliminar = (docente_id, nombre) => {
    setConfirmarEliminar({ docente_id, nombre })
  }

  const ejecutarEliminar = async (permanente) => {
    if (!confirmarEliminar) return
    const { docente_id } = confirmarEliminar
    setConfirmarEliminar(null)
    setBajaLoading(prev => ({ ...prev, [docente_id]: true }))
    try {
      await api.delete(`/quincenas/${quincena.id}/campo_clinico/${docente_id}?permanente=${permanente}`)
      cargar()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error al eliminar')
    } finally {
      setBajaLoading(prev => ({ ...prev, [docente_id]: false }))
    }
  }

  const reactivar = async (docente_id, montoDefault) => {
    setBajaLoading(prev => ({ ...prev, [docente_id]: true }))
    try {
      await api.post(`/quincenas/${quincena.id}/campo_clinico`, {
        docente_id, monto: montoDefault || null
      })
      cargar()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error al reactivar')
    } finally {
      setBajaLoading(prev => ({ ...prev, [docente_id]: false }))
    }
  }

  const esSinPracticas = (d) => parseFloat(d.monto || 0) === 0 &&
    d.notas?.toLowerCase().includes('sin prácticas')

  const activos    = lista.filter(d => !esSinPracticas(d))
  const sinPracticas = lista.filter(d => esSinPracticas(d))
  const totalMonto = activos.reduce((s, d) => s + parseFloat(d.monto || 0), 0)
  const totalPagados = activos.filter(d => d.pagado).length

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>

  return (
    <div className="space-y-4">
      {/* Header con stats + botón agregar */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-sm">
              {activos.length}
            </div>
            <div>
              <div className="text-xs text-slate-500">Supervisores activos</div>
              <div className="text-sm font-semibold text-slate-800">{activos.length} esta quincena</div>
            </div>
          </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 text-xs font-bold">
            $
          </div>
          <div>
            <div className="text-xs text-slate-500">Total a pagar</div>
            <div className="text-sm font-semibold text-slate-800">${totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
        {totalPagados > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold">✓</div>
            <div>
              <div className="text-xs text-slate-500">Ya pagados</div>
              <div className="text-sm font-semibold text-slate-800">{totalPagados} supervisores</div>
            </div>
          </div>
        )}
        {sinPracticas.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-xs font-bold">—</div>
            <div>
              <div className="text-xs text-slate-500">Sin prácticas</div>
              <div className="text-sm font-semibold text-slate-500">{sinPracticas.length} esta quincena</div>
            </div>
          </div>
        )}
      </div>

      {/* Botón agregar */}
      {puedeEditar && (
        <div className="flex justify-end">
          <button onClick={() => setShowAgregar(true)}
            className="flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Agregar supervisor
          </button>
        </div>
      )}
      </div>

      {/* ── Tabla supervisores activos ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Supervisor</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Monto quincenal</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600">Estado pago</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Notas</th>
              {puedeEditar && <th className="px-4 py-3 text-center font-semibold text-slate-600">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activos.map(d => {
              const enEdicion = !!editando[d.docente_id]
              const ed = editando[d.docente_id] || {}
              const m = msg[d.docente_id]
              return (
                <tr key={d.docente_id} className={`hover:bg-slate-50 ${d.pagado ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{d.nombre_completo}</div>
                    <div className="text-xs text-slate-400">{d.programa_nombre || 'Campo Clínico'}{d.numero_docente ? ` · #${d.numero_docente}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {enEdicion ? (
                      <input type="number" step="50" min="0" value={ed.monto}
                        onChange={e => setEditando(prev => ({ ...prev, [d.docente_id]: { ...prev[d.docente_id], monto: e.target.value } }))}
                        className="w-28 text-right border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    ) : (
                      <span className="font-semibold tabular-nums text-slate-800">
                        ${parseFloat(d.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {enEdicion ? (
                      <label className="flex items-center justify-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={ed.pagado}
                          onChange={e => setEditando(prev => ({ ...prev, [d.docente_id]: { ...prev[d.docente_id], pagado: e.target.checked } }))}
                          className="w-4 h-4 rounded accent-blue-600"/>
                        <span className="text-xs text-slate-600">Pagado</span>
                      </label>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.pagado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>{d.pagado ? 'Pagado' : 'Pendiente'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {enEdicion ? (
                      <input type="text" placeholder="Notas opcionales..." value={ed.notas}
                        onChange={e => setEditando(prev => ({ ...prev, [d.docente_id]: { ...prev[d.docente_id], notas: e.target.value } }))}
                        className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">{d.notas || <span className="italic text-slate-300">—</span>}</span>
                    )}
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {enEdicion ? (
                          <>
                            <button onClick={() => guardar(d.docente_id)} disabled={guardando[d.docente_id]}
                              className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
                              {guardando[d.docente_id] ? '...' : 'Guardar'}
                            </button>
                            <button onClick={() => cancelarEdicion(d.docente_id)}
                              className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded">
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => iniciarEdicion(d)}
                              className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded border border-slate-200">
                              Editar
                            </button>
                            <button onClick={() => darBaja(d.docente_id)} disabled={bajaLoading[d.docente_id]}
                              className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 rounded border border-slate-200 hover:border-red-200 disabled:opacity-40"
                              title="Sin prácticas esta quincena">
                              {bajaLoading[d.docente_id] ? '...' : 'Sin prácticas'}
                            </button>
                          </>
                        )}
                        {m && <span className={`text-xs ml-1 ${m.ok ? 'text-emerald-600' : 'text-red-500'}`}>{m.text}</span>}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          {activos.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="px-4 py-3 text-sm font-semibold text-slate-700">Total a pagar</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                  ${totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td colSpan={puedeEditar ? 3 : 2} />
              </tr>
            </tfoot>
          )}
        </table>
        {activos.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            No hay supervisores activos para esta quincena.
          </div>
        )}
      </div>

      {/* ── Sección "Sin prácticas" (colapsable) ── */}
      {sinPracticas.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-200">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
            </svg>
            <span className="text-sm font-medium text-slate-500">Sin prácticas esta quincena ({sinPracticas.length})</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {sinPracticas.map(d => (
                <tr key={d.docente_id} className="opacity-60 hover:opacity-80">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-slate-600">{d.nombre_completo}</span>
                    <span className="text-xs text-slate-400 ml-2">{d.programa_nombre || 'Campo Clínico'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-400 tabular-nums">$0.00</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full text-xs">Sin prácticas</span>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => reactivar(d.docente_id, d.monto_default)}
                          disabled={bajaLoading[d.docente_id]}
                          className="px-2.5 py-1 text-xs bg-white hover:bg-teal-50 hover:text-teal-700 text-slate-500 rounded border border-slate-200 hover:border-teal-300 disabled:opacity-40">
                          {bajaLoading[d.docente_id] ? '...' : 'Reactivar'}
                        </button>
                        <button onClick={() => eliminar(d.docente_id, d.nombre_completo)}
                          disabled={bajaLoading[d.docente_id]}
                          className="px-2.5 py-1 text-xs bg-white hover:bg-red-50 hover:text-red-600 text-slate-400 rounded border border-slate-200 hover:border-red-200 disabled:opacity-40"
                          title="Quitar de campo clínico en esta quincena">
                          Eliminar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        * Monto por defecto $2,500.00 / quincena. "Sin prácticas" excluye del pago esta quincena sin afectar quincenas futuras.
      </p>

      {showAgregar && (
        <ModalAgregarSupervisor
          quincena={quincena}
          onClose={() => setShowAgregar(false)}
          onSaved={() => { setShowAgregar(false); cargar() }}
        />
      )}

      {/* ── Modal confirmar eliminación ── */}
      {confirmarEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Eliminar supervisor</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{confirmarEliminar.nombre}</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-600">¿Cómo deseas eliminarlo?</p>
              <button
                onClick={() => ejecutarEliminar(false)}
                className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50 transition-colors group">
                <p className="text-sm font-medium text-slate-700 group-hover:text-amber-700">Solo esta quincena</p>
                <p className="text-xs text-slate-400 mt-0.5">Seguirá apareciendo en quincenas futuras.</p>
              </button>
              <button
                onClick={() => ejecutarEliminar(true)}
                className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-colors group">
                <p className="text-sm font-medium text-slate-700 group-hover:text-red-700">Esta y todas las quincenas futuras</p>
                <p className="text-xs text-slate-400 mt-0.5">Se desactiva su asignación de campo clínico. No afecta quincenas anteriores.</p>
              </button>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setConfirmarEliminar(null)}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'nomina',        label: 'Nómina',        icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'asistencia',    label: 'Asistencia',    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'virtual',       label: 'Virtual',       icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2' },
  { id: 'incidencias',   label: 'Incidencias',   icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { id: 'campo_clinico', label: 'Campo Clínico', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
]

export default function QuincenaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { usuario } = useAuth()
  const [quincena, setQuincena] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('nomina')
  const [cambiandoEstado, setCambiandoEstado] = useState(false)

  const canEdit = ['superadmin', 'director_cap_humano', 'cap_humano'].includes(usuario?.rol)

  useEffect(() => {
    api.get(`/quincenas/${id}`)
      .then(res => setQuincena(res.data))
      .catch(() => navigate('/quincenas'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  const cambiarEstado = async (nuevoEstado) => {
    const confirmMsg = {
      en_revision: '¿Enviar a revisión? Los coordinadores podrán ver la nómina borrador.',
      abierta:     '¿Regresar a abierta?',
      cerrada:     '¿Cerrar la quincena? Se bloqueará la edición.',
      pagada:      '¿Marcar como pagada?',
    }
    if (!confirm(confirmMsg[nuevoEstado] || `¿Cambiar estado a "${nuevoEstado}"?`)) return
    setCambiandoEstado(true)
    try {
      const res = await api.patch(`/quincenas/${id}/estado`, null,
        { params: { nuevo_estado: nuevoEstado } })
      setQuincena(res.data.quincena)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al cambiar estado.')
    } finally {
      setCambiandoEstado(false)
    }
  }

  if (loading) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3" />
        <div className="h-4 bg-slate-200 rounded w-1/4" />
      </div>
    </div>
  )
  if (!quincena) return null

  const estadoCfg = ESTADO_CFG[quincena.estado] || { label: quincena.estado, cls: 'bg-slate-100 text-slate-600' }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <button onClick={() => navigate('/quincenas')}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Quincenas
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-800">
              {fmtFecha(quincena.fecha_inicio)} — {fmtFecha(quincena.fecha_fin)}
            </h1>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${estadoCfg.cls}`}>
              {estadoCfg.label}
            </span>
          </div>
          <p className="text-slate-500 text-sm">
            Ciclo {quincena.ciclo} · {quincena.razon_social === 'ambas' ? 'Centro + Instituto' : quincena.razon_social} · #{quincena.id}
          </p>
          {(quincena.total_docentes > 0 || quincena.total_honorarios > 0) && (
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
              <span>{quincena.total_docentes} docentes procesados</span>
              <span>·</span>
              <span>Total honorarios {fmt(quincena.total_honorarios)}</span>
              {quincena.pendientes_revision > 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-600 font-medium">{quincena.pendientes_revision} pendientes revisión</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Acciones de estado */}
        <div className="flex items-center gap-2 flex-wrap">
          <SyncBadge />
          {canEdit && <>
            {quincena.estado === 'abierta' && (
              <button onClick={() => cambiarEstado('en_revision')} disabled={cambiandoEstado}
                className="px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg disabled:opacity-50">
                Enviar a revisión
              </button>
            )}
            {quincena.estado === 'en_revision' && (
              <>
                <button onClick={() => cambiarEstado('abierta')} disabled={cambiandoEstado}
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg disabled:opacity-50">
                  Regresar
                </button>
                <button onClick={() => cambiarEstado('cerrada')} disabled={cambiandoEstado}
                  className="px-3 py-2 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-lg disabled:opacity-50">
                  Cerrar quincena
                </button>
              </>
            )}
            {quincena.estado === 'cerrada' && (
              <button onClick={() => cambiarEstado('pagada')} disabled={cambiandoEstado}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50">
                Marcar como pagada
              </button>
            )}
          </>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'nomina'        && <TabNomina quincena={quincena} canEdit={canEdit} />}
      {tab === 'asistencia'    && <TabAsistencia quincena={quincena} usuario={usuario} />}
      {tab === 'virtual'       && <TabVirtual quincena={quincena} usuario={usuario} />}
      {tab === 'incidencias'   && <TabIncidencias quincena={quincena} usuario={usuario} />}
      {tab === 'campo_clinico' && <TabCampoClinico quincena={quincena} usuario={usuario} />}
    </div>
  )
}
