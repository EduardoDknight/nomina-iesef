import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

// ── Paleta sidebar ─────────────────────────────────────────────────────────────
const SIDEBAR_BG   = '#061833'
const ACTIVE_BG    = '#8B1020'
const HOVER_BG     = 'rgba(255,255,255,0.06)'
const BORDER_COLOR = 'rgba(255,255,255,0.08)'
const TEXT_DIM     = 'rgba(255,255,255,0.40)'
const TEXT_SECTION = 'rgba(255,255,255,0.30)'

const ROLES_LABEL = {
  superadmin:          'Superadmin',
  director_cap_humano: 'Director Cap. Humano',
  cap_humano:          'Capital Humano',
  finanzas:            'Finanzas',
  coord_docente:       'Coordinación Docente',
  servicios_escolares: 'Servicios Escolares',
  coord_academica:     'Coord. Académica',
  educacion_virtual:   'Educación Virtual',
  docente:             'Docente',
  trabajador:          'Personal Admin.',
  reportes:            'Reportes',
}

// ── Íconos ────────────────────────────────────────────────────────────────────
const IconHome = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)
const IconUsers = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const IconCal = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const IconNomina = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const IconAdmon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)
const IconSettings = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const IconCharts = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const IconChevron = ({ open }) => (
  <svg className="w-3 h-3 flex-shrink-0 transition-transform duration-200"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
    fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
  </svg>
)
const IconMenu = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)
const IconX = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)
const IconMoon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
)
const IconSun = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
  </svg>
)
// Nuevos
const IconCollapseLeft = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
  </svg>
)
const IconExpandRight = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 5l7 7-7 7M5 5l7 7-7 7" />
  </svg>
)
const IconUserCircle = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconLogout = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
)
const IconChevronDown = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
  </svg>
)

// ── Navegación ─────────────────────────────────────────────────────────────────
const NAV_STRUCTURE = [
  { type: 'link', path: '/dashboard', label: 'Inicio', icon: <IconHome />, roles: null },
  {
    type: 'group', key: 'docentes', label: 'Docentes', icon: <IconUsers />,
    roles: ['director_cap_humano', 'cap_humano', 'finanzas', 'coord_docente', 'servicios_escolares'],
    children: [
      { path: '/docentes',  label: 'Docentes',      icon: <IconUsers />, roles: ['director_cap_humano','cap_humano','finanzas','coord_docente'] },
      { path: '/horarios',  label: 'Horarios',       icon: <IconCal />,   roles: ['director_cap_humano','cap_humano','coord_docente','servicios_escolares'] },
      { path: '/quincenas', label: 'Nómina Docente', icon: <IconNomina />,roles: ['director_cap_humano','cap_humano','finanzas'] },
    ],
  },
  {
    type: 'group', key: 'admin', label: 'Administrativos', icon: <IconAdmon />,
    roles: ['director_cap_humano', 'cap_humano'],
    children: [
      { path: '/admin/personal', label: 'Personal',    icon: <IconUsers />, roles: ['director_cap_humano','cap_humano'] },
      { path: '/admin/nomina',   label: 'Nómina Admin',icon: <IconNomina />,roles: ['director_cap_humano','cap_humano'] },
    ],
  },
  { type: 'link', path: '/estadisticas',  label: 'Estadísticas',  icon: <IconCharts />,  roles: ['director_cap_humano','cap_humano','superadmin','finanzas'] },
  { type: 'link', path: '/configuracion', label: 'Configuración', icon: <IconSettings />, roles: ['director_cap_humano','cap_humano'] },
]

// ── Tooltip (para sidebar colapsado) ─────────────────────────────────────────

function SideTooltip({ text, children }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3
                      text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap
                      opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
        style={{ background: '#0f172a', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
        {text}
        {/* Flecha */}
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent"
          style={{ borderRightColor: '#0f172a' }} />
      </div>
    </div>
  )
}

// ── Avatar de usuario ─────────────────────────────────────────────────────────

function UserAvatar({ usuario, size = 'sm' }) {
  const cls = size === 'sm'  ? 'w-7 h-7 text-xs'
            : size === 'md'  ? 'w-9 h-9 text-sm'
            :                  'w-8 h-8 text-xs'

  if (usuario?.foto_perfil) {
    return (
      <img
        src={usuario.foto_perfil}
        alt={usuario?.nombre ?? ''}
        className={`${cls} rounded-full object-cover flex-shrink-0 select-none`}
        style={{ border: '1.5px solid rgba(139,16,32,0.55)' }}
      />
    )
  }

  return (
    <div className={`${cls} rounded-full flex items-center justify-center flex-shrink-0 font-bold select-none`}
      style={{ background: 'rgba(139,16,32,0.30)', border: '1.5px solid rgba(139,16,32,0.55)', color: '#f87171' }}>
      {usuario?.nombre?.charAt(0).toUpperCase()}
    </div>
  )
}

// ── NavItem ────────────────────────────────────────────────────────────────────

function NavItem({ path, label, icon, disabled, onNavigate, collapsed }) {
  if (disabled) {
    if (collapsed) return (
      <SideTooltip text={`${label} (próximamente)`}>
        <div className="flex items-center justify-center w-9 h-9 rounded-lg mx-auto"
          style={{ color: 'rgba(255,255,255,0.15)', cursor: 'default' }}>
          {icon}
        </div>
      </SideTooltip>
    )
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs select-none"
        style={{ color: 'rgba(255,255,255,0.20)', cursor: 'default' }}>
        {icon}<span>{label}</span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.20)' }}>
          pronto
        </span>
      </div>
    )
  }

  if (collapsed) {
    return (
      <SideTooltip text={label}>
        <NavLink
          to={path}
          onClick={onNavigate}
          className="flex items-center justify-center w-9 h-9 rounded-lg mx-auto transition-all"
          style={({ isActive }) => ({
            background: isActive ? ACTIVE_BG : 'transparent',
            color:      isActive ? 'white'   : TEXT_DIM,
            boxShadow:  isActive ? '0 2px 10px rgba(139,16,32,0.35)' : 'none',
          })}
        >
          {icon}
        </NavLink>
      </SideTooltip>
    )
  }

  return (
    <NavLink
      to={path}
      onClick={onNavigate}
      className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all"
      style={({ isActive }) => ({
        background: isActive ? ACTIVE_BG : 'transparent',
        color:      isActive ? 'white'   : TEXT_DIM,
        boxShadow:  isActive ? '0 2px 10px rgba(139,16,32,0.35)' : 'none',
      })}
    >
      {icon}{label}
    </NavLink>
  )
}

// ── NavGroup ───────────────────────────────────────────────────────────────────

function NavGroup({ item, usuario, onNavigate, collapsed }) {
  const location  = useLocation()
  const anyActive = item.children.some(c => location.pathname.startsWith(c.path))
  const [open, setOpen] = useState(anyActive)

  const visibleChildren = item.children.filter(
    c => usuario?.rol === 'superadmin' || c.roles === null || c.roles.includes(usuario?.rol)
  )
  if (visibleChildren.length === 0) return null

  // Modo colapsado: muestra sólo el ícono del grupo → navega al primer hijo
  if (collapsed) {
    return (
      <SideTooltip text={item.label}>
        <NavLink
          to={visibleChildren[0].path}
          onClick={onNavigate}
          className="flex items-center justify-center w-9 h-9 rounded-lg mx-auto transition-all"
          style={{
            background: anyActive ? ACTIVE_BG : 'transparent',
            color:      anyActive ? 'white'   : TEXT_DIM,
            boxShadow:  anyActive ? '0 2px 10px rgba(139,16,32,0.35)' : 'none',
          }}
        >
          {item.icon}
        </NavLink>
      </SideTooltip>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all select-none"
        style={{ color: anyActive ? 'white' : TEXT_DIM, background: anyActive && !open ? 'rgba(139,16,32,0.15)' : 'transparent' }}
      >
        {item.icon}
        <span className="flex-1 text-left">{item.label}</span>
        <IconChevron open={open} />
      </button>
      {open && (
        <div className="ml-3 mt-0.5 mb-1 pl-3 space-y-0.5" style={{ borderLeft: `1px solid ${BORDER_COLOR}` }}>
          {visibleChildren.map(child => (
            <NavItem key={child.path} path={child.path} label={child.label}
              icon={child.icon} disabled={child.disabled} onNavigate={onNavigate} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Layout principal ───────────────────────────────────────────────────────────

export default function Layout() {
  const { usuario, logout } = useAuth()
  const { dark, toggle: toggleTheme } = useTheme()
  const navigate  = useNavigate()
  const location  = useLocation()

  // Sidebar colapsado (solo desktop)
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('nexo-sidebar-collapsed') === 'true'
  )
  // Sidebar móvil
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Dropdown perfil
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)

  // Cerrar sidebar móvil al cambiar ruta
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Bloquear scroll body cuando drawer abierto en móvil
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const closeSidebar = () => setSidebarOpen(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const toggleCollapsed = () => {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem('nexo-sidebar-collapsed', String(next))
      return next
    })
  }

  // ── Contenido del sidebar ────────────────────────────────────────────────────

  const SidebarContent = ({ forMobile = false }) => {
    const col = forMobile ? false : collapsed   // móvil siempre expandido
    return (
      <>
        {/* Marca */}
        <div className="flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}>
          {col ? (
            // Colapsado: sólo "N" centrado
            <div className="flex items-center justify-center py-4">
              <span className="text-white font-black text-lg" style={{ letterSpacing: '0.1em' }}>N</span>
              <span className="text-[10px] font-bold" style={{ color: '#8B1020', marginLeft: 1 }}>·</span>
            </div>
          ) : (
            <div className="px-5 pt-5 pb-4 flex items-center justify-between">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-white font-bold tracking-widest text-lg uppercase"
                    style={{ letterSpacing: '0.22em' }}>NEXO</span>
                  <span className="text-xs font-medium" style={{ color: 'rgba(139,16,32,0.90)' }}>IESEF</span>
                </div>
                <p className="text-xs mt-0.5 font-medium tracking-wide" style={{ color: TEXT_SECTION }}>
                  Gestión Institucional
                </p>
              </div>
              {/* Botón cerrar drawer en móvil */}
              {forMobile && (
                <button onClick={closeSidebar} className="md:hidden p-1.5 rounded-lg" style={{ color: TEXT_DIM }}>
                  <IconX />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden
                        ${col ? 'px-2' : 'px-3'}`}>
          {NAV_STRUCTURE.map(item => {
            const visible = usuario?.rol === 'superadmin' || item.roles === null || item.roles.includes(usuario?.rol)
            if (!visible) return null

            if (item.type === 'link') {
              if (col) {
                return (
                  <SideTooltip key={item.path} text={item.label}>
                    <NavLink
                      to={item.path}
                      onClick={closeSidebar}
                      className="flex items-center justify-center w-9 h-9 rounded-lg mx-auto transition-all"
                      style={({ isActive }) => ({
                        background: isActive ? ACTIVE_BG : 'transparent',
                        color:      isActive ? 'white'   : TEXT_DIM,
                        boxShadow:  isActive ? '0 2px 12px rgba(139,16,32,0.4)' : 'none',
                      })}
                    >
                      {item.icon}
                    </NavLink>
                  </SideTooltip>
                )
              }
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={closeSidebar}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={({ isActive }) => ({
                    background: isActive ? ACTIVE_BG : 'transparent',
                    color:      isActive ? 'white'   : TEXT_DIM,
                    boxShadow:  isActive ? '0 2px 12px rgba(139,16,32,0.4)' : 'none',
                  })}
                >
                  {item.icon}{item.label}
                </NavLink>
              )
            }
            if (item.type === 'group') {
              return (
                <NavGroup key={item.key} item={item} usuario={usuario}
                  onNavigate={closeSidebar} collapsed={col} />
              )
            }
            return null
          })}
        </nav>

        {/* Toggle colapsar (solo desktop) */}
        {!forMobile && (
          <div className="flex-shrink-0 px-2 py-2" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
            <button
              onClick={toggleCollapsed}
              title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
              className="w-full flex items-center rounded-lg py-2 text-xs transition-all"
              style={{ color: TEXT_DIM, paddingLeft: collapsed ? 0 : '0.75rem', justifyContent: collapsed ? 'center' : 'flex-start' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = HOVER_BG }}
              onMouseLeave={e => { e.currentTarget.style.color = TEXT_DIM; e.currentTarget.style.background = 'transparent' }}
            >
              {collapsed ? <IconExpandRight /> : (
                <>
                  <IconCollapseLeft />
                  <span className="ml-2">Colapsar</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Usuario + logout */}
        <div className="flex-shrink-0" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
          {col ? (
            // Colapsado: sólo avatar centrado
            <div className="flex justify-center py-3">
              <SideTooltip text={usuario?.nombre ?? ''}>
                <UserAvatar usuario={usuario} size="sm" />
              </SideTooltip>
            </div>
          ) : (
            <div className="px-3 py-4">
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1">
                <UserAvatar usuario={usuario} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{usuario?.nombre}</p>
                  <p className="text-xs truncate" style={{ color: TEXT_DIM }}>{ROLES_LABEL[usuario?.rol]}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                style={{ color: TEXT_DIM }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = HOVER_BG }}
                onMouseLeave={e => { e.currentTarget.style.color = TEXT_DIM;  e.currentTarget.style.background = 'transparent' }}
              >
                <IconLogout />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden"
      style={{ background: dark ? '#0f172a' : '#f1f4f8', transition: 'background 0.2s ease' }}>

      {/* ── Sidebar desktop ──────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-shrink-0 flex-col overflow-hidden"
        style={{
          background: SIDEBAR_BG,
          width: collapsed ? '56px' : '240px',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <SidebarContent forMobile={false} />
      </aside>

      {/* ── Sidebar móvil — overlay deslizable ─────────────────────────── */}
      <div
        className="md:hidden fixed inset-0 z-40 transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.55)', opacity: sidebarOpen ? 1 : 0,
                 pointerEvents: sidebarOpen ? 'auto' : 'none' }}
        onClick={closeSidebar}
      />
      <aside
        className="md:hidden fixed top-0 left-0 h-full z-50 flex flex-col w-72 max-w-[85vw] transition-transform duration-300"
        style={{ background: SIDEBAR_BG, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <SidebarContent forMobile={true} />
      </aside>

      {/* ── Contenido principal ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar móvil */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: SIDEBAR_BG, borderBottom: `1px solid ${BORDER_COLOR}` }}>
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg"
            style={{ color: 'rgba(255,255,255,0.6)' }}>
            <IconMenu />
          </button>
          <div className="flex items-baseline gap-1.5">
            <span className="text-white font-bold tracking-widest text-base"
              style={{ letterSpacing: '0.20em' }}>NEXO</span>
            <span className="text-xs font-medium" style={{ color: 'rgba(139,16,32,0.90)' }}>IESEF</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggleTheme} className="p-1.5 rounded-lg"
              style={{ color: 'rgba(255,255,255,0.6)' }} title={dark ? 'Modo claro' : 'Modo oscuro'}>
              {dark ? <IconSun /> : <IconMoon />}
            </button>
            <UserAvatar usuario={usuario} size="sm" />
          </div>
        </header>

        {/* Top bar desktop */}
        <header className="hidden md:flex items-center justify-end gap-3 px-5 py-2.5 flex-shrink-0"
          style={{
            background: dark ? '#0f172a' : '#ffffff',
            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            transition: 'background 0.2s ease',
          }}>

          {/* Toggle claro/oscuro */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{ color: dark ? 'rgba(255,255,255,0.65)' : '#475569',
                     background: dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }}
            onMouseEnter={e => { e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.12)' : '#e2e8f0'
                                 e.currentTarget.style.color = dark ? 'white' : '#1e293b' }}
            onMouseLeave={e => { e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'
                                 e.currentTarget.style.color = dark ? 'rgba(255,255,255,0.65)' : '#475569' }}
            title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {dark ? <IconSun /> : <IconMoon />}
            <span>{dark ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>

          {/* Separador */}
          <div className="w-px h-5" style={{ background: dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0' }} />

          {/* Avatar + dropdown de perfil */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(v => !v)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg transition-all"
              style={{ color: dark ? 'rgba(255,255,255,0.70)' : '#374151' }}
              onMouseEnter={e => { e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <UserAvatar usuario={usuario} size="sm" />
              <span className="text-sm font-medium hidden lg:block max-w-[140px] truncate">
                {usuario?.nombre}
              </span>
              <IconChevronDown />
            </button>

            {/* Dropdown */}
            {profileOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-60 rounded-xl overflow-hidden z-50"
                style={{
                  background:  dark ? '#1e293b' : '#ffffff',
                  border:      `1px solid ${dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`,
                  boxShadow:   dark
                    ? '0 8px 32px rgba(0,0,0,0.5)'
                    : '0 8px 32px rgba(0,0,0,0.12)',
                }}
              >
                {/* Cabecera */}
                <div className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'}` }}>
                  <UserAvatar usuario={usuario} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate"
                      style={{ color: dark ? '#f1f5f9' : '#1e293b' }}>
                      {usuario?.nombre}
                    </p>
                    <p className="text-xs truncate mt-0.5"
                      style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                      {ROLES_LABEL[usuario?.rol]}
                    </p>
                  </div>
                </div>

                {/* Opciones */}
                <div className="py-1.5">
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/perfil') }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                    style={{ color: dark ? '#e2e8f0' : '#374151' }}
                    onMouseEnter={e => { e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.05)' : '#f8fafc' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <IconUserCircle />
                    Mi perfil
                  </button>

                  <div className="mx-3 my-1"
                    style={{ height: '1px', background: dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }} />

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                    style={{ color: '#ef4444' }}
                    onMouseEnter={e => { e.currentTarget.style.background = dark ? 'rgba(239,68,68,0.08)' : '#fef2f2' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <IconLogout />
                    Cerrar sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Contenido scrollable */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
