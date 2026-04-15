import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import api from '../api/client'
import { SyncBadgeFull } from '../components/SyncBadge'

// ── Paleta ──────────────────────────────────────────────────────────────────
const C_RED    = '#8B1020'
const C_BLUE   = '#1e40af'
const C_TEAL   = '#0d9488'
const C_AMBER  = '#d97706'
const C_PURPLE = '#7c3aed'
const C_ROSE   = '#e11d48'

const PIE_COLORS = [C_RED, C_BLUE, C_TEAL, C_AMBER, C_PURPLE, C_ROSE,
  '#0891b2', '#65a30d', '#dc2626', '#7c3aed', '#ea580c', '#0284c7']

// ── Hooks ────────────────────────────────────────────────────────────────────
function useCounter(target, duration = 1200) {
  const [val, setVal] = useState(0)
  const frame = useRef(null)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    const start = performance.now()
    const animate = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(ease * target))
      if (p < 1) frame.current = requestAnimationFrame(animate)
    }
    frame.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration])
  return val
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color, prefix = '', suffix = '' }) {
  const displayed = useCounter(value)
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden"
      style={{ background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
      {/* Fondo decorativo */}
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-8"
        style={{ background: color, opacity: 0.08 }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
          {label}
        </span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div>
        <span className="text-3xl font-bold tracking-tight" style={{ color: '#111827' }}>
          {prefix}{displayed.toLocaleString()}{suffix}
        </span>
        {sub && <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── Tooltip personalizado ────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 shadow-xl text-xs"
      style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', minWidth: 140 }}>
      <p className="font-semibold mb-2 text-slate-300">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-bold ml-auto">{formatter ? formatter(p.value) : p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── Badge de estado quincena ──────────────────────────────────────────────────
const ESTADO_STYLE = {
  abierta:     { bg: '#dcfce7', color: '#15803d', label: 'Abierta' },
  en_revision: { bg: '#fef9c3', color: '#b45309', label: 'En revisión' },
  cerrada:     { bg: '#e0e7ff', color: '#3730a3', label: 'Cerrada' },
  pagada:      { bg: '#f3f4f6', color: '#374151', label: 'Pagada' },
}

function EstadoBadge({ estado }) {
  const s = ESTADO_STYLE[estado] || { bg: '#f3f4f6', color: '#374151', label: estado }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

// ── Label personalizado para PieChart ────────────────────────────────────────
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) {
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={10} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ── Sección con título ────────────────────────────────────────────────────────
function Section({ title, children, span = 1 }) {
  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-4`}
      style={{ background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
      <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#374151' }}>{title}</h3>
      {children}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Estadisticas() {
  const [resumen, setResumen] = useState(null)
  const [checadasSemana, setChecadasSemana] = useState([])
  const [porPrograma, setPorPrograma]       = useState([])
  const [quincenas, setQuincenas]           = useState([])
  const [evalVirtual, setEvalVirtual]       = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)

  useEffect(() => {
    const fetchAll = async () => {
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
    fetchAll()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
          style={{ borderColor: `${C_RED} transparent ${C_RED} ${C_RED}` }} />
        <p className="text-sm" style={{ color: '#6b7280' }}>Cargando estadísticas…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="rounded-xl p-4 text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
        Error al cargar estadísticas: {error}
      </div>
    </div>
  )

  const quincenasPie = resumen?.quincenas
    ? Object.entries(resumen.quincenas).map(([k, v]) => ({
        name: (ESTADO_STYLE[k]?.label || k),
        value: v,
      }))
    : []

  // Top 5 programas por horas para el BarChart (evita overflow)
  const topProgramas = [...porPrograma]
    .sort((a, b) => b.horas_semana - a.horas_semana)
    .slice(0, 8)

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-xl mx-auto">

      {/* ── Header ───────────────────────────────────────────────────────── */}
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

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Docentes activos"
          value={resumen?.docentes_activos ?? 0}
          sub="Registrados en el sistema"
          color={C_RED}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <KpiCard
          label="Asignaciones activas"
          value={resumen?.asignaciones_activas ?? 0}
          sub="Clases en horario vigente"
          color={C_BLUE}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <KpiCard
          label="Horas / semana"
          value={resumen?.horas_semana ?? 0}
          sub="Horas programadas totales"
          color={C_TEAL}
          suffix=" hrs"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <KpiCard
          label="Checadas hoy"
          value={resumen?.checadas_hoy ?? 0}
          sub={`Esta semana: ${(resumen?.checadas_semana ?? 0).toLocaleString()}`}
          color={C_AMBER}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* ── Segunda fila de KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total checadas BD"
          value={resumen?.checadas_total ?? 0}
          sub="Histórico desde 2025"
          color={C_PURPLE}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582 4 8 4m0 0c4.418 0 8-1.79 8-4" />
            </svg>
          }
        />
        <KpiCard
          label="Programas activos"
          value={resumen?.programas_activos ?? 0}
          sub="Centro + Instituto"
          color={C_ROSE}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <KpiCard
          label="Docentes virtuales"
          value={resumen?.docentes_virtuales ?? 0}
          sub="Con asignación virtual o mixta"
          color="#0891b2"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        {/* Quincenas por estado como mini-KPI */}
        <div className="rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden"
          style={{ background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full" style={{ background: '#65a30d', opacity: 0.08 }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>Quincenas</span>
          <div className="flex flex-col gap-1.5 mt-1">
            {Object.entries(resumen?.quincenas ?? {}).map(([k, v]) => {
              const s = ESTADO_STYLE[k] || { label: k, bg: '#f3f4f6', color: '#374151' }
              return (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: s.bg, color: s.color }}>{s.label}</span>
                  <span className="text-sm font-bold" style={{ color: '#111827' }}>{v}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Gráfico de tendencia de checadas ─────────────────────────────── */}
      <Section title="Tendencia de checadas — últimas 16 semanas">
        {checadasSemana.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#9ca3af' }}>Sin datos suficientes</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={checadasSemana} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C_RED}  stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C_RED}  stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPersonas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C_BLUE} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C_BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="total" name="Checadas" stroke={C_RED}
                strokeWidth={2.5} fill="url(#gradTotal)" dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="personas" name="Personas" stroke={C_BLUE}
                strokeWidth={2} fill="url(#gradPersonas)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* ── Fila: BarChart programas + PieChart quincenas ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

        {/* Bar: horas por programa */}
        <div className="md:col-span-3 rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#374151' }}>
            Horas semanales por programa
          </h3>
          {topProgramas.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#9ca3af' }}>Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProgramas} layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="codigo" tick={{ fontSize: 10, fill: '#374151' }}
                  tickLine={false} axisLine={false} width={60} />
                <Tooltip content={<CustomTooltip formatter={(v) => `${v} hrs`} />} />
                <Bar dataKey="horas_semana" name="Horas/sem" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {topProgramas.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie: docentes por programa */}
        <div className="md:col-span-2 rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#374151' }}>
            Docentes por programa
          </h3>
          {porPrograma.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#9ca3af' }}>Sin datos</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={porPrograma} dataKey="docentes" nameKey="codigo"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                    labelLine={false} label={<PieLabel />}>
                    {porPrograma.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip formatter={(v) => `${v} docentes`} />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Leyenda manual */}
              <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 120 }}>
                {porPrograma.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="truncate flex-1" style={{ color: '#374151' }}>{p.codigo}</span>
                    <span className="font-semibold tabular-nums" style={{ color: '#111827' }}>{p.docentes}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Evaluación virtual + Historial quincenas ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Evaluación virtual */}
        <Section title="Cumplimiento evaluación virtual">
          {evalVirtual.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#9ca3af' }}>
              Sin datos de evaluación virtual
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={evalVirtual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="ciclo" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="aprobadas"  name="Aprobadas"  fill={C_TEAL}  radius={[4,4,0,0]} maxBarSize={24} />
                <Bar dataKey="rechazadas" name="Rechazadas" fill={C_ROSE}  radius={[4,4,0,0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* Historial quincenas */}
        <Section title="Historial de quincenas">
          {quincenas.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#9ca3af' }}>Sin quincenas</p>
          ) : (
            <div className="overflow-y-auto space-y-1.5" style={{ maxHeight: 260 }}>
              {quincenas.map((q) => (
                <div key={q.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: '#1e293b' }}>
                      {q.ciclo_label || q.razon_social || 'Quincena'}
                    </p>
                    <p style={{ color: '#94a3b8' }}>
                      {q.fecha_inicio} — {q.fecha_fin}
                    </p>
                  </div>
                  <EstadoBadge estado={q.estado} />
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Tabla detallada programas ─────────────────────────────────────── */}
      <Section title="Distribución por programa">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                <th className="text-left py-2 pr-4 font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>Programa</th>
                <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>Docentes</th>
                <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>Horas/sem</th>
                <th className="py-2 pl-3 w-32 font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>Carga</th>
              </tr>
            </thead>
            <tbody>
              {porPrograma.map((p, i) => {
                const maxHrs = Math.max(...porPrograma.map(x => x.horas_semana), 1)
                const pct    = Math.round((p.horas_semana / maxHrs) * 100)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td className="py-2.5 pr-4 font-medium" style={{ color: '#374151' }}>{p.programa}</td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums" style={{ color: '#1e293b' }}>{p.docentes}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: '#6b7280' }}>{p.horas_semana}</td>
                    <td className="py-2.5 pl-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f1f5f9' }}>
                          <div className="h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        </div>
                        <span className="text-[10px] tabular-nums w-7 text-right" style={{ color: '#9ca3af' }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

    </div>
  )
}
