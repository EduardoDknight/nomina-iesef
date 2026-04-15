import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

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

const SIDEBAR_BG   = '#061833'
const ACTIVE_BG    = '#8B1020'
const HOVER_BG     = 'rgba(255,255,255,0.06)'
const BORDER_COLOR = 'rgba(255,255,255,0.08)'
const TEXT_DIM     = 'rgba(255,255,255,0.40)'
const TEXT_SECTION = 'rgba(255,255,255,0.30)'

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
  <svg
    className="w-3 h-3 flex-shrink-0 transition-transform duration-200"
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

// ── Navegación ────────────────────────────────────────────────────────────────
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

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ path, label, icon, disabled, onNavigate }) {
  if (disabled) {
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

// ── NavGroup ──────────────────────────────────────────────────────────────────
function NavGroup({ item, usuario, onNavigate }) {
  const location   = useLocation()
  const anyActive  = item.children.some(c => location.pathname.startsWith(c.path))
  const [open, setOpen] = useState(anyActive)

  const visibleChildren = item.children.filter(
    c => usuario?.rol === 'superadmin' || c.roles === null || c.roles.includes(usuario?.rol)
  )
  if (visibleChildren.length === 0) return null

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
              icon={child.icon} disabled={child.disabled} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function Layout() {
  const { usuario, logout } = useAuth()
  const { dark, toggle: toggleTheme } = useTheme()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Cerrar sidebar al cambiar de ruta (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Bloquear scroll del body cuando sidebar abierto en móvil
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  const closeSidebar = () => setSidebarOpen(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // ── Contenido del sidebar (reutilizado en desktop y mobile) ──────────────────
  const SidebarContent = () => (
    <>
      {/* Marca NEXO */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}>
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
        {/* Botón cerrar — solo visible en móvil */}
        <button
          onClick={closeSidebar}
          className="md:hidden p-1.5 rounded-lg transition-colors"
          style={{ color: TEXT_DIM }}
        >
          <IconX />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_STRUCTURE.map(item => {
          const visible = usuario?.rol === 'superadmin' || item.roles === null || item.roles.includes(usuario?.rol)
          if (!visible) return null

          if (item.type === 'link') {
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
            return <NavGroup key={item.key} item={item} usuario={usuario} onNavigate={closeSidebar} />
          }
          return null
        })}
      </nav>

      {/* Usuario + logout */}
      <div className="px-3 py-4 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(139,16,32,0.3)', border: '1px solid rgba(139,16,32,0.5)' }}>
            <span className="font-bold text-xs" style={{ color: '#f87171' }}>
              {usuario?.nombre?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{usuario?.nombre}</p>
            <p className="text-xs truncate" style={{ color: TEXT_DIM }}>{ROLES_LABEL[usuario?.rol]}</p>
          </div>
        </div>
        {/* Botón modo oscuro / claro */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all mb-1"
          style={{ color: TEXT_DIM }}
          onMouseEnter={e => { e.currentTarget.style.color = 'white';   e.currentTarget.style.background = HOVER_BG }}
          onMouseLeave={e => { e.currentTarget.style.color = TEXT_DIM;  e.currentTarget.style.background = 'transparent' }}
          title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {dark ? <IconSun /> : <IconMoon />}
          <span>{dark ? 'Modo claro' : 'Modo oscuro'}</span>
          {/* Indicador visual del estado actual */}
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: dark ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.15)',
                     color:      dark ? '#fbbf24'                : '#818cf8' }}>
            {dark ? 'oscuro' : 'claro'}
          </span>
        </button>

        {/* Cerrar sesión */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
          style={{ color: TEXT_DIM }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = HOVER_BG }}
          onMouseLeave={e => { e.currentTarget.style.color = TEXT_DIM;  e.currentTarget.style.background = 'transparent' }}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden"
      style={{ background: dark ? '#0f172a' : '#f1f4f8', transition: 'background 0.2s ease' }}>

      {/* ── Sidebar desktop (siempre visible ≥ md) ──────────────────────────── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 flex-col" style={{ background: SIDEBAR_BG }}>
        <SidebarContent />
      </aside>

      {/* ── Sidebar móvil — overlay deslizable ──────────────────────────────── */}
      {/* Backdrop */}
      <div
        className="md:hidden fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.55)',
          opacity:    sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? 'auto' : 'none',
        }}
        onClick={closeSidebar}
      />
      {/* Drawer */}
      <aside
        className="md:hidden fixed top-0 left-0 h-full z-50 flex flex-col w-72 max-w-[85vw] transition-transform duration-300"
        style={{
          background: SIDEBAR_BG,
          transform:  sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Contenido principal ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar móvil — hamburguesa + nombre página */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: SIDEBAR_BG, borderBottom: `1px solid ${BORDER_COLOR}` }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            <IconMenu />
          </button>
          <div className="flex items-baseline gap-1.5">
            <span className="text-white font-bold tracking-widest text-base"
              style={{ letterSpacing: '0.20em' }}>NEXO</span>
            <span className="text-xs font-medium" style={{ color: 'rgba(139,16,32,0.90)' }}>IESEF</span>
          </div>
          {/* Avatar usuario */}
          <div className="ml-auto w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(139,16,32,0.4)', border: '1px solid rgba(139,16,32,0.6)' }}>
            <span className="font-bold text-xs" style={{ color: '#f87171' }}>
              {usuario?.nombre?.charAt(0).toUpperCase()}
            </span>
          </div>
        </header>

        {/* Área de contenido scrollable */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
