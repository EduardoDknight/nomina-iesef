import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { SyncBadgePortal } from '../components/SyncBadge'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoWeekBoundsTW(offsetWeeks = 0) {
  const hoy = new Date()
  hoy.setDate(hoy.getDate() + offsetWeeks * 7)
  const wd  = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1
  const lun = new Date(hoy); lun.setDate(hoy.getDate() - wd)
  const sab = new Date(lun); sab.setDate(lun.getDate() + 5)
  const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return { fi: localISO(lun), ff: localISO(sab) }
}

// ── Días no laborables ───────────────────────────────────────────────────────
const DIA_NO_LAB_CFG_TW = {
  vacaciones:          { label: 'Vacaciones',     bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   icon: '🏖' },
  suspension_oficial:  { label: 'Susp. oficial',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  icon: '📋' },
  suspension_interna:  { label: 'Susp. interna',  bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', icon: '🔔' },
}

function BadgeDiaNoLabTW({ tipo, descripcion }) {
  const cfg = DIA_NO_LAB_CFG_TW[tipo] || { label: tipo, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-500', icon: '📅' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function currentQuincenaTW() {
  const hoy = new Date()
  const yr  = hoy.getFullYear()
  const mo  = String(hoy.getMonth() + 1).padStart(2, '0')
  if (hoy.getDate() <= 15) {
    return { fi: `${yr}-${mo}-01`, ff: `${yr}-${mo}-15` }
  }
  const lastDay = new Date(yr, hoy.getMonth() + 1, 0).getDate()
  return { fi: `${yr}-${mo}-16`, ff: `${yr}-${mo}-${lastDay}` }
}

function DateRangeSelectorTW({ value, onChange }) {
  const fmtLabel = (s) => new Date(s + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

  const hoyM = new Date()
  const yrM  = hoyM.getFullYear()
  const moM  = String(hoyM.getMonth() + 1).padStart(2, '0')
  const lastM = new Date(yrM, hoyM.getMonth() + 1, 0).getDate()
  const estemes = { fi: `${yrM}-${moM}-01`, ff: `${yrM}-${moM}-${lastM}` }

  const presets = [
    { label: 'Esta semana',     ...isoWeekBoundsTW(0) },
    { label: 'Semana pasada',   ...isoWeekBoundsTW(-1) },
    { label: 'Este mes',        ...estemes },
    { label: 'Quincena actual', ...currentQuincenaTW() },
  ]

  const active = presets.find(p => p.fi === value.fi && p.ff === value.ff)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => onChange({ fecha_inicio: p.fi, fecha_fin: p.ff })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              active?.label === p.label
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value.fi}
          onChange={e => onChange({ fecha_inicio: e.target.value, fecha_fin: value.ff })}
          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <span className="text-xs text-slate-400">—</span>
        <input
          type="date"
          value={value.ff}
          onChange={e => onChange({ fecha_inicio: value.fi, fecha_fin: e.target.value })}
          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>
      {active && (
        <p className="text-[10px] text-slate-400">{fmtLabel(value.fi)} – {fmtLabel(value.ff)}</p>
      )}
    </div>
  )
}

// BadgeTiempoRealAdm eliminado — la info de sincronización la provee SyncBadgePortal

// ── Tab: Mi Asistencia ────────────────────────────────────────────────────────
function TabAsistencia() {
  const defaultRange = isoWeekBoundsTW(0)
  const [rango, setRango]       = useState({ fi: defaultRange.fi, ff: defaultRange.ff })
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [abiertos, setAbiertos] = useState({})

  const cargar = (fi, ff) => {
    setLoading(true)
    api.get('/portal/mi-asistencia', { params: { fecha_inicio: fi, fecha_fin: ff } })
      .then(r => {
        setData(r.data)
        // Auto-expand today
        const hoyIdx = r.data.dias.findIndex(d => d.es_hoy)
        if (hoyIdx >= 0) setAbiertos(prev => ({ ...prev, [hoyIdx]: true }))
      })
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
      setAbiertos({})
    }
  }

  const toggle = (i) => setAbiertos(prev => ({ ...prev, [i]: !prev[i] }))

  const fmtD = (s) => new Date(s + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

  const diasConReg    = data?.resumen.dias_con_registro ?? 0
  const diasCompletos = data?.resumen.dias_completos    ?? 0
  const diasParciales = data?.resumen.dias_parciales    ?? 0

  return (
    <div className="space-y-3">
      {/* Selector de rango */}
      <DateRangeSelectorTW value={{ fi: rango.fi, ff: rango.ff }} onChange={handleRangeChange} />

      {/* Estado de sincronización del checador */}
      <SyncBadgePortal />

      {/* Resumen pills */}
      {!loading && data && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Con registro', val: diasConReg,    cls: 'text-blue-600' },
            { label: 'Completos',    val: diasCompletos,  cls: 'text-emerald-600' },
            { label: 'Parciales',    val: diasParciales,  cls: 'text-orange-500' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.cls}`}>{s.val}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl px-4 py-3 animate-pulse h-16" />
          ))}
        </div>
      ) : !data || data.dias.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <p className="text-slate-500 text-sm">Sin registros en este período.</p>
        </div>
      ) : (
        /* Días — oldest first */
        [...data.dias].map((dia, i) => {
          const incompleto = dia.tiene_checadas && !(dia.entrada && dia.salida)
          const completo   = !!(dia.entrada && dia.salida)

          return (
            <div key={dia.fecha}
              className={`bg-white border rounded-xl overflow-hidden ${
                dia.es_hoy
                  ? 'border-emerald-300 shadow-sm shadow-emerald-100 ring-1 ring-emerald-200'
                  : 'border-slate-200'
              }`}>
              <button
                className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-slate-50 transition-colors"
                onClick={() => toggle(i)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center text-xs leading-none font-bold ${
                    dia.es_hoy ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <span className="text-[10px] font-normal opacity-70">{dia.dia_semana.slice(0, 3)}</span>
                    <span>{fmtD(dia.fecha).split(' ')[0]}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{dia.dia_semana}</span>
                      {dia.es_hoy && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-600 uppercase">Hoy</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono">
                      {dia.entrada ? `↓ ${dia.entrada}` : '↓ —'}
                      {' · '}
                      {dia.salida  ? `↑ ${dia.salida}`  : '↑ —'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!dia.tiene_checadas && (
                    dia.dia_no_laborable
                      ? <BadgeDiaNoLabTW tipo={dia.dia_no_laborable.tipo} descripcion={dia.dia_no_laborable.descripcion} />
                      : <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-400">Sin checadas</span>
                  )}
                  {completo && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-600 font-medium">✓ Completo</span>
                  )}
                  {incompleto && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-600 font-medium">Incompleto</span>
                  )}
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${abiertos[i] ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {abiertos[i] && (
                <div className="border-t border-slate-100 px-4 py-3">
                  {dia.dia_no_laborable && (
                    <div className={`mb-3 flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs ${
                      DIA_NO_LAB_CFG_TW[dia.dia_no_laborable.tipo]?.bg || 'bg-slate-50'
                    } ${DIA_NO_LAB_CFG_TW[dia.dia_no_laborable.tipo]?.border || 'border-slate-200'
                    } ${DIA_NO_LAB_CFG_TW[dia.dia_no_laborable.tipo]?.text || 'text-slate-600'}`}>
                      <span>{DIA_NO_LAB_CFG_TW[dia.dia_no_laborable.tipo]?.icon || '📅'}</span>
                      <div>
                        <span className="font-semibold">{DIA_NO_LAB_CFG_TW[dia.dia_no_laborable.tipo]?.label || dia.dia_no_laborable.tipo}</span>
                        {dia.dia_no_laborable.descripcion && (
                          <span className="ml-1 opacity-80">— {dia.dia_no_laborable.descripcion}</span>
                        )}
                        {(dia.dia_no_laborable.tipo === 'vacaciones' || dia.dia_no_laborable.tipo === 'suspension_oficial') && (
                          <p className="opacity-70 mt-0.5">Día no laborable para personal administrativo — no se descuenta.</p>
                        )}
                      </div>
                    </div>
                  )}
                  {dia.todas.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-1">Sin checadas registradas este día.</p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Todas las marcaciones</p>
                      {dia.todas.map((ch, j) => (
                        <div key={j} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-mono ${
                          ch.tipo === 'entrada' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
                        }`}>
                          <span className="text-base">{ch.tipo === 'entrada' ? '↓' : '↑'}</span>
                          <span className="font-bold">{ch.hora}</span>
                          <span className={`ml-auto text-xs font-sans font-medium px-2 py-0.5 rounded-full ${
                            ch.tipo === 'entrada' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'
                          }`}>
                            {ch.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
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
