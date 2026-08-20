import React from 'react'

const Icon = ({ name, className = '' }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
)

export default function MemberRoster({ members = [], selectedMemberId, onSelectMember, loading }) {
  return (
    <div className="bg-surface border border-surface-variant rounded-lg overflow-hidden mb-16">
      <div className="flex items-center justify-between p-6 border-b border-surface-variant">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-surface-container rounded-full flex items-center justify-center">
            <Icon name="group" className="text-chalk" />
          </div>
          <div>
            <h3 className="text-[20px] font-semibold text-chalk" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>PeakPerformance</h3>
            <p className="text-[14px] text-chalk-dim" style={{ fontFamily: "'Inter', sans-serif" }}>Continuum workspace</p>
          </div>
        </div>
        <div className="text-[12px] tracking-[0.1em] text-chalk-dim uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          {members.length} member{members.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-4 p-4 border-b border-surface-variant bg-surface-container-lowest text-[12px] tracking-[0.1em] text-chalk-dim uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <div className="col-span-2">Member</div>
        <div>Sex</div>
        <div>Age</div>
        <div>Sport</div>
        <div>Sessions</div>
      </div>

      {loading ? (
        <div className="p-12 text-center bg-surface border-b border-surface-variant">
          <p className="text-[16px] text-chalk-dim" style={{ fontFamily: "'Inter', sans-serif" }}>Loading…</p>
        </div>
      ) : members.length === 0 ? (
        <div className="p-12 text-center bg-surface border-b border-surface-variant">
          <p className="text-[16px] text-chalk-dim" style={{ fontFamily: "'Inter', sans-serif" }}>No members yet — click "+ Add member" to create your first one.</p>
        </div>
      ) : (
        members.map((m) => {
          const on = m.id === selectedMemberId
          return (
            <button key={m.id} onClick={() => onSelectMember?.(m.id)}
              className={`grid grid-cols-6 gap-4 p-4 w-full text-left items-center border-b border-surface-variant transition-colors ${on ? 'bg-surface-container' : 'bg-surface hover:bg-surface-container-low'}`}>
              <div className={`col-span-2 text-[14px] ${on ? 'text-ignite-orange' : 'text-chalk'}`} style={{ fontFamily: "'Inter', sans-serif" }}>{m.name}</div>
              <div className="text-[14px] text-chalk-dim" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{m.sex || '—'}</div>
              <div className="text-[14px] text-chalk-dim" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{m.age ?? '—'}</div>
              <div className="text-[14px] text-chalk-dim" style={{ fontFamily: "'Inter', sans-serif" }}>{m.sport || '—'}</div>
              <div className="text-[14px] text-chalk-dim" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{m.sessions ?? 0}</div>
            </button>
          )
        })
      )}

      <div className="p-4 bg-surface text-[12px] tracking-[0.1em] text-chalk-dim flex items-center gap-2 uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <Icon name="subdirectory_arrow_right" className="!text-[16px]" />
        click any member to view their profile below
      </div>
    </div>
  )
}