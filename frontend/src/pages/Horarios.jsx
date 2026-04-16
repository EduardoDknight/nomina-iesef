import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// ── Constantes ──────────────────────────────────────────────────────────────

const DIAS      = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const DIAS_LABEL = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb' }

// Paleta de colores para materias (se asigna por índice)
const PALETA = [
  'bg-blue-100 border-blue-400 text-blue-800',
  'bg-emerald-100 border-emerald-400 text-emerald-800',
  'bg-violet-100 border-violet-400 text-violet-800',
  'bg-amber-100 border-amber-400 text-amber-800',
  'bg-pink-100 border-pink-400 text-pink-800',
  'bg-cyan-100 border-cyan-400 text-cyan-800',
  'bg-orange-100 border-orange-400 text-orange-800',
  'bg-teal-100 border-teal-400 text-teal-800',
  'bg-indigo-100 border-indigo-400 text-indigo-800',
  'bg-rose-100 border-rose-400 text-rose-800',
]

const PROG_COLOR = {
  1: 'bg-yellow-100 border-yellow-400',
  2: 'bg-blue-100 border-blue-400',
  3: 'bg-green-100 border-green-400',
  4: 'bg-purple-100 border-purple-400',
  5: 'bg-orange-100 border-orange-400',
  6: 'bg-pink-100 border-pink-400',
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function toMin(hhmm) {
  if (!hhmm) return 0
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

function fromMin(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Autocomplete genérico ────────────────────────────────────────────────────

function Autocomplete({ value, onChange, options, placeholder, renderOption, getKey, getLabel, className = '' }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState(value ? (getLabel ? getLabel(options.find(o => getKey(o) === value)) : value) : '')
  const ref = useRef(null)

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => {
    const label = getLabel ? getLabel(o) : String(o)
    return label.toLowerCase().includes(query.toLowerCase())
  }).slice(0, 20)

  function select(opt) {
    const label = getLabel ? getLabel(opt) : String(opt)
    setQuery(label)
    onChange(opt)
    setOpen(false)
  }

  function handleInput(e) {
    setQuery(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange(null)
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input type="text" value={query} onChange={handleInput} onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-52 overflow-y-auto text-sm">
          {filtered.map(opt => (
            <li key={getKey ? getKey(opt) : opt}
              onMouseDown={() => select(opt)}
              className="px-3 py-1.5 cursor-pointer hover:bg-blue-50">
              {renderOption ? renderOption(opt) : (getLabel ? getLabel(opt) : String(opt))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Componentes compartidos ──────────────────────────────────────────────────

function BloqueTag({ bloque, onDelete, canEdit }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white border border-gray-300 font-mono">
      {DIAS_LABEL[bloque.dia]} {bloque.inicio}–{bloque.fin}
      <span className="text-gray-400">({bloque.horas_bloque}h)</span>
      {canEdit && (
        <button onClick={() => onDelete(bloque.id)}
          className="text-red-400 hover:text-red-600 ml-1 leading-none" title="Eliminar bloque">×</button>
      )}
    </span>
  )
}

function ModalAgregarBloque({ asignacion, onClose, onSaved }) {
  const [form, setForm] = useState({ dia_semana: 'lunes', hora_inicio: '08:00', hora_fin: '10:00' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const horas_bloque = (() => {
    const ini = toMin(form.hora_inicio), fin = toMin(form.hora_fin)
    return fin > ini ? Math.round((fin - ini) / 60) : 0
  })()

  async function guardar() {
    if (horas_bloque <= 0) { setError('Hora fin debe ser después de hora inicio'); return }
    setSaving(true); setError(null)
    try {
      await api.post('/catalogos/horarios', {
        asignacion_id: asignacion.asignacion_id,
        dia_semana: form.dia_semana,
        hora_inicio: form.hora_inicio,
        hora_fin: form.hora_fin,
        horas_bloque,
      })
      onSaved()
    } catch (e) { setError(e.response?.data?.detail || 'Error al guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-80">
        <h3 className="font-semibold text-gray-800 mb-3">Agregar bloque</h3>
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-medium">{asignacion.grupo}</span> — {asignacion.materia}
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Día</label>
            <select className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              value={form.dia_semana} onChange={e => setForm(f => ({...f, dia_semana: e.target.value}))}>
              {DIAS.map(d => <option key={d} value={d}>{DIAS_LABEL[d]}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            {['hora_inicio','hora_fin'].map(k => (
              <div key={k} className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">{k === 'hora_inicio' ? 'Inicio' : 'Fin'}</label>
                <input type="time" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  value={form[k]} onChange={e => setForm(f => ({...f, [k]: e.target.value}))} />
              </div>
            ))}
          </div>
          {horas_bloque > 0 && <p className="text-xs text-blue-600">{horas_bloque}h por sesión</p>}
        </div>
        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
          <button onClick={guardar} disabled={saving}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pestaña 1: Por Programa ──────────────────────────────────────────────────

function GrillaSemanal({ grupos }) {
  const celdas = {}
  for (const g of grupos) {
    for (const b of g.bloques) {
      const key = `${b.dia}-${b.inicio}`
      if (!celdas[key]) celdas[key] = []
      celdas[key].push({ materia: g.materia, grupo: g.grupo, fin: b.fin, horas: b.horas_bloque })
    }
  }
  const horas = [...new Set(grupos.flatMap(g => g.bloques.map(b => b.inicio)))].sort()
  if (!horas.length) return <p className="text-xs text-gray-400 italic mt-1">Sin bloques presenciales</p>

  return (
    <div className="overflow-x-auto mt-2">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="border border-gray-200 px-2 py-1 bg-gray-50 w-14">Hora</th>
            {DIAS.map(d => <th key={d} className="border border-gray-200 px-2 py-1 bg-gray-50 text-center w-20">{DIAS_LABEL[d]}</th>)}
          </tr>
        </thead>
        <tbody>
          {horas.map(h => (
            <tr key={h}>
              <td className="border border-gray-200 px-2 py-1 font-mono text-gray-500">{h}</td>
              {DIAS.map(d => {
                const cel = celdas[`${d}-${h}`]
                return (
                  <td key={d} className="border border-gray-200 px-1 py-1 align-top">
                    {cel?.map((c, i) => (
                      <div key={i} className="rounded px-1 py-0.5 bg-blue-50 border border-blue-200 mb-0.5 leading-tight">
                        <div className="font-medium truncate max-w-[80px]">{c.grupo}</div>
                        <div className="text-gray-500 truncate max-w-[80px]">{c.materia.split(' ').slice(0,2).join(' ')}</div>
                        <div className="text-gray-400">→{c.fin}</div>
                      </div>
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilaDocente({ docente, canEdit, onRefresh }) {
  const [expandido, setExpandido]   = useState(false)
  const [verGrilla, setVerGrilla]   = useState(false)
  const [modalAsig, setModalAsig]   = useState(null)

  async function eliminarBloque(id) {
    if (!confirm('¿Eliminar este bloque?')) return
    await api.delete(`/catalogos/horarios/${id}`).catch(() => alert('Error'))
    onRefresh()
  }
  async function eliminarAsignacion(id) {
    if (!confirm('¿Eliminar esta asignación completa?')) return
    await api.delete(`/catalogos/asignaciones/${id}`).catch(() => alert('Error'))
    onRefresh()
  }

  const totalBloques = docente.grupos.reduce((s, g) => s + g.bloques.length, 0)

  return (
    <div className="border border-gray-200 rounded-lg mb-2">
      <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => setExpandido(e => !e)}>
        <span className="text-gray-400 text-xs w-4">{expandido ? '▼' : '▶'}</span>
        <span className="font-medium text-gray-800 flex-1 text-sm">{docente.docente_nombre}</span>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{Math.round(docente.total_horas_semana)}h/sem</span>
        <span className="text-xs text-gray-400">{docente.grupos.length} grupos · {totalBloques} bloques</span>
      </div>

      {expandido && (
        <div className="border-t border-gray-100 px-4 pb-3 pt-2">
          <button onClick={() => setVerGrilla(v => !v)} className="text-xs text-blue-600 hover:underline mb-2">
            {verGrilla ? 'Ocultar grilla semanal' : 'Ver grilla semanal'}
          </button>
          {verGrilla && <GrillaSemanal grupos={docente.grupos} />}
          <div className="mt-2 space-y-2">
            {docente.grupos.map(g => (
              <div key={g.asignacion_id} className="bg-gray-50 rounded p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-700">{g.grupo}</span>
                      <span className="text-xs text-gray-500 truncate">{g.materia}</span>
                      <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">{g.horas_semana}h/sem</span>
                      <span className="text-xs text-gray-400">${g.tarifa}/h</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {g.bloques.length === 0
                        ? <span className="text-xs text-red-400 italic">Sin bloques definidos</span>
                        : g.bloques.map(b => (
                          <BloqueTag key={b.id} bloque={b} onDelete={eliminarBloque} canEdit={canEdit} />
                        ))
                      }
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setModalAsig(g)}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">+ Bloque</button>
                      <button onClick={() => eliminarAsignacion(g.asignacion_id)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100">Eliminar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {modalAsig && (
        <ModalAgregarBloque asignacion={modalAsig} onClose={() => setModalAsig(null)}
          onSaved={() => { setModalAsig(null); onRefresh() }} />
      )}
    </div>
  )
}

function TabPorPrograma({ canEdit }) {
  const [programas,        setProgramas]        = useState([])
  const [progSeleccionado, setProgSeleccionado] = useState(null)
  const [cicloLabel,       setCicloLabel]       = useState('')
  const [ciclosDisp,       setCiclosDisp]       = useState([])
  const [docentes,         setDocentes]         = useState([])
  const [busqueda,         setBusqueda]         = useState('')
  const [loading,          setLoading]          = useState(false)

  useEffect(() => {
    api.get('/catalogos/programas').then(r => {
      const progs = r.data.filter(p => p.activo && p.id !== 7)
      setProgramas(progs)
      if (progs.length) setProgSeleccionado(progs[0].id)
    })
    api.get('/quincenas/ciclos-disponibles').then(r => {
      setCiclosDisp(r.data)
      if (r.data.length > 0) setCicloLabel(r.data[0])
    }).catch(() => {})
  }, [])

  useEffect(() => { if (progSeleccionado) cargar() }, [progSeleccionado, cicloLabel])

  async function cargar() {
    setLoading(true)
    try {
      const r = await api.get('/catalogos/asignaciones/por-programa', {
        params: { programa_id: progSeleccionado, ciclo: cicloLabel || undefined }
      })
      setDocentes(r.data)
    } finally { setLoading(false) }
  }

  const docentesFiltrados = docentes.filter(d =>
    !busqueda || d.docente_nombre.toLowerCase().includes(busqueda.toLowerCase())
  )
  const prog = programas.find(p => p.id === progSeleccionado)

  return (
    <div>
      {/* Ciclo selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Ciclo</span>
        {ciclosDisp.length > 0 ? (
          <select value={cicloLabel} onChange={e => setCicloLabel(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="">Todos los ciclos</option>
            {ciclosDisp.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input type="text" value={cicloLabel} onChange={e => setCicloLabel(e.target.value)}
            placeholder="Ej. 2026-1" className="border border-gray-300 rounded px-2 py-1 text-sm w-24" />
        )}
      </div>

      {/* Pestañas de programa */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {programas.map(p => (
          <button key={p.id} onClick={() => setProgSeleccionado(p.id)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              progSeleccionado === p.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {p.codigo || p.nombre.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Cabecera programa */}
      {prog && (
        <div className={`rounded-lg border p-3 mb-4 flex items-center gap-4 ${PROG_COLOR[prog.id] || 'bg-gray-100 border-gray-300'}`}>
          <div className="flex-1">
            <span className="font-semibold text-gray-800">{prog.nombre}</span>
            <span className="ml-2 text-sm text-gray-600">${prog.costo_hora}/h · {prog.plan}</span>
          </div>
          <span className="text-sm text-gray-600">
            {docentesFiltrados.length} docentes · {docentesFiltrados.reduce((s, d) => s + d.grupos.length, 0)} grupos
          </span>
        </div>
      )}

      <input type="text" placeholder="Buscar docente..." value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3" />

      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : docentesFiltrados.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          {busqueda ? 'Sin resultados para esa búsqueda' : 'No hay horarios para este programa/ciclo'}
        </div>
      ) : (
        docentesFiltrados.map(d => (
          <FilaDocente key={`${d.docente_id}-${d.programa_id}`}
            docente={d} canEdit={canEdit} onRefresh={cargar} />
        ))
      )}
    </div>
  )
}

// ── Pestaña 2: Por Grupo — Grilla visual ─────────────────────────────────────

/**
 * Construye la estructura de la grilla con rowspan y detección de conflictos.
 * Retorna: { slots, grid }
 *   slots: string[]  (ej. ['07:00','07:30','08:00',...])
 *   grid:  { [dia]: { [slotIdx]: CeldaInfo | 'skip' | null } }
 *
 * CeldaInfo: { asig, bloque, span, conflict }
 */
function buildGrid(asignaciones) {
  // Recopilar todos los tiempos de inicio/fin → slots cada 30 min
  let minMin = 7 * 60, maxMin = 22 * 60
  for (const a of asignaciones) {
    for (const b of a.bloques) {
      const ini = toMin(b.inicio), fin = toMin(b.fin)
      if (ini < minMin) minMin = ini
      if (fin > maxMin) maxMin = fin
    }
  }
  // Redondear al múltiplo de 30 más cercano
  minMin = Math.floor(minMin / 30) * 30
  maxMin = Math.ceil(maxMin / 30) * 30

  const slots = []
  for (let m = minMin; m < maxMin; m += 30) slots.push(fromMin(m))

  // Inicializar grilla vacía
  const grid = {}
  for (const dia of DIAS) {
    grid[dia] = {}
    for (let i = 0; i < slots.length; i++) grid[dia][i] = null
  }

  // Asignar asignacion+color
  const colorMap = {}
  let colorIdx = 0
  for (const a of asignaciones) {
    if (!colorMap[a.asignacion_id]) {
      colorMap[a.asignacion_id] = PALETA[colorIdx % PALETA.length]
      colorIdx++
    }
  }

  // Llenar grilla
  for (const a of asignaciones) {
    for (const b of a.bloques) {
      const startMin = toMin(b.inicio)
      const endMin   = toMin(b.fin)
      const startIdx = slots.indexOf(b.inicio)
      if (startIdx < 0) continue
      const span = Math.max(1, Math.round((endMin - startMin) / 30))

      const existing = grid[b.dia][startIdx]
      if (existing !== null && existing !== 'skip') {
        // Conflicto — marcar ambos
        existing.conflict = true
        grid[b.dia][startIdx] = { ...existing, conflict: true }
        // Agregar el nuevo como conflicto en una lista
        if (!existing.extras) existing.extras = []
        existing.extras.push({ asig: a, bloque: b, color: colorMap[a.asignacion_id] })
      } else if (existing === null) {
        grid[b.dia][startIdx] = {
          asig:  a,
          bloque: b,
          span,
          conflict: false,
          color: colorMap[a.asignacion_id],
          extras: [],
        }
        for (let j = 1; j < span && startIdx + j < slots.length; j++) {
          if (grid[b.dia][startIdx + j] === null) {
            grid[b.dia][startIdx + j] = 'skip'
          }
        }
      }
    }
  }

  return { slots, grid }
}

function CeldaClase({ asig, bloque, conflict, color, extras = [], canEdit, onDeleteBloque }) {
  const [hover, setHover] = useState(false)

  return (
    <div className="relative h-full" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={`rounded px-1.5 py-1 border leading-tight h-full ${
        conflict ? 'bg-red-50 border-red-300' : color
      }`}>
        <div className="font-semibold truncate pr-3">{asig.materia.split(' ').slice(0,3).join(' ')}</div>
        <div className="text-gray-600 truncate text-[10px]">{asig.docente.split(' ').slice(-2).join(' ')}</div>
        <div className="text-gray-400 text-[10px]">{bloque.inicio}–{bloque.fin}</div>
        {conflict && <div className="text-red-600 text-[10px] font-bold">⚠ CONFLICTO</div>}
      </div>

      {/* Botón eliminar bloque (hover) */}
      {canEdit && hover && (
        <button
          onClick={e => { e.stopPropagation(); onDeleteBloque(bloque.id) }}
          className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] leading-none hover:bg-red-600 z-10"
          title="Eliminar este bloque"
        >×</button>
      )}

      {/* Conflictos extras */}
      {extras.map((ex, ei) => (
        <div key={ei} className="rounded px-1.5 py-1 border border-red-300 bg-red-50 leading-tight mt-0.5">
          <div className="font-semibold truncate text-[10px]">{ex.asig.materia.split(' ').slice(0,3).join(' ')}</div>
          <div className="text-gray-500 truncate text-[10px]">{ex.asig.docente.split(' ').slice(-2).join(' ')}</div>
        </div>
      ))}
    </div>
  )
}

function GrillaGrupo({ asignaciones, canEdit, onRefresh }) {
  const { slots, grid } = useMemo(() => buildGrid(asignaciones), [asignaciones])

  const numConflictos = DIAS.reduce((total, dia) =>
    total + slots.reduce((t, _, i) => {
      const c = grid[dia][i]
      return t + (c && c !== 'skip' && c.conflict ? 1 : 0)
    }, 0), 0)

  async function handleDeleteBloque(bloqueId) {
    if (!confirm('¿Eliminar este bloque de horario?')) return
    try {
      await api.delete(`/catalogos/horarios/${bloqueId}`)
      onRefresh()
    } catch { alert('Error al eliminar') }
  }

  if (!slots.length) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">No hay bloques de horario cargados para este grupo.</p>
        <p className="text-xs mt-1">Usa la pestaña "Por Programa" para agregar bloques manualmente.</p>
      </div>
    )
  }

  return (
    <div>
      {numConflictos > 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span><strong>{numConflictos} conflicto{numConflictos > 1 ? 's' : ''}</strong> — dos clases ocupan el mismo horario</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full min-w-[580px]">
          <thead>
            <tr>
              <th className="border border-gray-200 px-2 py-1.5 bg-gray-50 text-gray-500 font-medium w-16 sticky left-0 z-10">Hora</th>
              {DIAS.map(d => (
                <th key={d} className="border border-gray-200 px-2 py-1.5 bg-gray-50 text-center text-gray-600 font-medium">
                  {DIAS_LABEL[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, slotIdx) => (
              <tr key={slot} className={slotIdx % 2 === 0 ? '' : 'bg-gray-50/30'}>
                <td className="border border-gray-200 px-2 font-mono text-gray-400 text-center sticky left-0 bg-white z-10 text-[10px] h-7">
                  {slot}
                </td>
                {DIAS.map(dia => {
                  const celda = grid[dia][slotIdx]
                  if (celda === 'skip') return null
                  if (celda === null) return <td key={dia} className="border border-gray-100 h-7" />
                  const { asig, bloque, span, conflict, color, extras } = celda
                  return (
                    <td key={dia} rowSpan={span}
                      className={`border ${conflict ? 'border-red-200' : 'border-gray-200'} p-1 align-top`}>
                      <CeldaClase asig={asig} bloque={bloque} conflict={conflict}
                        color={color} extras={extras} canEdit={canEdit}
                        onDeleteBloque={handleDeleteBloque} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-gray-400">
        <span>{asignaciones.length} materias</span>
        <span>{asignaciones.reduce((s, a) => s + a.horas_semana, 0)}h/sem programadas</span>
        {numConflictos === 0 && <span className="text-emerald-600">Sin conflictos</span>}
      </div>
    </div>
  )
}

function ModalNuevaMateria({ grupo, programaId, cicloLabel, onClose, onSaved }) {
  // Datos para autocomplete
  const [materias,  setMaterias]  = useState([])
  const [docentes,  setDocentes]  = useState([])

  // Selecciones
  const [materiaId,   setMateriaId]   = useState(null)   // int o null
  const [materiaNombre, setMateriaNombre] = useState('')  // para crear nueva
  const [docenteId,   setDocenteId]   = useState(null)
  const [horasSemana, setHorasSemana] = useState(2)
  const [modalidad,   setModalidad]   = useState('presencial')
  const [bloques,     setBloques]     = useState([
    { dia: 'lunes', hora_inicio: '08:00', hora_fin: '10:00' }
  ])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    api.get('/catalogos/materias', { params: { programa_id: programaId } })
      .then(r => setMaterias(r.data))
    api.get('/docentes', { params: { activos: true } })
      .then(r => setDocentes(r.data))
  }, [programaId])

  function addBloque() {
    setBloques(b => [...b, { dia: 'lunes', hora_inicio: '08:00', hora_fin: '10:00' }])
  }
  function removeBloque(i) {
    setBloques(b => b.filter((_, idx) => idx !== i))
  }
  function updateBloque(i, field, val) {
    setBloques(b => b.map((bl, idx) => idx === i ? { ...bl, [field]: val } : bl))
  }

  async function guardar() {
    if (!docenteId) { setError('Selecciona un docente'); return }
    if (!materiaId && !materiaNombre.trim()) { setError('Selecciona o escribe el nombre de la materia'); return }
    if (bloques.length === 0) { setError('Agrega al menos un bloque de horario'); return }

    setSaving(true); setError('')
    try {
      let mId = materiaId

      // Crear materia si no existe
      if (!mId) {
        const r = await api.post('/catalogos/materias', {
          nombre: materiaNombre.trim(),
          programa_id: programaId,
        })
        mId = r.data.id
      }

      // Calcular horas_semana desde los bloques
      const horasTotal = bloques.reduce((s, b) => {
        const [hI, mI] = b.hora_inicio.split(':').map(Number)
        const [hF, mF] = b.hora_fin.split(':').map(Number)
        return s + Math.round(((hF * 60 + mF) - (hI * 60 + mI)) / 60)
      }, 0)

      // Crear asignacion
      const asig = await api.post('/catalogos/asignaciones', {
        docente_id:   docenteId,
        materia_id:   mId,
        grupo,
        horas_semana: horasSemana || horasTotal,
        modalidad,
        ciclo:        cicloLabel || '2026-1',
        vigente_desde: new Date().toISOString().slice(0, 10),
      })

      // Crear bloques
      for (const b of bloques) {
        const ini = b.hora_inicio.split(':').map(Number)
        const fin = b.hora_fin.split(':').map(Number)
        const horas = Math.round(((fin[0]*60+fin[1]) - (ini[0]*60+ini[1])) / 60)
        await api.post('/catalogos/horarios', {
          asignacion_id: asig.data.id,
          dia_semana:    b.dia,
          hora_inicio:   b.hora_inicio,
          hora_fin:      b.hora_fin,
          horas_bloque:  horas,
        })
      }

      onSaved()
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al crear la materia')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800">Nueva materia</h3>
            <p className="text-xs text-gray-400 mt-0.5">Grupo: <span className="font-medium text-gray-600">{grupo}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Materia */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Materia</label>
            <Autocomplete
              value={materiaId}
              options={materias}
              placeholder="Buscar materia o escribir nueva..."
              getKey={m => m.id}
              getLabel={m => m?.nombre || ''}
              renderOption={m => <span>{m.nombre}</span>}
              onChange={opt => {
                if (opt) { setMateriaId(opt.id); setMateriaNombre(opt.nombre) }
                else     { setMateriaId(null);   setMateriaNombre('') }
              }}
            />
            {!materiaId && materiaNombre.trim() && (
              <p className="text-xs text-amber-600 mt-1">
                Se creará la materia "<strong>{materiaNombre.trim()}</strong>" en este programa.
              </p>
            )}
          </div>

          {/* Docente */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Docente</label>
            <Autocomplete
              value={docenteId}
              options={docentes}
              placeholder="Buscar docente..."
              getKey={d => d.id}
              getLabel={d => d?.nombre_completo || ''}
              renderOption={d => (
                <span>
                  {d.nombre_completo}
                  <span className="ml-2 text-gray-400 text-xs">#{d.numero_docente}</span>
                </span>
              )}
              onChange={opt => setDocenteId(opt?.id || null)}
            />
          </div>

          {/* Modalidad + Horas */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Modalidad</label>
              <select value={modalidad} onChange={e => setModalidad(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
                <option value="mixta">Mixta</option>
              </select>
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1">Horas/semana</label>
              <input type="number" min={1} step={1} value={horasSemana}
                onChange={e => setHorasSemana(parseInt(e.target.value, 10) || 0)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
            </div>
          </div>

          {/* Bloques */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Bloques de horario</label>
              <button onClick={addBloque}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Agregar día</button>
            </div>
            <div className="space-y-2">
              {bloques.map((b, i) => {
                const ini = b.hora_inicio.split(':').map(Number)
                const fin = b.hora_fin.split(':').map(Number)
                const horas = ((fin[0]*60+fin[1]) - (ini[0]*60+ini[1])) / 60
                return (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <select value={b.dia} onChange={e => updateBloque(i, 'dia', e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-xs bg-white w-24">
                      {DIAS.map(d => <option key={d} value={d}>{DIAS_LABEL[d]}</option>)}
                    </select>
                    <input type="time" value={b.hora_inicio}
                      onChange={e => updateBloque(i, 'hora_inicio', e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-xs bg-white w-24" />
                    <span className="text-gray-300 text-xs">→</span>
                    <input type="time" value={b.hora_fin}
                      onChange={e => updateBloque(i, 'hora_fin', e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-xs bg-white w-24" />
                    {horas > 0 && (
                      <span className="text-xs text-gray-400 w-10 shrink-0">{horas}h</span>
                    )}
                    {bloques.length > 1 && (
                      <button onClick={() => removeBloque(i)}
                        className="ml-auto text-red-400 hover:text-red-600 text-sm leading-none">×</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
          <button onClick={guardar} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {saving ? 'Creando...' : 'Crear materia'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalRenombrar({ grupoActual, cicloLabel, onClose, onSaved }) {
  const [nombre, setNombre] = useState(grupoActual)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function guardar() {
    if (!nombre.trim() || nombre.trim() === grupoActual) { onClose(); return }
    setSaving(true); setError('')
    try {
      await api.patch('/catalogos/grupos/renombrar', null, {
        params: { grupo_actual: grupoActual, grupo_nuevo: nombre.trim(), ciclo_label: cicloLabel || undefined }
      })
      onSaved(nombre.trim())
    } catch (e) { setError(e.response?.data?.detail || 'Error al renombrar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-5 w-72">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">Renombrar grupo</h3>
        <input autoFocus type="text" value={nombre} onChange={e => setNombre(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && guardar()}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-2" />
        {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
          <button onClick={guardar} disabled={saving}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Renombrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TabPorGrupo({ canEdit }) {
  const [programas,     setProgramas]     = useState([])
  const [progSel,       setProgSel]       = useState(null)   // REQUERIDO — no hay "Todos"
  const [cicloLabel,    setCicloLabel]    = useState('')
  const [ciclosDisp,    setCiclosDisp]    = useState([])
  const [grupos,        setGrupos]        = useState([])
  const [grupoSel,      setGrupoSel]      = useState('')
  const [asignaciones,  setAsignaciones]  = useState([])
  const [loadingGrilla, setLoadingGrilla] = useState(false)
  const [modalRenombrar,   setModalRenombrar]   = useState(false)
  const [modalNuevaMateria, setModalNuevaMateria] = useState(false)

  useEffect(() => {
    api.get('/catalogos/programas').then(r => {
      const progs = r.data.filter(p => p.activo && p.id !== 7)
      setProgramas(progs)
      if (progs.length) setProgSel(progs[0].id)
    })
    api.get('/quincenas/ciclos-disponibles').then(r => {
      setCiclosDisp(r.data)
      if (r.data.length > 0) setCicloLabel(r.data[0])
    }).catch(() => {})
  }, [])

  // Cargar grupos del programa seleccionado
  useEffect(() => {
    if (!progSel) return
    setGrupoSel('')
    setAsignaciones([])
    api.get('/catalogos/grupos-lista', {
      params: { programa_id: progSel, ciclo_label: cicloLabel || undefined }
    }).then(r => {
      setGrupos(r.data)
      if (r.data.length > 0) setGrupoSel(r.data[0].grupo)
    }).catch(() => setGrupos([]))
  }, [progSel, cicloLabel])

  // Cargar grilla del grupo
  function cargarGrilla(g) {
    if (!g) { setAsignaciones([]); return }
    setLoadingGrilla(true)
    api.get('/catalogos/horarios/por-grupo', {
      params: { grupo: g, ciclo_label: cicloLabel || undefined }
    }).then(r => setAsignaciones(r.data))
    .catch(() => setAsignaciones([]))
    .finally(() => setLoadingGrilla(false))
  }

  useEffect(() => { cargarGrilla(grupoSel) }, [grupoSel])

  async function eliminarGrupo() {
    if (!confirm(`¿Eliminar el grupo "${grupoSel}" y todas sus clases? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete('/catalogos/grupos', { params: { grupo: grupoSel, ciclo_label: cicloLabel || undefined } })
      setGrupoSel('')
      setAsignaciones([])
      // Recargar lista de grupos
      const r = await api.get('/catalogos/grupos-lista', {
        params: { programa_id: progSel, ciclo_label: cicloLabel || undefined }
      })
      setGrupos(r.data)
      if (r.data.length > 0) setGrupoSel(r.data[0].grupo)
    } catch (e) { alert(e.response?.data?.detail || 'Error al eliminar') }
  }

  const progActual = programas.find(p => p.id === progSel)

  return (
    <div>
      {/* Paso 1 — Seleccionar programa */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Programa</p>
        <div className="flex gap-1.5 flex-wrap">
          {programas.map(p => (
            <button key={p.id} onClick={() => setProgSel(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                progSel === p.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}>
              {p.codigo || p.nombre.split(' ')[0]}
            </button>
          ))}
          {/* Ciclo selector inline */}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Ciclo</span>
            {ciclosDisp.length > 0 ? (
              <select value={cicloLabel} onChange={e => setCicloLabel(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1.5 text-xs">
                {ciclosDisp.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input type="text" value={cicloLabel} onChange={e => setCicloLabel(e.target.value)}
                placeholder="2026-1" className="border border-gray-200 rounded px-2 py-1.5 text-xs w-20" />
            )}
          </div>
        </div>
      </div>

      {/* Paso 2 — Seleccionar grupo del programa */}
      {progSel && (
        <div className="mb-4">
          <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
            Grupo — {progActual?.nombre}
          </p>
          {grupos.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No hay grupos registrados para este programa/ciclo.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {grupos.map(g => (
                <button key={g.grupo} onClick={() => setGrupoSel(g.grupo)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                    grupoSel === g.grupo
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-slate-400'
                  }`}>
                  {g.grupo}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cabecera del grupo + acciones */}
      {grupoSel && (
        <div className="flex items-center gap-2 mb-4 py-2 border-b border-gray-100">
          <span className="font-semibold text-gray-700">{grupoSel}</span>
          <span className="text-xs text-gray-400">· {progActual?.nombre}</span>
          {canEdit && (
            <div className="ml-auto flex gap-2">
              <button onClick={() => setModalNuevaMateria(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nueva materia
              </button>
              <button onClick={() => setModalRenombrar(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Renombrar
              </button>
              <button onClick={eliminarGrupo}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Eliminar grupo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grilla */}
      {!grupoSel ? (
        <div className="text-center py-16 text-gray-300">
          <svg className="w-10 h-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-400">Selecciona un programa y luego un grupo</p>
        </div>
      ) : loadingGrilla ? (
        <div className="text-center py-12 text-gray-400 text-sm">Cargando grilla...</div>
      ) : (
        <GrillaGrupo asignaciones={asignaciones} canEdit={canEdit}
          onRefresh={() => cargarGrilla(grupoSel)} />
      )}

      {modalRenombrar && (
        <ModalRenombrar
          grupoActual={grupoSel}
          cicloLabel={cicloLabel}
          onClose={() => setModalRenombrar(false)}
          onSaved={async (nuevoNombre) => {
            setModalRenombrar(false)
            setGrupoSel(nuevoNombre)
            const r = await api.get('/catalogos/grupos-lista', {
              params: { programa_id: progSel, ciclo_label: cicloLabel || undefined }
            })
            setGrupos(r.data)
          }}
        />
      )}

      {modalNuevaMateria && grupoSel && (
        <ModalNuevaMateria
          grupo={grupoSel}
          programaId={progSel}
          cicloLabel={cicloLabel}
          onClose={() => setModalNuevaMateria(false)}
          onSaved={() => {
            setModalNuevaMateria(false)
            cargarGrilla(grupoSel)
          }}
        />
      )}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function Horarios() {
  const { usuario } = useAuth()
  const [tab, setTab]       = useState('programa')
  const canEdit = ['superadmin', 'director_cap_humano', 'cap_humano',
                   'coord_docente', 'servicios_escolares'].includes(usuario?.rol)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">Horarios</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Fuente: PDF aSc de Coord. Docente · Editable para correcciones manuales
        </p>
      </div>

      {/* Pestañas principales */}
      <div className="flex border-b border-gray-200 mb-5">
        {[
          { key: 'programa', label: 'Por Programa', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
          { key: 'grupo',    label: 'Por Grupo',    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'programa' && <TabPorPrograma canEdit={canEdit} />}
      {tab === 'grupo'    && <TabPorGrupo canEdit={canEdit} />}
    </div>
  )
}
