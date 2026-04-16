import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import api from '../api/client'
import { SyncBadgeFull } from '../components/SyncBadge'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        '#05091a',
  surface:   '#0a1128',
  surface2:  '#0d1635',
  border:    'rgba(34,211,238,0.09)',
  borderMid: 'rgba(34,211,238,0.18)',
  cyan:      '#22d3ee',
  cyanGlow:  'rgba(34,211,238,0.15)',
  red:       '#f87171',
  green:     '#4ade80',
  amber:     '#fbbf24',
  violet:    '#a78bfa',
  orange:    '#fb923c',
  blue:      '#60a5fa',
  text:      '#e2e8f0',
  textMuted: '#64748b',
  textDim:   '#1e293b',
  mono:      '"JetBrains Mono", "Fira Code", "Courier New", monospace',
  sans:      '"DM Sans", system-ui, sans-serif',
  display:   '"Syne", system-ui, sans-serif',
}

const PROGRAM_COLORS = [
  T.red, T.blue, T.green, T.amber, T.violet, T.orange, T.cyan, '#34d399',
]

// ── CSS global injected once ──────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@600;700;800&display=swap');

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseDot {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50%       { opacity: 1;   transform: scale(1.2); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes scanIn {
    from { clip-path: inset(0 100% 0 0); }
    to   { clip-path: inset(0 0% 0 0); }
  }
  .kpi-card {
    opacity: 0;
    animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) forwards;
  }
  .kpi-card:hover .kpi-glow { opacity: 1 !important; }
  .stats-row-hover:hover { background: ${T.surface2} !important; }

  @media (max-width: 768px) {
    .stats-grid-3-2 { grid-template-columns: 1fr !important; }
    .stats-grid-2   { grid-template-columns: 1fr !important; }
  }
`

// ── Counter hook ──────────────────────────────────────────────────────────────
function useCounter(target, duration = 1400) {
  const [val, setVal] = useState(0)
  const frame = useRef(null)
  useEffect(() => {
    if (!target) { setVal(0); return }
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 4)
      setVal(Math.round(ease * target))
      if (p < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration])
  return val
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, index, prefix = '', suffix = '' }) {
  const n = useCounter(value)
  return (
    <div className="kpi-card" style={{
      animationDelay: `${index * 55}ms`,
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 10,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 8,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* ambient glow behind number */}
      <div className="kpi-glow" style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 20% 50%, ${accent}0d 0%, transparent 65%)`,
        opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none',
      }} />
      {/* index badge */}
      <span style={{
        position: 'absolute', top: 11, right: 13,
        fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 1,
      }}>
        {String(index).padStart(2, '0')}
      </span>
      {/* label */}
      <span style={{
        fontFamily: T.display, fontSize: 9.5, fontWeight: 700,
        letterSpacing: '0.13em', textTransform: 'uppercase', color: T.textMuted,
      }}>
        {label}
      </span>
      {/* value */}
      <div style={{
        fontFamily: T.mono, fontSize: 30, fontWeight: 700,
        color: '#f0f9ff', lineHeight: 1,
        textShadow: `0 0 18px ${accent}50`,
      }}>
        {prefix}{n.toLocaleString()}{suffix}
      </div>
      {sub && (
        <span style={{ fontFamily: T.sans, fontSize: 10.5, color: T.textMuted }}>
          {sub}
        </span>
      )}
      {/* bottom accent line */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        width: '50%', height: 1,
        background: `linear-gradient(90deg, ${accent}60, transparent)`,
      }} />
    </div>
  )
}

// ── Quincenas card ────────────────────────────────────────────────────────────
const ESTADO_MAP = {
  abierta:     { color: '#4ade80', label: 'Abierta' },
  en_revision: { color: '#fbbf24', label: 'En revisión' },
  cerrada:     { color: '#60a5fa', label: 'Cerrada' },
  pagada:      { color: '#64748b', label: 'Pagada' },
}

function QuincenasCard({ data, index }) {
  return (
    <div className="kpi-card" style={{
      animationDelay: `${index * 55}ms`,
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${T.green}`,
      borderRadius: 10,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <span style={{
        fontFamily: T.display, fontSize: 9.5, fontWeight: 700,
        letterSpacing: '0.13em', textTransform: 'uppercase', color: T.textMuted,
      }}>
        Quincenas
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {Object.entries(data ?? {}).map(([k, v]) => {
          const s = ESTADO_MAP[k] || { color: T.textMuted, label: k }
          return (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: 9.5, color: s.color,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {s.label}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: 22, fontWeight: 700, color: '#f0f9ff',
              }}>
                {v}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Dark tooltip ──────────────────────────────────────────────────────────────
function DarkTip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#030712', border: `1px solid ${T.borderMid}`,
      borderRadius: 8, padding: '10px 14px',
      fontFamily: T.mono, fontSize: 11,
      boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 16px ${T.cyanGlow}`,
    }}>
      <p style={{ color: T.cyan, marginBottom: 7, fontSize: 10, letterSpacing: '0.08em' }}>
        {label}
      </p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: p.color, display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ color: T.textMuted }}>{p.name}</span>
          <span style={{ color: '#f0f9ff', fontWeight: 600, marginLeft: 'auto', paddingLeft: 20 }}>
            {fmt ? fmt(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ title, children, style = {}, delay = 0 }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 16,
      opacity: 0,
      animation: `fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}ms forwards`,
      ...style,
    }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 3, height: 13, borderRadius: 2,
            background: T.cyan,
            boxShadow: `0 0 8px ${T.cyanGlow}`,
          }} />
          <h3 style={{
            fontFamily: T.display, fontSize: 9.5, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: T.textMuted, margin: 0,
          }}>
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  )
}

// ── Estado badge ──────────────────────────────────────────────────────────────
function EstadoBadge({ estado }) {
  const s = ESTADO_MAP[estado] || { color: T.textMuted, label: estado }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', fontFamily: T.mono,
      color: s.color, background: `${s.color}18`,
      border: `1px solid ${s.color}40`,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Estadisticas() {
  const [resumen, setResumen]           = useState(null)
  const [checadasSemana, setChecadasSemana] = useState([])
  const [porPrograma, setPorPrograma]   = useState([])
  const [quincenas, setQuincenas]       = useState([])
  const [evalVirtual, setEvalVirtual]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

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
        setError(e.response?.status ? `HTTP ${e.response.status}` : e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 320, background: T.bg, fontFamily: T.mono,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: `2px solid ${T.cyan}`, borderTopColor: 'transparent',
          animation: 'spin 0.75s linear infinite',
          margin: '0 auto 14px',
          boxShadow: `0 0 12px ${T.cyanGlow}`,
        }} />
        <p style={{ color: T.textMuted, fontSize: 11, letterSpacing: '0.18em' }}>CARGANDO…</p>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ padding: 24, background: T.bg, minHeight: '100%' }}>
      <div style={{
        background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
        borderRadius: 8, padding: '14px 18px',
        color: T.red, fontSize: 12, fontFamily: T.mono,
      }}>
        ERR: {error}
      </div>
    </div>
  )

  const topProgramas = [...porPrograma].sort((a, b) => b.horas_semana - a.horas_semana).slice(0, 8)
  const maxHrs = Math.max(...porPrograma.map(x => x.horas_semana), 1)

  const kpis = [
    { label: 'Docentes activos',    value: resumen?.docentes_activos ?? 0,    sub: 'Registrados en sistema', accent: T.cyan },
    { label: 'Asignaciones activas', value: resumen?.asignaciones_activas ?? 0, sub: 'Horario vigente',      accent: T.blue },
    { label: 'Horas por semana',    value: resumen?.horas_semana ?? 0,        sub: 'Carga programada total', accent: T.green, suffix: ' h' },
    { label: 'Checadas hoy',        value: resumen?.checadas_hoy ?? 0,        sub: `Semana: ${(resumen?.checadas_semana ?? 0).toLocaleString()}`, accent: T.amber },
    { label: 'Total histórico BD',  value: resumen?.checadas_total ?? 0,      sub: 'Desde 2025', accent: T.violet },
    { label: 'Programas activos',   value: resumen?.programas_activos ?? 0,   sub: 'Centro + Instituto', accent: T.red },
    { label: 'Docentes virtuales',  value: resumen?.docentes_virtuales ?? 0,  sub: 'Virtual o mixta', accent: T.orange },
  ]

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{
        background: T.bg,
        minHeight: '100%',
        padding: '22px 20px 52px',
        fontFamily: T.sans,
        color: T.text,
        backgroundImage: `radial-gradient(circle, rgba(34,211,238,0.06) 1px, transparent 1px)`,
        backgroundSize: '26px 26px',
      }}>
        <div style={{ maxWidth: 1300, margin: '0 auto' }}>

          {/* ── HEADER ──────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24,
            opacity: 0,
            animation: 'fadeUp 0.4s ease forwards',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <span style={{
                  fontFamily: T.mono, fontSize: 10, color: T.cyan,
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                }}>
                  NEXO · PANEL DE CONTROL
                </span>
                <span style={{
                  display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                  background: T.cyan,
                  animation: 'pulseDot 2s ease-in-out infinite',
                  boxShadow: `0 0 6px ${T.cyan}`,
                }} />
              </div>
              <h1 style={{
                fontFamily: T.display, fontSize: 26, fontWeight: 800,
                color: '#f0f9ff', margin: 0, letterSpacing: '-0.02em',
                lineHeight: 1,
              }}>
                Estadísticas
              </h1>
            </div>
            <SyncBadgeFull />
          </div>

          {/* ── KPI GRID ────────────────────────────────────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}>
            {kpis.map((k, i) => (
              <KpiCard key={i} {...k} index={i + 1} />
            ))}
            <QuincenasCard data={resumen?.quincenas} index={kpis.length + 1} />
          </div>

          {/* ── TENDENCIA CHECADAS ───────────────────────────────────────── */}
          <Panel title="Tendencia de checadas — últimas 4 semanas" delay={420} style={{ marginBottom: 14 }}>
            {checadasSemana.length === 0 ? (
              <p style={{ color: T.textMuted, textAlign: 'center', padding: '28px 0', fontFamily: T.mono, fontSize: 11 }}>
                SIN DATOS SUFICIENTES
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={checadasSemana} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={T.cyan} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={T.cyan} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={T.red} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={T.red} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.textDim} vertical={false} />
                  <XAxis dataKey="semana"
                    tick={{ fontSize: 10, fill: T.textMuted, fontFamily: T.mono }}
                    tickLine={false} axisLine={{ stroke: T.textDim }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: T.textMuted, fontFamily: T.mono }}
                    tickLine={false} axisLine={false} />
                  <Tooltip content={<DarkTip />} />
                  <Legend iconType="circle" iconSize={6}
                    wrapperStyle={{ fontSize: 10, fontFamily: T.mono, color: T.textMuted }} />
                  <Area type="monotone" dataKey="total" name="CHECADAS"
                    stroke={T.cyan} strokeWidth={2.5} fill="url(#gC)"
                    dot={false} activeDot={{ r: 4, fill: T.cyan, stroke: T.surface, strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="personas" name="PERSONAS"
                    stroke={T.red} strokeWidth={2} fill="url(#gP)"
                    dot={false} activeDot={{ r: 4, fill: T.red, stroke: T.surface, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* ── HORAS POR PROGRAMA + DOCENTES PIE ───────────────────────── */}
          <div className="stats-grid-3-2" style={{
            display: 'grid', gridTemplateColumns: '3fr 2fr',
            gap: 14, marginBottom: 14,
          }}>
            <Panel title="Horas semanales por programa" delay={520}>
              {topProgramas.length === 0 ? (
                <p style={{ color: T.textMuted, textAlign: 'center', padding: '28px 0', fontFamily: T.mono, fontSize: 11 }}>SIN DATOS</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topProgramas} layout="vertical"
                    margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.textDim} horizontal={false} />
                    <XAxis type="number"
                      tick={{ fontSize: 9.5, fill: T.textMuted, fontFamily: T.mono }}
                      tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="codigo" width={58}
                      tick={{ fontSize: 10.5, fill: T.text, fontFamily: T.mono }}
                      tickLine={false} axisLine={false} />
                    <Tooltip content={<DarkTip fmt={(v) => `${v} hrs`} />} />
                    <Bar dataKey="horas_semana" name="Hrs/sem" radius={[0, 4, 4, 0]} maxBarSize={18}>
                      {topProgramas.map((_, i) => (
                        <Cell key={i} fill={PROGRAM_COLORS[i % PROGRAM_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Docentes por programa" delay={580}>
              {porPrograma.length === 0 ? (
                <p style={{ color: T.textMuted, textAlign: 'center', padding: '28px 0', fontFamily: T.mono, fontSize: 11 }}>SIN DATOS</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie data={porPrograma} dataKey="docentes" nameKey="codigo"
                        cx="50%" cy="50%" outerRadius={76} innerRadius={40}
                        labelLine={false}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                          if (percent < 0.05) return null
                          const r = innerRadius + (outerRadius - innerRadius) * 0.5
                          const rad = Math.PI / 180
                          const x = cx + r * Math.cos(-midAngle * rad)
                          const y = cy + r * Math.sin(-midAngle * rad)
                          return (
                            <text x={x} y={y} fill="white" textAnchor="middle"
                              dominantBaseline="central" fontSize={9} fontWeight={700}
                              fontFamily={T.mono}>
                              {`${(percent * 100).toFixed(0)}%`}
                            </text>
                          )
                        }}>
                        {porPrograma.map((_, i) => (
                          <Cell key={i} fill={PROGRAM_COLORS[i % PROGRAM_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<DarkTip fmt={(v) => `${v} docentes`} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    overflowY: 'auto', maxHeight: 110,
                  }}>
                    {porPrograma.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                          background: PROGRAM_COLORS[i % PROGRAM_COLORS.length],
                        }} />
                        <span style={{ flex: 1, color: T.textMuted, fontFamily: T.mono, fontSize: 10 }}>
                          {p.codigo}
                        </span>
                        <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.text }}>
                          {p.docentes}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          </div>

          {/* ── EVALUACIÓN VIRTUAL + HISTORIAL QUINCENAS ────────────────── */}
          <div className="stats-grid-2" style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 14, marginBottom: 14,
          }}>
            <Panel title="Cumplimiento evaluación virtual" delay={640}>
              {evalVirtual.length === 0 ? (
                <p style={{ color: T.textMuted, textAlign: 'center', padding: '28px 0', fontFamily: T.mono, fontSize: 11 }}>SIN DATOS</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={evalVirtual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.textDim} />
                    <XAxis dataKey="ciclo"
                      tick={{ fontSize: 9, fill: T.textMuted, fontFamily: T.mono }}
                      tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 9, fill: T.textMuted, fontFamily: T.mono }}
                      tickLine={false} axisLine={false} />
                    <Tooltip content={<DarkTip />} />
                    <Legend iconType="circle" iconSize={6}
                      wrapperStyle={{ fontSize: 10, fontFamily: T.mono, color: T.textMuted }} />
                    <Bar dataKey="aprobadas"  name="APROBADAS"  fill={T.green} radius={[4,4,0,0]} maxBarSize={22} />
                    <Bar dataKey="rechazadas" name="RECHAZADAS" fill={T.red}   radius={[4,4,0,0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Historial de quincenas" delay={700}>
              {quincenas.length === 0 ? (
                <p style={{ color: T.textMuted, textAlign: 'center', padding: '28px 0', fontFamily: T.mono, fontSize: 11 }}>SIN DATOS</p>
              ) : (
                <div style={{ overflowY: 'auto', maxHeight: 240, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {quincenas.map((q) => (
                    <div key={q.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 6,
                      background: T.surface2, border: `1px solid ${T.textDim}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontFamily: T.display, fontSize: 11.5, fontWeight: 600,
                          color: T.text, margin: 0,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {q.ciclo_label || q.razon_social || 'Quincena'}
                        </p>
                        <p style={{
                          fontFamily: T.mono, fontSize: 10, color: T.textMuted,
                          margin: '2px 0 0',
                        }}>
                          {q.fecha_inicio} — {q.fecha_fin}
                        </p>
                      </div>
                      <EstadoBadge estado={q.estado} />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* ── TABLA DISTRIBUCIÓN POR PROGRAMA ─────────────────────────── */}
          <Panel title="Distribución detallada por programa" delay={760}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {[
                      { label: 'Programa',        align: 'left' },
                      { label: 'Docentes',         align: 'right' },
                      { label: 'Hrs / semana',     align: 'right' },
                      { label: 'Carga relativa',   align: 'left' },
                    ].map((h, i) => (
                      <th key={i} style={{
                        padding: '8px 12px', textAlign: h.align,
                        fontFamily: T.display, fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        color: T.textMuted, whiteSpace: 'nowrap',
                      }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porPrograma.map((p, i) => {
                    const pct = Math.round((p.horas_semana / maxHrs) * 100)
                    const color = PROGRAM_COLORS[i % PROGRAM_COLORS.length]
                    return (
                      <tr key={i} className="stats-row-hover" style={{
                        borderBottom: `1px solid ${T.textDim}`,
                        transition: 'background 0.12s',
                      }}>
                        <td style={{
                          padding: '10px 12px', fontFamily: T.sans,
                          fontSize: 13, color: T.text,
                        }}>
                          {p.programa}
                        </td>
                        <td style={{
                          padding: '10px 12px', textAlign: 'right',
                          fontFamily: T.mono, fontSize: 14,
                          fontWeight: 700, color: '#f0f9ff',
                        }}>
                          {p.docentes}
                        </td>
                        <td style={{
                          padding: '10px 12px', textAlign: 'right',
                          fontFamily: T.mono, fontSize: 12, color: T.textMuted,
                        }}>
                          {p.horas_semana}
                        </td>
                        <td style={{ padding: '10px 12px', minWidth: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              flex: 1, height: 3, borderRadius: 2,
                              background: T.textDim, overflow: 'hidden',
                            }}>
                              <div style={{
                                height: '100%', borderRadius: 2,
                                width: `${pct}%`,
                                background: `linear-gradient(90deg, ${color}, ${color}90)`,
                                boxShadow: `0 0 6px ${color}60`,
                              }} />
                            </div>
                            <span style={{
                              fontFamily: T.mono, fontSize: 9.5,
                              color: T.textMuted, width: 28, textAlign: 'right',
                            }}>
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
      </div>
    </>
  )
}
