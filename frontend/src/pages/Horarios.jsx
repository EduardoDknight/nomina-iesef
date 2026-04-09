import { useState, useEffect } from 'react'
import api from '../api/client'

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const DIAS_LABEL = { lunes: 'L', martes: 'M', miercoles: 'X', jueves: 'J', viernes: 'V', sabado: 'S' }
const PROG_COLOR = {
  1: 'bg-yellow-100 border-yellow-400',
  2: 'bg-blue-100 border-blue-400',
  3: 'bg-green-100 border-green-400',
  4: 'bg-purple-100 border-purple-400',
  5: 'bg-orange-100 border-orange-400',
  6: 'bg-pink-100 border-pink-400',
}

function BloqueTag({ bloque, onDelete, canEdit }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white border border-gray-300 font-mono">
      {DIAS_LABEL[bloque.dia]} {bloque.inicio}-{bloque.fin}
      <span className="text-gray-400">({bloque.horas_bloque}h)</span>
      {canEdit && (
        <button
          onClick={() => onDelete(bloque.id)}
          className="text-red-400 hover:text-red-600 ml-1 leading-none"
          title="Eliminar bloque"
        >×</button>
      )}
    </span>
  )
}

function GrillaSemanal({ grupos }) {
  // Construir grid por hora para visualización
  const celdas = {} // "dia-HH" → [texto]
  for (const g of grupos) {
    for (const b of g.bloques) {
      const key = `${b.dia}-${b.inicio}`
      if (!celdas[key]) celdas[key] = []
      celdas[key].push({ materia: g.materia, grupo: g.grupo, fin: b.fin, horas: b.horas_bloque })
    }
  }

  // Horas únicas
  const horas = [...new Set(
    grupos.flatMap(g => g.bloques.map(b => b.inicio))
  )].sort()

  if (!horas.length) return <p className="text-xs text-gray-400 italic">Sin bloques presenciales</p>

  return (
    <div className="overflow-x-auto mt-2">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="border border-gray-200 px-2 py-1 bg-gray-50 w-14">Hora</th>
            {DIAS.map(d => (
              <th key={d} className="border border-gray-200 px-2 py-1 bg-gray-50 text-center w-20">
                {DIAS_LABEL[d]}
              </th>
            ))}
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

function ModalAgregarBloque({ asignacion, onClose, onSaved }) {
  const [form, setForm] = useState({
    dia_semana: 'lunes', hora_inicio: '08:00', hora_fin: '10:00'
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const horas_bloque = (() => {
    const [hh, mm] = form.hora_inicio.split(':').map(Number)
    const [hh2, mm2] = form.hora_fin.split(':').map(Number)
    return Math.round((hh2 * 60 + mm2 - (hh * 60 + mm)) / 60 * 100) / 100
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
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-80">
        <h3 className="font-semibold text-gray-800 mb-4">Agregar bloque</h3>
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-medium">{asignacion.grupo}</span> — {asignacion.materia}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Día</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              value={form.dia_semana}
              onChange={e => setForm(f => ({...f, dia_semana: e.target.value}))}
            >
              {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Inicio</label>
              <input type="time" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                value={form.hora_inicio}
                onChange={e => setForm(f => ({...f, hora_inicio: e.target.value}))} />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Fin</label>
              <input type="time" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                value={form.hora_fin}
                onChange={e => setForm(f => ({...f, hora_fin: e.target.value}))} />
            </div>
          </div>
          {horas_bloque > 0 && (
            <p className="text-xs text-blue-600">{horas_bloque}h por sesión</p>
          )}
        </div>

        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">
            Cancelar
          </button>
          <button
            onClick={guardar} disabled={saving}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FilaDocente({ docente, canEdit, onRefresh }) {
  const [expandido, setExpandido] = useState(false)
  const [verGrilla, setVerGrilla] = useState(false)
  const [modalAsig, setModalAsig] = useState(null) // asignacion para agregar bloque

  async function eliminarBloque(bloqueId) {
    if (!confirm('¿Eliminar este bloque?')) return
    try {
      await api.delete(`/catalogos/horarios/${bloqueId}`)
      onRefresh()
    } catch {
      alert('Error al eliminar bloque')
    }
  }

  async function eliminarAsignacion(asigId) {
    if (!confirm('¿Eliminar esta asignación completa?')) return
    try {
      await api.delete(`/catalogos/asignaciones/${asigId}`)
      onRefresh()
    } catch {
      alert('Error al eliminar asignación')
    }
  }

  const totalBloques = docente.grupos.reduce((s, g) => s + g.bloques.length, 0)

  return (
    <div className="border border-gray-200 rounded-lg mb-2">
      {/* Cabecera docente */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => setExpandido(e => !e)}
      >
        <span className="text-gray-400 text-xs w-4">{expandido ? '▼' : '▶'}</span>
        <span className="font-medium text-gray-800 flex-1 text-sm">{docente.docente_nombre}</span>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {Math.round(docente.total_horas_semana)}h/sem
        </span>
        <span className="text-xs text-gray-400">
          {docente.grupos.length} grupos · {totalBloques} bloques
        </span>
      </div>

      {expandido && (
        <div className="border-t border-gray-100 px-4 pb-3 pt-2">
          {/* Toggle grilla */}
          <button
            onClick={() => setVerGrilla(v => !v)}
            className="text-xs text-blue-600 hover:underline mb-2"
          >
            {verGrilla ? 'Ocultar grilla semanal' : 'Ver grilla semanal'}
          </button>

          {verGrilla && <GrillaSemanal grupos={docente.grupos} />}

          {/* Lista de asignaciones */}
          <div className="mt-2 space-y-2">
            {docente.grupos.map(g => (
              <div key={g.asignacion_id} className="bg-gray-50 rounded p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-700">{g.grupo}</span>
                      <span className="text-xs text-gray-500 truncate">{g.materia}</span>
                      <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">
                        {g.horas_semana}h/sem
                      </span>
                      <span className="text-xs text-gray-400">${g.tarifa}/h</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {g.bloques.length === 0
                        ? <span className="text-xs text-red-400 italic">Sin bloques definidos</span>
                        : g.bloques.map(b => (
                          <BloqueTag
                            key={b.id} bloque={b}
                            onDelete={eliminarBloque}
                            canEdit={canEdit}
                          />
                        ))
                      }
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setModalAsig(g)}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                        title="Agregar bloque"
                      >+ Bloque</button>
                      <button
                        onClick={() => eliminarAsignacion(g.asignacion_id)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100"
                        title="Eliminar asignación"
                      >Eliminar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalAsig && (
        <ModalAgregarBloque
          asignacion={modalAsig}
          onClose={() => setModalAsig(null)}
          onSaved={() => { setModalAsig(null); onRefresh() }}
        />
      )}
    </div>
  )
}

export default function Horarios() {
  const [programas, setProgramas] = useState([])
  const [progSeleccionado, setProgSeleccionado] = useState(null)
  const [ciclo, setCiclo] = useState('2026-1')
  const [docentes, setDocentes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(false)
  const [canEdit] = useState(true) // TODO: basado en rol

  useEffect(() => {
    api.get('/catalogos/programas').then(r => {
      const progs = r.data.filter(p => p.activo && p.id !== 7) // excluir Campo Clínico
      setProgramas(progs)
      if (progs.length) setProgSeleccionado(progs[0].id)
    })
  }, [])

  useEffect(() => {
    if (!progSeleccionado) return
    cargar()
  }, [progSeleccionado, ciclo])

  async function cargar() {
    setLoading(true)
    try {
      const r = await api.get('/catalogos/asignaciones/por-programa', {
        params: { programa_id: progSeleccionado, ciclo }
      })
      setDocentes(r.data)
    } finally {
      setLoading(false)
    }
  }

  const docentesFiltrados = docentes.filter(d =>
    !busqueda || d.docente_nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const prog = programas.find(p => p.id === progSeleccionado)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Horarios por Programa</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Fuente: PDF aSc de Coord. Docente · Editable para correcciones
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Ciclo</label>
          <input
            type="text" value={ciclo}
            onChange={e => setCiclo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
          />
        </div>
      </div>

      {/* Tabs de programa */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {programas.map(p => (
          <button
            key={p.id}
            onClick={() => setProgSeleccionado(p.id)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              progSeleccionado === p.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.codigo || p.nombre.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Cabecera del programa */}
      {prog && (
        <div className={`rounded-lg border p-3 mb-4 flex items-center gap-4 ${PROG_COLOR[prog.id] || 'bg-gray-100 border-gray-300'}`}>
          <div className="flex-1">
            <span className="font-semibold text-gray-800">{prog.nombre}</span>
            <span className="ml-2 text-sm text-gray-600">${prog.costo_hora}/h · {prog.plan}</span>
          </div>
          <span className="text-sm text-gray-600">
            {docentesFiltrados.length} docentes ·{' '}
            {docentesFiltrados.reduce((s, d) => s + d.grupos.length, 0)} grupos
          </span>
        </div>
      )}

      {/* Búsqueda */}
      <input
        type="text"
        placeholder="Buscar docente..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3"
      />

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : docentesFiltrados.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          {busqueda ? 'Sin resultados para esa búsqueda' : 'No hay horarios para este programa/ciclo'}
        </div>
      ) : (
        <div>
          {docentesFiltrados.map(d => (
            <FilaDocente
              key={`${d.docente_id}-${d.programa_id}`}
              docente={d}
              canEdit={canEdit}
              onRefresh={cargar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
