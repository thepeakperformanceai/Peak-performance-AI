import axios from 'axios'

// Owner-dashboard data service — talks to the dashboard backend.
const BASE_URL = import.meta.env.VITE_API_URL || ''
const client = axios.create({ baseURL: BASE_URL, timeout: 30000 })

client.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const apiService = {
  async getMembers() {
    const { data } = await client.get('/gym/members')
    return data
  },
  async getSquadComparison(sport, test) {
    const params = {}
    if (sport) params.sport = sport
    if (test) params.test = test
    const { data } = await client.get('/gym/squad-comparison', { params })
    return data
  },
  async getMemberDetail(id) {
    const { data } = await client.get(`/gym/members/${id}`)
    return data
  },
  async createMember(payload) {
    const { data } = await client.post('/gym/members', payload)
    return data
  },
  async deleteMember(id) {
    const { data } = await client.delete(`/gym/members/${id}`)
    return data
  },
  async changeMemberPassword(id, password) {
    const { data } = await client.patch(`/gym/members/${id}/password`, { password })
    return data
  },
}

export const apiError = (err, fallback = 'Something went wrong.') =>
  err?.response?.data?.error || err?.response?.data?.message || fallback