import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../services/auth'
import { getAuthToken, setAuthToken, clearAuthToken } from '../utils/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On first load, if a token exists, verify it and hydrate the user
  useEffect(() => {
    if (!getAuthToken()) { setLoading(false); return }

    authApi.me()
      .then(res => setUser(res.data.user))
      .catch(() => clearAuthToken())
      .finally(() => setLoading(false))
  }, [])

  const persist = (token, userData) => {
    setAuthToken(token)
    setUser(userData)
  }

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password })
    persist(res.data.token, res.data.user)
    return res.data.user
  }, [])

  // Step 1 — stages the signup and emails a code. Does NOT log anyone in.
  const requestSignupOtp = useCallback(async (payload) => {
    const res = await authApi.signup(payload)
    return res.data
  }, [])

  // Step 2 — verifying the code creates the account and returns a token
  const verifySignupOtp = useCallback(async (email, otp) => {
    const res = await authApi.verifyOtp({ email, otp })
    persist(res.data.token, res.data.user)
    return res.data.user
  }, [])

  const resendSignupOtp = useCallback(async (email) => {
    const res = await authApi.resendOtp({ email })
    return res.data
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      requestSignupOtp,
      verifySignupOtp,
      resendSignupOtp,
      isAdmin: user?.role === 'admin'
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}