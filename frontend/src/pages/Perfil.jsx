/**
 * Perfil — Página de perfil para roles administrativos de la plataforma.
 * Permite:
 *   1. Cambiar foto de perfil (resize client-side ≤ 200×200 px antes de enviar)
 *   2. Cambiar contraseña
 *
 * Accesible desde el dropdown del header → "Mi perfil"
 */
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// ── Helper: redimensionar imagen en el cliente ────────────────────────────────

function resizarImagen(file, maxPx = 200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale  = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const w      = Math.round(img.width  * scale)
      const h      = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      // Fondo blanco para imágenes con transparencia (PNG)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')) }
    img.src = url
  })
}

// ── Componente Avatar grande ──────────────────────────────────────────────────

function AvatarGrande({ usuario, preview }) {
  const src = preview ?? usuario?.foto_perfil
  if (src) {
    return (
      <img
        src={src}
        alt={usuario?.nombre}
        className="w-24 h-24 rounded-full object-cover border-4"
        style={{ borderColor: 'rgba(139,16,32,0.35)' }}
      />
    )
  }
  return (
    <div className="w-24 h-24 rounded-full flex items-center justify-center border-4 select-none"
      style={{ background: 'rgba(139,16,32,0.15)', borderColor: 'rgba(139,16,32,0.35)' }}>
      <span className="text-3xl font-bold" style={{ color: '#8B1020' }}>
        {usuario?.nombre?.charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

const ROLES_LABEL = {
  superadmin:          'Superadmin',
  director_cap_humano: 'Director Cap. Humano',
  cap_humano:          'Capital Humano',
  finanzas:            'Finanzas',
  coord_docente:       'Coordinación Docente',
  servicios_escolares: 'Servicios Escolares',
  coord_academica:     'Coord. Académica',
  educacion_virtual:   'Educación Virtual',
}

export default function Perfil() {
  const { usuario, actualizarFoto, marcarPasswordCambiado } = useAuth()
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  // Foto
  const [preview,     setPreview]     = useState(null)
  const [fotoMsg,     setFotoMsg]     = useState(null)
  const [guardandoFoto, setGuardandoFoto] = useState(false)

  // Contraseña
  const [pwForm,  setPwForm]  = useState({ actual: '', nueva: '', confirma: '' })
  const [pwMsg,   setPwMsg]   = useState(null)
  const [pwSaving, setPwSaving] = useState(false)
  const [showPw,  setShowPw]  = useState({ actual: false, nueva: false, confirma: false })

  // ── Foto ──────────────────────────────────────────────────────────────────

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''          // permite re-seleccionar el mismo archivo
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setFotoMsg({ tipo: 'error', texto: 'Solo se permiten archivos de imagen (JPG, PNG, WebP…)' })
      return
    }
    setFotoMsg(null)
    try {
      const b64 = await resizarImagen(file, 200, 0.82)
      setPreview(b64)
    } catch {
      setFotoMsg({ tipo: 'error', texto: 'No se pudo procesar la imagen' })
    }
  }

  const guardarFoto = async () => {
    if (!preview) return
    setGuardandoFoto(true)
    setFotoMsg(null)
    try {
      await api.patch('/auth/perfil', { foto_perfil: preview })
      actualizarFoto(preview)
      setPreview(null)
      setFotoMsg({ tipo: 'ok', texto: 'Foto de perfil actualizada' })
    } catch (err) {
      setFotoMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al guardar la foto' })
    } finally {
      setGuardandoFoto(false)
    }
  }

  const eliminarFoto = async () => {
    if (!confirm('¿Eliminar foto de perfil? Se mostrará tu inicial.')) return
    setGuardandoFoto(true)
    setFotoMsg(null)
    try {
      await api.patch('/auth/perfil', { foto_perfil: null })
      actualizarFoto(null)
      setPreview(null)
      setFotoMsg({ tipo: 'ok', texto: 'Foto eliminada' })
    } catch (err) {
      setFotoMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al eliminar la foto' })
    } finally {
      setGuardandoFoto(false)
    }
  }

  // ── Contraseña ────────────────────────────────────────────────────────────

  const cambiarPassword = async (e) => {
    e.preventDefault()
    setPwMsg(null)
    if (pwForm.nueva !== pwForm.confirma) {
      setPwMsg({ tipo: 'error', texto: 'Las contraseñas nuevas no coinciden' })
      return
    }
    if (pwForm.nueva.length < 6) {
      setPwMsg({ tipo: 'error', texto: 'La contraseña debe tener al menos 6 caracteres' })
      return
    }
    setPwSaving(true)
    try {
      await api.post('/auth/cambiar-password', {
        password_actual:   pwForm.actual,
        password_nueva:    pwForm.nueva,
        password_confirma: pwForm.confirma,
      })
      marcarPasswordCambiado()
      setPwForm({ actual: '', nueva: '', confirma: '' })
      setPwMsg({ tipo: 'ok', texto: 'Contraseña actualizada correctamente' })
    } catch (err) {
      setPwMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al cambiar la contraseña' })
    } finally {
      setPwSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto">

      {/* Encabezado */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800
                     text-sm font-medium mb-3 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
        <h1 className="text-xl font-bold text-slate-800">Mi perfil</h1>
        <p className="text-sm text-slate-500 mt-0.5">{usuario?.nombre} · {ROLES_LABEL[usuario?.rol]}</p>
      </div>

      {/* ── Tarjeta: foto de perfil ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-4">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Foto de perfil</h2>

        <div className="flex items-center gap-6 flex-wrap">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <AvatarGrande usuario={usuario} preview={preview} />
            {/* Badge "nueva" si hay preview */}
            {preview && (
              <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[10px]
                               font-bold px-1.5 py-0.5 rounded-full">
                Vista previa
              </span>
            )}
          </div>

          {/* Acciones */}
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-sm text-slate-600 mb-2">
                La imagen se redimensiona automáticamente a 200×200 px antes de guardarse.
                Formatos admitidos: JPG, PNG, WebP.
              </p>
              {/* Input oculto */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                           bg-indigo-50 text-indigo-700 border border-indigo-200
                           hover:bg-indigo-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {preview ? 'Elegir otra imagen' : 'Elegir imagen'}
              </button>
            </div>

            {/* Botones guardar / cancelar / eliminar */}
            <div className="flex items-center gap-2 flex-wrap">
              {preview && (
                <>
                  <button
                    onClick={guardarFoto}
                    disabled={guardandoFoto}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold
                               rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white
                               disabled:opacity-50 transition-colors"
                  >
                    {guardandoFoto ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    Guardar foto
                  </button>
                  <button
                    onClick={() => { setPreview(null); setFotoMsg(null) }}
                    className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700
                               border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              )}
              {!preview && usuario?.foto_perfil && (
                <button
                  onClick={eliminarFoto}
                  disabled={guardandoFoto}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600
                             hover:text-red-700 border border-red-200 hover:bg-red-50
                             rounded-lg disabled:opacity-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Quitar foto
                </button>
              )}
            </div>

            {/* Mensaje */}
            {fotoMsg && (
              <div className={`text-sm px-3 py-2 rounded-lg border ${
                fotoMsg.tipo === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {fotoMsg.texto}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tarjeta: cambiar contraseña ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Cambiar contraseña</h2>

        <form onSubmit={cambiarPassword} className="space-y-4">
          {[
            { key: 'actual',   label: 'Contraseña actual',     placeholder: '••••••••' },
            { key: 'nueva',    label: 'Nueva contraseña',       placeholder: 'Mínimo 6 caracteres' },
            { key: 'confirma', label: 'Confirmar nueva contraseña', placeholder: '••••••••' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <div className="relative">
                <input
                  type={showPw[key] ? 'text' : 'password'}
                  value={pwForm[key]}
                  onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full pr-10 pl-3 py-2 text-sm border border-slate-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPw[key] ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}

          {/* Mensaje */}
          {pwMsg && (
            <div className={`text-sm px-3 py-2 rounded-lg border ${
              pwMsg.tipo === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {pwMsg.texto}
            </div>
          )}

          <button
            type="submit"
            disabled={pwSaving || !pwForm.actual || !pwForm.nueva || !pwForm.confirma}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold
                       rounded-lg bg-slate-800 hover:bg-slate-900 text-white
                       disabled:opacity-40 transition-colors"
          >
            {pwSaving ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
            Cambiar contraseña
          </button>
        </form>
      </div>

    </div>
  )
}
