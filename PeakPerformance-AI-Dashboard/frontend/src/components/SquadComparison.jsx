import React, { useState, useEffect } from 'react'
import { apiService } from '../services/api'

const ORANGE = '#FF4B12', VOID = '#0A0A0C', SURFACE = '#131315', BORDER = '#353437'
const CHALK = '#F4F3EF', DIM = '#A8A8AD', FAINT = '#5b5b5f', TEAL = '#39d0c8'
const MONO = { fontFamily: "'IBM Plex Mono', monospace" }
const SG = { fontFamily: "'Space Grotesk', sans-serif" }
const INTER = { fontFamily: "'Inter', sans-serif" }

const Panel = ({ label, children }) => (
  <div className="rounded-lg border p-5" style={{ background: SURFACE, borderColor: BORDER }}>
    <p className="text-[11px] tracking-[0.1em] uppercase mb-3" style={{ ...MONO, color: FAINT }}>{label}</p>
    {children}
  </div>
)

const Stat = ({ value, unit = '/100', sub }) => (
  <div>
    <div className="flex items-end gap-1">
      <span className="text-[36px] leading-none font-bold" style={{ ...SG, color: CHALK }}>{value ?? '—'}</span>
      {value != null && <span className="text-[13px] mb-1" style={{ ...MONO, color: DIM }}>{unit}</span>}
    </div>
    {sub && <p className="text-[12px] mt-2" style={{ ...INTER, color: DIM }}>{sub}</p>}
  </div>
)

const Bar = ({ label, value, color = ORANGE, count }) => (
  <div className="mb-3 last:mb-0">
    <div className="flex justify-between items-center mb-1">
      <span className="text-[13px]" style={{ ...INTER, color: CHALK }}>{label}{count != null && <span style={{ color: FAINT }}> · {count}</span>}</span>
      <span className="text-[13px] font-bold" style={{ ...SG, color: CHALK }}>{value ?? '—'}</span>
    </div>
    <div className="h-2 rounded" style={{ background: '#1c1e22' }}>
      <div className="h-full rounded" style={{ width: `${Math.min(100, value || 0)}%`, background: color }} />
    </div>
  </div>
)

export default function SquadComparison() {
  const [data, setData] = useState(null)
  const [sport, setSport] = useState(null)
  const [test, setTest] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async (sp, ts) => {
    setLoading(true)
    try {
      const d = await apiService.getSquadComparison(sp, ts)
      setData(d); setSport(d.sport); setTest(d.test)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const onSport = (sp) => { setSport(sp); setTest(null); load(sp, null) }
  const onTest = (ts) => { setTest(ts); load(sport, ts) }

  const sports = data?.sports || []
  const tests = data?.tests || []
  const unit = data?.unit || '/100'

  return (
    <section className="rounded-lg border p-6 md:p-8 mb-16" style={{ background: VOID, borderColor: BORDER }}>
      <h3 className="text-[24px] md:text-[28px] font-bold mb-2" style={{ ...SG, color: CHALK }}>Compare Members</h3>
      <p className="text-[14px] mb-6" style={{ ...INTER, color: DIM }}>
        Pick a sport and a test (manual or DynaMo) to see how that squad performs — overall, by sex, and by age.
      </p>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <span className="text-[12px] tracking-[0.1em] uppercase" style={{ ...MONO, color: FAINT }}>Sport</span>
        {sports.length === 0 && !loading && <span className="text-[13px]" style={{ ...INTER, color: DIM }}>No members yet.</span>}
        {sports.map(sp => {
          const on = sp === sport
          return (
            <button key={sp} onClick={() => onSport(sp)}
              className="text-[13px] px-4 py-1.5 rounded-full border transition-colors"
              style={{ ...INTER, borderColor: on ? ORANGE : BORDER, color: on ? ORANGE : DIM, background: 'transparent' }}>
              {sp === 'Strength & Conditioning' ? 'S&C' : sp}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-6">
        <span className="text-[12px] tracking-[0.1em] uppercase" style={{ ...MONO, color: FAINT }}>Test</span>
        <select value={test || ''} onChange={(e) => onTest(e.target.value)}
          className="text-[14px] px-4 py-2 rounded-lg outline-none"
          style={{ ...INTER, background: SURFACE, border: `1px solid ${BORDER}`, color: CHALK, minWidth: 300 }}>
          {tests.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-[13px] py-8 text-center" style={{ ...MONO, color: DIM }}>Loading…</p>
      ) : !data || data.testedCount === 0 ? (
        <div className="rounded-lg border p-8 text-center" style={{ background: SURFACE, borderColor: BORDER }}>
          <p className="text-[14px]" style={{ ...INTER, color: DIM }}>
            No members in {sport === 'Strength & Conditioning' ? 'S&C' : sport} have a result for “{test}” yet.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Panel label={`Squad average · ${test}`}>
              <Stat value={data.overallAvg} unit={unit} sub={`${data.testedCount} of ${data.totalInSport} tested`} />
            </Panel>
            <Panel label="Best performer">
              {data.best ? <Stat value={data.best.score} unit={unit} sub={`${data.best.name}${data.best.raw ? ` · ${data.best.raw}` : ''}`} /> : <Stat value={null} />}
            </Panel>
            <Panel label="Needs work">
              {data.worst ? <Stat value={data.worst.score} unit={unit} sub={`${data.worst.name}${data.worst.raw ? ` · ${data.worst.raw}` : ''}`} /> : <Stat value={null} />}
            </Panel>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel label={`Male vs Female (avg ${unit === 'LSI %' ? 'LSI' : 'score'})`}>
              <Bar label="Male" value={data.maleAvg} count={data.maleCount} color={ORANGE} />
              <Bar label="Female" value={data.femaleAvg} count={data.femaleCount} color={TEAL} />
            </Panel>
            <Panel label={`By age group (avg ${unit === 'LSI %' ? 'LSI' : 'score'})`}>
              {data.ageBreakdown.length === 0
                ? <p className="text-[13px]" style={{ ...INTER, color: DIM }}>No age data.</p>
                : data.ageBreakdown.map(g => <Bar key={g.group} label={g.group} value={g.avg} count={g.count} />)}
            </Panel>
          </div>
        </>
      )}
    </section>
  )
}