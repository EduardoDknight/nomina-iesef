import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// ── Cursor SVG personalizado (I-beam con halo oscuro, visible en cualquier fondo) ──
const IBEAM_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='24' viewBox='0 0 20 24'%3E%3Cpath d='M6 1h8M6 23h8M10 1v22' stroke='%23000' stroke-width='3.5' stroke-linecap='round'/%3E%3Cpath d='M6 1h8M6 23h8M10 1v22' stroke='%23fff' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E") 10 12, text`

// ── Animación red neuronal ─────────────────────────────────────────────────────
//  Fase 1: nodos nacen uno a uno con fade-in
//  Fase 2: nodos derivan, conexiones aparecen/desaparecen por distancia
//  Fase 3: señales (puntos luminosos) viajan por las conexiones activas

function NeuralCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // ── Parámetros ──
    const NODE_COUNT   = 32
    const MAX_DIST     = 175
    const SPEED        = 0.26
    const BIRTH_DELAY  = 180      // ms entre nacimientos de nodos
    const FRAME_MS     = 1000 / 30
    const SIG_SPEED    = 0.008    // velocidad señal (0→1 por frame a 30fps ≈ ~4s)
    const SIG_MAX      = 5        // señales simultáneas
    const SIG_INTERVAL = 800      // ms entre nuevas señales

    let w, h
    let nodes    = []
    let signals  = []
    let raf, lastTime = 0
    let lastBirth = 0, nodesSpawned = 0
    let lastSig   = 0

    const resize = () => {
      w = canvas.width  = window.innerWidth
      h = canvas.height = window.innerHeight
      // Re-distribuir nodos existentes si hay resize
      nodes.forEach(n => {
        n.x = Math.random() * w
        n.y = Math.random() * h
      })
    }

    const spawnNode = () => {
      nodes.push({
        x:       Math.random() * w,
        y:       Math.random() * h,
        vx:      (Math.random() - 0.5) * SPEED,
        vy:      (Math.random() - 0.5) * SPEED,
        r:       Math.random() * 1.2 + 0.9,
        opacity: 0,           // nace invisible
        born:    false,       // true cuando opacity >= 1
      })
    }

    const spawnSignal = () => {
      if (signals.length >= SIG_MAX) return
      // Buscar una conexión activa (ambos nodos con opacity > 0.5)
      const active = []
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].opacity < 0.5) continue
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[j].opacity < 0.5) continue
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          if (Math.sqrt(dx * dx + dy * dy) < MAX_DIST) {
            active.push([i, j])
          }
        }
      }
      if (!active.length) return
      const [a, b] = active[Math.floor(Math.random() * active.length)]
      // dirección aleatoria
      const [from, to] = Math.random() < 0.5 ? [a, b] : [b, a]
      signals.push({ from, to, t: 0 })
    }

    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      if (document.hidden) return
      if (now - lastTime < FRAME_MS) return
      lastTime = now

      // ── Nacimiento progresivo de nodos ──
      if (nodesSpawned < NODE_COUNT && now - lastBirth > BIRTH_DELAY) {
        spawnNode()
        nodesSpawned++
        lastBirth = now
      }

      // ── Nueva señal periódica ──
      if (now - lastSig > SIG_INTERVAL) {
        spawnSignal()
        lastSig = now
      }

      ctx.clearRect(0, 0, w, h)

      // ── Mover y hacer crecer cada nodo ──
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > w) n.vx *= -1
        if (n.y < 0 || n.y > h) n.vy *= -1
        if (n.opacity < 1) {
          n.opacity = Math.min(1, n.opacity + 0.018)  // fade-in ~55 frames
          if (n.opacity >= 1) n.born = true
        }
      }

      // ── Conexiones ──
      for (let i = 0; i < nodes.length; i++) {
        const ni = nodes[i]
        if (ni.opacity < 0.05) continue
        for (let j = i + 1; j < nodes.length; j++) {
          const nj = nodes[j]
          if (nj.opacity < 0.05) continue
          const dx   = ni.x - nj.x
          const dy   = ni.y - nj.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MAX_DIST) {
            const fade  = Math.min(ni.opacity, nj.opacity)
            const alpha = fade * 0.20 * (1 - dist / MAX_DIST)
            ctx.beginPath()
            ctx.moveTo(ni.x, ni.y)
            ctx.lineTo(nj.x, nj.y)
            ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
            ctx.lineWidth   = 0.6
            ctx.stroke()
          }
        }
      }

      // ── Nodos ──
      for (const n of nodes) {
        if (n.opacity < 0.02) continue
        // Halo suave al nacer
        if (!n.born) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r * 3.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${(n.opacity * 0.06).toFixed(3)})`
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${(n.opacity * 0.50).toFixed(3)})`
        ctx.fill()
      }

      // ── Señales ──
      signals = signals.filter(s => s.t <= 1)
      for (const s of signals) {
        s.t += SIG_SPEED
        if (s.t > 1) continue
        const from = nodes[s.from], to = nodes[s.to]
        if (!from || !to) continue
        const x = from.x + (to.x - from.x) * s.t
        const y = from.y + (to.y - from.y) * s.t
        // Halo de la señal
        const grd = ctx.createRadialGradient(x, y, 0, x, y, 8)
        grd.addColorStop(0,   'rgba(180,210,255,0.55)')
        grd.addColorStop(0.4, 'rgba(140,180,255,0.18)')
        grd.addColorStop(1,   'rgba(140,180,255,0)')
        ctx.beginPath()
        ctx.arc(x, y, 8, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()
        // Punto central
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(200,225,255,0.90)'
        ctx.fill()
      }
    }

    resize()
    window.addEventListener('resize', resize, { passive: true })
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────

export default function Login() {
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [error,         setError]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [showPass,      setShowPass]      = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const { login } = useAuth()
  const navigate  = useNavigate()

  // Captura el evento de instalación PWA (solo aparece en móvil/tablet cuando Chrome
  // considera que la app es instalable y no está ya instalada en modo standalone)
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    if (isStandalone) return   // ya está instalada, no mostrar botón

    const isMobileTablet = window.innerWidth < 1024
    if (!isMobileTablet) return

    const handler = (e) => {
      e.preventDefault()        // evita que Chrome muestre el banner automático
      setInstallPrompt(e)       // guardamos el prompt para dispararlo con el botón
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      login(res.data)
      if (res.data.debe_cambiar_password) {
        navigate('/cambiar-password', { replace: true })
      } else if (res.data.rol === 'docente') {
        navigate('/portal/docente', { replace: true })
      } else if (res.data.rol === 'trabajador') {
        navigate('/portal/trabajador', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      const det = err.response?.data?.detail
      setError(typeof det === 'string' ? det : 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  const inputBase = {
    background:  'rgba(255,255,255,0.07)',
    border:      '1px solid rgba(255,255,255,0.12)',
    fontSize:    '16px',          // evita zoom automático en iOS
    caretColor:  '#e2e8f0',       // cursor de texto visible
    cursor:      IBEAM_CURSOR,    // I-beam con halo negro, visible en fondo oscuro
  }
  const inputFocus = '1px solid rgba(139,16,32,0.80)'
  const inputBlur  = '1px solid rgba(255,255,255,0.12)'

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background:    'linear-gradient(150deg, #061833 0%, #0a2244 55%, #040f1f 100%)',
        paddingTop:    'env(safe-area-inset-top,    12px)',
        paddingBottom: 'env(safe-area-inset-bottom, 12px)',
        paddingLeft:   'env(safe-area-inset-left,   16px)',
        paddingRight:  'env(safe-area-inset-right,  16px)',
      }}
    >
      {/* Animación */}
      <NeuralCanvas />

      {/* Destellos estáticos */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: '#8B1020', filter: 'blur(80px)' }} />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full opacity-10"
          style={{ background: '#8B1020', filter: 'blur(100px)' }} />
        <div className="absolute top-0 left-0 w-0.5 h-full"
          style={{ background: 'linear-gradient(to bottom, transparent, #8B1020 30%, #8B1020 70%, transparent)' }} />
      </div>

      {/* Contenido */}
      <div className="relative z-10 w-full px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-sm mx-auto">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4 px-6 py-4 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <img
                src="/logo-iesef.png"
                alt="IESEF"
                className="h-16 sm:h-20 w-auto object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
                loading="eager"
              />
            </div>
            <h1 className="font-bold text-2xl sm:text-3xl text-center tracking-widest uppercase"
              style={{ color: 'white', letterSpacing: '0.25em' }}>
              NEXO
            </h1>
            <p className="text-xs mt-1 text-center font-medium tracking-wider uppercase"
              style={{ color: 'rgba(255,255,255,0.40)', letterSpacing: '0.12em' }}>
              Plataforma de Gestión Institucional
            </p>
            <p className="text-xs mt-0.5 text-center" style={{ color: 'rgba(255,255,255,0.22)' }}>
              Instituto de Estudios Superiores Elise Freinet
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl p-6 shadow-2xl"
            style={{
              background:           'rgba(255,255,255,0.05)',
              backdropFilter:       'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border:               '1px solid rgba(255,255,255,0.09)',
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-7 h-0.5 rounded-full" style={{ background: '#8B1020' }} />
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Iniciar sesión
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* Email */}
              <div>
                <label htmlFor="login-email"
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'rgba(255,255,255,0.50)' }}>
                  Usuario o correo
                </label>
                <input
                  id="login-email"
                  type="text"
                  autoComplete="username"
                  inputMode="text"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="correo@iesef.edu.mx o usuario"
                  className="w-full px-4 py-3 rounded-lg text-white placeholder-white/25 outline-none transition-colors"
                  style={inputBase}
                  onFocus={e => (e.target.style.border = inputFocus)}
                  onBlur ={e => (e.target.style.border = inputBlur)}
                />
              </div>

              {/* Contraseña */}
              <div>
                <label htmlFor="login-pass"
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'rgba(255,255,255,0.50)' }}>
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="login-pass"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-11 rounded-lg text-white placeholder-white/25 outline-none transition-colors"
                    style={inputBase}
                    onFocus={e => (e.target.style.border = inputFocus)}
                    onBlur ={e => (e.target.style.border = inputBlur)}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:text-white/60"
                    style={{ color: 'rgba(255,255,255,0.30)' }}
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPass ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M3 3l18 18M10.477 10.477A3 3 0 0013.5 13.5M6.343 6.343A9.965 9.965 0 003 12c2 4.5 6.5 7.5 9 7.5a9.77 9.77 0 004.657-1.186M9.88 4.879A9.965 9.965 0 0112 4.5c2.5 0 7 3 9 7.5-.75 1.692-1.874 3.134-3.18 4.22" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div role="alert"
                  className="flex items-start gap-2 p-3 rounded-lg text-sm"
                  style={{ background: 'rgba(139,16,32,0.20)', border: '1px solid rgba(139,16,32,0.40)', color: '#fca5a5' }}>
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Botón */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 text-white font-semibold rounded-lg transition-all active:scale-95 disabled:cursor-not-allowed select-none mt-1"
                style={{
                  background: loading ? 'rgba(139,16,32,0.5)' : '#8B1020',
                  boxShadow:  '0 4px 20px rgba(139,16,32,0.35)',
                  fontSize:   '15px',
                  minHeight:  '48px',
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#6f0d1a' }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#8B1020' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verificando...
                  </span>
                ) : 'Entrar'}
              </button>
            </form>
          </div>

          {/* Botón instalar PWA — solo aparece en móvil/tablet cuando Chrome ofrece la instalación */}
          {installPrompt && (
            <button
              onClick={handleInstall}
              className="flex items-center gap-2 mx-auto mt-5 px-4 py-2 rounded-xl text-xs transition-all active:scale-95"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border:     '1px solid rgba(255,255,255,0.12)',
                color:      'rgba(255,255,255,0.45)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              Instalar app
            </button>
          )}

          <p className="text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.15)' }}>
            IESEF · Sistema Interno · v1.0
          </p>
        </div>
      </div>
    </div>
  )
}
