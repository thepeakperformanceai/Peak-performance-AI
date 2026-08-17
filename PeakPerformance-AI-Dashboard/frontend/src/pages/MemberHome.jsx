import React, { useState, useEffect, useCallback } from 'react'
import Logo from '../components/Logo'
import MemberDetail from '../components/MemberDetail'
import FullReport from '../components/FullReport'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../services/authApi'

export default function MemberHome({ onNewReport }) {
  const { logout } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('report')   // 'report' | 'progress'

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await authApi.myProgress(); setData(res.data) }
    catch (_) { setData(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const tabBtn = (active) => ({
    padding: '8px 16px', border: 'none', cursor: 'pointer', borderRadius: 8,
    background: active ? '#ff4b12' : 'transparent', color: active ? '#0A0E13' : '#8b99a6',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700
  })

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#06090e', padding: '28px 16px' }}>
      <div className="container-xl px-2 px-md-3">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <Logo width={180} height={56} />
          <div className="d-flex align-items-center gap-2">
            <button onClick={onNewReport} className="font-ibm-mono"
              style={{ backgroundColor: '#ff4b12', color: '#0A0E13', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + New assessment
            </button>
            <button onClick={logout} className="font-ibm-mono"
              style={{ background: 'none', border: '1px solid #1c2e42', color: '#8b99a6', borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>
              Log out
            </button>
          </div>
        </div>

        {/* Tabs: full report vs progress */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button style={tabBtn(tab === 'report')} onClick={() => setTab('report')}>MY REPORT</button>
          <button style={tabBtn(tab === 'progress')} onClick={() => setTab('progress')}>PROGRESS</button>
        </div>

        {loading ? (
          <div className="font-ibm-mono" style={{ color: '#8b99a6', textAlign: 'center', padding: 40 }}>Loading…</div>
        ) : tab === 'report' ? (
          data?.latestReport
            ? <FullReport report={data.latestReport} />
            : <div className="font-ibm-mono" style={{ color: '#8b99a6', textAlign: 'center', padding: 40 }}>No report yet.</div>
        ) : (
          <MemberDetail member={data} loading={false} />
        )}
      </div>
    </div>
  )
}