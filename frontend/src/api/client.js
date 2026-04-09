import axios from 'axios'

const api = axios.create({
  baseURL: '/api'
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    // No redirigir si es el propio endpoint de login o cambio de password
    const url = err.config?.url || ''
    const esEndpointAuth = url.includes('/auth/login') || url.includes('/auth/cambiar-password')
    if (err.response?.status === 401 && !esEndpointAuth) {
      localStorage.removeItem('token')
      localStorage.removeItem('usuario')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
