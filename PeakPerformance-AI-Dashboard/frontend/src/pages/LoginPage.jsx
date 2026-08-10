import React, { useState } from 'react'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { apiError } from '../services/authApi'

const wrap = { minHeight: '100vh', backgroundColor: '#06090e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }
const card = { width: '100%', maxWidth: '400px', backgroundColor: '#0e1823', border: '1px solid #172333', borderRadius: '16px', padding: '30px' }
const input = { width: '100%', padding: '11px 12px', borderRadius: '10px', backgroundColor: '#0b141f', border: '1px solid #1c2e42', color: '#e9eef2', fontSize: '14px', fontFamily: "'Inter', sans-serif", outline: 'none', marginBottom: '12px' }
const btn = (d) => ({ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#54d9c4', color: '#0A0E13', fontWeight: 700, fontSize: '13px', fontFamily: "'IBM Plex Mono', monospace", cursor: d ? 'default' : 'pointer', opacity: d ? 0.6 : 1, marginTop: '6px' })

const tabBtn = (active) => ({
  flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
  backgroundColor: active ? '#0e1823' : 'transparent',
  color: active ? '#54d9c4' : '#8b99a6',
  borderBottom: active ? '2px solid #54d9c4' : '2px solid #172333',
  fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px'
})

const strong = (pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw)

export default function LoginPage() {
  const { login, signup } = useAuth()
  const [tab, setTab] = useState('member')        // 'member' | 'owner'
  const [ownerMode, setOwnerMode] = useState('login')  // 'login' | 'signup'

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const upd = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const reset = () => { setForm({ name: '', email: '', password: '', confirmPassword: '' }); setError('') }

  const doLogin = async () => {
    setError('')
    if (!form.email || !form.password) return setError('Enter your email and password.')
    setBusy(true)
    try { await login(form.email, form.password) }   // App re-renders by role
    catch (err) { setError(apiError(err, 'Login failed.')) }
    finally { setBusy(false) }
  }

  const doSignup = async () => {
    setError('')
    if (!form.name || !form.email) return setError('Enter your name and email.')
    if (!strong(form.password)) return setError('Password needs 8+ chars, a capital and a special character.')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.')
    setBusy(true)
    try { await signup(form) }   // creates owner + gym, logs in
    catch (err) { setError(apiError(err, 'Sign up failed.')) }
    finally { setBusy(false) }
  }

  const isOwnerSignup = tab === 'owner' && ownerMode === 'signup'

  return (
    <div style={wrap}>
      <div style={card}>
        <div className="mb-4 text-center"><Logo width={190} height={58} /></div>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: 22 }}>
          <button style={tabBtn(tab === 'member')} onClick={() => { setTab('member'); reset() }}>MEMBER</button>
          <button style={tabBtn(tab === 'owner')} onClick={() => { setTab('owner'); reset() }}>GYM OWNER</button>
        </div>

        <h1 className="font-space" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e9eef2', marginBottom: 4 }}>
          {tab === 'member' ? 'Member login' : isOwnerSignup ? 'Create your gym' : 'Gym owner login'}
        </h1>
        <p className="font-inter" style={{ color: '#8b99a6', fontSize: '12.5px', marginBottom: 20, lineHeight: 1.5 }}>
          {tab === 'member'
            ? 'Sign in with the credentials your gym gave you.'
            : isOwnerSignup
              ? 'Set up your account — your gym is created automatically.'
              : 'Sign in to manage your members and view stats.'}
        </p>

        {isOwnerSignup && (
          <input style={input} placeholder="Your name" value={form.name} onChange={upd('name')} />
        )}
        <input style={input} type="email" placeholder="Email" value={form.email} onChange={upd('email')} />
        <input style={input} type="password" placeholder="Password" value={form.password} onChange={upd('password')}
               onKeyDown={e => e.key === 'Enter' && !isOwnerSignup && (tab === 'member' ? doLogin() : doLogin())} />
        {isOwnerSignup && (
          <input style={input} type="password" placeholder="Confirm password" value={form.confirmPassword}
                 onChange={upd('confirmPassword')} onKeyDown={e => e.key === 'Enter' && doSignup()} />
        )}

        {error && <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: 8 }}>{error}</div>}

        {tab === 'member' ? (
          <button style={btn(busy)} disabled={busy} onClick={doLogin}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        ) : ownerMode === 'login' ? (
          <>
            <button style={btn(busy)} disabled={busy} onClick={doLogin}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="font-inter text-center" style={{ color: '#8b99a6', fontSize: 12, marginTop: 14 }}>
              New here?{' '}
              <span style={{ color: '#54d9c4', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => { setOwnerMode('signup'); reset() }}>Create a gym account</span>
            </p>
          </>
        ) : (
          <>
            <button style={btn(busy)} disabled={busy} onClick={doSignup}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
            <p className="font-inter text-center" style={{ color: '#8b99a6', fontSize: 12, marginTop: 14 }}>
              Already have an account?{' '}
              <span style={{ color: '#54d9c4', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => { setOwnerMode('login'); reset() }}>Log in</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}