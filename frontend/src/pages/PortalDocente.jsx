import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { SyncBadgePortal } from '../components/SyncBadge'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const fmtFecha = (d) => d ? new Date(d + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Días no laborables ───────────────────────────────────────────────────────
const DIA_NO_LAB_CFG = {
  vacaciones:          { label: 'Vacaciones',     bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   icon: '🏖' },
  suspension_oficial:  { label: 'Susp. oficial',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  icon: '📋' },
  suspension_interna:  { label: 'Susp. interna',  bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', icon: '🔔' },
}

function BadgeDiaNoLab({ tipo, descripcion, compact = false }) {
  const cfg = DIA_NO_LAB_CFG[tipo] || { label: tipo, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', icon: '📅' }
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
        {cfg.icon} {cfg.label}
      </span>
    )
  }
  return (
    <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-sm ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      <span className="shrink-0 text-base leading-none mt-0.5">{cfg.icon}</span>
      <div>
        <span className="font-semibold">{cfg.label}</span>
        {descripcion && <span className="ml-1 font-normal opacity-80">— {descripcion}</span>}
        {tipo === 'suspension_interna' && (
          <p className="text-[11px] opacity-70 mt-0.5">Las clases de este día se pagan aunque no haya checada.</p>
        )}
        {(tipo === 'vacaciones' || tipo === 'suspension_oficial') && (
          <p className="text-[11px] opacity-70 mt-0.5">No se esperan checadas ni se pagan clases este día.</p>
        )}
      </div>
    </div>
  )
}

const ESTADO_NOMINA = {
  borrador: { label: 'Borrador', cls: 'bg-amber-100 text-amber-700' },
  validado: { label: 'Validado', cls: 'bg-blue-100 text-blue-700' },
  pagado:   { label: 'Pagado',   cls: 'bg-emerald-100 text-emerald-700' },
}

const ESTADO_ACLARACION = {
  pendiente: { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700' },
  revisando: { label: 'Revisando', cls: 'bg-blue-100 text-blue-700' },
  resuelta:  { label: 'Resuelta',  cls: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
}

// ── Tab: Mi Nómina ────────────────────────────────────────────────────────────
function TabNomina() {
  const [nominas, setNominas] = useState([])
  const [expandida, setExpandida] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/portal/mi-nomina').then(r => setNominas(r.data)).finally(() => setLoading(false))
  }, [])

  const verDetalle = async (quincena_id) => {
    if (expandida === quincena_id) { setExpandida(null); setDetalle(null); return }
    setExpandida(quincena_id)
    const r = await api.get(`/portal/mi-nomina/${quincena_id}`)
    setDetalle(r.data)
  }

  if (loading) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
          <div className="flex justify-between">
            <div className="space-y-2">
              <div className="h-4 w-48 bg-slate-100 rounded" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
            <div className="h-5 w-24 bg-slate-100 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )

  if (!nominas.length) return (
    <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
        </svg>
      </div>
      <p className="text-slate-700 font-medium text-sm">Aún no hay nóminas registradas</p>
      <p className="text-slate-400 text-xs mt-1 max-w-xs mx-auto">
        Una vez que se procese la primera quincena aparecerá tu historial de pagos aquí.
      </p>
    </div>
  )

  // Resumen del último pago
  const ultimo = nominas[0]

  return (
    <div className="space-y-3">
      {/* Tarjeta resumen */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white mb-4">
        <p className="text-blue-200 text-xs font-medium uppercase tracking-wide mb-1">Último pago</p>
        <p className="text-3xl font-bold">{fmt(ultimo.total_final)}</p>
        <p className="text-blue-200 text-xs mt-1">
          {fmtFecha(ultimo.fecha_inicio)} — {fmtFecha(ultimo.fecha_fin)} · {Math.round(ultimo.horas_reales)} hrs
        </p>
        <div className="flex items-center gap-2 mt-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
            ultimo.nomina_estado === 'pagado' ? 'bg-emerald-400/20 text-emerald-100' :
            ultimo.nomina_estado === 'validado' ? 'bg-blue-300/20 text-blue-100' :
            'bg-amber-400/20 text-amber-100'
          }`}>
            {ESTADO_NOMINA[ultimo.nomina_estado]?.label || ultimo.nomina_estado}
          </span>
          <span className="text-blue-300 text-xs">{nominas.length} quincena{nominas.length !== 1 ? 's' : ''} en historial</span>
        </div>
      </div>

      {nominas.map(n => {
        const cfg = ESTADO_NOMINA[n.nomina_estado] || { label: n.nomina_estado, cls: 'bg-slate-100 text-slate-600' }
        return (
          <div key={n.quincena_id || n.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              className="w-full px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => verDetalle(n.quincena_id || n.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {fmtFecha(n.fecha_inicio)} — {fmtFecha(n.fecha_fin)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {Math.round(n.horas_reales)} hrs · Honorarios {fmt(n.honorarios)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                  <p className="text-base font-bold text-slate-800">{fmt(n.total_final)}</p>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandida === (n.quincena_id || n.id) ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {expandida === (n.quincena_id || n.id) && detalle && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
                  <div className="flex justify-between"><span className="text-slate-500">H. Presenciales</span><span className="font-medium">{Math.round(detalle.horas_presenciales)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">H. Virtuales</span><span className="font-medium">{Math.round(detalle.horas_virtuales)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">H. Suplencia</span><span className="font-medium">{Math.round(detalle.horas_suplencia)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">H. Totales</span><span className="font-medium">{Math.round(detalle.horas_reales)}</span></div>
                </div>
                <div className="border-t border-slate-200 pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Honorarios</span><span className="font-mono">{fmt(detalle.honorarios)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">IVA 16%</span><span className="font-mono">{fmt(detalle.iva)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sub-total</span><span className="font-mono">{fmt(detalle.sub_total)}</span></div>
                  <div className="flex justify-between text-red-600"><span>Ret. ISR 10%</span><span className="font-mono">-{fmt(detalle.retencion_isr)}</span></div>
                  <div className="flex justify-between text-red-600"><span>Ret. IVA</span><span className="font-mono">-{fmt(detalle.retencion_iva)}</span></div>
                  {detalle.ajustes !== 0 && (
                    <div className={`flex justify-between ${detalle.ajustes > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      <span>Ajustes</span><span className="font-mono">{fmt(detalle.ajustes)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-200">
                    <span>Total a pagar</span><span className="font-mono">{fmt(detalle.total_final)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Mis Checadas ─────────────────────────────────────────────────────────

// Badge estado entrada
const ENT_CFG = {
  entrada_ok: { label: 'OK',      cls: 'bg-emerald-100 text-emerald-700' },
  retardo:    { label: 'Retardo', cls: 'bg-amber-100 text-amber-700' },
  falta:      { label: 'Falta',   cls: 'bg-red-100 text-red-700' },
}
// Badge estado salida
const SAL_CFG = {
  salida_ok:          { label: 'OK',         cls: 'bg-emerald-100 text-emerald-700' },
  salida_anticipada:  { label: 'Anticipada', cls: 'bg-slate-100 text-slate-600' },
  salida_tarde:       { label: 'Tarde',      cls: 'bg-slate-100 text-slate-500' },
}
// Status icon config
const STATUS_ICON = {
  completa:                    { icon: '✓', cls: 'text-emerald-600' },
  asumida_por_continuidad:     { icon: '↔', cls: 'text-amber-500' },
  sin_salida_continuidad:      { icon: '↔', cls: 'text-amber-500' },
  sin_entrada_continuidad:     { icon: '↔', cls: 'text-amber-500' },
  sin_checadas:                { icon: '—', cls: 'text-slate-400' },
  virtual:                     { icon: '⊡', cls: 'text-blue-400' },
  sin_salida:                  { icon: '!', cls: 'text-orange-500' },
  sin_entrada:                 { icon: '!', cls: 'text-orange-500' },
  falta_con_registro:          { icon: '!', cls: 'text-red-500' },
}

function BadgeTiempoReal({ actualizado }) {
  const hora = actualizado
    ? new Date(actualizado).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : null
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Tiempo real
      </span>
      {hora && <span>· Actualizado {hora} · se actualiza cada 5 min</span>}
    </div>
  )
}

function isoWeekBounds(offsetWeeks = 0) {
  const hoy = new Date()
  hoy.setDate(hoy.getDate() + offsetWeeks * 7)
  const wd  = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1  // 0=lun
  const lun = new Date(hoy); lun.setDate(hoy.getDate() - wd)
  const sab = new Date(lun); sab.setDate(lun.getDate() + 5)
  const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return { fi: localISO(lun), ff: localISO(sab) }
}

function currentQuincena() {
  const hoy = new Date()
  const yr  = hoy.getFullYear()
  const mo  = String(hoy.getMonth() + 1).padStart(2, '0')
  if (hoy.getDate() <= 15) {
    return { fi: `${yr}-${mo}-01`, ff: `${yr}-${mo}-15` }
  }
  const lastDay = new Date(yr, hoy.getMonth() + 1, 0).getDate()
  return { fi: `${yr}-${mo}-16`, ff: `${yr}-${mo}-${lastDay}` }
}

function DateRangeSelector({ value, onChange }) {
  const fmtLabel = (s) => new Date(s + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

  const hoyM = new Date()
  const yrM  = hoyM.getFullYear()
  const moM  = String(hoyM.getMonth() + 1).padStart(2, '0')
  const lastM = new Date(yrM, hoyM.getMonth() + 1, 0).getDate()
  const estemes = { fi: `${yrM}-${moM}-01`, ff: `${yrM}-${moM}-${lastM}` }

  const presets = [
    { label: 'Esta semana',     ...isoWeekBounds(0) },
    { label: 'Semana pasada',   ...isoWeekBounds(-1) },
    { label: 'Este mes',        ...estemes },
    { label: 'Quincena actual', ...currentQuincena() },
  ]

  const active = presets.find(p => p.fi === value.fi && p.ff === value.ff)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => onChange({ fecha_inicio: p.fi, fecha_fin: p.ff })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              active?.label === p.label
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Custom range */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value.fi}
          onChange={e => onChange({ fecha_inicio: e.target.value, fecha_fin: value.ff })}
          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span className="text-xs text-slate-400">—</span>
        <input
          type="date"
          value={value.ff}
          onChange={e => onChange({ fecha_inicio: value.fi, fecha_fin: e.target.value })}
          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      {active && (
        <p className="text-[10px] text-slate-400">{fmtLabel(value.fi)} – {fmtLabel(value.ff)}</p>
      )}
    </div>
  )
}

function TabChecadas() {
  const defaultRange = isoWeekBounds(0)
  const [rango, setRango]     = useState({ fi: defaultRange.fi, ff: defaultRange.ff })
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [verTodas, setVerTodas] = useState(false)

  const cargar = (fi, ff) => {
    setLoading(true)
    api.get('/portal/mis-checadas', { params: { fecha_inicio: fi, fecha_fin: ff } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    cargar(rango.fi, rango.ff)
    const iv = setInterval(() => cargar(rango.fi, rango.ff), 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [rango.fi, rango.ff])

  const handleRangeChange = ({ fecha_inicio, fecha_fin }) => {
    if (fecha_inicio && fecha_fin && fecha_inicio <= fecha_fin) {
      setRango({ fi: fecha_inicio, ff: fecha_fin })
      setVerTodas(false)
    }
  }

  const clasesContinuidad = data?.clases.filter(c =>
    c.alerta_cadena ||
    c.estado === 'asumida_por_continuidad' ||
    c.estado === 'sin_salida_continuidad' ||
    c.estado === 'sin_entrada_continuidad'
  ).length ?? 0

  return (
    <div className="space-y-3">
      {/* Selector de rango */}
      <DateRangeSelector
        value={{ fi: rango.fi, ff: rango.ff }}
        onChange={handleRangeChange}
      />

      {/* Cabecera: badge tiempo real */}
      <div className="flex items-center justify-end">
        <BadgeTiempoReal actualizado={data?.actualizado_en} />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl px-4 py-3 animate-pulse h-12" />
          ))}
        </div>
      ) : !data || data.clases.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <p className="text-slate-500 text-sm">Sin clases programadas en este período.</p>
        </div>
      ) : (
        <>
          {/* Días no laborables en el rango */}
          {data.dias_no_laborables && Object.entries(data.dias_no_laborables).length > 0 && (
            <div className="space-y-2">
              {Object.entries(data.dias_no_laborables).map(([fecha, dnl]) => (
                <BadgeDiaNoLab key={fecha} tipo={dnl.tipo} descripcion={dnl.descripcion} />
              ))}
            </div>
          )}

          {/* Alerta continuidad */}
          {data.alerta_continuidad && (
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <span className="shrink-0 mt-0.5">↔</span>
              <span>
                <strong>{clasesContinuidad} clase{clasesContinuidad !== 1 ? 's' : ''} pagada{clasesContinuidad !== 1 ? 's' : ''} por continuidad</strong>
                {' — '}El docente checó entrada al inicio y salida al final del bloque continuo, sin checar cada clase por separado.
              </span>
            </div>
          )}

          {/* Resumen horas */}
          <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
            <span>Checadas: <strong className="text-slate-800">{data.horas_checadas}h</strong></span>
            {data.horas_continuidad > 0 && (
              <span>Continuidad: <strong className="text-amber-700">{data.horas_continuidad}h</strong></span>
            )}
            {data.horas_asumidas > 0 && (
              <span>Asumidas: <strong className="text-amber-600">{data.horas_asumidas}h</strong></span>
            )}
            <span className="ml-auto font-semibold text-slate-800">Total: {data.horas_totales}h</span>
          </div>

          {/* Tabla de clases */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="text-left px-3 py-2.5">Fecha</th>
                    <th className="text-left px-3 py-2.5">Materia · Grupo</th>
                    <th className="text-left px-3 py-2.5 hidden sm:table-cell">Horario</th>
                    <th className="text-center px-3 py-2.5">Entrada</th>
                    <th className="text-center px-3 py-2.5">Salida</th>
                    <th className="text-center px-2 py-2.5">·</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clases.map((c, i) => {
                    const [fecha, hora_ini] = [c.fecha, c.horario?.split('-')[0]]
                    const entCfg = c.entrada ? (ENT_CFG[c.entrada.estado] || ENT_CFG.entrada_ok) : null
                    const salCfg = c.salida  ? (SAL_CFG[c.salida.estado]  || SAL_CFG.salida_ok)  : null
                    const stIco  = STATUS_ICON[c.estado] || STATUS_ICON.sin_checadas

                    return (
                      <tr
                        key={i}
                        className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                          c.alerta_cadena ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        {/* Fecha */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="text-xs font-medium text-slate-700">
                            {new Date(c.fecha + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                          </div>
                          <div className="text-[10px] text-slate-400 capitalize">{c.dia}</div>
                        </td>
                        {/* Materia */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-medium text-slate-800 leading-tight">{c.materia}</span>
                            {c.alerta_cadena && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 uppercase">continuidad</span>
                            )}
                          </div>
                          {c.grupo && <div className="text-[10px] text-slate-400">{c.grupo}</div>}
                        </td>
                        {/* Horario */}
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className="text-xs font-mono text-slate-600">{c.horario}</span>
                        </td>
                        {/* Entrada */}
                        <td className="px-3 py-2.5 text-center">
                          {c.es_virtual ? (
                            <span className="text-[10px] text-blue-400">virtual</span>
                          ) : c.entrada ? (
                            <div className="space-y-0.5">
                              <div className="text-xs font-mono font-semibold text-slate-700">{c.entrada.ts}</div>
                              {entCfg && (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${entCfg.cls}`}>{entCfg.label}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        {/* Salida */}
                        <td className="px-3 py-2.5 text-center">
                          {c.es_virtual ? (
                            <span className="text-[10px] text-blue-400">virtual</span>
                          ) : c.salida ? (
                            <div className="space-y-0.5">
                              <div className="text-xs font-mono font-semibold text-slate-700">{c.salida.ts}</div>
                              {salCfg && (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${salCfg.cls}`}>{salCfg.label}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        {/* Status icon / día no laborable */}
                        <td className="px-2 py-2.5 text-center">
                          {c.estado === 'sin_checadas' && data.dias_no_laborables?.[c.fecha] ? (
                            <BadgeDiaNoLab
                              tipo={data.dias_no_laborables[c.fecha].tipo}
                              compact
                            />
                          ) : (
                            <span className={`text-base font-bold ${stIco.cls}`}>{stIco.icon}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expandible: todas las marcaciones */}
          {data.todas_marcaciones.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-slate-50 transition-colors"
                onClick={() => setVerTodas(v => !v)}
              >
                <span className="text-xs font-medium text-slate-600">
                  Ver todas las marcaciones biométricas ({data.todas_marcaciones.length})
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${verTodas ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {verTodas && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                        <th className="text-left px-3 py-2">Fecha</th>
                        <th className="text-left px-3 py-2">Hora</th>
                        <th className="text-center px-3 py-2">E/S</th>
                        <th className="text-center px-3 py-2">Asignada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.todas_marcaciones.map((m, i) => (
                        <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-slate-600">{m.fecha}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-800 font-semibold">{m.ts}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                              m.tipo === 'E' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'
                            }`}>{m.tipo === 'E' ? 'Entrada' : 'Salida'}</span>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {m.asignada
                              ? <span className="text-emerald-500">✓</span>
                              : <span className="text-slate-300">·</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Tab: Aclaraciones ─────────────────────────────────────────────────────────
function TabAclaraciones() {
  const [aclaraciones, setAclaraciones] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ descripcion: '', fecha_referencia: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const cargar = () => api.get('/portal/aclaraciones').then(r => setAclaraciones(r.data))
  useEffect(() => { cargar() }, [])

  const enviar = async (e) => {
    e.preventDefault()
    if (!form.descripcion.trim()) { setError('Describe tu aclaración.'); return }
    setEnviando(true); setError(null)
    try {
      await api.post('/portal/aclaraciones', {
        descripcion: form.descripcion.trim(),
        fecha_referencia: form.fecha_referencia || null,
      })
      setModal(false)
      setForm({ descripcion: '', fecha_referencia: '' })
      cargar()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al enviar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setModal(true); setError(null) }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Nueva aclaración
        </button>
      </div>

      {aclaraciones.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <p className="text-slate-700 font-medium text-sm">No tienes aclaraciones registradas</p>
          <p className="text-slate-400 text-xs mt-1 max-w-xs mx-auto">
            Si tienes alguna duda sobre tus checadas o nómina, puedes enviar una aclaración al área de Capital Humano.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {aclaraciones.map(a => {
            const cfg = ESTADO_ACLARACION[a.estado] || { label: a.estado, cls: 'bg-slate-100 text-slate-600' }
            return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-slate-800">{a.descripcion}</p>
                    {a.fecha_referencia && (
                      <p className="text-xs text-slate-400 mt-1">Fecha referencia: {a.fecha_referencia}</p>
                    )}
                    {a.respuesta && (
                      <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700">
                        <span className="font-medium">Respuesta:</span> {a.respuesta}
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(a.creado_en).toLocaleDateString('es-MX')}
                      {a.atendido_por_nombre && ` · Atendido por ${a.atendido_por_nombre}`}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Nueva aclaración</h3>
            <form onSubmit={enviar} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Descripción
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={4}
                  placeholder="Describe tu duda o aclaración..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Fecha de referencia (opcional)
                </label>
                <input
                  type="date"
                  value={form.fecha_referencia}
                  onChange={e => setForm(f => ({ ...f, fecha_referencia: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 py-2.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={enviando}
                  className="flex-1 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50">
                  {enviando ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
      setMsg({ tipo: 'ok', texto: 'Contraseña actualizada correctamente.' })
      setForm({ password_actual: '', password_nueva: '', password_confirma: '' })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al cambiar.' })
    } finally {
      setGuardando(false)
    }
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
              className={inputCls} required minLength={k !== 'password_actual' ? 6 : 1} />
          </div>
        ))}
        {msg && (
          <div className={`px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.texto}
          </div>
        )}
        <button type="submit" disabled={guardando}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
          {guardando ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  )
}

// ── Portal Principal ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'nomina',      label: 'Mi Nómina',    icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  { id: 'checadas',    label: 'Mis Checadas', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'aclaraciones',label: 'Aclaraciones', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  { id: 'cuenta',      label: 'Mi Cuenta',    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

export default function PortalDocente() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('nomina')

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">IE</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-none">{usuario?.nombre}</p>
              <p className="text-xs text-slate-400 mt-0.5">Portal Docente</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Salir
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
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
        {/* Tab title */}
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-slate-800">
            {TABS.find(t => t.id === tab)?.label}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {tab === 'nomina'       && 'Tu historial de pagos y desglose fiscal por quincena'}
            {tab === 'checadas'     && 'Registros de entrada y salida del checador biométrico'}
            {tab === 'aclaraciones' && 'Consultas y aclaraciones enviadas a Capital Humano'}
            {tab === 'cuenta'       && 'Configuración de tu contraseña de acceso'}
          </p>
          {(tab === 'checadas' || tab === 'nomina') && (
            <div className="mt-2">
              <SyncBadgePortal />
            </div>
          )}
        </div>
        {tab === 'nomina'       && <TabNomina />}
        {tab === 'checadas'     && <TabChecadas />}
        {tab === 'aclaraciones' && <TabAclaraciones />}
        {tab === 'cuenta'       && <TabCuenta />}
      </main>
    </div>
  )
}
