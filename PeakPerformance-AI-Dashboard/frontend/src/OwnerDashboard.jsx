import React, { useState, useEffect } from 'react'
import MemberRoster from './components/MemberRoster'
import SquadComparison from './components/SquadComparison'
import MemberDetail from './components/MemberDetail'
import AddMemberModal from './components/AddMemberModal'
import { apiService } from './services/api'
import { useAuth } from './context/AuthContext'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'testing', label: 'Member Testing', icon: 'analytics' },
  { id: 'squad', label: 'Squad Comparison', icon: 'group_work' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

const NAV_BOTTOM = [
  { id: 'support', label: 'Support', icon: 'help' },
  { id: 'account', label: 'Account', icon: 'person' },
]

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function NavLink({ item, active, onNav }) {
  const on = active === item.id
  return (
    <li>
      <button
        type="button"
        onClick={() => onNav(item.id)}
        className={`flex w-full items-center gap-3 rounded-lg py-2 px-1 font-label-caps uppercase transition-all button-nav ${
          on
            ? 'border-l-4 border-ignite-orange bg-surface-container text-ignite-orange'
            : 'border-l-4 border-transparent text-chalk-dim hover:bg-surface-container hover:text-chalk'
        }`}
      >
        <Icon name={item.icon} className={on ? 'text-ignite-orange' : ''} />
        {item.label}
      </button>
    </li>
  )
}

function Placeholder({ title, text }) {
  return (
    <div className="rounded-lg border border-surface-variant bg-surface p-10 text-center">
      <h2 className="text-[20px] font-semibold text-chalk mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h2>
      <p className="text-[14px] text-chalk-dim m-0">{text}</p>
    </div>
  )
}

export default function OwnerDashboard() {
  const { logout } = useAuth()
  const [active, setActive] = useState('testing')
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
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingRoster(false)
    }
  }

  useEffect(() => {
    loadRoster()
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoadingSquad(true)
      try {
        setSquadData(await apiService.getSquadComparison(sportFilter, sexFilter))
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingSquad(false)
      }
    })()
  }, [sportFilter, sexFilter])

  useEffect(() => {
    if (!selectedMemberId) return
    ;(async () => {
      setLoadingDetail(true)
      try {
        setSelectedMemberDetail(await apiService.getMemberDetail(selectedMemberId))
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingDetail(false)
      }
    })()
  }, [selectedMemberId])

  const showMainDashboard = active === 'dashboard' || active === 'testing'
  const navActive =
    active === 'squad' ? 'squad' : active === 'dashboard' ? 'dashboard' : active === 'testing' ? 'testing' : active

  const headerActions = (
    <>
      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className="border border-ignite-orange bg-transparent text-[13px] font-bold uppercase uppercase text-ignite-orange px-4 md:px-6 py-2 rounded hover:bg-ignite-orange/10 transition-colors"
      >
        + Add member
      </button>
      <button
        type="button"
        onClick={logout}
        className="border border-surface-variant text-chalk text-[13px] font-bold uppercase uppercase px-4 md:px-6 py-2 rounded hover:bg-surface-container transition-colors"
      >
        Log out
      </button>
    </>
  )

  return (
    <div className="bg-void text-chalk font-body-md min-h-screen flex flex-col md:flex-row">
      {/* Mobile header */}
      <header className="bg-void border-b border-surface-variant w-full md:hidden flex justify-between items-center px-6 py-4 z-50">
        <div className="text-[20px] font-bold text-chalk" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>PeakPerformance</div>
        <div className="flex items-center gap-4">{headerActions}</div>
      </header>

      {/* Sidebar */}
      <nav className="bg-surface-container-lowest hidden md:flex flex-col border-r border-surface-variant fixed left-0 top-0 h-screen w-64 z-40 pt-8 pb-4 justify-between">
        <div className="px-6">
          <div className="mb-8">
            <p className="font-bold text-chalk tracking-tight text-[18px]" style={{ fontFamily: "'Space Grotesk', sans-serif" ,  }}>PeakPerformance</p>
            <p className="font-label-caps text-xl text-chalk-dim mt-2">Test. Train. Perform.</p>
            <p className="text-[14px] text-chalk-dim mt-1">Elite Performance Lab</p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="w-full bg-ignite-orange text-void text-[13px] font-bold uppercase uppercase px-1 py-2 rounded-xl mb-8 hover:opacity-90 transition-opacity flex justify-center items-center gap-2"
          >
            <Icon name="add" />
            New Assessment
          </button>

          <ul className="flex flex-col gap-2 p-0 mt-2">
            {NAV.map((item) => (
              <NavLink key={item.id} item={item} active={navActive} onNav={setActive} />
            ))}
          </ul>
        </div>

        <div className="px-6">
          <ul className="flex flex-col gap-2 p-0">
            {NAV_BOTTOM.map((item) => (
              <NavLink key={item.id} item={item} active={navActive} onNav={setActive} />
            ))}
          </ul>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 md:ml-64 p-6 md:p-12">
        <div className="hidden md:flex justify-end items-center gap-4 mb-12">{headerActions}</div>

        {showMainDashboard && (
          <>
            <div className="mb-12 max-w-3xl">
              <h1 className="text-[24px] md:text-[32px] font-bold text-chalk mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>PeakPerformance</h1>
              <h2 className="text-[24px] md:text-[32px] font-bold text-chalk mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Member Testing Dashboard
              </h2>
              <p className="text-[16px] text-chalk-dim">
                Every Continuum member tested on HumanTrak and Dynamo — football, padel and strength training members
                side by side, tracked against their own history session over session.
              </p>
            </div>

            <MemberRoster
              members={rosterMembers}
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
              loading={loadingRoster}
            />

            {/* {selectedMemberId && (
              <div className="mb-section-margin">
                <MemberDetail member={selectedMemberDetail} loading={loadingDetail} />
              </div>
            )} */}

            <SquadComparison
              squadData={squadData}
              sportFilter={sportFilter}
              sexFilter={sexFilter}
              onSportFilterChange={setSportFilter}
              onSexFilterChange={setSexFilter}
              loading={loadingSquad}
            />
          </>
        )}

        {active === 'squad' && (
          <>
            <div className="mb-12 max-w-3xl">
              <h1 className="text-[24px] md:text-[32px] font-bold text-chalk mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Squad Comparison
              </h1>
              <p className="text-[16px] text-chalk-dim">
                Filter by sport or sex to see how sub-groups are trending — same data, sliced the way a coach actually
                thinks about a squad.
              </p>
            </div>
            <SquadComparison
              squadData={squadData}
              sportFilter={sportFilter}
              sexFilter={sexFilter}
              onSportFilterChange={setSportFilter}
              onSexFilterChange={setSexFilter}
              loading={loadingSquad}
            />
          </>
        )}

        {active === 'settings' && <Placeholder title="Settings" text="Workspace settings will appear here." />}
        {active === 'support' && <Placeholder title="Support" text="Reach the Peak Performance team for help." />}
        {active === 'account' && <Placeholder title="Account" text="Your account details and sign-out." />}

        {showAdd && (
          <AddMemberModal
            onClose={() => setShowAdd(false)}
            onCreated={() => {
              setShowAdd(false)
              loadRoster()
            }}
          />
        )}
      </main>
    </div>
  )
}