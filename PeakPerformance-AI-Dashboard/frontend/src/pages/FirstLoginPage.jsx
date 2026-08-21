import React, { useState } from 'react'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { authApi, apiError } from '../services/authApi'
import PasswordInput from '../components/PasswordInput'

const wrap = { minHeight: '100vh', backgroundColor: '#06090e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }
const card = { width: '100%', maxWidth: '380px', backgroundColor: '#0e1823', border: '1px solid #172333', borderRadius: '16px', padding: '32px' }
const input = { width: '100%', padding: '11px 12px', borderRadius: '10px', backgroundColor: '#0b141f', border: '1px solid #1c2e42', color: '#e9eef2', fontSize: '14px', fontFamily: "'Inter', sans-serif", outline: 'none', marginBottom: '12px' }
const btn = (d) => ({ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#ff4b12', color: '#0A0E13', fontWeight: 700, fontSize: '13px', fontFamily: "'IBM Plex Mono', monospace", cursor: d ? 'default' : 'pointer', opacity: d ? 0.6 : 1, marginTop: '6px' })

const strong = (pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw)
const Req = ({ ok, children }) => (
  <div style={{ color: ok ? '#ff4b12' : '#566e85', fontSize: '11.5px', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 3 }}>
    {ok ? '✓' : '○'} {children}
  </div>
)

export default function FirstLoginPage() {
  const { user, clearMustChange } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = currentPassword && strong(newPassword) && newPassword === confirmPassword

  const submit = async () => {
    setError('')
    if (!strong(newPassword)) return setError('Password needs 8+ chars, a capital and a special character.')
    if (newPassword !== confirmPassword) return setError('Passwords do not match.')
    setBusy(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword, confirmPassword })
      clearMustChange()
    } catch (err) { setError(apiError(err, 'Could not set password.')) }
    finally { setBusy(false) }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div className="mb-4"><Logo width={180} height={56} /></div>
        <h1 className="font-space" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#e9eef2', marginBottom: 4 }}>
          Set your password
        </h1>
        <p className="font-inter" style={{ color: '#8b99a6', fontSize: '13px', marginBottom: 22 }}>
          Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Choose a password to finish setup.
        </p>

        <PasswordInput style={input} placeholder="Temporary password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        <PasswordInput style={input} placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        {newPassword && (
          <div style={{ marginBottom: 12 }}>
            <Req ok={newPassword.length >= 8}>At least 8 characters</Req>
            <Req ok={/[A-Z]/.test(newPassword)}>One capital letter</Req>
            <Req ok={/[^A-Za-z0-9]/.test(newPassword)}>One special character</Req>
          </div>
        )}
        <PasswordInput style={input} placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && canSubmit && submit()} />

        {error && <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: 8 }}>{error}</div>}

        <button style={btn(busy || !canSubmit)} disabled={busy || !canSubmit} onClick={submit}>
          {busy ? 'Saving…' : 'Set password & continue'}
        </button>
      </div>
    </div>
  )
}