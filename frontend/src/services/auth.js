import axios from 'axios'
import { getAuthToken } from '../utils/auth'

// Same base URL as services/api.js so both clients talk to the same backend
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
})

client.interceptors.request.use(config => {
  const token = getAuthToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const authApi = {
  signup: (data) => client.post('/auth/signup', data),          // { name, email, password, confirmPassword }
  verifyOtp: (data) => client.post('/auth/verify-otp', data),   // { email, otp }
  resendOtp: (data) => client.post('/auth/resend-otp', data),   // { email }
  login: (data) => client.post('/auth/login', data),
  me: () => client.get('/auth/me'),
  changePassword: (data) => client.patch('/auth/password', data),
}

// Pull the readable message out of an axios error
export const apiError = (err, fallback = 'Something went wrong.') =>
  err?.response?.data?.error || err?.response?.data?.message || fallback