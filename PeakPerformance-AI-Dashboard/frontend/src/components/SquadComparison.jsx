import React from 'react'

function FilterPill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full font-small tracking-[0.1em] uppercase uppercase transition-colors ${
        active
          ? 'border border-ignite-orange text-ignite-orange bg-transparent'
          : 'border border-surface-variant text-chalk-dim hover:border-chalk-dim'
      }`}
    >
      {label}
    </button>
  )
}

function MetricCard({ label, value, unit }) {
  return (
    <div className="bg-surface-container-lowest border border-surface-variant rounded-lg p-6">
      <h4 className="font-small tracking-[0.1em] uppercase text-chalk-dim uppercase mb-4">{label}</h4>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold font-mono text-chalk">{value}</span>
        {unit && <span className="font-mono text-chalk-dim">{unit}</span>}
      </div>
    </div>
  )
}

function ChartPlaceholder({ title, bars }) {
  const hasData = bars && bars.length > 0

  return (
    <div>
      <p className="text-[14px] text-chalk-dim mb-2">{title}</p>
      {hasData ? (
        <>
          <div className="flex items-end justify-between gap-3 px-2 h-40 border-b border-l border-surface-variant border-dashed opacity-80">
            {bars.map((b, idx) => {
              const heightPercent = Math.min((b.value / 40) * 100, 100)
              return (
                <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end">
                  <div className="font-mono text-chalk-dim text-sm mb-2">{b.value}</div>
                  <div
                    className="w-full bg-ignite-orange rounded-t"
                    style={{ height: `${heightPercent}%`, minHeight: b.value > 0 ? '4px' : 0 }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between font-mono mt-2 px-2 text-chalk-dim font-small">
            {bars.map((b, idx) => (
              <div key={idx} className="flex-1 text-center">
                {b.shortName}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="h-40 border-b border-l border-surface-variant border-dashed opacity-50 flex items-end justify-center pb-4">
          <span className="font-small tracking-[0.1em] uppercase text-chalk-dim uppercase">No data</span>
        </div>
      )}
    </div>
  )
}

export default function SquadComparison({
  squadData,
  sportFilter,
  sexFilter,
  onSportFilterChange,
  onSexFilterChange,
  loading,
}) {
  const sports = ['All', 'Football', 'Cricket', 'Padel', 'S&C']
  const sexes = ['All', 'M', 'F']

  const cmjBars = squadData?.groupAverages?.CMJ || []
  const asymBars = squadData?.groupAverages?.Asymmetry || []

  return (
    <div className="mb-section-margin">
      <div className="mb-8">
        <p className="font-small tracking-[0.1em] uppercase text-chalk-dim uppercase mb-2">-- SQUAD COMPARISON</p>
        <h3 className="text-[24px] md:text-[32px] font-bold text-chalk mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Compare Members
        </h3>
        <p className="text-[16px] text-chalk-dim max-w-2xl">
          Filter by sport or sex to see how sub-groups are trending — same data, sliced the way a coach actually thinks
          about a squad.
        </p>
      </div>

      <div className="bg-surface border border-surface-variant rounded-lg p-6 md:p-8">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-6 mb-8 border-b border-surface-variant pb-6">
          <div className="flex items-center gap-4">
            <span className="font-small tracking-[0.1em] uppercase text-chalk-dim uppercase">Sport</span>
            <div className="flex gap-2 flex-wrap">
              {sports.map((sp) => (
                <FilterPill
                  key={sp}
                  label={sp}
                  active={sportFilter === sp}
                  onClick={() => onSportFilterChange(sp)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-small tracking-[0.1em] uppercase text-chalk-dim uppercase">Sex</span>
            <div className="flex gap-2">
              {sexes.map((sx) => (
                <FilterPill
                  key={sx}
                  label={sx}
                  active={sexFilter === sx}
                  onClick={() => onSexFilterChange(sx)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard label="Members" value={loading ? '…' : (squadData?.totalMembers ?? 0)} />
          <MetricCard label="Avg CMJ Height" value={loading ? '…' : (squadData?.avgCMJ ?? 0)} unit="cm" />
          <MetricCard label="Avg Grip Strength" value={loading ? '…' : (squadData?.avgGrip ?? 0)} unit="kg" />
          <MetricCard label="Avg Landing Asym." value={loading ? '…' : (squadData?.avgAsym ?? 0)} unit="%" />
        </div>

        {/* Charts */}
        <div className="border border-surface-variant rounded-lg p-6 mb-8 min-h-64 flex flex-col relative overflow-hidden bg-surface-container-lowest">
          <h4 className="font-small tracking-[0.1em] uppercase text-chalk-dim uppercase mb-6 z-10 relative">
            Group Averages by Sport (Latest Session, All Members)
          </h4>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 z-10 relative">
            <ChartPlaceholder title="Avg. CMJ Height (cm)" bars={cmjBars} />
            <ChartPlaceholder title="Avg. Landing Asymmetry (%)" bars={asymBars} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-tr from-surface-container-lowest to-surface opacity-30 pointer-events-none" />
        </div>

        {/* Comparison table */}
        <div className="border border-surface-variant rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 gap-4 p-4 border-b border-surface-variant bg-surface-container-lowest font-small tracking-[0.1em] uppercase text-chalk-dim uppercase overflow-x-auto whitespace-nowrap">
            <div className="col-span-2">Member</div>
            <div>Sex</div>
            <div>Age</div>
            <div>Sport</div>
            <div className="font-mono">Latest CMJ</div>
            <div className="font-mono">Latest Grip</div>
            <div className="font-mono">Latest Asym.</div>
          </div>

          {loading ? (
            <div className="p-8 text-center bg-surface">
              <p className="text-[14px] text-chalk-dim font-small tracking-[0.1em] uppercase uppercase">Filtering squad members…</p>
            </div>
          ) : squadData?.members?.length === 0 ? (
            <div className="p-8 text-center bg-surface">
              <p className="text-[14px] text-chalk-dim font-small tracking-[0.1em] uppercase uppercase">
                No members found matching selected filters.
              </p>
            </div>
          ) : (
            squadData?.members?.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-7 gap-4 p-4 border-b border-surface-variant last:border-b-0 bg-surface items-center"
              >
                <div className="col-span-2 text-[14px] font-semibold text-chalk">{m.name}</div>
                <div className="font-mono text-body-sm text-chalk-dim">{m.sex}</div>
                <div className="font-mono text-body-sm text-chalk-dim">{m.age}</div>
                <div>
                  <span className="w-full text-center py-1.5 rounded-full border border-surface-variant text-chalk-dim font-small tracking-[0.1em] uppercase inline-block">
                    {m.sport}
                  </span>
                </div>
                <div className="font-mono text-body-sm text-chalk-dim">{m.latestCMJ} cm</div>
                <div className="font-mono text-body-sm text-chalk-dim">{m.latestGrip} kg</div>
                <div className="font-mono text-body-sm text-chalk-dim">{m.latestAsym}%</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}