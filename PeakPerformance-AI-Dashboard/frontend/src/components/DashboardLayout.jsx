import React from 'react'

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

function MaterialIcon({ name, className = '' }) {
  return <span className={`material-symbols-outlined shrink-0 ${className}`}>{name}</span>
}

function NavItem({ item, active, onClick }) {
  const isActive = active === item.id
  return (
    <li>
      <button
        type="button"
        onClick={() => onClick(item.id)}
        className={[
          'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left',
          'font-label-caps text-xl uppercase transition-colors',
          isActive
            ? 'border-l-4 border-ignite-orange bg-surface-container text-ignite-orange'
            : 'border-l-4 border-transparent text-chalk-dim hover:bg-surface-container hover:text-chalk',
        ].join(' ')}
      >
        <MaterialIcon name={item.icon} className={isActive ? 'text-ignite-orange' : ''} />
        <span className="truncate">{item.label}</span>
      </button>
    </li>
  )
}

function HeaderActions({ onAddMember, onLogout }) {
  return (
    <>
      <button
        type="button"
        onClick={onAddMember}
        className="shrink-0 border border-ignite-orange bg-transparent px-4 py-2 font-button-text text-button-text uppercase text-ignite-orange rounded hover:bg-ignite-orange/10 transition-colors"
      >
        + Add member
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="shrink-0 border border-surface-variant px-4 py-2 font-button-text text-button-text uppercase text-chalk rounded hover:bg-surface-container transition-colors"
      >
        Log out
      </button>
    </>
  )
}

export default function DashboardLayout({
  activeNav,
  onNav,
  onNewAssessment,
  onAddMember,
  onLogout,
  children,
}) {
  return (
    <div className="min-h-screen bg-void text-chalk">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-surface-variant bg-void px-4 py-4 md:hidden">
        <span className="font-headline-md text-headline-md font-bold truncate">PeakPerformance</span>
        <div className="flex items-center gap-2">
          <HeaderActions onAddMember={onAddMember} onLogout={onLogout} />
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-surface-variant bg-surface-container-lowest md:flex">
        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 pb-6 pt-8">
          <div>
            <div className="mb-10">
              <h1 className="font-headline-md text-headline-md font-bold text-chalk">PeakPerformance</h1>
              <p className="mt-2 font-label-caps text-xl text-chalk-dim">Test. Train. Perform.</p>cd
            </div>

            <button
              type="button"
              onClick={onNewAssessment}
              className="mb-8 flex w-full items-center justify-center gap-2 rounded-lg bg-ignite-orange px-4 py-3 font-button-text text-button-text uppercase text-void hover:opacity-90 transition-opacity"
            >
              <MaterialIcon name="add" />
              <span>New Assessment</span>
            </button>

            <ul className="flex flex-col gap-1">
              {NAV.map((item) => (
                <NavItem key={item.id} item={item} active={activeNav} onClick={onNav} />
              ))}
            </ul>
          </div>

          <ul className="mt-8 flex flex-col gap-1 border-t border-surface-variant pt-4">
            {NAV_BOTTOM.map((item) => (
              <NavItem key={item.id} item={item} active={activeNav} onClick={onNav} />
            ))}
          </ul>
        </div>
      </aside>

      {/* Main area — offset for fixed sidebar */}
      <div className="min-w-0 md:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-10 md:py-10">
          <div className="mb-8 hidden items-center justify-end gap-3 md:flex">
            <HeaderActions onAddMember={onAddMember} onLogout={onLogout} />
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
