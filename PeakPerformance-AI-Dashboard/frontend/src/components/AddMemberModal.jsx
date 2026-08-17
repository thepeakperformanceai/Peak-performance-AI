import React, { useState } from 'react'
import { apiService, apiError } from '../services/api'

const overlay = { position: 'fixed', inset: 0, backgroundColor: 'rgba(3,6,10,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
const modal = { width: '100%', maxWidth: 440, backgroundColor: '#0e1823', border: '1px solid #172333', borderRadius: 16, padding: 26 }
const input = { width: '100%', padding: '10px 12px', borderRadius: 10, backgroundColor: '#0b141f', border: '1px solid #1c2e42', color: '#e9eef2', fontSize: 14, outline: 'none', marginBottom: 11 }
const label = { color: '#566e85', fontSize: 11, letterSpacing: 0.5, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase', display: 'block', marginBottom: 4 }
const SPORTS = ['Football', 'Padel', 'Strength & Conditioning', 'Other']
const strong = (pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw)

export default function AddMemberModal({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', email: '', password: '', sex: 'M', age: '', sport: 'Football' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const upd = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }))

  const submit = async () => {
    setError('')
    if (!f.name || !f.email || !f.password) return setError('Name, email and password are required.')
    if (!strong(f.password)) return setError('Password needs 8+ chars, a capital and a special character.')
    setBusy(true)
    try {
      await apiService.createMember({
        name: f.name, email: f.email, password: f.password,
        sex: f.sex, age: f.age ? Number(f.age) : null, sport: f.sport
      })
      onCreated()
    } catch (err) { setError(apiError(err, 'Could not create member.')) }
    finally { setBusy(false) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 className="font-space" style={{ color: '#e9eef2', fontSize: '1.15rem', fontWeight: 700, marginBottom: 4 }}>Add member</h2>
        <p className="font-inter" style={{ color: '#8b99a6', fontSize: 12.5, marginBottom: 18 }}>
          Set their login. Share the email and password with them.
        </p>

        <label style={label}>Name</label>
        <input style={input} value={f.name} onChange={upd('name')} placeholder="Full name" />

        <label style={label}>Email</label>
        <input style={input} type="email" value={f.email} onChange={upd('email')} placeholder="member@email.com" />

        <label style={label}>Password</label>
        <input style={input} type="text" value={f.password} onChange={upd('password')} placeholder="Min 8, a capital & a symbol" />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Sex</label>
            <select style={input} value={f.sex} onChange={upd('sex')}>
              <option value="M">M</option><option value="F">F</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Age</label>
            <input style={input} type="number" value={f.age} onChange={upd('age')} placeholder="24" />
          </div>
        </div>

        <label style={label}>Sport</label>
        <select style={input} value={f.sport} onChange={upd('sport')}>
          {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {error && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} className="font-ibm-mono"
            style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #1c2e42', background: 'none', color: '#8b99a6', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className="font-ibm-mono"
            style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', backgroundColor: '#ff4b12', color: '#0A0E13', fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Creating…' : 'Create member'}
          </button>
        </div>
      </div>
    </div>
  )
}