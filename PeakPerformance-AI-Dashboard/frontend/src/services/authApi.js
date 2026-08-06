import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''
const client = axios.create({ baseURL: BASE_URL, timeout: 120000 })

client.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !String(err.config?.url).includes('/auth/login')) {
      localStorage.removeItem('auth_token')
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login: (data) => client.post('/auth/login', data),
  me: () => client.get('/auth/me'),
  changePassword: (data) => client.patch('/auth/password', data),
  // member report flow
  generateReport: (formData) =>
    client.post('/report/generate', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  myProgress: () => client.get('/report/my-progress'),
}

export const apiError = (err, fallback = 'Something went wrong.') =>
  err?.response?.data?.error || err?.response?.data?.message || fallback
