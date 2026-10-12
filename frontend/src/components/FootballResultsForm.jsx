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

// Sports scored by the engine, with their position lists.
export const SCORED_SPORTS = {
  Football: { key: 'football', positions: FOOTBALL_POSITIONS, positionLabel: 'Position', title: '⚽ Football test results' },
  Padel: { key: 'padel', positions: PADEL_POSITIONS, positionLabel: 'Court side', title: '🎾 Padel test results' },
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

const TESTS_BY_SPORT = { football: FOOTBALL_TESTS, padel: PADEL_TESTS }
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
    if (t.kind === 'beep' && (!filled(r.level) || !filled(r.shuttle))) problems.push(`${t.label}: enter level and shuttle or change the status.`)
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

export default function FootballResultsForm({ results, onChange, sport = 'Football' }) {
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
    </div>
  )
}
