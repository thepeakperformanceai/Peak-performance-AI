import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../services/authApi'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('auth_token')) { setLoading(false); return }
    authApi.me()
      .then(res => setUser(res.data.user))
      .catch(() => localStorage.removeItem('auth_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password })
    localStorage.setItem('auth_token', res.data.token)
    setUser(res.data.user)
    setMustChangePassword(!!res.data.mustChangePassword)
    return res.data
  }, [])

  const clearMustChange = useCallback(() => setMustChangePassword(false), [])
  const logout = useCallback(() => {
    localStorage.removeItem('auth_token'); setUser(null); setMustChangePassword(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, mustChangePassword, login, logout, clearMustChange }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
