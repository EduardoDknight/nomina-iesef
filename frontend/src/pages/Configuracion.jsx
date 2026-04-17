import { useState, useEffect } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

const input = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"

/**
 * Normaliza errores de FastAPI a string.
 * FastAPI 422 devuelve detail como array de objetos [{loc, msg, type}].
 * Si lo pasamos directo a React children el componente crashea.
 */
function errMsg(err, fallback = 'Error al guardar.') {
  const detail = err?.response?.data?.detail
  if (!detail) return err?.message || fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map(e => (typeof e === 'string' ? e : e.msg ?? JSON.stringify(e))).join(' · ')
  }
  return String(detail)
}

const ROLES_LABEL = {
  superadmin:          'Super Admin',
  director_cap_humano: 'Director Cap. Humano',
  cap_humano:          'Capital Humano',
  finanzas:            'Finanzas',
  coord_docente:       'Coord. Docente',
  servicios_escolares: 'Servicios Escolares',
  coord_academica:     'Coord. Académica',
  educacion_virtual:   'Educación Virtual',
  docente:             'Docente',
  reportes:            'Reportes',
}

const ROLES_COLOR = {
  superadmin:          'bg-red-100 text-red-700',
  director_cap_humano: 'bg-violet-100 text-violet-700',
  cap_humano:          'bg-blue-100 text-blue-700',
  finanzas:            'bg-emerald-100 text-emerald-700',
  coord_docente:       'bg-amber-100 text-amber-700',
  servicios_escolares: 'bg-orange-100 text-orange-700',
  coord_academica:     'bg-cyan-100 text-cyan-700',
  educacion_virtual:   'bg-pink-100 text-pink-700',
  docente:             'bg-slate-100 text-slate-600',
  reportes:            'bg-slate-100 text-slate-500',
}

// ── Tab: Programas y Tarifas ──────────────────────────────────────────────────

function TabProgramas({ esDirector }) {
  const [programas, setProgramas] = useState([])
  const [editando, setEditando] = useState(null) // { id, costo_hora }
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargar = async () => {
    const res = await api.get('/catalogos/programas')
    setProgramas(res.data)
  }

  useEffect(() => { cargar() }, [])

  const guardarTarifa = async (id) => {
    setSaving(true)
    setMsg(null)
    try {
      await api.patch(`/catalogos/programas/${id}/tarifa`, null, {
        params: { costo_hora: parseFloat(editando.costo_hora) }
      })
      setMsg({ tipo: 'ok', texto: 'Tarifa actualizada correctamente.' })
      setEditando(null)
      cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: errMsg(err) })
    } finally {
      setSaving(false)
    }
  }

  const NIVEL_LABEL = { prepa: 'Preparatoria', licenciatura: 'Licenciatura', especialidad: 'Especialidad', maestria: 'Maestría' }
  const RAZON_COLOR = { centro: 'bg-blue-100 text-blue-700', instituto: 'bg-emerald-100 text-emerald-700', ambos: 'bg-violet-100 text-violet-700' }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Programas académicos y tarifas</h2>
          <p className="text-xs text-slate-500 mt-0.5">Las tarifas por programa son la base del cálculo de honorarios.</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Programa</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nivel</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Razón social</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo/hora</th>
              {esDirector && <th className="px-4 py-3 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {programas.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{p.nombre}</td>
                <td className="px-4 py-3 text-slate-600 text-xs capitalize">{NIVEL_LABEL[p.nivel] || p.nivel}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RAZON_COLOR[p.razon_social]}`}>
                    {p.razon_social}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs capitalize">{p.plan}</td>
                <td className="px-4 py-3">
                  {editando?.id === p.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">$</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={editando.costo_hora}
                        onChange={e => setEditando(ed => ({ ...ed, costo_hora: e.target.value }))}
                        className="w-28 px-2 py-1 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button onClick={() => guardarTarifa(p.id)} disabled={saving}
                        className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50">
                        {saving ? '...' : 'OK'}
                      </button>
                      <button onClick={() => setEditando(null)}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className="font-mono text-slate-700">
                      {p.costo_hora === 0 ? '— fijo' : `$${Number(p.costo_hora).toFixed(2)}`}
                    </span>
                  )}
                </td>
                {esDirector && (
                  <td className="px-4 py-3 text-right">
                    {editando?.id !== p.id && (
                      <button
                        onClick={() => setEditando({ id: p.id, costo_hora: p.costo_hora })}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar tarifa">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!esDirector && (
        <p className="mt-3 text-xs text-slate-400 text-center">
          Solo Dirección de Finanzas o el Super-administrador puede modificar tarifas.
        </p>
      )}
    </div>
  )
}

// ── Tab: Tolerancias ──────────────────────────────────────────────────────────

function TabTolerencias({ puedeEditar }) {
  const [config, setConfig] = useState(undefined)
  const [form, setForm] = useState(null)
  const [editando, setEditando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    api.get('/catalogos/config-asistencia')
      .then(res => { setConfig(res.data); setForm(res.data) })
      .catch(() => setConfig(null))
  }, [])

  const guardar = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await api.patch('/catalogos/config-asistencia', {
        tolerancia_entrada_min:    form.tolerancia_entrada_min,
        max_tolerancia_salida_min: form.max_tolerancia_salida_min,
      })
      setConfig(res.data)
      setForm(res.data)
      setEditando(false)
      setMsg({ tipo: 'ok', texto: 'Configuración guardada.' })
    } catch (err) {
      setMsg({ tipo: 'error', texto: errMsg(err) })
    } finally {
      setSaving(false)
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: parseInt(v) || 0 }))

  if (config === undefined) return <div className="py-8 text-center text-slate-400 text-sm">Cargando...</div>
  if (config === null) return (
    <div className="py-8 text-center text-sm text-slate-400 bg-white rounded-xl border border-slate-200">
      No disponible — este endpoint aún no está desplegado en producción.<br/>
      <span className="text-xs mt-1 block opacity-60">Sube <code>routers/catalogos.py</code> al servidor y reinicia uvicorn.</span>
    </div>
  )

  const camposDocente = [
    {
      key: 'tolerancia_entrada_min',
      label: 'Tolerancia de entrada',
      desc: 'Minutos después del inicio en que el docente puede checar sin incidencia. A partir del minuto siguiente se registra FALTA y no se paga la clase.',
      unidad: 'min'
    },
    {
      key: 'max_tolerancia_salida_min',
      label: 'Tolerancia máxima de salida',
      desc: 'Máximo de minutos antes del fin de clase en que se puede salir sin incidencia. Tope: min(horas_bloque×10, este valor).',
      unidad: 'min'
    },
  ]

  // Diagrama de timeline de entrada
  const tol = config?.tolerancia_entrada_min ?? 10

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Tolerancias de asistencia — Docentes</h2>
          <p className="text-xs text-slate-500 mt-0.5">Para docentes no existe zona de retardo: pasado el límite de entrada es falta directa. Ningún descuento es automático.</p>
        </div>
        {puedeEditar && !editando && (
          <button onClick={() => setEditando(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar
          </button>
        )}
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {/* Diagrama visual de entrada */}
      {!editando && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Cómo se clasifica una checada de entrada (docentes)</p>
          <div className="relative h-8 rounded-lg overflow-hidden flex text-[11px] font-medium">
            <div className="bg-emerald-100 border-r border-emerald-300 flex items-center justify-center text-emerald-700 px-2"
              style={{ width: '35%' }}>
              ✓ Normal (0–{tol} min)
            </div>
            <div className="bg-red-100 flex-1 flex items-center justify-center text-red-600">
              ✗ Falta (&gt;{tol} min)
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Min 0 = inicio exacto de la clase. No existe zona de retardo para docentes.</p>
        </div>
      )}

      {/* Campos numéricos */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {camposDocente.map(({ key, label, desc, unidad }) => (
          <div key={key} className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </div>
            {editando ? (
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="60"
                  value={form[key]}
                  onChange={e => set(key, e.target.value)}
                  className="w-20 px-2 py-1.5 text-sm text-center border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-400 w-8">{unidad}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-800">{config[key]}</span>
                <span className="text-sm text-slate-400">{unidad}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Nota sobre administrativos */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-amber-800 mb-1">Retardos — solo aplica a administrativos</p>
        <p className="text-xs text-amber-700">
          Los administrativos tienen zona de retardo (hasta 20 min), con política de N retardos = 1 día descontado.
          La configuración de tolerancias para administrativos estará disponible en un módulo separado (etapa futura).
        </p>
      </div>

      {editando && (
        <div className="flex items-center gap-2 justify-end">
          <button onClick={() => { setEditando(false); setForm(config) }}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 rounded-lg">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}

      {!puedeEditar && (
        <p className="text-xs text-slate-400 text-center">
          Solo Capital Humano y el Director pueden modificar estas configuraciones.
        </p>
      )}
    </div>
  )
}

// ── Drawer Usuarios ───────────────────────────────────────────────────────────

const EMPTY_USR = { nombre: '', email: '', rol: 'cap_humano', password: 'IESEF2026', programa_id: '' }

function DrawerUsuario({ usuario: u, onClose, onSaved }) {
  const esNuevo = !u
  const [form, setForm] = useState(esNuevo ? EMPTY_USR : {
    nombre:      u.nombre || '',
    email:       u.email || '',
    rol:         u.rol || 'cap_humano',
    password:    '',
    programa_id: u.programa_id || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const body = {
        ...form,
        programa_id: form.programa_id !== '' ? parseInt(form.programa_id) : null,
      }
      if (!esNuevo && !body.password) delete body.password
      if (esNuevo) {
        await api.post('/usuarios', body)
      } else {
        await api.patch(`/usuarios/${u.id}`, body)
      }
      onSaved()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDesactivar = async () => {
    if (!confirm(`¿Desactivar acceso de ${u.nombre}?`)) return
    setLoading(true)
    try {
      await api.patch(`/usuarios/${u.id}`, { activo: false })
      onSaved()
    } catch {
      setError('Error al desactivar.')
    } finally {
      setLoading(false)
    }
  }

  const necesitaPrograma = form.rol === 'coord_academica'

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {esNuevo ? 'Nuevo administrador' : 'Editar administrador'}
            </h2>
            {!esNuevo && <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre completo *</label>
            <input type="text" value={form.nombre} required
              onChange={e => set('nombre', e.target.value)}
              placeholder="Capital Humano" className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Correo electrónico *</label>
            <input type="email" value={form.email} required
              onChange={e => set('email', e.target.value)}
              placeholder="usuario@iesef.edu.mx" className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rol *</label>
            <select value={form.rol} onChange={e => set('rol', e.target.value)} className={input}>
              {Object.entries(ROLES_LABEL)
                .filter(([val]) => !['docente', 'trabajador'].includes(val))
                .map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
            </select>
          </div>
          {necesitaPrograma && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">ID de programa (para coord. académica)</label>
              <input type="number" value={form.programa_id}
                onChange={e => set('programa_id', e.target.value)}
                placeholder="1 = PREPA, 2 = ENFER, etc." className={input} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {esNuevo ? 'Contraseña inicial' : 'Nueva contraseña (dejar vacío para no cambiar)'}
            </label>
            <input type="text" value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={esNuevo ? 'IESEF2026' : '••••••••'} className={input} />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </form>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-2">
          {!esNuevo && u.activo && (
            <button type="button" onClick={handleDesactivar} disabled={loading}
              className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg disabled:opacity-40">
              Desactivar
            </button>
          )}
          {!esNuevo && !u.activo && (
            <button type="button" onClick={async () => {
              setLoading(true)
              await api.patch(`/usuarios/${u.id}`, { activo: true })
              onSaved()
            }} disabled={loading}
              className="px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-lg disabled:opacity-40">
              Reactivar
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 rounded-lg">
            {loading ? 'Guardando...' : esNuevo ? 'Crear administrador' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Administradores ──────────────────────────────────────────────────────

function TabUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(null)

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await api.get('/usuarios')
      // Solo mostrar usuarios administrativos del sistema (no docentes ni personal)
      setUsuarios(res.data.filter(u => !['docente', 'trabajador'].includes(u.rol)))
    } catch {
      setUsuarios([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Administradores del sistema</h2>
          <p className="text-xs text-slate-500 mt-0.5">{usuarios.length} administradores registrados</p>
        </div>
        <button onClick={() => setDrawer('nuevo')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo administrador
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Correo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Rol</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Último acceso</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-3.5 bg-slate-200 rounded w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : usuarios.map(u => (
              <tr key={u.id} className={`hover:bg-slate-50 ${!u.activo ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{u.nombre}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLES_COLOR[u.rol] || 'bg-slate-100 text-slate-600'}`}>
                    {ROLES_LABEL[u.rol] || u.rol}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${u.activo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setDrawer(u)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawer !== null && (
        <DrawerUsuario
          usuario={drawer === 'nuevo' ? null : drawer}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); cargar() }}
        />
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

// ── Tab: Credenciales portal ──────────────────────────────────────────────────

function TabCredenciales() {
  const { usuario } = useAuth()
  const [subtab, setSubtab] = useState('docentes')
  const [docentes, setDocentes] = useState([])
  const [administrativos, setAdministrativos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(null)
  const [msg, setMsg] = useState(null)

  const puedeVerTrabajadores = ['superadmin','director_cap_humano','cap_humano'].includes(usuario?.rol)
  const puedeResetear = ['superadmin','director_cap_humano'].includes(usuario?.rol)

  const cargarDocentes = () => {
    setLoading(true)
    api.get('/usuarios/credenciales-docentes')
      .then(r => setDocentes(r.data))
      .catch(() => setDocentes([]))
      .finally(() => setLoading(false))
  }

  const cargarAdministrativos = () => {
    if (!puedeVerTrabajadores) return
    setLoading(true)
    api.get('/usuarios/credenciales-trabajadores')
      .then(r => setAdministrativos(r.data))
      .catch(() => setAdministrativos([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (subtab === 'docentes') cargarDocentes()
    else if (subtab === 'administrativos') cargarAdministrativos()
    setBusqueda('')
  }, [subtab])

  const resetear = async (id, nombre) => {
    if (!confirm(`¿Restablecer contraseña de ${nombre} a IESEF${new Date().getFullYear()}?`)) return
    setResetting(id)
    setMsg(null)
    try {
      const r = await api.post(`/usuarios/${id}/reset-password`)
      setMsg({ tipo: 'ok', texto: `Contraseña de ${r.data.nombre} restablecida a ${r.data.password_reset_a}` })
      if (subtab === 'docentes') cargarDocentes(); else if (subtab === 'administrativos') cargarAdministrativos()
    } catch (err) {
      setMsg({ tipo: 'error', texto: errMsg(err, 'Error al restablecer.') })
    } finally {
      setResetting(null)
    }
  }

  const exportar = () => {
    const url = subtab === 'docentes'
      ? '/usuarios/credenciales-docentes/export'
      : '/usuarios/credenciales-trabajadores/export'
    const token = localStorage.getItem('token')
    fetch(`http://localhost:8000${url}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        const nombreArchivo = subtab === 'docentes' ? 'docentes' : 'administrativos'
        a.download = `credenciales_${nombreArchivo}_${new Date().toISOString().slice(0,10)}.xlsx`
        a.click()
      })
  }

  const lista = subtab === 'docentes' ? docentes : administrativos
  const filtrada = lista.filter(u =>
    !busqueda || u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.username.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Credenciales de acceso al portal</h2>
          <p className="text-xs text-slate-500 mt-0.5">La contraseña solo se muestra cuando no ha sido cambiada por el usuario.</p>
        </div>
        <button onClick={exportar}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar Excel
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setSubtab('docentes')}
          className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${subtab === 'docentes' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}>
          Docentes
        </button>
        {puedeVerTrabajadores && (
          <button onClick={() => setSubtab('administrativos')}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${subtab === 'administrativos' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'}`}>
            Administrativos
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o usuario..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Contraseña</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Último acceso</th>
              {puedeResetear && <th className="px-4 py-3 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(puedeResetear ? 6 : 5)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : filtrada.map(u => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{u.nombre}</td>
                <td className="px-4 py-3 font-mono text-slate-600 text-xs">{u.username}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {u.debe_cambiar_password
                    ? <span className="text-amber-600">{u.password_visible}</span>
                    : <span className="text-slate-400">{u.password_visible}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.debe_cambiar_password ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {u.debe_cambiar_password ? 'Pendiente' : 'Personalizada'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'}
                </td>
                {puedeResetear && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => resetear(u.id, u.nombre)}
                      disabled={resetting === u.id}
                      className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg disabled:opacity-50 transition-colors"
                      title="Restablecer contraseña">
                      {resetting === u.id ? '...' : 'Reset'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtrada.length === 0 && (
          <p className="text-center py-6 text-slate-400 text-sm">Sin resultados.</p>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-2">{filtrada.length} usuarios</p>
    </div>
  )
}

// ── Tab: Calendario Institucional ────────────────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['D','L','M','M','J','V','S']

const TIPO_COLOR = {
  vacaciones:          { bg: 'bg-red-500',    ring: 'ring-red-400',    text: 'text-white',     label: 'Vacaciones' },
  suspension_oficial:  { bg: 'bg-amber-400',  ring: 'ring-amber-300',  text: 'text-amber-900', label: 'Suspensión oficial' },
  suspension_interna:  { bg: 'bg-violet-500', ring: 'ring-violet-400', text: 'text-white',     label: 'Suspensión interna' },
}

function buildCalendar(year, month) {
  // month: 0-11
  const firstDay = new Date(year, month, 1).getDay()   // 0=Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
}

function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function TabCalendario({ puedeEditar }) {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())        // 0-11
  const [dias, setDias] = useState([])                   // {fecha, tipo, descripcion, hora_inicio, hora_fin, id}
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)               // {dia, iso} — popup para agregar
  const [tipoNuevo, setTipoNuevo] = useState('vacaciones')
  const [descNueva, setDescNueva] = useState('')
  const [todoElDia, setTodoElDia] = useState(true)         // para suspension_interna
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [horaFin, setHoraFin] = useState('11:00')
  const [programasTodos, setProgramasTodos] = useState(true)       // true = todos los programas
  const [programasSelec, setProgramasSelec] = useState([])          // IDs seleccionados
  const [programasCatalogo, setProgramasCatalogo] = useState([])    // catálogo cargado 1 vez
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await api.get('/calendario/dias-no-laborables', { params: { anio } })
      setDias(res.data)
    } catch { setDias([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [anio])

  // Catálogo de programas (carga única para el selector de programas afectados)
  useEffect(() => {
    if (programasCatalogo.length === 0) {
      api.get('/catalogos/programas')
        .then(res => setProgramasCatalogo(res.data))
        .catch(() => {})
    }
  }, [])

  // Index por fecha ISO para O(1) lookup
  const diasIdx = {}
  for (const d of dias) diasIdx[d.fecha] = d

  const cells = buildCalendar(anio, mes)

  const irMes = (delta) => {
    let m = mes + delta
    let y = anio
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMes(m)
    setAnio(y)
  }

  const handleClickDia = (day) => {
    if (!puedeEditar || !day) return
    const iso = toISO(anio, mes, day)
    const existente = diasIdx[iso]
    if (existente) {
      // Eliminar
      const label = existente.descripcion || TIPO_COLOR[existente.tipo]?.label || existente.tipo
      const horario = existente.hora_inicio ? ` · ${existente.hora_inicio}–${existente.hora_fin}` : ''
      if (!confirm(`¿Quitar "${label}${horario}" del ${iso}?`)) return
      setSaving(true)
      api.delete(`/calendario/dias-no-laborables/${existente.id}`)
        .then(() => { setMsg({ tipo: 'ok', texto: `${iso} eliminado.` }); cargar() })
        .catch(() => setMsg({ tipo: 'error', texto: 'Error al eliminar.' }))
        .finally(() => setSaving(false))
    } else {
      setTipoNuevo('vacaciones')
      setDescNueva('')
      setTodoElDia(true)
      setHoraInicio('09:00')
      setHoraFin('11:00')
      setProgramasTodos(true)
      setProgramasSelec([])
      setModal({ dia: day, iso })
    }
  }

  const guardarDia = async () => {
    if (!modal) return

    // Validación de horario parcial
    if (tipoNuevo === 'suspension_interna' && !todoElDia) {
      if (!horaInicio || !horaFin) {
        setMsg({ tipo: 'error', texto: 'Indica hora de inicio y fin para la suspensión.' })
        return
      }
      if (horaInicio >= horaFin) {
        setMsg({ tipo: 'error', texto: 'La hora de inicio debe ser antes que la hora de fin.' })
        return
      }
    }
    // Validación de programas específicos
    if (tipoNuevo === 'suspension_interna' && !programasTodos && programasSelec.length === 0) {
      setMsg({ tipo: 'error', texto: 'Selecciona al menos un programa o elige "Todos los programas".' })
      return
    }

    setSaving(true)
    setMsg(null)
    try {
      const body = {
        fecha:       modal.iso,
        tipo:        tipoNuevo,
        descripcion: descNueva || null,
        ciclo:       String(anio),
      }
      if (tipoNuevo === 'suspension_interna') {
        if (!todoElDia) {
          body.hora_inicio = horaInicio
          body.hora_fin    = horaFin
        }
        body.programas_ids = (!programasTodos && programasSelec.length > 0)
          ? programasSelec
          : null
      }
      await api.post('/calendario/dias-no-laborables', body)

      const labelHorario   = (tipoNuevo === 'suspension_interna' && !todoElDia) ? ` (${horaInicio}–${horaFin})` : ''
      const nProgramas     = (!programasTodos && programasSelec.length > 0) ? ` · ${programasSelec.length} programa(s)` : ''
      setMsg({ tipo: 'ok', texto: `${modal.iso} marcado como ${TIPO_COLOR[tipoNuevo].label}${labelHorario}${nProgramas}.` })
      setModal(null)
      cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: errMsg(err) })
    } finally { setSaving(false) }
  }

  // Resumen del mes actual
  const diasMes    = dias.filter(d => {
    const [y, m] = d.fecha.split('-').map(Number)
    return y === anio && m === mes + 1
  })
  const vacMes       = diasMes.filter(d => d.tipo === 'vacaciones').length
  const suspMes      = diasMes.filter(d => d.tipo === 'suspension_oficial').length
  const suspIntMes   = diasMes.filter(d => d.tipo === 'suspension_interna').length

  // Total del año
  const vacAnio      = dias.filter(d => d.tipo === 'vacaciones').length
  const suspAnio     = dias.filter(d => d.tipo === 'suspension_oficial').length
  const suspIntAnio  = dias.filter(d => d.tipo === 'suspension_interna').length

  return (
    <div className="max-w-2xl">
      {/* Encabezado */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Calendario Institucional</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {[
              vacAnio > 0    && `${vacAnio} vac`,
              suspAnio > 0   && `${suspAnio} of.`,
              suspIntAnio > 0 && `${suspIntAnio} int.`,
            ].filter(Boolean).join(' · ') || 'Sin días marcados'}{' '}en {anio}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs shrink-0">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-200">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Vacaciones
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />Susp. oficial
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-50 text-violet-700 border border-violet-200">
            <span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />Susp. interna
          </span>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${
          msg.tipo === 'ok'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {msg.texto}
          <button onClick={() => setMsg(null)} className="ml-2 opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      {/* Navegación de mes */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => irMes(-1)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-slate-700">
          {MESES[mes]} {anio}
          {(vacMes > 0 || suspMes > 0 || suspIntMes > 0) && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({[
                vacMes     > 0 && `${vacMes} vac`,
                suspMes    > 0 && `${suspMes} of.`,
                suspIntMes > 0 && `${suspIntMes} int.`,
              ].filter(Boolean).join(' · ')})
            </span>
          )}
        </span>
        <button
          onClick={() => irMes(1)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Grilla del calendario */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {/* Cabecera días de la semana */}
        <div className="grid grid-cols-7 border-b border-slate-200">
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} className={`py-2 text-center text-xs font-semibold ${
              i === 0 || i === 6 ? 'text-slate-400' : 'text-slate-500'
            }`}>{d}</div>
          ))}
        </div>

        {/* Días */}
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Cargando...</div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (!day) {
                return <div key={`e${idx}`} className="h-10 border-b border-r border-slate-100 last:border-r-0" />
              }
              const iso     = toISO(anio, mes, day)
              const marcado = diasIdx[iso]
              const col     = marcado ? TIPO_COLOR[marcado.tipo] : null
              const esHoy   = iso === toISO(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
              const esFinde = (idx % 7 === 0) || (idx % 7 === 6)

              // Suspensión interna parcial: fondo violeta con borde discontinuo
              const esSuspIntParcial = marcado?.tipo === 'suspension_interna' && marcado?.hora_inicio

              return (
                <div
                  key={iso}
                  onClick={() => handleClickDia(day)}
                  title={
                    marcado
                      ? `${TIPO_COLOR[marcado.tipo]?.label || marcado.tipo}${marcado.descripcion ? ` — ${marcado.descripcion}` : ''}${marcado.hora_inicio ? ` · ${marcado.hora_inicio}–${marcado.hora_fin}` : ''}`
                      : puedeEditar ? 'Clic para marcar' : ''
                  }
                  className={[
                    'relative h-10 flex items-center justify-center text-sm border-b border-r border-slate-100 last:border-r-0 select-none transition-colors',
                    puedeEditar && !marcado ? 'cursor-pointer hover:bg-blue-50' : '',
                    marcado && !esSuspIntParcial ? `${col.bg} ${col.text} cursor-pointer font-semibold` : '',
                    esSuspIntParcial ? 'bg-violet-100 text-violet-800 cursor-pointer font-semibold border-2 border-violet-400' : '',
                    !marcado && esFinde ? 'text-slate-400' : '',
                    !marcado && !esFinde ? 'text-slate-700' : '',
                  ].join(' ')}>
                  <span className={[
                    'w-7 h-7 flex items-center justify-center rounded-full text-sm',
                    esHoy && !marcado ? 'ring-2 ring-blue-400 font-bold text-blue-600' : '',
                    saving ? 'opacity-50' : '',
                  ].join(' ')}>
                    {day}
                  </span>
                  {/* Indicador de horas para suspensión parcial */}
                  {esSuspIntParcial && (
                    <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] text-violet-500 leading-none font-medium">
                      {marcado.hora_inicio}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista del mes si hay días marcados */}
      {diasMes.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Días no laborables en {MESES[mes]}
          </p>
          {diasMes.map(d => {
            const col = TIPO_COLOR[d.tipo] || { bg: 'bg-slate-400', label: d.tipo }
            const badgeCls =
              d.tipo === 'vacaciones'         ? 'bg-red-100 text-red-700'       :
              d.tipo === 'suspension_oficial'  ? 'bg-amber-100 text-amber-700'   :
                                                 'bg-violet-100 text-violet-700'

            // Nombres de programas afectados (solo para suspension_interna con lista)
            const nombresPrograma = d.programas_ids?.length
              ? d.programas_ids
                  .map(id => programasCatalogo.find(p => p.id === id)?.nombre || `Prog.${id}`)
                  .join(', ')
              : null

            return (
              <div key={d.id} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.bg}`} />
                    <span className="text-sm text-slate-700 font-medium">
                      {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' })}
                    </span>
                    {d.descripcion && (
                      <span className="text-xs text-slate-500 truncate">— {d.descripcion}</span>
                    )}
                    {d.hora_inicio && (
                      <span className="text-xs font-mono text-violet-600 flex-shrink-0 bg-violet-50 px-1.5 py-0.5 rounded">
                        {d.hora_inicio}–{d.hora_fin}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badgeCls}`}>
                    {col.label}
                  </span>
                </div>
                {/* Programas específicos (solo suspension_interna con lista acotada) */}
                {nombresPrograma && (
                  <div className="mt-1.5 ml-4 flex items-center gap-1.5 flex-wrap">
                    <svg className="w-3 h-3 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-[11px] text-violet-700">{nombresPrograma}</span>
                    <span className="text-[10px] text-slate-400">— resto de programas asiste normal</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {puedeEditar && (
        <p className="text-xs text-slate-400 mt-3">
          Clic en un día libre para marcarlo · Clic en un día marcado para quitarlo
        </p>
      )}

      {/* Modal: tipo y descripción */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-5 w-96 max-w-[95vw]">
            <h3 className="font-semibold text-slate-800 mb-1">Marcar día no laborable</h3>
            <p className="text-sm text-slate-500 mb-4">{modal.iso}</p>

            {/* Selector de tipo */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo</label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setTipoNuevo('vacaciones')}
                  className={`py-2 px-1 text-xs rounded-lg border font-medium transition-colors ${
                    tipoNuevo === 'vacaciones'
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}>
                  Vacaciones
                </button>
                <button
                  onClick={() => setTipoNuevo('suspension_oficial')}
                  className={`py-2 px-1 text-xs rounded-lg border font-medium transition-colors ${
                    tipoNuevo === 'suspension_oficial'
                      ? 'bg-amber-400 text-amber-900 border-amber-400'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}>
                  Susp. oficial
                </button>
                <button
                  onClick={() => setTipoNuevo('suspension_interna')}
                  className={`py-2 px-1 text-xs rounded-lg border font-medium transition-colors ${
                    tipoNuevo === 'suspension_interna'
                      ? 'bg-violet-500 text-white border-violet-500'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}>
                  Susp. interna
                </button>
              </div>
            </div>

            {/* Opciones extra para suspensión interna */}
            {tipoNuevo === 'suspension_interna' && (
              <div className="mb-3 space-y-3">
                {/* Nota explicativa */}
                <div className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-lg">
                  <p className="text-xs text-violet-800 font-medium mb-0.5">Docentes sí cobran</p>
                  <p className="text-xs text-violet-700">
                    Las clases en este período se pagan aunque no haya checada biométrica.
                    Los administrativos no se ven afectados.
                  </p>
                </div>

                {/* Cobertura: todo el día vs horas específicas */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Cobertura</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTodoElDia(true)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                        todoElDia
                          ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}>
                      Todo el día
                    </button>
                    <button
                      onClick={() => setTodoElDia(false)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                        !todoElDia
                          ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}>
                      Horario específico
                    </button>
                  </div>
                </div>

                {/* Pickers de hora — solo si no es todo el día */}
                {!todoElDia && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Hora inicio</label>
                      <input
                        type="time"
                        value={horaInicio}
                        onChange={e => setHoraInicio(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Hora fin</label>
                      <input
                        type="time"
                        value={horaFin}
                        onChange={e => setHoraFin(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                )}

                {/* Programas afectados */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Programas afectados</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => { setProgramasTodos(true); setProgramasSelec([]) }}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                        programasTodos
                          ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}>
                      Todos los programas
                    </button>
                    <button
                      onClick={() => setProgramasTodos(false)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                        !programasTodos
                          ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}>
                      Programas específicos
                    </button>
                  </div>

                  {!programasTodos && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                      {programasCatalogo.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">Cargando…</p>
                      ) : programasCatalogo.map(p => {
                        const selec = programasSelec.includes(p.id)
                        return (
                          <label
                            key={p.id}
                            className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors border-b border-slate-100 last:border-b-0 ${
                              selec ? 'bg-violet-50' : 'hover:bg-slate-50'
                            }`}>
                            <input
                              type="checkbox"
                              checked={selec}
                              onChange={() =>
                                setProgramasSelec(prev =>
                                  selec ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                )
                              }
                              className="w-3.5 h-3.5 accent-violet-600"
                            />
                            <span className={`text-xs flex-1 ${selec ? 'text-violet-800 font-medium' : 'text-slate-600'}`}>
                              {p.nombre}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                              p.razon_social === 'centro'
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              {p.razon_social}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}

                  {!programasTodos && programasSelec.length === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1.5">
                      Selecciona al menos un programa o usa "Todos los programas".
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Descripción */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Descripción {tipoNuevo === 'suspension_interna' ? '(motivo del evento)' : '(opcional)'}
              </label>
              <input
                value={descNueva}
                onChange={e => setDescNueva(e.target.value)}
                placeholder={
                  tipoNuevo === 'suspension_interna'
                    ? 'Ej. Simulacro, Día del Maestro, Ceremonia…'
                    : 'Ej. Semana Santa'
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={guardarDia}
                disabled={saving}
                className="flex-1 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors">
                {saving ? 'Guardando…' : 'Marcar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'programas',    label: 'Programas y tarifas' },
  { id: 'tolerancias',  label: 'Tolerancias' },
  { id: 'usuarios',     label: 'Administradores' },
  { id: 'credenciales', label: 'Credenciales portal' },
  { id: 'calendario',   label: 'Calendario' },
]

export default function Configuracion() {
  const { usuario } = useAuth()
  const [tab, setTab] = useState('programas')

  const puedeEditarTarifas = ['superadmin', 'director_cap_humano', 'finanzas'].includes(usuario?.rol)
  const puedeEditarTolerencias = ['superadmin', 'director_cap_humano', 'cap_humano'].includes(usuario?.rol)
  const puedeEditarCalendario = ['superadmin', 'director_cap_humano', 'cap_humano'].includes(usuario?.rol)

  // Solo director y cap_humano acceden a esta página (restringido en nav)
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Configuración</h1>
        <p className="text-slate-500 text-sm mt-0.5">Parámetros del sistema de nómina</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'programas'    && <TabProgramas esDirector={puedeEditarTarifas} />}
      {tab === 'tolerancias'  && <TabTolerencias puedeEditar={puedeEditarTolerencias} />}
      {tab === 'usuarios'     && <TabUsuarios />}
      {tab === 'credenciales' && <TabCredenciales />}
      {tab === 'calendario'   && <TabCalendario puedeEditar={puedeEditarCalendario} />}
    </div>
  )
}
