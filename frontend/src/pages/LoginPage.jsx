import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiError } from '../services/auth'
import PasswordInput from '../components/PasswordInput'

const INPUT = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none ' +
              'focus:border-pp-orange focus:ring-1 focus:ring-pp-orange'

export default function LoginPage({ onForgotPassword, onSignup }) {
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // No redirect needed: setting the user in context re-renders App
  const handleSubmit = async () => {
    setError('')
    if (!email || !password) return setError('Please enter your email and password.')

    setBusy(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(apiError(err, 'Login failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-7">
        <h1 className="font-display font-bold text-lg text-gray-900">Welcome back</h1>
        <p className="text-xs text-gray-500 mt-1 mb-6">PeakPerformance.pk — Sports Science Platform</p>

        <div className="space-y-3">
          <input className={INPUT} type="email" placeholder="Email" autoComplete="email"
                 value={email} onChange={e => setEmail(e.target.value)} />
          <PasswordInput
            className={INPUT + ' pr-10'}
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

        <button onClick={handleSubmit} disabled={busy}
                className="w-full mt-5 py-2.5 rounded-lg bg-pp-orange text-white text-sm font-medium disabled:opacity-60">
          {busy ? 'Logging in…' : 'Log in'}
        </button>

        <button onClick={onForgotPassword}
                className="w-full mt-3 text-xs text-gray-500 hover:text-gray-800">
          Forgot your password?
        </button>

        <p className="text-xs text-gray-500 text-center mt-4">
          Don't have an account?{' '}
          <button onClick={onSignup} className="text-pp-orange font-medium">Sign up</button>
        </p>
      </div>
    </div>
  )
}