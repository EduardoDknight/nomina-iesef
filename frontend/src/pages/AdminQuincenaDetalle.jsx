import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import SyncBadge from '../components/SyncBadge'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => n != null
  ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
  : '—'

const fmtFecha = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX',
      { day: '2-digit', month: 'short', year: 'numeric' })
  : '—'

const fmtFechaCorta = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX',
      { weekday: 'short', day: '2-digit', month: 'short' })
  : '—'

const ESTADO_CFG = {
  abierto:     { label: 'Abierto',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  abierta:     { label: 'Abierta',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  en_revision: { label: 'En revisión', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  cerrado:     { label: 'Cerrado',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  cerrada:     { label: 'Cerrada',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pagada:      { label: 'Pagada',      cls: 'bg-blue-100 text-blue-700 border-blue-200' },
}

const ESTADO_ASISTENCIA_DIA = {
  presente:   { label: 'Presente',   cls: 'bg-emerald-100 text-emerald-700' },
  retardo:    { label: 'Retardo',    cls: 'bg-amber-100 text-amber-700'    },
  falta:      { label: 'Falta',      cls: 'bg-red-100 text-red-600'        },
  incompleto: { label: 'Incompleto', cls: 'bg-orange-100 text-orange-700'  },
}

const TIPO_INC_ADMIN = {
  falta_justificada: 'Falta justificada',
  permiso:           'Permiso',
  vacaciones:        'Vacaciones',
  otro:              'Otro',
}

const TIPO_INC_COLOR = {
  falta_justificada: 'bg-red-100 text-red-700 border border-red-200',
  permiso:           'bg-amber-100 text-amber-700 border border-amber-200',
  vacaciones:        'bg-blue-100 text-blue-700 border border-blue-200',
  otro:              'bg-slate-100 text-slate-600 border border-slate-200',
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

// ── Tab Asistencia ─────────────────────────────────────────────────────────────

function TabAsistencia({ quincena, canEdit }) {
  const [resumen, setResumen]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [generando, setGenerando]     = useState(false)
  const [msg, setMsg]                 = useState(null)
  const [expandido, setExpandido]     = useState(null)
  const [detalle, setDetalle]         = useState({})
  const [loadingDet, setLoadingDet]   = useState({})

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/admin/periodos/${quincena.id}/asistencia`)
      setResumen(Array.isArray(res.data) ? res.data : [])
    } catch {
      setResumen([])
    } finally {
      setLoading(false)
    }
  }, [quincena.id])

  useEffect(() => { cargar() }, [cargar])

  const calcularNomina = async () => {
    if (!confirm('¿Calcular/recalcular nómina del personal administrativo?')) return
    setGenerando(true)
    setMsg(null)
    try {
      const res = await api.post(`/admin/periodos/${quincena.id}/generar_nomina`)
      setMsg({ tipo: 'ok', texto: res.data?.mensaje || 'Nómina calculada exitosamente.' })
      cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al calcular.' })
    } finally {
      setGenerando(false)
    }
  }

  const toggleDetalle = async (t) => {
    const id = t.trabajador_id
    if (expandido === id) {
      setExpandido(null)
      return
    }
    setExpandido(id)
    if (detalle[id]) return
    setLoadingDet(p => ({ ...p, [id]: true }))
    try {
      const res = await api.get(`/admin/periodos/${quincena.id}/asistencia/${id}/detalle`)
      setDetalle(p => ({ ...p, [id]: res.data.dias || [] }))
    } catch {
      setDetalle(p => ({ ...p, [id]: [] }))
    } finally {
      setLoadingDet(p => ({ ...p, [id]: false }))
    }
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Asistencia del período</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtFecha(quincena.fecha_inicio)} — {fmtFecha(quincena.fecha_fin)} · {resumen.length} trabajadores
          </p>
        </div>
        {canEdit && ['abierto', 'abierta', 'en_revision'].includes(quincena.estado) && (
          <button onClick={calcularNomina} disabled={generando}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg disabled:opacity-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {generando ? 'Calculando...' : 'Calcular Nómina'}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-6" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Cargo</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Días Periodo</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Retardos</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Faltas</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Días Descuento</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado Nómina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : resumen.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No hay datos de asistencia para este período.
                  </td>
                </tr>
              ) : resumen.map(t => {
                const abierto = expandido === t.trabajador_id
                const dias = detalle[t.trabajador_id] || []
                return (
                  <>
                    <tr key={t.trabajador_id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => toggleDetalle(t)}>
                      {/* Expand arrow */}
                      <td className="px-4 py-3 text-slate-400">
                        <svg className={`w-3.5 h-3.5 transition-transform ${abierto ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{t.nombre}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{t.cargo || '—'}</td>
                      <td className="px-4 py-3 text-center text-slate-700 tabular-nums">{t.dias_periodo ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {t.retardos > 0
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{t.retardos}</span>
                          : <span className="text-slate-400 text-xs">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.faltas > 0
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{t.faltas}</span>
                          : <span className="text-slate-400 text-xs">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(t.dias_descuento ?? 0) > 0
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{t.dias_descuento}</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">OK</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.nomina_calculada
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Calculado</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pendiente</span>}
                      </td>
                    </tr>

                    {/* Fila expandida — detalle por día */}
                    {abierto && (
                      <tr key={`det-${t.trabajador_id}`}>
                        <td colSpan={8} className="bg-slate-50 px-0 py-0">
                          <div className="px-6 py-3">
                            {loadingDet[t.trabajador_id] ? (
                              <div className="py-4 text-center text-sm text-slate-400">Cargando detalle...</div>
                            ) : dias.length === 0 ? (
                              <div className="py-3 text-sm text-slate-400">Sin detalle disponible.</div>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-100 border-b border-slate-200">
                                      <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Día</th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Entrada Prog.</th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Salida Prog.</th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Primera Checada</th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Última Checada</th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {dias.map((d, i) => {
                                      const est = ESTADO_ASISTENCIA_DIA[d.estado] || { label: d.estado, cls: 'bg-slate-100 text-slate-600' }
                                      return (
                                        <tr key={i} className="hover:bg-white">
                                          <td className="px-3 py-2 font-medium text-slate-700">{fmtFecha(d.fecha)}</td>
                                          <td className="px-3 py-2 text-slate-500 capitalize">{d.dia_semana || '—'}</td>
                                          <td className="px-3 py-2 font-mono text-slate-500">{d.hora_entrada_prog || '—'}</td>
                                          <td className="px-3 py-2 font-mono text-slate-500">{d.hora_salida_prog || '—'}</td>
                                          <td className="px-3 py-2 font-mono text-slate-700">
                                            {d.primera_checada || <span className="text-slate-300">—</span>}
                                          </td>
                                          <td className="px-3 py-2 font-mono text-slate-700">
                                            {d.ultima_checada || <span className="text-slate-300">—</span>}
                                          </td>
                                          <td className="px-3 py-2">
                                            <div className="flex items-center gap-1.5">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${est.cls}`}>
                                                {est.label}
                                              </span>
                                              {d.minutos_tarde > 0 && (
                                                <span className="text-amber-500 text-[10px]">+{d.minutos_tarde}min</span>
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
    </div>
  )
}

// ── Tab Nómina ─────────────────────────────────────────────────────────────────

function TabNomina({ quincena }) {
  const [nomina, setNomina]     = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.get(`/admin/periodos/${quincena.id}/nomina`)
      .then(res => setNomina(Array.isArray(res.data) ? res.data : []))
      .catch(() => setNomina([]))
      .finally(() => setLoading(false))
  }, [quincena.id])

  const totalSueldo    = nomina.reduce((s, n) => s + (n.sueldo_base ?? 0), 0)
  const totalDescuento = nomina.reduce((s, n) => s + (n.descuento ?? 0), 0)
  const totalPagar     = nomina.reduce((s, n) => s + (n.total_a_pagar ?? 0), 0)

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-800">Nómina del personal administrativo</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {nomina.length} trabajadores · Total a pagar {fmt(totalPagar)}
        </p>
      </div>

      {nomina.length === 0 && !loading ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <svg className="w-8 h-8 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-slate-500 text-sm">Nómina no calculada aún.</p>
          <p className="text-xs text-slate-400 mt-1">Usa "Calcular Nómina" en la pestaña Asistencia.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Cargo</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Días Periodo</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Días Presentes</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Retardos</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Días Descuento</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Sueldo Base</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Descuento</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total a Pagar</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(10)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : nomina.map(n => (
                <tr key={n.trabajador_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{n.nombre}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{n.cargo || '—'}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-700">{n.dias_periodo ?? '—'}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-700">{n.dias_presentes ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {(n.retardos ?? 0) > 0
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{n.retardos}</span>
                      : <span className="text-slate-400 text-xs">0</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(n.dias_descuento ?? 0) > 0
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{n.dias_descuento}</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">OK</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(n.sueldo_base)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-500 text-xs">{n.descuento > 0 ? fmt(n.descuento) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{fmt(n.total_a_pagar)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      n.estado === 'pagado'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {n.estado === 'pagado' ? 'Pagado' : 'Borrador'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {nomina.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                  <td className="px-4 py-3 text-slate-700" colSpan={6}>Total ({nomina.length} trabajadores)</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(totalSueldo)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-500 text-xs">{fmt(totalDescuento)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">{fmt(totalPagar)}</td>
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

// ── Modal Nueva Incidencia ────────────────────────────────────────────────────

function ModalIncidencia({ quincena, trabajadores, onClose, onSaved }) {
  const [form, setForm] = useState({
    trabajador_id: '',
    tipo: 'falta_justificada',
    fecha: quincena.fecha_inicio || '',
    descripcion: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.trabajador_id) { setError('Selecciona un trabajador.'); return }
    setLoading(true)
    setError('')
    try {
      await api.post(`/admin/periodos/${quincena.id}/incidencias`, {
        ...form,
        trabajador_id: parseInt(form.trabajador_id),
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al registrar incidencia.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Nueva Incidencia</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Trabajador *</label>
            <select value={form.trabajador_id} onChange={e => set('trabajador_id', e.target.value)}
              required className={inputCls}>
              <option value="">Seleccionar trabajador...</option>
              {trabajadores.map(t => (
                <option key={t.trabajador_id ?? t.id} value={t.trabajador_id ?? t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inputCls}>
                {Object.entries(TIPO_INC_ADMIN).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha *</label>
              <input type="date" required value={form.fecha}
                min={quincena.fecha_inicio} max={quincena.fecha_fin}
                onChange={e => set('fecha', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
            <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              rows={3} className={inputCls} placeholder="Motivo u observaciones..." />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg">
              {loading ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Tab Incidencias ────────────────────────────────────────────────────────────

function TabIncidencias({ quincena, canEdit }) {
  const [incidencias, setIncidencias]     = useState([])
  const [trabajadores, setTrabajadores]   = useState([])
  const [loading, setLoading]             = useState(true)
  const [showModal, setShowModal]         = useState(false)
  const [eliminando, setEliminando]       = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/admin/periodos/${quincena.id}/incidencias`)
      setIncidencias(Array.isArray(res.data) ? res.data : [])
    } catch {
      setIncidencias([])
    } finally {
      setLoading(false)
    }
  }, [quincena.id])

  // Cargar lista de trabajadores para el modal
  useEffect(() => {
    cargar()
    api.get('/admin/trabajadores')
      .then(res => setTrabajadores(Array.isArray(res.data) ? res.data.filter(t => t.activo) : []))
      .catch(() => setTrabajadores([]))
  }, [cargar])

  const handleEliminar = async (incId) => {
    if (!confirm('¿Eliminar esta incidencia?')) return
    setEliminando(incId)
    try {
      await api.delete(`/admin/periodos/${quincena.id}/incidencias/${incId}`)
      cargar()
    } catch {
      // silencioso
    } finally {
      setEliminando(null)
    }
  }

  const fmtTimestamp = (ts) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Incidencias</h2>
          <p className="text-xs text-slate-500 mt-0.5">{incidencias.length} registros</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Incidencia
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Trabajador</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Registrado por</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Registrado en</th>
                {canEdit && (
                  <th className="px-4 py-3 w-12" />
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(canEdit ? 7 : 6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : incidencias.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center text-slate-400">
                    Sin incidencias registradas para esta quincena.
                  </td>
                </tr>
              ) : (
                incidencias.map(inc => (
                  <tr key={inc.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{inc.trabajador_nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        TIPO_INC_COLOR[inc.tipo] || 'bg-slate-100 text-slate-600'
                      }`}>
                        {TIPO_INC_ADMIN[inc.tipo] || inc.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{fmtFecha(inc.fecha)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-xs">
                      <span className="line-clamp-2" title={inc.descripcion}>
                        {inc.descripcion || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{inc.registrado_por_nombre || inc.registrado_por || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtTimestamp(inc.registrado_en)}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleEliminar(inc.id)}
                          disabled={eliminando === inc.id}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                          title="Eliminar incidencia">
                          {eliminando === inc.id ? (
                            <span className="text-xs text-slate-400">...</span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ModalIncidencia
          quincena={quincena}
          trabajadores={trabajadores}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); cargar() }}
        />
      )}
    </div>
  )
}

// ── Tabs config ───────────────────────────────────────────────────────────────

const TABS = [
  {
    id: 'asistencia',
    label: 'Asistencia',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    id: 'nomina',
    label: 'Nómina',
    icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    id: 'incidencias',
    label: 'Incidencias',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  },
]

// ── Página principal ───────────────────────────────────────────────────────────

export default function AdminQuincenaDetalle() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { usuario } = useAuth()
  const [quincena, setQuincena] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('asistencia')

  const canEdit = ['superadmin', 'director_cap_humano', 'cap_humano'].includes(usuario?.rol)

  useEffect(() => {
    api.get(`/admin/periodos/${id}`)
      .then(res => setQuincena(res.data))
      .catch(() => navigate('/admin/nomina'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  if (loading) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3" />
        <div className="h-4 bg-slate-200 rounded w-1/4" />
      </div>
    </div>
  )
  if (!quincena) return null

  const estadoCfg = ESTADO_CFG[quincena.estado] || { label: quincena.estado, cls: 'bg-slate-100 text-slate-600 border-slate-200' }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <button onClick={() => navigate('/admin/nomina')}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Nómina Administrativa
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-slate-800">
              {fmtFecha(quincena.fecha_inicio)} — {fmtFecha(quincena.fecha_fin)}
            </h1>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${estadoCfg.cls}`}>
              {estadoCfg.label}
            </span>
          </div>
          <p className="text-slate-500 text-sm">
            Ciclo {quincena.ciclo} · Personal Administrativo · #{quincena.id}
          </p>
        </div>
        <SyncBadge />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'asistencia'  && <TabAsistencia quincena={quincena} canEdit={canEdit} />}
      {tab === 'nomina'      && <TabNomina quincena={quincena} />}
      {tab === 'incidencias' && <TabIncidencias quincena={quincena} canEdit={canEdit} />}
    </div>
  )
}
