import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import api from '../api/client'
import { SyncBadgeFull } from '../components/SyncBadge'
import { useTheme } from '../context/ThemeContext'

// ── Paleta de programas ───────────────────────────────────────────────────────
const PROG_COLORS = [
  '#8B1020', '#1e40af', '#0d9488', '#d97706',
  '#7c3aed', '#0891b2', '#65a30d', '#e11d48',
]

// ── Hook de colores reactivo al tema ──────────────────────────────────────────
// Todos los componentes lo llaman directamente — nunca pasan colores por props.
function useC() {
  const { dark } = useTheme()
  return {
    dark,
    text:     dark ? '#f1f5f9' : '#111827',
    textMd:   dark ? '#e2e8f0' : '#374151',
    textMut:  dark ? '#94a3b8' : '#6b7280',
    textDim:  dark ? '#475569' : '#9ca3af',
    surface:  dark ? '#1e293b' : '#ffffff',
    surface2: dark ? '#0f172a' : '#f8fafc',
    border:   dark ? '#334155' : '#e5e7eb',
    border2:  dark ? '#1e293b' : '#f1f5f9',
    grid:     dark ? '#1e293b' : '#f1f5f9',
    axis:     dark ? '#64748b' : '#9ca3af',
  }
}

// ── Estados de quincena ───────────────────────────────────────────────────────
function estadoCfg(estado, dark) {
  const map = {
    abierta:     {
      bg:    dark ? 'rgba(74,222,128,0.12)'  : '#dcfce7',
      color: dark ? '#4ade80'                : '#15803d',
      label: 'Abierta',
    },
    en_revision: {
      bg:    dark ? 'rgba(251,191,36,0.12)'  : '#fef9c3',
      color: dark ? '#fbbf24'                : '#b45309',
      label: 'En revisión',
    },
    cerrada:     {
      bg:    dark ? 'rgba(129,140,248,0.12)' : '#e0e7ff',
      color: dark ? '#818cf8'                : '#3730a3',
      label: 'Cerrada',
    },
    pagada:      {
      bg:    dark ? 'rgba(148,163,184,0.12)' : '#f3f4f6',
      color: dark ? '#94a3b8'                : '#6b7280',
      label: 'Pagada',
    },
  }
  return map[estado] || { bg: dark ? '#1e293b' : '#f3f4f6', color: dark ? '#94a3b8' : '#6b7280', label: estado }
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
  const c = useC()
  return (
    <div className="rounded-xl p-5 flex flex-col gap-2.5 relative overflow-hidden"
      style={{ background: c.surface, border: `1px solid ${c.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 2, background: accentColor, borderRadius: '12px 12px 0 0',
      }} />
      <span style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: c.textMut,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 32, fontWeight: 700, lineHeight: 1,
        color: c.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
      }}>
        {prefix}{n.toLocaleString()}{suffix}
      </span>
      {sub && <span style={{ fontSize: 11, color: c.textDim }}>{sub}</span>}
    </div>
  )
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ title, children }) {
  const c = useC()
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: c.surface, border: `1px solid ${c.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      {title && (
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <div style={{ width: 2, height: 12, borderRadius: 1, background: '#8B1020', flexShrink: 0 }} />
          <h3 style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: c.textMut, margin: 0,
          }}>
            {title}
          </h3>
        </div>
      )}
      <div className="p-5 pt-4">{children}</div>
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, fmt }) {
  const c = useC()
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: c.surface, border: `1px solid ${c.border}`,
      borderRadius: 8, padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: 12,
    }}>
      <p style={{
        color: c.textMut, marginBottom: 7, fontSize: 10,
        fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: c.textMut }}>{p.name}</span>
          <span style={{ color: c.text, fontWeight: 700, marginLeft: 'auto', paddingLeft: 20, fontVariantNumeric: 'tabular-nums' }}>
            {fmt ? fmt(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Estadisticas() {
  const c = useC()

  const [resumen, setResumen]               = useState(null)
  const [checadasSemana, setChecadasSemana] = useState([])
  const [porPrograma, setPorPrograma]       = useState([])
  const [quincenas, setQuincenas]           = useState([])
  const [evalVirtual, setEvalVirtual]       = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)

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
        setChecadasSemana(r2.data.map(d => ({ ...d, semana: d.semana.slice(5) })))
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
          style={{ borderColor: '#8B1020 transparent #8B1020 #8B1020' }} />
        <p style={{ color: c.textMut, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Cargando…
        </p>
      </div>
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="rounded-lg p-4 text-sm"
        style={{
          background: c.dark ? 'rgba(239,68,68,0.1)' : '#fef2f2',
          color: c.dark ? '#f87171' : '#991b1b',
          border: `1px solid ${c.dark ? 'rgba(239,68,68,0.3)' : '#fecaca'}`,
        }}>
        Error al cargar estadísticas: {error}
      </div>
    </div>
  )

  const topProgramas = [...porPrograma].sort((a, b) => b.horas_semana - a.horas_semana).slice(0, 8)
  const maxHrs = Math.max(...porPrograma.map(x => x.horas_semana), 1)

  // Colores de ejes/área que Recharts no puede resolver con CSS
  const area1 = c.dark ? '#ef4444' : '#8B1020'
  const area2 = c.dark ? '#3b82f6' : '#1e40af'

  const kpis = [
    { label: 'Docentes activos',     value: resumen?.docentes_activos ?? 0,     sub: 'Registrados en sistema',   accentColor: '#8B1020' },
    { label: 'Asignaciones activas', value: resumen?.asignaciones_activas ?? 0, sub: 'Horario vigente',          accentColor: '#1e40af' },
    { label: 'Horas por semana',     value: resumen?.horas_semana ?? 0,         sub: 'Programadas totales',      accentColor: '#0d9488', suffix: ' h' },
    { label: 'Checadas hoy',         value: resumen?.checadas_hoy ?? 0,         sub: `Semana: ${(resumen?.checadas_semana ?? 0).toLocaleString()}`, accentColor: '#d97706' },
    { label: 'Total histórico BD',   value: resumen?.checadas_total ?? 0,       sub: 'Desde 2025',               accentColor: '#7c3aed' },
    { label: 'Programas activos',    value: resumen?.programas_activos ?? 0,    sub: 'Centro + Instituto',       accentColor: '#0891b2' },
    { label: 'Docentes virtuales',   value: resumen?.docentes_virtuales ?? 0,   sub: 'Virtual o mixta',         accentColor: '#65a30d' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: c.text, margin: 0 }}>
            Estadísticas
          </h1>
          <p style={{ fontSize: 13, marginTop: 3, color: c.textMut }}>
            Indicadores generales del sistema NEXO
          </p>
        </div>
        <SyncBadgeFull />
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}

        {/* Quincenas */}
        <div className="rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden"
          style={{ background: c.surface, border: `1px solid ${c.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 2, background: '#65a30d', borderRadius: '12px 12px 0 0',
          }} />
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: c.textMut }}>
            Quincenas
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(resumen?.quincenas ?? {}).map(([k, v]) => {
              const s = estadoCfg(k, c.dark)
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: s.color }}>{s.label}</span>
                  <span style={{
                    fontSize: 22, fontWeight: 700, lineHeight: 1,
                    color: c.text, fontVariantNumeric: 'tabular-nums',
                  }}>{v}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Tendencia ───────────────────────────────────────────────────── */}
      <Panel title="Tendencia de checadas — últimas 4 semanas">
        {checadasSemana.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: c.textMut }}>Sin datos suficientes</p>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={checadasSemana} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gA1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={area1} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={area1} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gA2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={area2} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={area2} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTip />} />
              <Legend iconType="circle" iconSize={7}
                wrapperStyle={{ fontSize: 11, color: c.axis, paddingTop: 8 }} />
              <Area type="monotone" dataKey="total" name="Checadas"
                stroke={area1} strokeWidth={2} fill="url(#gA1)"
                dot={false} activeDot={{ r: 4, fill: area1, stroke: c.surface, strokeWidth: 2 }} />
              <Area type="monotone" dataKey="personas" name="Personas"
                stroke={area2} strokeWidth={1.5} fill="url(#gA2)"
                dot={false} activeDot={{ r: 4, fill: area2, stroke: c.surface, strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* ── Horas por programa + Docentes pie ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3">
          <Panel title="Horas semanales por programa">
            {topProgramas.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: c.textMut }}>Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topProgramas} layout="vertical"
                  margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="codigo" width={58}
                    tick={{ fontSize: 11, fill: c.textMd }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip fmt={(v) => `${v} hrs`} />} />
                  <Bar dataKey="horas_semana" name="Hrs/sem" radius={[0, 3, 3, 0]} maxBarSize={20}>
                    {topProgramas.map((_, i) => <Cell key={i} fill={PROG_COLORS[i % PROG_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>

        <div className="md:col-span-2">
          <Panel title="Docentes por programa">
            {porPrograma.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: c.textMut }}>Sin datos</p>
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
                          <text x={cx + r * Math.cos(-midAngle * rad)} y={cy + r * Math.sin(-midAngle * rad)}
                            fill="white" textAnchor="middle" dominantBaseline="central"
                            fontSize={10} fontWeight={700}>
                            {`${(percent * 100).toFixed(0)}%`}
                          </text>
                        )
                      }}>
                      {porPrograma.map((_, i) => <Cell key={i} fill={PROG_COLORS[i % PROG_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTip fmt={(v) => `${v} docentes`} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 120 }}>
                  {porPrograma.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: PROG_COLORS[i % PROG_COLORS.length] }} />
                      <span style={{ flex: 1, fontSize: 11, color: c.textMd, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.codigo}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
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
            <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: c.textMut }}>Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={evalVirtual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: c.axis, paddingTop: 6 }} />
                <Bar dataKey="aprobadas"  name="Aprobadas"  fill="#0d9488" radius={[3,3,0,0]} maxBarSize={22} />
                <Bar dataKey="rechazadas" name="Rechazadas" fill="#e11d48" radius={[3,3,0,0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Historial de quincenas">
          {quincenas.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: c.textMut }}>Sin quincenas</p>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {quincenas.map((q) => {
                const s = estadoCfg(q.estado, c.dark)
                return (
                  <div key={q.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', borderRadius: 8,
                    background: c.surface2, border: `1px solid ${c.border2}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 12, color: c.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.ciclo_label || q.razon_social || 'Quincena'}
                      </p>
                      <p style={{ fontSize: 11, color: c.textDim, margin: '2px 0 0' }}>
                        {q.fecha_inicio} — {q.fecha_fin}
                      </p>
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: 20,
                      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                      background: s.bg, color: s.color,
                    }}>
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Tabla distribución ───────────────────────────────────────────── */}
      <Panel title="Distribución por programa">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                {[
                  { label: 'Programa',      align: 'left' },
                  { label: 'Docentes',       align: 'right' },
                  { label: 'Hrs / sem',      align: 'right' },
                  { label: 'Carga relativa', align: 'left' },
                ].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 12px', textAlign: h.align,
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: c.textMut,
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
                  <tr key={i} style={{ borderBottom: `1px solid ${c.border2}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: c.textMd }}>{p.programa}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums' }}>{p.docentes}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: c.textMut, fontVariantNumeric: 'tabular-nums' }}>{p.horas_semana}</td>
                    <td style={{ padding: '10px 12px', minWidth: 130 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 3, borderRadius: 2, background: c.border, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: color }} />
                        </div>
                        <span style={{ fontSize: 10, color: c.textDim, width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
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
