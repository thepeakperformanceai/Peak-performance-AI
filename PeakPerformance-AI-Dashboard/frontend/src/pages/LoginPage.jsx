import React, { useState } from 'react'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { apiError } from '../services/authApi'

const wrap = {
  minHeight: '100vh', backgroundColor: '#06090e', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: '24px'
}
const card = {
  width: '100%', maxWidth: '380px', backgroundColor: '#0e1823',
  border: '1px solid #172333', borderRadius: '16px', padding: '32px'
}
const input = {
  width: '100%', padding: '11px 12px', borderRadius: '10px',
  backgroundColor: '#0b141f', border: '1px solid #1c2e42', color: '#e9eef2',
  fontSize: '14px', fontFamily: "'Inter', sans-serif", outline: 'none', marginBottom: '12px'
}
const btn = (disabled) => ({
  width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
  backgroundColor: '#54d9c4', color: '#0A0E13', fontWeight: 700, fontSize: '13px',
  fontFamily: "'IBM Plex Mono', monospace", cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.6 : 1, marginTop: '6px'
})

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (!email || !password) return setError('Enter your email and password.')
    setBusy(true)
    try { await login(email, password) }        // AuthContext re-renders App on success
    catch (err) { setError(apiError(err, 'Login failed.')) }
    finally { setBusy(false) }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div className="mb-4"><Logo width={180} height={56} /></div>
        <h1 className="font-space" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#e9eef2', marginBottom: 4 }}>
          Member login
        </h1>
        <p className="font-inter" style={{ color: '#8b99a6', fontSize: '13px', marginBottom: 22 }}>
          Sign in with the credentials your gym gave you.
        </p>

        <input style={input} type="email" placeholder="Email" value={email}
               onChange={e => setEmail(e.target.value)} />
        <input style={input} type="password" placeholder="Password" value={password}
               onChange={e => setPassword(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && submit()} />

        {error && <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: 8 }}>{error}</div>}

        <button style={btn(busy)} disabled={busy} onClick={submit}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}
