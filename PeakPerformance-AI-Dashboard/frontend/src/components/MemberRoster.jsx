import React from 'react'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function MemberRoster({ members, selectedMemberId, onSelectMember, loading }) {
  return (
    <div className="bg-surface border border-surface-variant rounded-lg overflow-hidden mb-section-margin">
      {/* Card header */}
      <div className="flex items-center justify-between p-6 border-b border-surface-variant">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-surface-container rounded-full flex items-center justify-center">
            <Icon name="group" className="text-chalk" />
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-chalk">PeakPerformance</h3>
            <p className="font-body-sm text-body-sm text-chalk-dim">Continuum workspace</p>
          </div>
        </div>
        <div className="font-label-caps text-xl text-chalk-dim uppercase font-mono">
          {members.length} member{members.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-7 gap-4 p-4 border-b border-surface-variant bg-surface-container-lowest font-label-caps text-xl text-chalk-dim uppercase">
        <div className="col-span-2">Member</div>
        <div>Sex</div>
        <div>Age</div>
        <div>Sport</div>
        <div>Sessions</div>
        <div>Last Tested</div>
      </div>

      {/* Table body */}
      {loading ? (
        <div className="p-12 text-center bg-surface border-b border-surface-variant">
          <p className="font-body-md text-body-md text-chalk-dim mb-0">Loading roster data…</p>
        </div>
      ) : members.length === 0 ? (
        <div className="p-12 text-center bg-surface flex flex-col items-center justify-center border-b border-surface-variant">
          <p className="font-body-md text-body-md text-chalk-dim mb-0">
            No members yet — click &quot;+ Add member&quot; to create your first one.
          </p>
        </div>
      ) : (
        <div className="border-b border-surface-variant">
          {members.map((m) => {
            const isSelected = m.id === selectedMemberId
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMember(m.id)}
                className={`grid grid-cols-7 gap-4 w-full p-4 text-left transition-colors border-b border-surface-variant last:border-b-0 hover:bg-surface-container/50 ${
                  isSelected ? 'bg-surface-container border-l-4 border-l-ignite-orange' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div
                  className={`col-span-2 font-headline-md text-body-sm font-bold ${
                    isSelected ? 'text-ignite-orange' : 'text-chalk'
                  }`}
                >
                  {m.name}
                </div>
                <div className="font-mono text-body-sm text-chalk-dim self-center">{m.sex}</div>
                <div className="font-mono text-body-sm text-chalk-dim self-center">{m.age}</div>
                <div className="self-center">
                  <span className="px-4 py-1.5 rounded-full border border-surface-variant text-chalk-dim font-label-caps text-xl inline-block">
                    {m.sport}
                  </span>
                </div>
                <div className="font-mono text-body-sm text-chalk-dim self-center">{m.sessions}</div>
                <div className="font-mono text-body-sm text-chalk-dim self-center">{m.lastTested}</div>
              </button>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div className="p-4 bg-surface font-label-caps text-xl text-chalk-dim flex items-center gap-2 uppercase">
        <Icon name="subdirectory_arrow_right" className="text-sm" />
        click any member to view their profile below
      </div>
    </div>
  )
}
