import React, { useState, useEffect } from 'react'
import Header from './components/Header'
import MemberRoster from './components/MemberRoster'
import SquadComparison from './components/SquadComparison'
import MemberDetail from './components/MemberDetail'
import { apiService } from './services/api'
import { useAuth } from './context/AuthContext'

// The gym-owner dashboard (roster + squad comparison + member detail).
export default function OwnerDashboard() {
  const { logout } = useAuth()
  const [rosterMembers, setRosterMembers] = useState([])
  const [selectedMemberId, setSelectedMemberId] = useState(null)
  const [selectedMemberDetail, setSelectedMemberDetail] = useState(null)

  const [squadData, setSquadData] = useState(null)
  const [sportFilter, setSportFilter] = useState('All')
  const [sexFilter, setSexFilter] = useState('All')

  const [loadingRoster, setLoadingRoster] = useState(true)
  const [loadingSquad, setLoadingSquad] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    (async () => {
      setLoadingRoster(true)
      try {
        const data = await apiService.getMembers()
        setRosterMembers(data)
        if (data.length && !selectedMemberId) setSelectedMemberId(data[0].id)
      } catch (e) { console.error(e) }
      finally { setLoadingRoster(false) }
    })()
  }, [])

  useEffect(() => {
    (async () => {
      setLoadingSquad(true)
      try { setSquadData(await apiService.getSquadComparison(sportFilter, sexFilter)) }
      catch (e) { console.error(e) }
      finally { setLoadingSquad(false) }
    })()
  }, [sportFilter, sexFilter])

  useEffect(() => {
    if (!selectedMemberId) return
    (async () => {
      setLoadingDetail(true)
      try { setSelectedMemberDetail(await apiService.getMemberDetail(selectedMemberId)) }
      catch (e) { console.error(e) }
      finally { setLoadingDetail(false) }
    })()
  }, [selectedMemberId])

  return (
    <div className="min-vh-100 py-4 py-md-5" style={{ backgroundColor: '#0b0f17' }}>
      <div className="container-xl px-3 px-md-4">
        <div className="d-flex justify-content-end mb-2">
          <button onClick={logout} className="font-ibm-mono"
            style={{ background: 'none', border: '1px solid #1c2e42', color: '#8b99a6', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
            Log out
          </button>
        </div>

        <Header />

        <MemberRoster
          members={rosterMembers}
          selectedMemberId={selectedMemberId}
          onSelectMember={setSelectedMemberId}
          loading={loadingRoster}
        />

        <SquadComparison
          squadData={squadData}
          sportFilter={sportFilter}
          sexFilter={sexFilter}
          onSportFilterChange={setSportFilter}
          onSexFilterChange={setSexFilter}
          loading={loadingSquad}
        />

        <MemberDetail member={selectedMemberDetail} loading={loadingDetail} />
      </div>
    </div>
  )
}
