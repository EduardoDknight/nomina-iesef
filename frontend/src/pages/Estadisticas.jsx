import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import api from '../api/client'
import { SyncBadgeFull } from '../components/SyncBadge'
import { useTheme } from '../context/ThemeContext'

// ── Paleta de programas (misma del resto de la app) ───────────────────────────
const PROG_COLORS = [
  '#8B1020', '#1e40af', '#0d9488', '#d97706',
  '#7c3aed', '#0891b2', '#65a30d', '#e11d48',
]

// ── Estado badge ──────────────────────────────────────────────────────────────
const ESTADO_CFG = {
  abierta:     { bg: '#dcfce7', color: '#15803d', label: 'Abierta' },
  en_revision: { bg: '#fef9c3', color: '#b45309', label: 'En revisión' },
  cerrada:     { bg: '#e0e7ff', color: '#3730a3', label: 'Cerrada' },
  pagada:      { bg: '#f3f4f6', color: '#374151', label: 'Pagada' },
}

// ── Counter hook ──────────────────────────────────────────────────────────────
function useCounter(target, duration = 1200) {
  const [val, setVal] = useState(0)
  const frame = useRef(null)
  useEffect(() => {
    if (!target) { setVal(0); return }
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(ease * target))
      if (p < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration])
  return val
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accentColor, prefix = '', suffix = '' }) {
  const n = useCounter(value)
  return (
    <div className="rounded-xl p-5 flex flex-col gap-2.5 relative overflow-hidden"
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
      {/* línea de acento superior */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 2, background: accentColor,
        borderRadius: '12px 12px 0 0',
      }} />
      <span className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: '#6b7280', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <span style={{
        fontSize: 32, fontWeight: 700, lineHeight: 1,
        color: '#111827',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      }}>
        {prefix}{n.toLocaleString()}{suffix}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: '#9ca3af' }}>{sub}</span>
      )}
    </div>
  )
}

// ── Sección con título ────────────────────────────────────────────────────────
function Panel({ title, children }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      {title && (
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-0">
          <div style={{ width: 2, height: 12, borderRadius: 1, background: '#8B1020', flexShrink: 0 }} />
          <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
            {title}
          </h3>
        </div>
      )}
      <div className="p-5 pt-4">
        {children}
      </div>
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, fmt, dark }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: dark ? '#1e293b' : '#ffffff',
      border: `1px solid ${dark ? '#334155' : '#e5e7eb'}`,
      borderRadius: 8, padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      fontSize: 12,
    }}>
      <p style={{
        color: dark ? '#94a3b8' : '#6b7280',
        marginBottom: 7, fontSize: 11,
        fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: p.color, display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ color: dark ? '#94a3b8' : '#6b7280' }}>{p.name}</span>
          <span style={{
            color: dark ? '#f1f5f9' : '#111827',
            fontWeight: 700, marginLeft: 'auto', paddingLeft: 20,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt ? fmt(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Estadisticas() {
  const { dark } = useTheme()

  const [resumen, setResumen]             = useState(null)
  const [checadasSemana, setChecadasSemana] = useState([])
  const [porPrograma, setPorPrograma]     = useState([])
  const [quincenas, setQuincenas]         = useState([])
  const [evalVirtual, setEvalVirtual]     = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [r1, r2, r3, r4, r5] = await Promise.all([
          api.get('/estadisticas/resumen'),
          api.get('/estadisticas/checadas-por-semana'),
          api.get('/estadisticas/docentes-por-programa'),
          api.get('/estadisticas/quincenas-historial'),
          api.get('/estadisticas/evaluacion-virtual'),
        ])
        setResumen(r1.data)
        setChecadasSemana(r2.data.map(c => ({ ...c, semana: c.semana.slice(5) })))
        setPorPrograma(r3.data)
        setQuincenas(r4.data)
        setEvalVirtual(r5.data)
      } catch (e) {
        setError(e.response?.status ? `Error ${e.response.status}` : e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Colores adaptativos para gráficas (no pueden ser manejados por CSS)
  const grid   = dark ? '#1e293b' : '#f1f5f9'
  const axis   = dark ? '#64748b' : '#9ca3af'
  const area1  = dark ? '#dc2626' : '#8B1020'
  const area2  = dark ? '#3b82f6' : '#1e40af'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
          style={{ borderColor: '#8B1020 transparent #8B1020 #8B1020' }} />
        <p className="text-xs uppercase tracking-widest" style={{ color: '#9ca3af' }}>
          Cargando…
        </p>
      </div>
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="rounded-lg p-4 text-sm bg-red-50 text-red-700"
        style={{ border: '1px solid #fecaca' }}>
        Error al cargar estadísticas: {error}
      </div>
    </div>
  )

  const topProgramas = [...porPrograma]
    .sort((a, b) => b.horas_semana - a.horas_semana)
    .slice(0, 8)
  const maxHrs = Math.max(...porPrograma.map(x => x.horas_semana), 1)

  const kpis = [
    { label: 'Docentes activos',    value: resumen?.docentes_activos ?? 0,    sub: 'Registrados en sistema',   accentColor: '#8B1020' },
    { label: 'Asignaciones activas', value: resumen?.asignaciones_activas ?? 0, sub: 'Horario vigente',        accentColor: '#1e40af' },
    { label: 'Horas por semana',    value: resumen?.horas_semana ?? 0,        sub: 'Programadas totales',       accentColor: '#0d9488', suffix: ' h' },
    { label: 'Checadas hoy',        value: resumen?.checadas_hoy ?? 0,        sub: `Semana: ${(resumen?.checadas_semana ?? 0).toLocaleString()}`, accentColor: '#d97706' },
    { label: 'Total histórico BD',  value: resumen?.checadas_total ?? 0,      sub: 'Desde 2025',               accentColor: '#7c3aed' },
    { label: 'Programas activos',   value: resumen?.programas_activos ?? 0,   sub: 'Centro + Instituto',        accentColor: '#0891b2' },
    { label: 'Docentes virtuales',  value: resumen?.docentes_virtuales ?? 0,  sub: 'Virtual o mixta',          accentColor: '#65a30d' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#111827' }}>
            Estadísticas
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Indicadores generales del sistema NEXO
          </p>
        </div>
        <SyncBadgeFull />
      </div>

      {/* ── KPI grid — 7 métricas + quincenas ───────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}

        {/* Quincenas por estado */}
        <div className="rounded-xl p-5 flex flex-col gap-2.5 relative overflow-hidden"
          style={{ background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 2, background: '#65a30d', borderRadius: '12px 12px 0 0',
          }} />
          <span className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: '#6b7280', letterSpacing: '0.1em' }}>
            Quincenas
          </span>
          <div className="flex flex-col gap-2 mt-0.5">
            {Object.entries(resumen?.quincenas ?? {}).map(([k, v]) => {
              const s = ESTADO_CFG[k] || { label: k, color: '#374151' }
              return (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: s.color }}>
                    {s.label}
                  </span>
                  <span style={{
                    fontSize: 22, fontWeight: 700, lineHeight: 1,
                    color: '#111827', fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.02em',
                  }}>{v}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Tendencia de checadas ────────────────────────────────────────── */}
      <Panel title="Tendencia de checadas — últimas 4 semanas">
        {checadasSemana.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: '#9ca3af' }}>Sin datos suficientes</p>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={checadasSemana} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gArea1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={area1} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={area1} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gArea2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={area2} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={area2} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTip dark={dark} />} />
              <Legend iconType="circle" iconSize={7}
                wrapperStyle={{ fontSize: 11, color: axis, paddingTop: 8 }} />
              <Area type="monotone" dataKey="total" name="Checadas"
                stroke={area1} strokeWidth={2} fill="url(#gArea1)"
                dot={false} activeDot={{ r: 4, fill: area1, stroke: dark ? '#1e293b' : 'white', strokeWidth: 2 }} />
              <Area type="monotone" dataKey="personas" name="Personas"
                stroke={area2} strokeWidth={1.5} fill="url(#gArea2)"
                dot={false} activeDot={{ r: 4, fill: area2, stroke: dark ? '#1e293b' : 'white', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* ── Horas por programa + Docentes por programa ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

        <div className="md:col-span-3">
          <Panel title="Horas semanales por programa">
            {topProgramas.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: '#9ca3af' }}>Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topProgramas} layout="vertical"
                  margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="codigo" width={58}
                    tick={{ fontSize: 11, fill: dark ? '#e2e8f0' : '#374151' }}
                    tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip dark={dark} fmt={(v) => `${v} hrs`} />} />
                  <Bar dataKey="horas_semana" name="Hrs/sem" radius={[0, 3, 3, 0]} maxBarSize={20}>
                    {topProgramas.map((_, i) => (
                      <Cell key={i} fill={PROG_COLORS[i % PROG_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>

        <div className="md:col-span-2">
          <Panel title="Docentes por programa">
            {porPrograma.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: '#9ca3af' }}>Sin datos</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={porPrograma} dataKey="docentes" nameKey="codigo"
                      cx="50%" cy="50%" outerRadius={82} innerRadius={44}
                      labelLine={false}
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                        if (percent < 0.06) return null
                        const r = innerRadius + (outerRadius - innerRadius) * 0.5
                        const rad = Math.PI / 180
                        return (
                          <text
                            x={cx + r * Math.cos(-midAngle * rad)}
                            y={cy + r * Math.sin(-midAngle * rad)}
                            fill="white" textAnchor="middle" dominantBaseline="central"
                            fontSize={10} fontWeight={700}>
                            {`${(percent * 100).toFixed(0)}%`}
                          </text>
                        )
                      }}>
                      {porPrograma.map((_, i) => (
                        <Cell key={i} fill={PROG_COLORS[i % PROG_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip dark={dark} fmt={(v) => `${v} docentes`} />} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 120 }}>
                  {porPrograma.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0"
                        style={{ background: PROG_COLORS[i % PROG_COLORS.length] }} />
                      <span className="text-xs flex-1 truncate" style={{ color: '#374151' }}>{p.codigo}</span>
                      <span className="text-xs font-semibold tabular-nums" style={{ color: '#111827' }}>
                        {p.docentes}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Evaluación virtual + Historial quincenas ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <Panel title="Cumplimiento evaluación virtual">
          {evalVirtual.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: '#9ca3af' }}>Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={evalVirtual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip dark={dark} />} />
                <Legend iconType="circle" iconSize={7}
                  wrapperStyle={{ fontSize: 11, color: axis, paddingTop: 6 }} />
                <Bar dataKey="aprobadas"  name="Aprobadas"  fill="#0d9488" radius={[3,3,0,0]} maxBarSize={22} />
                <Bar dataKey="rechazadas" name="Rechazadas" fill="#e11d48" radius={[3,3,0,0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Historial de quincenas">
          {quincenas.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: '#9ca3af' }}>Sin quincenas</p>
          ) : (
            <div className="overflow-y-auto space-y-1.5" style={{ maxHeight: 260 }}>
              {quincenas.map((q) => {
                const s = ESTADO_CFG[q.estado] || { bg: '#f3f4f6', color: '#374151', label: q.estado }
                return (
                  <div key={q.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs"
                    style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: '#111827' }}>
                        {q.ciclo_label || q.razon_social || 'Quincena'}
                      </p>
                      <p style={{ color: '#9ca3af', marginTop: 1 }}>
                        {q.fecha_inicio} — {q.fecha_fin}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
                      style={{ background: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Tabla distribución por programa ─────────────────────────────── */}
      <Panel title="Distribución por programa">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {[
                  { label: 'Programa',       align: 'left' },
                  { label: 'Docentes',        align: 'right' },
                  { label: 'Hrs / sem',       align: 'right' },
                  { label: 'Carga relativa',  align: 'left' },
                ].map((h, i) => (
                  <th key={i} className="py-2.5 font-semibold uppercase tracking-widest"
                    style={{
                      textAlign: h.align, color: '#6b7280', fontSize: 10,
                      paddingLeft: i !== 0 ? 12 : 0, paddingRight: i !== 3 ? 12 : 0,
                    }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porPrograma.map((p, i) => {
                const pct   = Math.round((p.horas_semana / maxHrs) * 100)
                const color = PROG_COLORS[i % PROG_COLORS.length]
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td className="py-2.5 font-medium" style={{ color: '#374151' }}>{p.programa}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums pl-3 pr-3"
                      style={{ color: '#111827' }}>{p.docentes}</td>
                    <td className="py-2.5 text-right tabular-nums pl-3 pr-3"
                      style={{ color: '#6b7280' }}>{p.horas_semana}</td>
                    <td className="py-2.5 pl-3" style={{ minWidth: 120 }}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full" style={{ background: '#f1f5f9' }}>
                          <div className="h-1 rounded-full"
                            style={{ width: `${pct}%`, background: color, transition: 'width 0.8s ease' }} />
                        </div>
                        <span className="tabular-nums w-7 text-right" style={{ color: '#9ca3af', fontSize: 10 }}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

    </div>
  )
}
