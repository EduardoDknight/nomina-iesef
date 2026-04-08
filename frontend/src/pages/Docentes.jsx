import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const ADSCRIPCION_LABEL = { centro: 'Centro', instituto: 'Instituto', ambos: 'Ambos' }
const TIPO_LABEL = { por_horas: 'Por horas', tiempo_completo: 'Tiempo completo', campo_clinico: 'Campo clínico' }

const DIAS_TC = [
  { key: 'lunes',     label: 'L' },
  { key: 'martes',    label: 'M' },
  { key: 'miercoles', label: 'X' },
  { key: 'jueves',    label: 'J' },
  { key: 'viernes',   label: 'V' },
  { key: 'sabado',    label: 'S' },
  { key: 'domingo',   label: 'D' },
]

const EMPTY_JORNADA = {
  lunes: true, martes: true, miercoles: true, jueves: true,
  viernes: true, sabado: false, domingo: false,
  hora_entrada: '08:00', hora_salida: '16:00',
}

const EMPTY_FORM = {
  numero_docente: '', nombre_completo: '', correo: '',
  rfc: '', curp: '', codigo_postal: '',
  forma_pago: 'Clabe interbancaria', clabe: '',
  regimen_fiscal: 'honorarios', adscripcion: 'instituto',
  tipo: 'por_horas',
  activo: true,
  crear_portal: true,
  password_portal: `IESEF${new Date().getFullYear()}`,
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function Drawer({ docente, onClose, onSaved }) {
  const esNuevo = !docente
  const { usuario } = useAuth()
  const canEditJornada = ['director_cap_humano', 'cap_humano', 'coord_docente'].includes(usuario?.rol)

  const [form, setForm] = useState(esNuevo ? EMPTY_FORM : {
    numero_docente:  docente.numero_docente || '',
    nombre_completo: docente.nombre_completo || '',
    correo:          docente.correo || '',
    rfc:             docente.rfc || '',
    curp:            docente.curp || '',
    codigo_postal:   docente.codigo_postal || '',
    forma_pago:      docente.forma_pago || 'Clabe interbancaria',
    clabe:           docente.clabe || '',
    regimen_fiscal:  docente.regimen_fiscal || 'honorarios',
    adscripcion:     docente.adscripcion || 'instituto',
    tipo:            docente.tipo || 'por_horas',
    activo:          docente.activo ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Jornada TC ─────────────────────────────────────────────────────────────
  const [jornadas, setJornadas] = useState([{ ...EMPTY_JORNADA }])
  const [jornadasLoaded, setJornadasLoaded] = useState(false)

  useEffect(() => {
    if (!esNuevo && form.tipo === 'tiempo_completo' && !jornadasLoaded) {
      api.get(`/docentes/${docente.id}/jornada`)
        .then(res => {
          if (res.data && res.data.length > 0) setJornadas(res.data)
          setJornadasLoaded(true)
        })
        .catch(() => setJornadasLoaded(true))
    }
    if (form.tipo !== 'tiempo_completo') {
      setJornadasLoaded(false)
    }
  }, [form.tipo, esNuevo, docente?.id, jornadasLoaded])

  const updateJornada = (i, k, v) =>
    setJornadas(js => js.map((j, idx) => idx === i ? { ...j, [k]: v } : j))
  const addJornada = () => {
    if (jornadas.length >= 3) return
    setJornadas(js => [...js, { ...EMPTY_JORNADA }])
  }
  const removeJornada = (i) =>
    setJornadas(js => js.filter((_, idx) => idx !== i))

  // ── Handlers ───────────────────────────────────────────────────────────────
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      let docenteId = docente?.id
      if (esNuevo) {
        const res = await api.post('/docentes', { ...form })
        docenteId = res.data.id
      } else {
        await api.patch(`/docentes/${docente.id}`, { ...form })
      }
      // Guardar jornada TC si aplica y tiene permiso
      if (form.tipo === 'tiempo_completo' && docenteId && canEditJornada) {
        await api.put(`/docentes/${docenteId}/jornada`, jornadas)
      }
      onSaved()
    } catch (err) {
      const det = err.response?.data?.detail
      setError(typeof det === 'string' ? det : 'Error al guardar.')
    } finally {
      setLoading(false)
    }
  }

  const handleBaja = async () => {
    if (!confirm(`¿Dar de baja a ${docente.nombre_completo}? Esta acción lo marcará como inactivo.`)) return
    setLoading(true)
    try {
      await api.patch(`/docentes/${docente.id}`, { activo: false })
      onSaved()
    } catch {
      setError('Error al dar de baja.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {esNuevo ? 'Nuevo docente' : 'Editar docente'}
            </h2>
            {!esNuevo && (
              <p className="text-xs text-slate-400 mt-0.5">ID #{docente.id} · No. {docente.numero_docente}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Estado (solo edición) */}
          {!esNuevo && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-medium text-slate-700">Estado del docente</p>
                <p className="text-xs text-slate-400">{form.activo ? 'Activo en el sistema' : 'Inactivo / dado de baja'}</p>
              </div>
              <button type="button" onClick={() => set('activo', !form.activo)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.activo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.activo ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}

          {/* Identificación */}
          <Section title="Identificación">
            <Field label="Número de checador *" required>
              <input type="text" value={form.numero_docente}
                onChange={e => set('numero_docente', e.target.value)}
                placeholder="ej. 110" required className={input} />
            </Field>
            <Field label="Nombre completo *" full required>
              <input type="text" value={form.nombre_completo}
                onChange={e => set('nombre_completo', e.target.value)}
                placeholder="Apellido Apellido Nombre" required className={input} />
            </Field>
            <Field label="Correo institucional">
              <input type="email" value={form.correo}
                onChange={e => set('correo', e.target.value)}
                placeholder="docente.xx@iesef.edu.mx" className={input} />
            </Field>
          </Section>

          {/* Acceso al portal */}
          {esNuevo && (
            <div className="col-span-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Acceso al portal docente</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.crear_portal}
                    onChange={e => set('crear_portal', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
                    onChange={e => set('password_portal', e.target.value)}
                    className={input}
                    placeholder={`IESEF${new Date().getFullYear()}`}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    El docente deberá cambiarla en su primer ingreso. Usuario: correo institucional.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Fiscal */}
          <Section title="Datos fiscales">
            <Field label="RFC">
              <input type="text" value={form.rfc} maxLength={13}
                onChange={e => set('rfc', e.target.value.toUpperCase())}
                placeholder="AEAJ010915N64" className={input} />
            </Field>
            <Field label="CURP">
              <input type="text" value={form.curp} maxLength={18}
                onChange={e => set('curp', e.target.value.toUpperCase())}
                placeholder="AEAJ010915MHGNLSA3" className={input} />
            </Field>
            <Field label="Régimen fiscal">
              <select value={form.regimen_fiscal} onChange={e => set('regimen_fiscal', e.target.value)} className={input}>
                <option value="honorarios">Honorarios</option>
                <option value="asimilados_salarios">Asimilados a salarios</option>
              </select>
            </Field>
            <Field label="Forma de pago">
              <select value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)} className={input}>
                <option value="Clabe interbancaria">Clabe interbancaria</option>
                <option value="Cheque">Cheque</option>
                <option value="Efectivo">Efectivo</option>
              </select>
            </Field>
            <Field label="CLABE (18 dígitos)" full>
              <input type="text" value={form.clabe} maxLength={18}
                onChange={e => set('clabe', e.target.value.replace(/\D/g, ''))}
                placeholder="002291905278057072" className={input} />
            </Field>
            <Field label="Código postal" title="Requerido para generación de CFDI">
              <input type="text" value={form.codigo_postal} maxLength={5}
                onChange={e => set('codigo_postal', e.target.value.replace(/\D/g, ''))}
                placeholder="42500" className={input} />
            </Field>
          </Section>

          {/* Académico */}
          <Section title="Datos académicos">
            <Field label="Adscripción">
              <select value={form.adscripcion} onChange={e => set('adscripcion', e.target.value)} className={input}>
                <option value="instituto">Instituto</option>
                <option value="centro">Centro</option>
                <option value="ambos">Ambos</option>
              </select>
            </Field>
            <Field label="Tipo de docente">
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={input}>
                <option value="por_horas">Por horas</option>
                <option value="tiempo_completo">Tiempo completo</option>
                <option value="campo_clinico">Campo clínico</option>
              </select>
            </Field>
          </Section>

          {/* ── Jornada Tiempo Completo ─────────────────────────────────── */}
          {form.tipo === 'tiempo_completo' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Jornada contrato
                </p>
                {!canEditJornada && (
                  <span className="text-xs text-slate-400 italic">Solo lectura</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Horas dentro de esta jornada se cubren con sueldo fijo. Las horas de clase fuera se pagan como extras.
              </p>
              <div className="space-y-2">
                {jornadas.map((bloque, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {/* Días */}
                    <div className="flex items-center gap-1.5 mb-3">
                      {DIAS_TC.map(d => (
                        <button key={d.key} type="button"
                          disabled={!canEditJornada}
                          onClick={() => canEditJornada && updateJornada(i, d.key, !bloque[d.key])}
                          className={`w-7 h-7 rounded-full text-xs font-bold transition-colors
                            ${bloque[d.key]
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white text-slate-400 border border-slate-200'}
                            ${!canEditJornada ? 'cursor-default' : 'hover:opacity-80'}`}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                    {/* Horario */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Entrada</label>
                        <input type="time" value={bloque.hora_entrada}
                          disabled={!canEditJornada}
                          onChange={e => updateJornada(i, 'hora_entrada', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400" />
                      </div>
                      <span className="text-slate-300 mt-4">—</span>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Salida</label>
                        <input type="time" value={bloque.hora_salida}
                          disabled={!canEditJornada}
                          onChange={e => updateJornada(i, 'hora_salida', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400" />
                      </div>
                      {canEditJornada && jornadas.length > 1 && (
                        <button type="button" onClick={() => removeJornada(i)}
                          className="mt-4 p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {canEditJornada && jornadas.length < 3 && (
                  <button type="button" onClick={addJornada}
                    className="w-full py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-dashed border-blue-300 rounded-xl transition-colors">
                    + Agregar otro horario
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-2">
          {!esNuevo && (
            <button type="button" onClick={handleBaja} disabled={loading || !form.activo}
              className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 border border-red-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
              title={!form.activo ? 'El docente ya está dado de baja' : 'Marcar como inactivo en el sistema'}>
              Dar de baja
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 rounded-lg transition-colors">
            {loading ? 'Guardando...' : esNuevo ? 'Crear docente' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Helpers de formulario
const input = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{title}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Field({ label, children, full, required }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Docentes() {
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [orden, setOrden] = useState({ campo: 'nombre_completo', dir: 'asc' })
  const [uploadMsg, setUploadMsg] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [drawer, setDrawer] = useState(null) // null | 'nuevo' | {docente}
  const fileRef = useRef()
  const POR_PAGINA = 20

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await api.get('/docentes')
      setTodos(Array.isArray(res.data) ? res.data : [])
    } catch {
      setTodos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const toggleOrden = (campo) => {
    setOrden(o => ({ campo, dir: o.campo === campo && o.dir === 'asc' ? 'desc' : 'asc' }))
    setPagina(1)
  }

  const filtrados = todos.filter(d => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return (
      d.nombre_completo?.toLowerCase().includes(q) ||
      d.rfc?.toLowerCase().includes(q) ||
      d.numero_docente?.toLowerCase().includes(q) ||
      d.correo?.toLowerCase().includes(q)
    )
  })

  const ordenados = [...filtrados].sort((a, b) => {
    let va = a[orden.campo] ?? ''
    let vb = b[orden.campo] ?? ''
    if (orden.campo === 'numero_docente') {
      const na = parseFloat(va) || 0
      const nb = parseFloat(vb) || 0
      return orden.dir === 'asc' ? na - nb : nb - na
    }
    const cmp = String(va).localeCompare(String(vb), 'es')
    return orden.dir === 'asc' ? cmp : -cmp
  })

  const total = filtrados.length
  const paginados = ordenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const totalPaginas = Math.ceil(total / POR_PAGINA)

  const handleBusqueda = (e) => { setBusqueda(e.target.value); setPagina(1) }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await api.post('/docentes/carga-masiva', form)
      setUploadMsg({
        tipo: 'ok',
        texto: `${res.data.insertados} nuevos · ${res.data.actualizados} actualizados · ${res.data.errores} omitidos`,
        detalle: res.data.detalle_errores,
      })
      cargar()
    } catch (err) {
      const det = err.response?.data?.detail
      const texto = typeof det === 'string' ? det : Array.isArray(det) ? det.map(d => d.msg).join(', ') : 'Error al procesar.'
      setUploadMsg({ tipo: 'error', texto })
    } finally {
      setUploading(false)
      fileRef.current.value = ''
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Docentes</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total} de {todos.length} registros</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          <button onClick={() => fileRef.current.click()} disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800 text-sm font-medium rounded-lg transition-all disabled:opacity-50 active:scale-95">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? 'Procesando...' : 'Importar Excel'}
          </button>
          <button onClick={() => setDrawer('nuevo')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo docente
          </button>
        </div>
      </div>

      {/* Mensaje upload */}
      {uploadMsg && (
        <div className={`mb-4 rounded-lg border text-sm ${uploadMsg.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <div className="flex items-start gap-2 px-4 py-3">
            {uploadMsg.tipo === 'ok'
              ? <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              : <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            }
            <div>
              <p className="font-medium">{uploadMsg.texto}</p>
              {uploadMsg.detalle?.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs opacity-80">
                  {uploadMsg.detalle.map((d, i) => <li key={i}>· {d}</li>)}
                </ul>
              )}
            </div>
            <button onClick={() => setUploadMsg(null)} className="ml-auto opacity-60 hover:opacity-100">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Buscador */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" value={busqueda} onChange={handleBusqueda}
          placeholder="Buscar por nombre, RFC, número docente, correo..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {[
                  { label: 'No.', campo: 'numero_docente' },
                  { label: 'Nombre', campo: 'nombre_completo' },
                  { label: 'Correo', campo: 'correo' },
                  { label: 'RFC', campo: 'rfc' },
                  { label: 'Adscripción', campo: 'adscripcion' },
                  { label: 'Tipo', campo: 'tipo' },
                  { label: 'Régimen', campo: 'regimen_fiscal' },
                  { label: 'Estado', campo: 'activo' },
                ].map(({ label, campo }) => (
                  <th key={campo} onClick={() => toggleOrden(campo)}
                    className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 whitespace-nowrap">
                    {label}
                    {orden.campo === campo && <span className="ml-1">{orden.dir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                ))}
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    {busqueda ? 'Sin resultados.' : 'Sin docentes. Usa "Importar Excel" o "Nuevo docente".'}
                  </td>
                </tr>
              ) : (
                paginados.map(d => (
                  <tr key={d.id}
                    className={`hover:bg-slate-50 transition-colors ${!d.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-slate-500 text-xs">
                      {d.numero_docente?.replace(/\.0+$/, '') || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{d.nombre_completo}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{d.correo || '—'}</td>
                    <td className="px-4 py-3 font-mono text-slate-500 text-xs">{d.rfc || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.adscripcion === 'ambos' ? 'bg-violet-100 text-violet-700' :
                        d.adscripcion === 'centro' ? 'bg-blue-100 text-blue-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {ADSCRIPCION_LABEL[d.adscripcion] || d.adscripcion}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{TIPO_LABEL[d.tipo] || d.tipo}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs capitalize">{d.regimen_fiscal?.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${d.activo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {d.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDrawer(d)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <p className="text-xs text-slate-500">Página {pagina} de {totalPaginas} · {total} registros</p>
            <div className="flex items-center gap-1">
              <button disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Anterior
              </button>
              <button disabled={pagina === totalPaginas} onClick={() => setPagina(p => p + 1)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawer !== null && (
        <Drawer
          docente={drawer === 'nuevo' ? null : drawer}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); cargar() }}
        />
      )}
    </div>
  )
}
