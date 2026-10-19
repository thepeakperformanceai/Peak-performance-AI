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
  // Tests chosen per session; position and dominant hand are optional.
  'Custom Assessment': { key: 'custom', custom: true, positions: null, positionLabel: 'Position / role (optional)', handLabel: 'Dominant hand (optional)', handOptional: true, title: '🧪 Custom assessment' },
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

// 5-0-5 timed off each foot (football and padel): both times kept, the faster one scored.
const COD_505_FEET = { key: 'cod_505', label: '5-0-5 Agility', kind: 'twofeet', unit: 's', range: [1.8, 4.0], step: '0.01', group: 'Manual tests', hint: 'Best time turning off each foot; the faster one is scored. Interim benchmark (cricket norms)' }

const FOOTBALL_TESTS = [
  { key: 'sprint_10m', label: '10m Sprint', kind: 'manual', unit: 's', range: [1.4, 3.5], step: '0.01', group: 'Manual tests' },
  { key: 'sprint_30m', label: '30m Sprint', kind: 'manual', unit: 's', range: [3.5, 8.0], step: '0.01', group: 'Manual tests' },
  { key: 'ruler_drop', label: 'Ruler Drop', kind: 'manual', unit: 'cm', range: [0, 30], step: '0.1', group: 'Manual tests', hint: 'Ruler not caught = 30' },
  COD_505_FEET,
  { key: 'single_leg_stand', label: 'Single Leg Stand (eyes closed)', kind: 'bilateral', unit: 's', range: [0, 30], step: '0.1', group: 'HumanTrak (from the VALD report)' },
  { key: 'trunk_rotation', label: 'Trunk Rotation', kind: 'bilateral', unit: '°', range: [0, 90], step: '1', group: 'HumanTrak (from the VALD report)' },
  { key: 'overhead_squat', label: 'Overhead Squat', kind: 'single', unit: 'composite', range: null, step: '1', group: 'HumanTrak (from the VALD report)' },
  { key: 'hip_extension', label: 'Hip Extension', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'knee_extension', label: 'Knee Extension', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
]

const PADEL_TESTS = [
  { key: 'sprint_10m', label: '10m Sprint', kind: 'manual', unit: 's', range: [1.4, 3.5], step: '0.01', group: 'Manual tests' },
  { key: 'ruler_drop', label: 'Ruler Drop', kind: 'manual', unit: 'cm', range: [0, 30], step: '0.1', group: 'Manual tests', hint: 'Ruler not caught = 30' },
  COD_505_FEET,
  { key: 'single_leg_stand', label: 'Single Leg Stand (eyes closed)', kind: 'bilateral', unit: 's', range: [0, 30], step: '0.1', group: 'HumanTrak (from the VALD report)' },
  { key: 'trunk_rotation', label: 'Trunk Rotation', kind: 'bilateral', unit: '°', range: [0, 90], step: '1', group: 'HumanTrak (from the VALD report)' },
  { key: 'overhead_squat', label: 'Overhead Squat', kind: 'single', unit: 'composite', range: null, step: '1', group: 'HumanTrak (from the VALD report)', faults: true },
  { key: 'shoulder_er', label: 'Shoulder External Rotation', kind: 'bilateral', unit: 'N', range: [20, 1500], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'hip_abduction', label: 'Hip Abduction', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'hip_adduction', label: 'Hip Adduction', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
]

const PENDING_HINT = 'Recorded only: benchmarks pending, not scored yet'

const CRICKET_TESTS = [
  { key: 'sprint_10m', label: '10m Sprint (split)', kind: 'manual', unit: 's', range: [1.4, 3.5], step: '0.01', group: 'Manual tests', hint: '10 m split from the 20 m run' },
  { key: 'sprint_20m', label: '20m Sprint', kind: 'manual', unit: 's', range: [2.4, 5.5], step: '0.01', group: 'Manual tests' },
  { key: 'cod_505', label: '505 Agility', kind: 'manual', unit: 's', range: [1.8, 4.0], step: '0.01', group: 'Manual tests', hint: 'Timing gates, 5 m either side of the turn; best of two' },
  { key: 'medicine_ball', label: 'Medicine Ball Throw (seated, 4 kg)', kind: 'manual', unit: 'm', range: [1.5, 12.0], step: '0.01', group: 'Manual tests', hint: PENDING_HINT },
  { key: 'ruler_drop', label: 'Ruler Drop', kind: 'manual', unit: 'cm', range: [0, 30], step: '0.1', group: 'Manual tests', hint: 'Ruler not caught = 30' },
  { key: 'single_leg_stand', label: 'Single Leg Stand (eyes closed)', kind: 'bilateral', unit: 's', range: [0, 30], step: '0.1', group: 'HumanTrak (from the VALD report)' },
  { key: 'shoulder_er', label: 'Shoulder External Rotation', kind: 'bilateral', unit: 'N', range: [20, 1500], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'shoulder_ir', label: 'Shoulder Internal Rotation', kind: 'bilateral', unit: 'N', range: [20, 1500], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'elbow_extension', label: 'Elbow Extension', kind: 'bilateral', unit: 'N', range: [20, 1500], step: '1', group: 'Dynamo (from the VALD report)' },
  { key: 'hip_extension', label: 'Hip Extension', kind: 'bilateral', unit: 'N', range: [50, 3000], step: '1', group: 'Dynamo (from the VALD report)' },
]

const TESTS_BY_SPORT = { football: FOOTBALL_TESTS, padel: PADEL_TESTS, cricket: CRICKET_TESTS }

// ---------- custom assessment ----------
// Manual tests a tester can add. Norms: the chosen sport's anchors if that
// sport has the test, otherwise the only sport that does (shown beside it).
const MANUAL_LIBRARY = [
  { key: 'sprint_10m', label: '10m Sprint', kind: 'manual', unit: 's', range: [1.4, 3.5], step: '0.01', norms: ['football', 'padel', 'cricket'] },
  { key: 'sprint_20m', label: '20m Sprint', kind: 'manual', unit: 's', range: [2.4, 5.5], step: '0.01', norms: ['cricket'] },
  { key: 'sprint_30m', label: '30m Sprint', kind: 'manual', unit: 's', range: [3.5, 8.0], step: '0.01', norms: ['football'] },
  { key: 'ruler_drop', label: 'Ruler Drop', kind: 'manual', unit: 'cm', range: [0, 30], step: '0.1', norms: ['football', 'padel', 'cricket'], hint: 'Ruler not caught = 30' },
  { key: 'cod_505', label: '505 Agility', kind: 'manual', unit: 's', range: [1.8, 4.0], step: '0.01', norms: ['cricket'], hint: 'Timing gates, 5 m either side of the turn; best of two' },
  { key: 'medicine_ball', label: 'Medicine Ball Throw (seated, 4 kg)', kind: 'manual', unit: 'm', range: [1.5, 12.0], step: '0.01', norms: [], hint: PENDING_HINT },
]
const BENCHMARK_SPORTS = [{ value: 'football', label: 'Football' }, { value: 'padel', label: 'Padel' }, { value: 'cricket', label: 'Cricket' }]
const normsFor = (t, benchmarkSport) => (t.norms.includes(benchmarkSport) ? benchmarkSport : t.norms[0] || null)

// VALD battery tests (same definition in every sport), by key.
const VALD_BATTERY = Object.fromEntries([...FOOTBALL_TESTS, ...PADEL_TESTS, ...CRICKET_TESTS]
  .filter(t => t.kind === 'bilateral' || t.kind === 'single').map(t => [t.key, t]))
const STAT_NAMES = { speed: 'Speed', power: 'Power', agility: 'Agility', endurance: 'Endurance', balance: 'Balance', reaction: 'Reaction' }

// The form's test definitions for a custom session, from results.customTests.
const customTestDefs = (results) => (results.customTests || []).map(c => {
  if (c.kind === 'manual') {
    const m = MANUAL_LIBRARY.find(x => x.key === c.key)
    const from = normsFor(m, results.benchmarkSport)
    return { ...m, group: 'Manual tests', removable: true, scored: true,
      hint: [m.hint, from ? `${from[0].toUpperCase()}${from.slice(1)} norms` : null].filter(Boolean).join(' · ') }
  }
  const b = VALD_BATTERY[c.key]
  return {
    key: c.key,
    label: c.label || b?.label || c.key,
    kind: c.bilateral ? 'bilateral' : 'single',
    unit: c.unit ?? b?.unit ?? '',
    range: b?.range || null,
    step: 'any',
    group: c.stat ? 'VALD tests (scored)' : 'VALD tests (shown, not scored)',
    removable: true,
    scored: !!c.stat,
    hint: c.stat
      ? `${STAT_NAMES[c.stat]}${c.statSource === 'built_in' ? ' (standard)' : ''} · ${c.device}`
      : `${c.statSource === 'show_only' ? 'Show only' : 'Not mapped'} · ${c.device} · map it to a stat in Admin › VALD test mapping to score it`,
  }
})

const testsFor = (sportKey = 'football', results = {}) => (sportKey === 'custom' ? customTestDefs(results) : TESTS_BY_SPORT[sportKey])

const emptyTest = () => ({
  status: 'completed', value: '', left: '', right: '',
  cutoffs: ['', '', '', ''], band: '', band_left: '', band_right: '', fault: '',
})

// Padel overhead squat: what the tester saw. Picks the library's fix and is
// named in the athlete report's "Why" line; it never changes the score.
const SQUAT_FAULTS = [
  { value: 'heels_lift', label: 'Heels lifting' },
  { value: 'knees_cave', label: 'Knees caving inward' },
  { value: 'arms_drop', label: 'Arms dropping forward' },
  { value: 'back_arch', label: 'Lower back arching' },
  { value: 'clean', label: 'Clean pattern' },
]

export const emptyResults = (sportKey = 'football') => (sportKey === 'custom'
  ? { timingMethod: '', benchmarkSport: 'football', customTests: [], tests: {} }
  : {
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
  const custom = sportKey === 'custom'
  const tests = testsFor(sportKey, results)
  // Custom: timing is only needed when the session has a sprint.
  const needsTiming = !custom || tests.some(t => t.key.startsWith('sprint_'))
  if (needsTiming && !results.timingMethod) problems.push('Choose the sprint timing method.')
  if (custom && !tests.length) problems.push('Add at least one test: pull from VALD or add a manual test.')
  if (custom && tests.length && !tests.some(t => t.scored)) problems.push('None of these tests can be scored: add a manual test, or map a VALD test to a stat (Admin › VALD test mapping).')
  let completed = 0
  for (const t of tests) {
    const r = results.tests[t.key]
    if (r.status !== 'completed') continue
    completed++
    if (t.scored === false) continue                      // shown only: no band needed
    if (t.kind === 'manual' && !filled(r.value)) problems.push(`${t.label}: enter a value or change the status.`)
    if (t.kind === 'twofeet' && !filled(r.left) && !filled(r.right)) problems.push(`${t.label}: enter at least one foot's time or change the status.`)
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

function TestRow({ test, r, set, onRemove }) {
  const done = r.status === 'completed'
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
        {onRemove && (
          <button type="button" onClick={onRemove} title="Remove this test" className="order-last ml-auto pt-2 text-xs text-gray-400 hover:text-red-600">✕ Remove</button>
        )}

        {done && (test.kind === 'manual' || test.kind === 'single') && (
          <div>
            <div className="flex items-center gap-2">
              <NumberInput value={r.value} onChange={v => set({ value: v })} step={test.step} placeholder="Value" />
              <span className="text-xs text-gray-500">{test.unit}</span>
            </div>
            {outOfRange(r.value, test.range) && <Warn>Outside {test.range[0]}–{test.range[1]} {test.unit}: will be marked invalid. Re-check.</Warn>}
          </div>
        )}

        {done && test.kind === 'twofeet' && (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Left foot</span>
              <NumberInput value={r.left} onChange={v => set({ left: v })} step={test.step} placeholder="Left" />
              <span className="text-xs text-gray-500">Right foot</span>
              <NumberInput value={r.right} onChange={v => set({ right: v })} step={test.step} placeholder="Right" />
              <span className="text-xs text-gray-500">{test.unit}</span>
            </div>
            {(outOfRange(r.left, test.range) || outOfRange(r.right, test.range)) && (
              <Warn>Outside {test.range[0]}–{test.range[1]} {test.unit}: will be marked invalid. Re-check.</Warn>
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
      {done && (test.kind === 'bilateral' || test.kind === 'single') && test.scored !== false && <ValdBenchmark test={test} r={r} set={set} />}
      {done && test.faults && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-500 w-28">Fault seen</span>
          <select className="inp w-80" value={r.fault || ''} onChange={e => set({ fault: e.target.value })}>
            <option value="">Not recorded</option>
            {SQUAT_FAULTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <span className="text-[11px] text-gray-400">Picks the fix in the athlete report; doesn't change the score</span>
        </div>
      )}
    </div>
  )
}

export default function FootballResultsForm({ results, onChange, sport = 'Football', athleteName = '' }) {
  const { key: sportKey, title } = SCORED_SPORTS[sport] || SCORED_SPORTS.Football
  const custom = sportKey === 'custom'
  const TESTS = testsFor(sportKey, results)
  const setTest = (key) => (patch) =>
    onChange({ ...results, tests: { ...results.tests, [key]: { ...results.tests[key], ...patch } } })

  // Custom: add / remove tests.
  const addManual = (key) => {
    if (!key || (results.customTests || []).some(t => t.key === key)) return
    onChange({ ...results, customTests: [...results.customTests, { key, kind: 'manual' }], tests: { ...results.tests, [key]: emptyTest() } })
  }
  const removeTest = (key) => {
    const { [key]: _gone, ...tests } = results.tests
    onChange({ ...results, customTests: results.customTests.filter(t => t.key !== key), tests })
  }
  const showTiming = !custom || TESTS.some(t => t.key.startsWith('sprint_'))

  const GROUP_ORDER = ['Manual tests', 'VALD tests (scored)', 'VALD tests (shown, not scored)']
  const groups = [...new Set(TESTS.map(t => t.group))].sort((a, b) => (custom ? GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b) : 0))
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

      {custom && (
        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-700">Add a manual test</span>
            <select className="inp w-64" value="" onChange={e => addManual(e.target.value)}>
              <option value="">Choose…</option>
              {MANUAL_LIBRARY.filter(m => !(results.customTests || []).some(t => t.key === m.key)).map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-500 ml-2">Norms for manual tests</span>
            <select className="inp w-32" value={results.benchmarkSport} onChange={e => onChange({ ...results, benchmarkSport: e.target.value })}>
              {BENCHMARK_SPORTS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-gray-500">
            Each test is scored on its own: manual tests by their research norms, VALD tests by the VALD cut-offs or band.
            Stats come from the tests that feed them (VALD tests via Admin › VALD test mapping). The OVR is the plain average of the
            scored stats and needs at least 3; otherwise the card says “No OVR: custom session”. Remove any test with ✕.
          </p>
        </div>
      )}

      {custom && !TESTS.length && (
        <p className="text-sm text-gray-500 mb-2">No tests yet: pull the athlete from VALD above, or add a manual test.</p>
      )}

      {showTiming && <div className="flex flex-wrap items-center gap-3 mb-2">
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
      </div>}

      {groups.map(g => (
        <div key={g} className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{g}</div>
          {TESTS.filter(t => t.group === g).map(t => (
            <TestRow key={t.key} test={t} r={results.tests[t.key]} set={setTest(t.key)} onRemove={custom ? () => removeTest(t.key) : null} />
          ))}
        </div>
      ))}

      {!custom && <AdditionalVald rows={results.additionalVald || []} onChange={rows => onChange({ ...results, additionalVald: rows })} />}
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
