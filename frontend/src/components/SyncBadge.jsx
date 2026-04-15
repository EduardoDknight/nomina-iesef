/**
 * SyncBadge — Indicador de última sincronización con el checador MB360
 *
 * Variantes:
 *   compact  → píldora pequeña inline para headers  (default)
 *   full     → tarjeta expandida para Estadísticas
 *   portal   → versión compacta para portales móviles
 *
 * Colores automáticos por frescura:
 *   < 30 min  → verde   (datos frescos)
 *   30-60 min → ámbar   (próxima sincronización)
 *   > 60 min  → rojo    (posible problema)
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

// ── Helpers ──────────────────────────────────────────────────────────────────

function minutosDesde(isoString) {
  if (!isoString) return null
  const diff = (Date.now() - new Date(isoString).getTime()) / 60000
  return Math.round(diff)
}

function fmtRelativo(minutos) {
  if (minutos === null) return '—'
  if (minutos < 1)   return 'Ahora mismo'
  if (minutos === 1) return 'Hace 1 min'
  if (minutos < 60)  return `Hace ${minutos} min`
  const hrs = Math.floor(minutos / 60)
  const min = minutos % 60
  if (hrs === 1 && min === 0) return 'Hace 1 hr'
  if (hrs === 1) return `Hace 1 hr ${min} min`
  if (min === 0) return `Hace ${hrs} hrs`
  return `Hace ${hrs} h ${min} min`
}

function fmtHora(isoString) {
  if (!isoString) return null
  return new Date(isoString).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fmtFechaHora(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  const hoy = new Date()
  const esHoy = d.toDateString() === hoy.toDateString()
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (esHoy) return `hoy ${hora}`
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' + hora
}

function colorConfig(minutos) {
  if (minutos === null) {
    return {
      dot:    '#94a3b8',
      bg:     '#f8fafc',
      border: '#e2e8f0',
      text:   '#64748b',
      label:  'Sin datos',
      pulse:  false,
    }
  }
  if (minutos <= 30) {
    return {
      dot:    '#10b981',
      bg:     '#f0fdf4',
      border: '#bbf7d0',
      text:   '#065f46',
      label:  'Al día',
      pulse:  true,
    }
  }
  if (minutos <= 60) {
    return {
      dot:    '#f59e0b',
      bg:     '#fffbeb',
      border: '#fde68a',
      text:   '#92400e',
      label:  'Actualizando',
      pulse:  false,
    }
  }
  return {
    dot:    '#ef4444',
    bg:     '#fef2f2',
    border: '#fecaca',
    text:   '#991b1b',
    label:  'Sin conexión',
    pulse:  false,
  }
}

// ── Hook principal ────────────────────────────────────────────────────────────

function useSyncInfo() {
  const [ultimoSync, setUltimoSync] = useState(null)
  const [total, setTotal]           = useState(null)
  const [cargando, setCargando]     = useState(true)
  const [minutos, setMinutos]       = useState(null)

  const fetchSync = useCallback(async () => {
    try {
      const { data } = await api.get('/asistencias/ultimo_sync')
      setUltimoSync(data.ultimo_sync ?? null)
      setTotal(data.total_registros ?? null)
    } catch {
      // no rompe la UI si falla
    } finally {
      setCargando(false)
    }
  }, [])

  // Cargar al montar y cada 5 minutos
  useEffect(() => {
    fetchSync()
    const iv = setInterval(fetchSync, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [fetchSync])

  // Actualizar el contador relativo cada minuto sin re-fetchear
  useEffect(() => {
    const tick = () => setMinutos(minutosDesde(ultimoSync))
    tick()
    const iv = setInterval(tick, 60 * 1000)
    return () => clearInterval(iv)
  }, [ultimoSync])

  return { ultimoSync, total, cargando, minutos }
}

// ── Variante: compact (para headers de página) ───────────────────────────────

export function SyncBadgeCompact() {
  const { minutos, ultimoSync, cargando } = useSyncInfo()

  if (cargando) return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8' }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: '#cbd5e1' }} />
      Sincronizando…
    </div>
  )

  const cfg = colorConfig(minutos)

  return (
    <div title={`Última sincronización con MB360: ${fmtFechaHora(ultimoSync) ?? 'desconocida'}\nActualización automática cada 30 min`}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-default select-none transition-colors"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${cfg.pulse ? 'animate-pulse' : ''}`}
        style={{ background: cfg.dot }} />
      {minutos !== null ? fmtRelativo(minutos) : '—'}
    </div>
  )
}

// ── Variante: full (para Estadísticas) ───────────────────────────────────────

export function SyncBadgeFull() {
  const { minutos, ultimoSync, total, cargando } = useSyncInfo()

  if (cargando) return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse inline-block" />
      Cargando…
    </div>
  )

  const cfg = colorConfig(minutos)
  const hora = fmtHora(ultimoSync)

  return (
    <div title={`Última sincronización con MB360: ${fmtFechaHora(ultimoSync) ?? 'desconocida'}\nActualización automática cada 30 min`}
      className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-default select-none"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${cfg.pulse ? 'animate-pulse' : ''}`}
        style={{ background: cfg.dot }} />
      <span>
        {cfg.label}
        {hora && (
          <span className="ml-1 opacity-75">· MB360 {hora}</span>
        )}
        {total !== null && (
          <span className="ml-1 opacity-60">· {total.toLocaleString()} checadas</span>
        )}
      </span>
    </div>
  )
}

// ── Variante: portal (móvil, ancho completo, banner sutil) ───────────────────

export function SyncBadgePortal() {
  const { minutos, ultimoSync, cargando } = useSyncInfo()

  if (cargando) return null

  const cfg = colorConfig(minutos)

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.pulse ? 'animate-pulse' : ''}`}
        style={{ background: cfg.dot }} />
      <span>
        <span className="font-medium">Checador MB360 · {fmtRelativo(minutos)}</span>
        {ultimoSync && (
          <span className="ml-1 opacity-70">({fmtFechaHora(ultimoSync)})</span>
        )}
        <span className="ml-1 opacity-60">· actualización cada 30 min</span>
      </span>
    </div>
  )
}

// Default export = compact
export default SyncBadgeCompact
