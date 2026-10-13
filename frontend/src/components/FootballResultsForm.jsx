import ValdPullPanel from './ValdPullPanel'
// Test results — manual entry for the scoring engine (football and padel).
// Ranges here only power the on-screen warnings; the backend's scoring
// configs (backend/scoring/football_v1.json, padel_v1.json) are the authority.

export const FOOTBALL_POSITIONS = [
  { value: 'GK', label: 'Goalkeeper (GK)' },
  { value: 'DEF', label: 'Defender (DEF)' },
  { value: 'MID', label: 'Midfielder (MID)' },
  { value: 'FWD', label: 'Forward (FWD)' },
]

export const PADEL_POSITIONS = [
  { value: 'LEFT', label: 'Left side (revés)' },
  { value: 'RIGHT', label: 'Right side (drive)' },
  { value: 'BOTH', label: 'Both sides' },
]

export const CRICKET_ROLES = [
  { value: 'BAT', label: 'Batter (BAT)' },
  { value: 'PACE', label: 'Pace bowler (PACE)' },
  { value: 'SPIN', label: 'Spin bowler (SPIN)' },
  { value: 'ALL', label: 'All-rounder (ALL)' },
  { value: 'WK', label: 'Wicketkeeper (WK)' },
]

// Sports scored by the engine, with their position lists.
export const SCORED_SPORTS = {
  Football: { key: 'football', positions: FOOTBALL_POSITIONS, positionLabel: 'Position', title: '⚽ Football test results' },
  Padel: { key: 'padel', positions: PADEL_POSITIONS, positionLabel: 'Court side', handLabel: 'Dominant hand', title: '🎾 Padel test results' },
  Cricket: { key: 'cricket', positions: CRICKET_ROLES, positionLabel: 'Role', handLabel: 'Bowling arm', title: '🏏 Cricket test results' },
}

const STATUSES = [
  { value: 'completed', label: 'Completed' },
  { value: 'not_done', label: 'Not done' },
  { value: 'injured', label: 'Injured' },
  { value: 'equipment_fault', label: 'Equipment fault' },
  { value: 'invalid', label: 'Invalid (protocol broken)' },
]

const BANDS = [
  { value: 'well_below', label: 'Well below' },
  { value: 'below', label: 'Below' },
  { value: 'within_normal', label: 'Within normal' },
  { value: 'slightly_above', label: 'Slightly above' },
  { value: 'well_above', label: 'Well above' },
]

const BEEP_SHUTTLES = {
  1: 7, 2: 8, 3: 8, 4: 9, 5: 9, 6: 10, 7: 10, 8: 11, 9: 11, 10: 11,
  11: 12, 12: 12, 13: 13, 14: 13, 15: 13, 16: 14, 17: 14, 18: 15, 19: 15, 20: 16, 21: 16,
}

const FOOTBALL_TESTS = [
  { key: 'sprint_10m', label: '10m Sprint', kind: 'manual', unit: 's', range: [1.4, 3.5], step: '0.01', group: 'Manual tests' },
  { key: 'sprint_30m', label: '30m Sprint', kind: 'manual', unit: 's', range: [3.5, 8.0], step: '0.01', group: 'Manual tests' },
  { key: 'ruler_drop', label: 'Ruler Drop', kind: 'manual', unit: 'cm', range: [0, 30], step: '0.1', group: 'Manual tests', hint: 'Ruler not caught = 30' },
  { key: 'beep_test', label: 'Beep Test', kind: 'beep', group: 'Manual tests', hint: 'Stopped early through injury = Injured, never a low score' },
  { key: 'single_leg_stand', label: 'Single Leg Stand (eyes closed)', kind: 'bilateral', unit: 's', range: [0, 30], step: '0.1', group: 'HumanTrak (from the VALD report)' },
  { key: 'trunk_rotation', label: 'Trunk Rotation', kind: 'bilateral', unit: '°', range: [0, 90], step: '1', group: 'HumanTrak (from the VALD report)' },
  { key: 'overhead_squat', label: 'Overhead Squat', kind: 'single', unit: 'composite', range: null, step: '1', group: 'HumanTrak (from the VALD report)' },
  { key: 'hip_extension', label: 'Hip Extension', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'knee_extension', label: 'Knee Extension', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
]

const PADEL_TESTS = [
  { key: 'sprint_10m', label: '10m Sprint', kind: 'manual', unit: 's', range: [1.4, 3.5], step: '0.01', group: 'Manual tests' },
  { key: 'ruler_drop', label: 'Ruler Drop', kind: 'manual', unit: 'cm', range: [0, 30], step: '0.1', group: 'Manual tests', hint: 'Ruler not caught = 30' },
  { key: 'beep_test', label: 'Beep Test', kind: 'beep', group: 'Manual tests', hint: 'Stopped early through injury = Injured, never a low score' },
  { key: 'single_leg_stand', label: 'Single Leg Stand (eyes closed)', kind: 'bilateral', unit: 's', range: [0, 30], step: '0.1', group: 'HumanTrak (from the VALD report)' },
  { key: 'trunk_rotation', label: 'Trunk Rotation', kind: 'bilateral', unit: '°', range: [0, 90], step: '1', group: 'HumanTrak (from the VALD report)' },
  { key: 'overhead_squat', label: 'Overhead Squat', kind: 'single', unit: 'composite', range: null, step: '1', group: 'HumanTrak (from the VALD report)' },
  { key: 'shoulder_er', label: 'Shoulder External Rotation', kind: 'bilateral', unit: 'N', range: [20, 1500], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'hip_abduction', label: 'Hip Abduction', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'hip_adduction', label: 'Hip Adduction', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
]

// Yo-Yo IR1 levels and shuttles per level (each shuttle is 2 x 20 m).
const YOYO_SHUTTLES = { 5: 1, 9: 1, 11: 2, 12: 3, 13: 4, 14: 8, 15: 8, 16: 8, 17: 8, 18: 8, 19: 8, 20: 8, 21: 8, 22: 8, 23: 8 }
const PENDING_HINT = 'Recorded only: benchmarks pending, not scored yet'

const CRICKET_TESTS = [
  { key: 'sprint_10m', label: '10m Sprint (split)', kind: 'manual', unit: 's', range: [1.4, 3.5], step: '0.01', group: 'Manual tests', hint: '10 m split from the 20 m run' },
  { key: 'sprint_20m', label: '20m Sprint', kind: 'manual', unit: 's', range: [2.4, 5.5], step: '0.01', group: 'Manual tests' },
  { key: 'cod_505', label: '505 Agility', kind: 'manual', unit: 's', range: [1.8, 4.0], step: '0.01', group: 'Manual tests', hint: 'Timing gates, 5 m either side of the turn; best of two' },
  { key: 'medicine_ball', label: 'Medicine Ball Throw (seated, 4 kg)', kind: 'manual', unit: 'm', range: [1.5, 12.0], step: '0.01', group: 'Manual tests', hint: PENDING_HINT },
  { key: 'yoyo_ir1', label: 'Yo-Yo IR1', kind: 'yoyo', group: 'Manual tests', hint: 'Level.shuttle, e.g. 17.4. Stopped through injury = Injured' },
  { key: 'ruler_drop', label: 'Ruler Drop', kind: 'manual', unit: 'cm', range: [0, 30], step: '0.1', group: 'Manual tests', hint: 'Ruler not caught = 30' },
  { key: 'single_leg_stand', label: 'Single Leg Stand (eyes closed)', kind: 'bilateral', unit: 's', range: [0, 30], step: '0.1', group: 'HumanTrak (from the VALD report)' },
  { key: 'shoulder_er', label: 'Shoulder External Rotation', kind: 'bilateral', unit: 'N', range: [20, 1500], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'shoulder_ir', label: 'Shoulder Internal Rotation', kind: 'bilateral', unit: 'N', range: [20, 1500], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'elbow_extension', label: 'Elbow Extension', kind: 'bilateral', unit: 'N', range: [20, 1500], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'hip_extension', label: 'Hip Extension', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
]

const TESTS_BY_SPORT = { football: FOOTBALL_TESTS, padel: PADEL_TESTS, cricket: CRICKET_TESTS }
const testsFor = (sportKey = 'football') => TESTS_BY_SPORT[sportKey]

const emptyTest = () => ({
  status: 'completed', value: '', left: '', right: '', level: '', shuttle: '',
  cutoffs: ['', '', '', ''], band: '', band_left: '', band_right: '',
})

export const emptyResults = (sportKey = 'football') => ({
  timingMethod: '',
  tests: Object.fromEntries(testsFor(sportKey).map(t => [t.key, emptyTest()])),
})
export const emptyFootballResults = () => emptyResults('football')

const filled = (v) => v !== '' && v !== null && v !== undefined
const outOfRange = (v, range) => filled(v) && range && (Number(v) < range[0] || Number(v) > range[1])

// Returns a list of problems that block submitting (missing values).
// Out-of-range values only warn: the engine marks them invalid.
export function footballProblems(results, sportKey = 'football') {
  const problems = []
  if (!results.timingMethod) problems.push('Choose the sprint timing method.')
  let completed = 0
  for (const t of testsFor(sportKey)) {
    const r = results.tests[t.key]
    if (r.status !== 'completed') continue
    completed++
    if (t.kind === 'manual' && !filled(r.value)) problems.push(`${t.label}: enter a value or change the status.`)
    if ((t.kind === 'beep' || t.kind === 'yoyo') && (!filled(r.level) || !filled(r.shuttle))) problems.push(`${t.label}: enter level and shuttle or change the status.`)
    if (t.kind === 'single' && !filled(r.value)) problems.push(`${t.label}: enter a value or change the status.`)
    if (t.kind === 'bilateral' && !filled(r.left) && !filled(r.right)) problems.push(`${t.label}: enter at least one side or change the status.`)
    if (t.kind === 'bilateral' || t.kind === 'single') {
      const nCut = r.cutoffs.filter(filled).length
      if (nCut > 0 && nCut < 4) problems.push(`${t.label}: enter all 4 VALD cut-offs, or leave them empty and pick the band.`)
      if (nCut === 0) {
        const needBand = t.kind === 'single'
          ? [r.band]
          : [filled(r.left) ? r.band_left : 'x', filled(r.right) ? r.band_right : 'x']
        if (needBand.some(b => !b)) problems.push(`${t.label}: enter the VALD cut-offs or pick the VALD band.`)
      }
    }
  }
  if (completed === 0) problems.push('Enter at least one completed test.')
  return problems
}

function Warn({ children }) {
  return <p className="text-[11px] text-amber-600 mt-1">⚠ {children}</p>
}

function NumberInput({ value, onChange, placeholder, step, width = 'w-24' }) {
  return (
    <input
      type="number" inputMode="decimal" step={step} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`inp ${width}`}
    />
  )
}

function ValdBenchmark({ test, r, set }) {
  const nCut = r.cutoffs.filter(filled).length
  const bandSelect = (key, label) => (
    <select className="inp w-36" value={r[key]} onChange={e => set({ [key]: e.target.value })} disabled={nCut > 0}>
      <option value="">{label}</option>
      {BANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
    </select>
  )
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-500 w-28">VALD cut-offs</span>
        {r.cutoffs.map((c, i) => (
          <NumberInput
            key={i} value={c} step="any" width="w-20" placeholder={`#${i + 1}`}
            onChange={v => set({ cutoffs: r.cutoffs.map((x, j) => (j === i ? v : x)) })}
          />
        ))}
      </div>
      {nCut === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-500 w-28">or VALD band</span>
          {test.kind === 'single'
            ? bandSelect('band', 'Band…')
            : <>
                {filled(r.left) && bandSelect('band_left', 'Left band…')}
                {filled(r.right) && bandSelect('band_right', 'Right band…')}
              </>}
          <span className="text-[11px] text-gray-400">Band only = scored at the band midpoint (partial)</span>
        </div>
      )}
    </div>
  )
}

function TestRow({ test, r, set }) {
  const done = r.status === 'completed'
  const maxShuttle = BEEP_SHUTTLES[Number(r.level)]
  return (
    <div className="py-3 border-t border-gray-100 first:border-t-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-48 pt-2">
          <div className="text-sm font-medium text-gray-800">{test.label}</div>
          {r.vald && r.status === 'completed' && (
            <div className="text-[11px] text-blue-700">From VALD {r.vald.device} · {String(r.vald.date || '').slice(0, 10)}</div>
          )}
          {test.hint && <div className="text-[11px] text-gray-400">{test.hint}</div>}
        </div>
        <select className="inp w-44" value={r.status} onChange={e => set({ status: e.target.value })}>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {done && (test.kind === 'manual' || test.kind === 'single') && (
          <div>
            <div className="flex items-center gap-2">
              <NumberInput value={r.value} onChange={v => set({ value: v })} step={test.step} placeholder="Value" />
              <span className="text-xs text-gray-500">{test.unit}</span>
            </div>
            {outOfRange(r.value, test.range) && <Warn>Outside {test.range[0]}–{test.range[1]} {test.unit}: will be marked invalid. Re-check.</Warn>}
          </div>
        )}

        {done && test.kind === 'yoyo' && (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Level</span>
              <NumberInput value={r.level} onChange={v => set({ level: v })} step="1" width="w-20" placeholder="e.g. 17" />
              <span className="text-xs text-gray-500">Shuttle</span>
              <NumberInput value={r.shuttle} onChange={v => set({ shuttle: v })} step="1" width="w-20" placeholder="e.g. 3" />
            </div>
            {filled(r.level) && !YOYO_SHUTTLES[Number(r.level)] && <Warn>Yo-Yo IR1 levels are {Object.keys(YOYO_SHUTTLES).join(', ')}.</Warn>}
            {YOYO_SHUTTLES[Number(r.level)] && filled(r.shuttle) && (Number(r.shuttle) < 1 || Number(r.shuttle) > YOYO_SHUTTLES[Number(r.level)]) && (
              <Warn>Level {r.level} has shuttles 1 to {YOYO_SHUTTLES[Number(r.level)]}.</Warn>
            )}
          </div>
        )}

        {done && test.kind === 'beep' && (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Level</span>
              <NumberInput value={r.level} onChange={v => set({ level: v })} step="1" width="w-20" placeholder="e.g. 11" />
              <span className="text-xs text-gray-500">Shuttle</span>
              <NumberInput value={r.shuttle} onChange={v => set({ shuttle: v })} step="1" width="w-20" placeholder="e.g. 4" />
            </div>
            {filled(r.level) && !maxShuttle && <Warn>Level must be a whole number from 1 to 21.</Warn>}
            {maxShuttle && filled(r.shuttle) && (Number(r.shuttle) < 0 || Number(r.shuttle) > maxShuttle) && (
              <Warn>Level {r.level} has {maxShuttle} shuttles.</Warn>
            )}
          </div>
        )}

        {done && test.kind === 'bilateral' && (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">L</span>
              <NumberInput value={r.left} onChange={v => set({ left: v })} step={test.step} placeholder="Left" />
              <span className="text-xs text-gray-500">R</span>
              <NumberInput value={r.right} onChange={v => set({ right: v })} step={test.step} placeholder="Right" />
              <span className="text-xs text-gray-500">{test.unit}</span>
            </div>
            {(outOfRange(r.left, test.range) || outOfRange(r.right, test.range)) && (
              <Warn>Outside {test.range[0]}–{test.range[1]} {test.unit}: will be marked invalid. Re-check.</Warn>
            )}
            {filled(r.left) !== filled(r.right) && <Warn>One side only: scored from that side, flagged amber, no symmetry score.</Warn>}
          </div>
        )}
      </div>
      {done && (test.kind === 'bilateral' || test.kind === 'single') && <ValdBenchmark test={test} r={r} set={set} />}
    </div>
  )
}

export default function FootballResultsForm({ results, onChange, sport = 'Football', athleteName = '' }) {
  const { key: sportKey, title } = SCORED_SPORTS[sport] || SCORED_SPORTS.Football
  const TESTS = testsFor(sportKey)
  const setTest = (key) => (patch) =>
    onChange({ ...results, tests: { ...results.tests, [key]: { ...results.tests[key], ...patch } } })

  const groups = [...new Set(TESTS.map(t => t.group))]
  return (
    <div className="card">
      <h2 className="text-sm font-medium text-gray-900 mb-1 flex items-center gap-2">
        {title}
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Every score is calculated from these numbers. Nothing missing is ever estimated: a test that wasn't done shows
        as “Not tested” and the OVR is marked Provisional.
      </p>

      <ValdPullPanel sportKey={sportKey} athleteName={athleteName} results={results} onChange={onChange} />

      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span className="text-xs font-medium text-gray-500">Sprint timing *</span>
        {['hand', 'electronic'].map(m => (
          <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="radio" name="timingMethod" value={m}
              checked={results.timingMethod === m}
              onChange={() => onChange({ ...results, timingMethod: m })}
            />
            {m === 'hand' ? 'Hand stopwatch' : 'Electronic gates'}
          </label>
        ))}
      </div>

      {groups.map(g => (
        <div key={g} className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{g}</div>
          {TESTS.filter(t => t.group === g).map(t => (
            <TestRow key={t.key} test={t} r={results.tests[t.key]} set={setTest(t.key)} />
          ))}
        </div>
      ))}

      <AdditionalVald rows={results.additionalVald || []} onChange={rows => onChange({ ...results, additionalVald: rows })} />
    </div>
  )
}

// VALD tests outside this sport's battery, filled by "Pull from VALD". They go
// on the report under "Additional VALD results": not scored, not in the OVR.
// The VALD band is optional (from the VALD report or VALD Hub).
function AdditionalVald({ rows, onChange }) {
  if (!rows.length) return null
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i) => onChange(rows.filter((_, j) => j !== i))
  const n = (v) => (v === undefined || v === null ? '—' : v)
  const bandSelect = (i, key, value, label) => (
    <select className="inp text-xs w-32" value={value || ''} onChange={e => set(i, { [key]: e.target.value })}>
      <option value="">{label}</option>
      {BANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
    </select>
  )
  return (
    <div className="mt-6">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Additional VALD results</div>
      <p className="text-xs text-gray-500 mb-2">
        Other tests VALD holds for this athlete (most recent per test and side). They appear on the report and PDF for
        information only: <b>not scored and not counted in the OVR</b>. Adding the VALD band is optional.
      </p>
      {rows.map((r, i) => {
        const sided = r.left !== undefined || r.right !== undefined
        return (
          <div key={`${r.key}-${i}`} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-gray-50">
            <div className="flex-1 min-w-[220px]">
              <span className="text-sm font-medium text-gray-900">{r.test}</span>
              <span className="text-xs text-gray-500">
                {' · '}{r.device}{r.date ? ` · ${String(r.date).slice(0, 10)}` : ''}{r.stat ? ` · ${r.stat[0].toUpperCase()}${r.stat.slice(1)}` : ''}
              </span>
              <div className="text-xs text-gray-700">
                {r.needsMetric
                  ? <span className="text-amber-700">Result not shown until an admin picks which metric to report (Admin › VALD test mapping).</span>
                  : sided
                    ? <>L {n(r.left)} · R {n(r.right)} {r.unit}{r.symmetry != null ? ` · symmetry ${r.symmetry}%` : ''}</>
                    : <>{n(r.value)} {r.unit}</>}
              </div>
            </div>
            {!r.needsMetric && (sided
              ? <>{r.left !== undefined && bandSelect(i, 'band_left', r.band_left, 'Left band…')}{r.right !== undefined && bandSelect(i, 'band_right', r.band_right, 'Right band…')}</>
              : bandSelect(i, 'band', r.band, 'Band…'))}
            <button type="button" className="text-xs text-gray-400 hover:text-red-600" onClick={() => remove(i)} title="Leave this test off the report">✕</button>
          </div>
        )
      })}
    </div>
  )
}
