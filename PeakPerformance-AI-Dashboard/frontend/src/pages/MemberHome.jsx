import React, { useState, useEffect, useCallback } from 'react'
import Logo from '../components/Logo'
import MemberDetail from '../components/MemberDetail'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../services/authApi'

export default function MemberHome({ onNewReport }) {
  const { user, logout } = useAuth()
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await authApi.myProgress(); setMember(res.data) }
    catch (_) { setMember(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#06090e', padding: '32px 16px' }}>
      <div className="container-xl px-2 px-md-3">
        {/* Top bar */}
        <div className="d-flex justify-content-between align-items-center mb-4">
          <Logo width={190} height={58} />
          <div className="d-flex align-items-center gap-2">
            <button onClick={onNewReport} className="font-ibm-mono"
              style={{ backgroundColor: '#54d9c4', color: '#0A0E13', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + New assessment
            </button>
            <button onClick={logout} className="font-ibm-mono"
              style={{ background: 'none', border: '1px solid #1c2e42', color: '#8b99a6', borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>
              Log out
            </button>
          </div>
        </div>

        <h1 className="fw-bold mb-2 text-white font-space" style={{ fontSize: '1.5rem', letterSpacing: '-0.5px' }}>
          My testing dashboard
        </h1>
        <p className="mb-4 font-inter" style={{ color: '#8b99a6', maxWidth: 700, fontSize: '0.95rem', lineHeight: 1.5 }}>
          Your assessments tracked session over session — measured against your own history, not a cohort.
        </p>

        {/* Reuse the exact MemberDetail layout, fed with the member's own data */}
        <MemberDetail member={member} loading={loading} />
      </div>
    </div>
  )
}
