const NAV_ITEMS = [
  { id: 'upload', label: 'New report',    icon: '＋' },
  { id: 'report', label: 'Report viewer', icon: '📄' },
  { id: 'past',   label: 'Past reports',  icon: '📋' },
  { id: 'admin',    label: 'Admin panel', icon: '⚙' },
  { id: 'settings', label: 'Settings',    icon: '👤' },
]

import { useAuth } from '../context/AuthContext'

export default function Sidebar({ activePage, onNavigate }) {
  const { user } = useAuth()
  const initials = (user?.name || '')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—'

  return (
    <aside className="w-[220px] bg-pp-sidebar flex flex-col flex-shrink-0">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.08]">
        <p className="font-display font-bold text-white text-[15px] tracking-tight">
          PeakPerformance.pk
        </p>
        <p className="text-[11px] text-white/40 mt-0.5">Sports Science Platform</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3">
        <p className="text-[10px] uppercase tracking-widest text-white/25 px-2.5 pb-1 pt-2">
          Workspace
        </p>

        {NAV_ITEMS.slice(0, 3).map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`
              w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg mb-0.5
              text-sm transition-colors text-left
              ${activePage === item.id
                ? 'bg-pp-orange text-white'
                : 'text-white/55 hover:bg-white/[0.06] hover:text-white/85'
              }
            `}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}

        <p className="text-[10px] uppercase tracking-widest text-white/25 px-2.5 pb-1 pt-4">
          Settings
        </p>

        {NAV_ITEMS.slice(3)
          .filter(item => item.id !== 'admin' || user?.role === 'admin')
          .map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`
              w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg mb-0.5
              text-sm transition-colors text-left
              ${activePage === item.id
                ? 'bg-pp-orange text-white'
                : 'text-white/55 hover:bg-white/[0.06] hover:text-white/85'
              }
            `}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* User chip */}
      <div className="p-3 border-t border-white/[0.08]">
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.06]">
          <div className="w-7 h-7 rounded-full bg-pp-orange flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-white/70 truncate">{user?.name}</p>
            <p className="text-[10px] text-white/35 capitalize">{user?.role}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}