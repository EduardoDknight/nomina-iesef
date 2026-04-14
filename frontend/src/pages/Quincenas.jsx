import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

const ESTADO_CONFIG = {
  abierta:     { label: 'Abierta',     color: 'bg-emerald-100 text-emerald-700' },
  en_revision: { label: 'En revisión', color: 'bg-amber-100 text-amber-700' },
  cerrada:     { label: 'Cerrada',     color: 'bg-slate-100 text-slate-600' },
  pagada:      { label: 'Pagada',      color: 'bg-blue-100 text-blue-700' },
}

function Modal({ onClose, onSave }) {
  const [form, setForm] = useState({ fecha_inicio: '', fecha_fin: '', ciclo: '', razon_social: 'ambas' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ciclos, setCiclos] = useState([])

  useEffect(() => {
    api.get('/quincenas/ciclos-disponibles').then(r => {
      setCiclos(r.data)
      if (r.data.length === 1) setForm(f => ({ ...f, ciclo: r.data[0] }))
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/quincenas', form)
      onSave()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear la quincena.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Nueva quincena</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha inicio</label>
              <input type="date" required value={form.fecha_inicio}
                onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha fin</label>
              <input type="date" required value={form.fecha_fin}
                onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Ciclo académico</label>
            {ciclos.length > 0 ? (
              <select required value={form.ciclo} onChange={e => setForm(f => ({ ...f, ciclo: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Selecciona un ciclo…</option>
                {ciclos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input type="text" required placeholder="Ej. 2026-1" value={form.ciclo}
                onChange={e => setForm(f => ({ ...f, ciclo: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Razón social</label>
            <select value={form.razon_social}
              onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="ambas">Ambas (Centro + Instituto)</option>
              <option value="centro">Solo Centro</option>
              <option value="instituto">Solo Instituto</option>
            </select>
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 px-4 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg">
              {loading ? 'Creando...' : 'Crear quincena'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Quincenas() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [quincenas, setQuincenas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const canEdit = ['superadmin', 'director_cap_humano', 'cap_humano', 'coord_docente'].includes(usuario?.rol)

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await api.get('/quincenas')
      setQuincenas(res.data)
    } catch {
      setQuincenas([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const cambiarEstado = async (e, id, nuevoEstado) => {
    e.stopPropagation()
    try {
      await api.patch(`/quincenas/${id}/estado`, null, { params: { nuevo_estado: nuevoEstado } })
      cargar()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al cambiar estado.')
    }
  }

  const fmtFecha = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quincenas</h1>
          <p className="text-slate-500 text-sm mt-0.5">Gestión de períodos de nómina</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva quincena
          </button>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                </div>
                <div className="h-6 bg-slate-200 rounded w-20"></div>
              </div>
            </div>
          ))
        ) : quincenas.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-slate-400">No hay quincenas registradas.</p>
          </div>
        ) : (
          quincenas.map(q => {
            const cfg = ESTADO_CONFIG[q.estado] || { label: q.estado, color: 'bg-slate-100 text-slate-600' }
            return (
              <div key={q.id}
                onClick={() => navigate(`/quincenas/${q.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-slate-800">
                        {fmtFecha(q.fecha_inicio)} — {fmtFecha(q.fecha_fin)}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Ciclo {q.ciclo} · {q.razon_social === 'ambas' ? 'Centro + Instituto' : q.razon_social} · ID #{q.id}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                    {canEdit && q.estado === 'abierta' && (
                      <button onClick={e => cambiarEstado(e, q.id, 'en_revision')}
                        className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors">
                        Enviar a revisión
                      </button>
                    )}
                    {canEdit && q.estado === 'en_revision' && (
                      <button onClick={e => cambiarEstado(e, q.id, 'cerrada')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors">
                        Cerrar quincena
                      </button>
                    )}
                    {canEdit && q.estado === 'cerrada' && (
                      <button onClick={e => cambiarEstado(e, q.id, 'pagada')}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors">
                        Marcar como pagada
                      </button>
                    )}
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {showModal && (
        <Modal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); cargar() }} />
      )}
    </div>
  )
}
