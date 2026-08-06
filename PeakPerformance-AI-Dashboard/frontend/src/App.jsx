import React, { useState, useEffect, useCallback } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import FirstLoginPage from './pages/FirstLoginPage'
import GenerateReportPage from './pages/GenerateReportPage'
import MemberHome from './pages/MemberHome'
import OwnerDashboard from './OwnerDashboard'
import { authApi } from './services/authApi'

function Shell() {
  const { user, loading, mustChangePassword } = useAuth()
  const [hasReports, setHasReports] = useState(null)   // null = unknown, gating on it
  const [checking, setChecking] = useState(false)
  const [forceGenerate, setForceGenerate] = useState(false)

  // For members: after auth, check whether they have any reports yet
  const refreshHasReports = useCallback(async () => {
    setChecking(true)
    try { const res = await authApi.myProgress(); setHasReports(res.data.hasReports) }
    catch (_) { setHasReports(false) }
    finally { setChecking(false) }
  }, [])

  useEffect(() => {
    if (user?.role === 'member' && !mustChangePassword) refreshHasReports()
  }, [user, mustChangePassword, refreshHasReports])

  if (loading) {
    return <div style={{ minHeight: '100vh', backgroundColor: '#06090e', color: '#8b99a6',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono', monospace" }}>Loading…</div>
  }

  // Not logged in
  if (!user) return <LoginPage />

  // First login — must set a real password
  if (mustChangePassword) return <FirstLoginPage />

  // Gym owner → the comparison dashboard (existing screens)
  if (user.role === 'gymOwner') return <OwnerDashboard />

  // Member flow
  if (checking || hasReports === null) {
    return <div style={{ minHeight: '100vh', backgroundColor: '#06090e', color: '#8b99a6',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono', monospace" }}>Loading your dashboard…</div>
  }

  // Mandatory first action: generate a report. Also reachable via "New assessment".
  if (!hasReports || forceGenerate) {
    return (
      <GenerateReportPage
        firstTime={!hasReports}
        onGenerated={() => { setForceGenerate(false); setHasReports(true) }}
      />
    )
  }

  // Their own report + progress view
  return <MemberHome onNewReport={() => setForceGenerate(true)} />
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
