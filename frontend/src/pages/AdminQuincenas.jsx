import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const ESTADO_CONFIG = {
  abierto:  { label: 'Abierto',  color: 'bg-emerald-100 text-emerald-700' },
  cerrado:  { label: 'Cerrado',  color: 'bg-slate-100 text-slate-600'    },
}

const fmtFecha = (f) =>
  f ? new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function ModalNuevoPeriodo({ onClose, onSaved }) {
  const [form, setForm]     = useState({ nombre: '', fecha_inicio: '', fecha_fin: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.post('/admin/periodos', form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear el período.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Nuevo período administrativo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre del período *</label>
            <input type="text" required placeholder="Ej. 1a Quincena Abril 2026"
              value={form.nombre} onChange={e => set('nombre', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha inicio *</label>
              <input type="date" required value={form.fecha_inicio}
                onChange={e => set('fecha_inicio', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha fin *</label>
              <input type="date" required value={form.fecha_fin}
                onChange={e => set('fecha_fin', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
              {loading ? 'Creando...' : 'Crear período'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminQuincenas() {
  const [periodos, setPeriodos]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [eliminando, setEliminando] = useState(null)
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const canEdit = ['superadmin', 'director_cap_humano', 'cap_humano'].includes(usuario?.rol)

  const cargar = () => {
    setLoading(true)
    api.get('/admin/periodos')
      .then(res => setPeriodos(res.data || []))
      .catch(() => setPeriodos([]))
      .finally(() => setLoading(false))
  }

  const eliminarPeriodo = async (e, p) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar el período "${p.nombre}"?\nEsto borrará también su nómina e incidencias.`)) return
    setEliminando(p.id)
    try {
      await api.delete(`/admin/periodos/${p.id}`)
      cargar()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al eliminar.')
    } finally {
      setEliminando(null)
    }
  }

  useEffect(() => { cargar() }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Nómina Administrativos</h1>
          <p className="text-sm text-slate-500 mt-1">Períodos de pago del personal administrativo</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo período
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 animate-pulse py-12 text-center">Cargando períodos...</div>
      ) : periodos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center">
          <p className="text-slate-400 text-sm">No hay períodos registrados.</p>
          {canEdit && (
            <button onClick={() => setShowModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg">
              Crear el primer período
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map(p => {
                const cfg = ESTADO_CONFIG[p.estado] || ESTADO_CONFIG.cerrado
                return (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{p.nombre}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {fmtFecha(p.fecha_inicio)} — {fmtFecha(p.fecha_fin)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canEdit && (
                          <button
                            onClick={e => eliminarPeriodo(e, p)}
                            disabled={eliminando === p.id}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50">
                            {eliminando === p.id ? 'Eliminando...' : 'Eliminar'}
                          </button>
                        )}
                        <button onClick={() => navigate(`/admin/nomina/${p.id}`)}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                          Ver detalle →
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ModalNuevoPeriodo
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); cargar() }}
        />
      )}
    </div>
  )
}
