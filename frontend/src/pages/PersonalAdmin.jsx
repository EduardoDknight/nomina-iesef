import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const DIAS = [
  { key: 'lunes',     label: 'L' },
  { key: 'martes',    label: 'M' },
  { key: 'miercoles', label: 'X' },
  { key: 'jueves',    label: 'J' },
  { key: 'viernes',   label: 'V' },
  { key: 'sabado',    label: 'S' },
  { key: 'domingo',   label: 'D' },
]

const EMPTY_BLOQUE = {
  lunes: true, martes: true, miercoles: true, jueves: true,
  viernes: true, sabado: false, domingo: false,
  hora_entrada: '09:00', hora_salida: '17:00',
}

const EMPTY_FORM = {
  chec_id: '',
  nombre: '',
  cargo: '',
  sueldo_quincenal: '',
  horarios: [{ ...EMPTY_BLOQUE }],
  crear_portal: true,
  password_portal: `IESEF${new Date().getFullYear()}`,
}

const input = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function formatHorarios(horarios) {
  if (!horarios || horarios.length === 0) return 'Sin horario'
  return horarios.map(h => {
    const dias = DIAS.filter(d => h[d.key]).map(d => d.label).join('')
    return `${dias} ${h.hora_entrada}-${h.hora_salida}`
  }).join(' | ')
}

// ── Modal Agregar/Editar ───────────────────────────────────────────────────────

function ModalTrabajador({ trabajador, onClose, onSaved }) {
  const esNuevo = !trabajador
  const [form, setForm] = useState(esNuevo ? { ...EMPTY_FORM, horarios: [{ ...EMPTY_BLOQUE }] } : {
    chec_id:          trabajador.chec_id ?? '',
    nombre:           trabajador.nombre ?? '',
    cargo:            trabajador.cargo ?? '',
    sueldo_quincenal: trabajador.sueldo_quincenal ?? '',
    horarios:         trabajador.horarios?.length > 0
                        ? trabajador.horarios.map(h => ({ ...EMPTY_BLOQUE, ...h }))
                        : [{ ...EMPTY_BLOQUE }],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const updateBloque = (i, k, v) => {
    setForm(f => {
      const hs = f.horarios.map((h, idx) => idx === i ? { ...h, [k]: v } : h)
      return { ...f, horarios: hs }
    })
  }

  const addBloque = () => {
    if (form.horarios.length >= 4) return
    setForm(f => ({ ...f, horarios: [...f.horarios, { ...EMPTY_BLOQUE }] }))
  }

  const removeBloque = (i) => {
    setForm(f => ({ ...f, horarios: f.horarios.filter((_, idx) => idx !== i) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const body = {
        ...form,
        chec_id: form.chec_id !== '' ? Number(form.chec_id) : null,
        sueldo_quincenal: form.sueldo_quincenal !== '' ? Number(form.sueldo_quincenal) : null,
      }
      if (esNuevo) {
        await api.post('/admin/trabajadores', body)
      } else {
        await api.put(`/admin/trabajadores/${trabajador.id}`, body)
      }
      onSaved()
    } catch (err) {
      const det = err.response?.data?.detail
      setError(typeof det === 'string' ? det : 'Error al guardar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">
            {esNuevo ? 'Agregar trabajador' : 'Editar trabajador'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Datos básicos */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Datos del trabajador</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ID Checador</label>
                <input type="number" value={form.chec_id}
                  onChange={e => setField('chec_id', e.target.value)}
                  placeholder="ej. 301" className={input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Nombre completo <span className="text-red-400">*</span>
                </label>
                <input type="text" required value={form.nombre}
                  onChange={e => setField('nombre', e.target.value)}
                  placeholder="Apellido Apellido Nombre" className={input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Cargo</label>
                <input type="text" value={form.cargo}
                  onChange={e => setField('cargo', e.target.value)}
                  placeholder="ej. Secretaria, Intendencia" className={input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Sueldo quincenal ($)</label>
                <input type="number" step="0.01" value={form.sueldo_quincenal}
                  onChange={e => setField('sueldo_quincenal', e.target.value)}
                  placeholder="ej. 5000.00" className={input} />
              </div>
            </div>
          </div>

          {/* Horarios */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Horarios</p>
              {form.horarios.length < 4 && (
                <button type="button" onClick={addBloque}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar bloque
                </button>
              )}
            </div>
            <div className="space-y-3">
              {form.horarios.map((bloque, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-500">Bloque {i + 1}</span>
                    {form.horarios.length > 1 && (
                      <button type="button" onClick={() => removeBloque(i)}
                        className="text-xs text-red-500 hover:text-red-700">
                        Eliminar
                      </button>
                    )}
                  </div>
                  {/* Días */}
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {DIAS.map(d => (
                      <label key={d.key} className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={!!bloque[d.key]}
                          onChange={e => updateBloque(i, d.key, e.target.checked)}
                          className="sr-only" />
                        <span className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold border select-none transition-colors ${
                          bloque[d.key]
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                        }`}>
                          {d.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  {/* Horas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Hora entrada</label>
                      <input type="time" value={bloque.hora_entrada}
                        onChange={e => updateBloque(i, 'hora_entrada', e.target.value)}
                        className={input} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Hora salida</label>
                      <input type="time" value={bloque.hora_salida}
                        onChange={e => updateBloque(i, 'hora_salida', e.target.value)}
                        className={input} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Acceso al portal */}
          {esNuevo && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">Acceso al portal</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.crear_portal}
                    onChange={e => setField('crear_portal', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="text-sm text-slate-600">Crear acceso</span>
                </label>
              </div>
              {form.crear_portal && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Contraseña inicial</label>
                  <input
                    type="text"
                    value={form.password_portal}
                    onChange={e => setField('password_portal', e.target.value)}
                    className={input}
                  />
                  <p className="text-xs text-slate-400 mt-1">Usuario: número de checador ({form.chec_id || '—'})</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 rounded-lg transition-colors">
            {loading ? 'Guardando...' : esNuevo ? 'Agregar trabajador' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function PersonalAdmin() {
  const { usuario } = useAuth()
  const [trabajadores, setTrabajadores] = useState([])
  const [loading, setLoading]     = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [modal, setModal]         = useState(null) // null | 'nuevo' | {trabajador}
  const [toggling, setToggling]   = useState(null) // id en proceso

  const canEdit = ['superadmin', 'director_cap_humano', 'cap_humano'].includes(usuario?.rol)

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/trabajadores')
      setTrabajadores(Array.isArray(res.data) ? res.data : [])
    } catch {
      setTrabajadores([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const handleToggle = async (t) => {
    if (!confirm(`¿${t.activo ? 'Desactivar' : 'Activar'} a ${t.nombre}?`)) return
    setToggling(t.id)
    try {
      await api.patch(`/admin/trabajadores/${t.id}/activo`, { activo: !t.activo })
      cargar()
    } catch {
      // silencioso
    } finally {
      setToggling(null)
    }
  }

  const filtrados = trabajadores.filter(t => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return (
      t.nombre?.toLowerCase().includes(q) ||
      t.cargo?.toLowerCase().includes(q) ||
      String(t.chec_id || '').includes(q)
    )
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Personal Administrativo</h1>
          <p className="text-slate-500 text-sm mt-0.5">{trabajadores.length} trabajadores registrados</p>
        </div>
        {canEdit && (
          <button onClick={() => setModal('nuevo')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar trabajador
          </button>
        )}
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, cargo o ID checador..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Cargo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Sueldo Quincenal</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Checador ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Horarios</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                {canEdit && (
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(canEdit ? 7 : 6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center text-slate-400">
                    {busqueda ? 'Sin resultados para la búsqueda.' : 'No hay trabajadores registrados.'}
                  </td>
                </tr>
              ) : (
                filtrados.map(t => (
                  <tr key={t.id} className={`hover:bg-slate-50 transition-colors ${!t.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{t.nombre}</td>
                    <td className="px-4 py-3 text-slate-600">{t.cargo || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {t.sueldo_quincenal != null
                        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(t.sueldo_quincenal)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-slate-500">
                      {t.chec_id ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatHorarios(t.horarios)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.activo
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${t.activo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {/* Editar */}
                          <button onClick={() => setModal(t)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {/* Toggle activo */}
                          <button
                            onClick={() => handleToggle(t)}
                            disabled={toggling === t.id}
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                              t.activo
                                ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={t.activo ? 'Desactivar' : 'Activar'}>
                            {t.activo ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal !== null && (
        <ModalTrabajador
          trabajador={modal === 'nuevo' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar() }}
        />
      )}
    </div>
  )
}
