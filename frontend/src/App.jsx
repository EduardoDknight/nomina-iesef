import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Docentes from './pages/Docentes'
import Quincenas from './pages/Quincenas'
import Configuracion from './pages/Configuracion'
import QuincenaDetalle from './pages/QuincenaDetalle'
import Horarios from './pages/Horarios'
import PersonalAdmin from './pages/PersonalAdmin'
import AdminQuincenas from './pages/AdminQuincenas'
import AdminQuincenaDetalle from './pages/AdminQuincenaDetalle'
import CambiarPassword from './pages/CambiarPassword'
import PortalDocente from './pages/PortalDocente'
import PortalTrabajador from './pages/PortalTrabajador'
import Estadisticas from './pages/Estadisticas'
import AsistenciaClasificada from './pages/AsistenciaClasificada'
import Perfil from './pages/Perfil'

// Ruta que requiere autenticación — si debe cambiar password redirige ahí primero
function PrivateRoute({ children }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />
  return children
}

// Ruta exclusiva para docentes
function DocenteRoute({ children }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />
  if (usuario.rol !== 'docente') return <Navigate to="/dashboard" replace />
  return children
}

// Ruta exclusiva para trabajadores
function TrabajadorRoute({ children }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />
  if (usuario.rol !== 'trabajador') return <Navigate to="/dashboard" replace />
  return children
}

// Ruta de staff operativo (todos los roles excepto docente y trabajador)
function StaffRoute({ children }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />
  if (usuario.rol === 'docente') return <Navigate to="/portal/docente" replace />
  if (usuario.rol === 'trabajador') return <Navigate to="/portal/trabajador" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cambiar-password" element={<CambiarPassword />} />

        {/* Portal docente */}
        <Route path="/portal/docente" element={<DocenteRoute><PortalDocente /></DocenteRoute>} />

        {/* Portal trabajador */}
        <Route path="/portal/trabajador" element={<TrabajadorRoute><PortalTrabajador /></TrabajadorRoute>} />

        {/* Sistema operativo (staff) */}
        <Route path="/" element={<StaffRoute><Layout /></StaffRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="docentes" element={<Docentes />} />
          <Route path="quincenas" element={<Quincenas />} />
          <Route path="quincenas/:id" element={<QuincenaDetalle />} />
          <Route path="quincenas/:id/asistencia-clasificada" element={<AsistenciaClasificada />} />
          <Route path="horarios" element={<Horarios />} />
          <Route path="estadisticas" element={<Estadisticas />} />
          <Route path="configuracion" element={<Configuracion />} />
          <Route path="admin/personal" element={<PersonalAdmin />} />
          <Route path="admin/nomina" element={<AdminQuincenas />} />
          <Route path="admin/nomina/:id" element={<AdminQuincenaDetalle />} />
          <Route path="perfil" element={<Perfil />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
