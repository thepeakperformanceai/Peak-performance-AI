import React, { useState, useEffect } from 'react'
import MemberRoster from './components/MemberRoster'
import SquadComparison from './components/SquadComparison'
import MemberDetail from './components/MemberDetail'
import AddMemberModal from './components/AddMemberModal'
import { apiService } from './services/api'
import { useAuth } from './context/AuthContext'

const ORANGE = '#ff4b12'
const BG = '#0b0f17'
const PANEL = '#0e1520'
const BORDER = '#1b2634'
const MUTED = '#8b99a6'

/* ---- sidebar nav ---- */
const NAV = [
  { id: 'dashboard', label: 'DASHBOARD', icon: '▦' },
  { id: 'testing',   label: 'MEMBER TESTING', icon: '☰' },
  { id: 'squad',     label: 'SQUAD COMPARISON', icon: '◎' },
  { id: 'settings',  label: 'SETTINGS', icon: '⚙' },
]
const NAV_BOTTOM = [
  { id: 'support', label: 'SUPPORT', icon: '◍' },
  { id: 'account', label: 'ACCOUNT', icon: '⛁' },
]

function Sidebar({ active, onNav, onLogout }) {
  const item = (n) => {
    const on = active === n.id
    return (
      <button key={n.id} onClick={() => onNav(n.id)} className="font-ibm-mono"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
          padding: '10px 14px', marginBottom: 4, borderRadius: 8, cursor: 'pointer',
          fontSize: 12, letterSpacing: 0.5,
          background: on ? `${ORANGE}1a` : 'transparent',
          color: on ? ORANGE : MUTED,
          border: on ? `1px solid ${ORANGE}55` : '1px solid transparent',
        }}>
        <span style={{ width: 16, textAlign: 'center' }}>{n.icon}</span>{n.label}
      </button>
    )
  }
  return (
    <aside style={{
      width: 232, minWidth: 232, background: '#080b11', borderRight: `1px solid ${BORDER}`,
      height: '100vh', position: 'sticky', top: 0, display: 'flex', flexDirection: 'column',
      padding: '22px 16px'
    }}>
      <div style={{ marginBottom: 26 }}>
        <div className="font-space" style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
          Peak<span style={{ color: ORANGE }}>Performance</span>
        </div>
        <div className="font-ibm-mono" style={{ fontSize: 9.5, color: '#5b6b7c', marginTop: 4, letterSpacing: 0.5 }}>
          Test. Train. Perform.<br />Elite Performance Lab
        </div>
      </div>

      <nav style={{ flex: 1 }}>{NAV.map(item)}</nav>
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>{NAV_BOTTOM.map(item)}</div>
    </aside>
  )
}

function ContentHeader({ onAdd, onLogout }) {
  return (
    <div className="d-flex justify-content-between align-items-start mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div className="font-space" style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
          Peak<span style={{ color: ORANGE }}>Performance</span>
        </div>
        <h1 className="fw-bold mt-2 mb-2 text-white font-space" style={{ fontSize: '1.5rem', letterSpacing: '-0.5px' }}>
          Member Testing Dashboard
        </h1>
        <p className="mb-0 font-inter" style={{ color: MUTED, maxWidth: 640, fontSize: '0.92rem', lineHeight: 1.5 }}>
          Every Continuum member tested on HumanTrak and Dynamo — football, padel and strength training
          members side by side, tracked against their own history session over session.
        </p>
      </div>
      <div className="d-flex gap-2">
        <button onClick={onAdd} className="font-ibm-mono"
          style={{ background: 'transparent', color: ORANGE, border: `1px solid ${ORANGE}`, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + ADD MEMBER
        </button>
        <button onClick={onLogout} className="font-ibm-mono"
          style={{ background: 'none', border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>
          LOG OUT
        </button>
      </div>
    </div>
  )
}

const Placeholder = ({ title, text }) => (
  <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 40, textAlign: 'center' }}>
    <h2 className="font-space" style={{ color: '#fff', fontSize: '1.1rem', marginBottom: 8 }}>{title}</h2>
    <p className="font-inter" style={{ color: MUTED, fontSize: 13, margin: 0 }}>{text}</p>
  </div>
)

export default function OwnerDashboard() {
  const { logout } = useAuth()
  const [active, setActive] = useState('dashboard')
  const [showAdd, setShowAdd] = useState(false)

  const [rosterMembers, setRosterMembers] = useState([])
  const [selectedMemberId, setSelectedMemberId] = useState(null)
  const [selectedMemberDetail, setSelectedMemberDetail] = useState(null)
  const [squadData, setSquadData] = useState(null)
  const [sportFilter, setSportFilter] = useState('All')
  const [sexFilter, setSexFilter] = useState('All')
  const [loadingRoster, setLoadingRoster] = useState(true)
  const [loadingSquad, setLoadingSquad] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const loadRoster = async () => {
    setLoadingRoster(true)
    try {
      const data = await apiService.getMembers()
      setRosterMembers(data)
      if (data.length && !selectedMemberId) setSelectedMemberId(data[0].id)
    } catch (e) { console.error(e) } finally { setLoadingRoster(false) }
  }
  useEffect(() => { loadRoster() }, [])

  useEffect(() => {
    (async () => {
      setLoadingSquad(true)
      try { setSquadData(await apiService.getSquadComparison(sportFilter, sexFilter)) }
      catch (e) { console.error(e) } finally { setLoadingSquad(false) }
    })()
  }, [sportFilter, sexFilter])

  useEffect(() => {
    if (!selectedMemberId) return
    (async () => {
      setLoadingDetail(true)
      try { setSelectedMemberDetail(await apiService.getMemberDetail(selectedMemberId)) }
      catch (e) { console.error(e) } finally { setLoadingDetail(false) }
    })()
  }, [selectedMemberId])

  const roster = (
    <>
      <MemberRoster members={rosterMembers} selectedMemberId={selectedMemberId}
        onSelectMember={setSelectedMemberId} loading={loadingRoster} />
      <MemberDetail member={selectedMemberDetail} loading={loadingDetail} />
    </>
  )
  const squad = (
    <SquadComparison squadData={squadData} sportFilter={sportFilter} sexFilter={sexFilter}
      onSportFilterChange={setSportFilter} onSexFilterChange={setSexFilter} loading={loadingSquad} />
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: BG }}>
      <Sidebar active={active} onNav={setActive} onLogout={logout} />

      <main style={{ flex: 1, padding: '28px 28px 48px', overflowX: 'hidden' }}>
        <ContentHeader onAdd={() => setShowAdd(true)} onLogout={logout} />

        {showAdd && (
          <AddMemberModal onClose={() => setShowAdd(false)}
            onCreated={() => { setShowAdd(false); loadRoster() }} />
        )}

        {(active === 'dashboard' || active === 'testing') && roster}
        {active === 'squad' && squad}
        {active === 'settings' && <Placeholder title="Settings" text="Workspace settings will appear here." />}
        {active === 'support' && <Placeholder title="Support" text="Reach the Peak Performance team for help." />}
        {active === 'account' && <Placeholder title="Account" text="Your account details and sign-out." />}

        {/* On the main dashboard, show squad comparison below the roster too (matches the reference) */}
        {active === 'dashboard' && <div style={{ marginTop: 24 }}>{squad}</div>}
      </main>
    </div>
  )
}