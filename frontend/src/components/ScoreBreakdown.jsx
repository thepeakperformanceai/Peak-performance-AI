// "How this OVR was calculated" for one report: each stat, the tests that
// feed it, and its share of the OVR. Every number comes from the backend's
// breakdown (the stored engine result, explained with the same configs);
// nothing is calculated here.

const STATUS_TEXT = {
  not_done: 'Not done', injured: 'Injured', equipment_fault: 'Equipment fault',
  invalid: 'Invalid (outside the believable range)', completed: 'Completed',
}
const BENCHMARK_TEXT = {
  research: 'Published research norms',
  vald_age_sex: 'VALD percentile or band (same age and sex)',
  pending: 'No norms yet (recorded only)',
  not_rated: 'Measured, not rated (VALD gave no band)',
}

const fmt = (v) => (v === null || v === undefined ? '—' : String(v))

function rawResult(t) {
  if (t.left !== undefined || t.right !== undefined) return `Left ${fmt(t.left)} · Right ${fmt(t.right)}`
  if (t.metres !== undefined) return `${fmt(t.value)} (${t.metres} m)`
  return fmt(t.value)
}

function TestLine({ t }) {
  const done = t.status === 'completed'
  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="py-2 pr-3">
        <div className="font-medium text-gray-900">{t.label}</div>
        <div className="text-[11px] text-gray-500">{BENCHMARK_TEXT[t.benchmark]}</div>
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">
        {done ? <>{rawResult(t)} <span className="text-gray-500">{t.unit}</span></> : <span className="text-amber-700">{STATUS_TEXT[t.status] || t.status}</span>}
        {t.handTimingAddSeconds != null && (
          <div className="text-[11px] text-gray-500">Hand-timed: +{t.handTimingAddSeconds} s → {t.adjustedValue} s scored</div>
        )}
        {t.percentiles && <div className="text-[11px] text-gray-500">VALD percentile: {t.percentiles.filter(p => p != null).join(' / ')} (not the score)</div>}
        {t.bands && t.bands.some(Boolean) && <div className="text-[11px] text-gray-500">VALD band: {t.bands.filter(Boolean).join(' / ')}{t.partial ? ' (band only)' : ''}</div>}
        {t.lsi != null && <div className="text-[11px] text-gray-500">Weaker side = {t.lsi}% of stronger</div>}
      </td>
      <td className="py-2 pr-3 text-right font-semibold">{t.score == null ? '—' : t.score}</td>
      <td className="py-2 text-right text-gray-600 whitespace-nowrap">
        {t.shareOfStatPct == null ? '—' : `${t.shareOfStatPct}%`}
      </td>
    </tr>
  )
}

export default function ScoreBreakdown({ b, methodologyHref }) {
  const ovr = b.ovr
  const scoredStats = b.stats.filter(s => s.value !== null)
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-gray-100 p-4">
        <h3 className="text-base font-semibold text-gray-900">How this OVR was calculated</h3>
        <p className="text-sm text-gray-600 mt-1">
          Each test gets a score out of 99. Tests are combined into six stats, and the stats are combined into the OVR.
          {' '}
          {ovr.value !== null
            ? <>This session’s OVR is <b>{ovr.value}</b> (exactly {ovr.exact} before rounding), from {ovr.statsScored} scored stats.</>
            : <>There is no OVR for this session: {ovr.statsScored} stat{ovr.statsScored === 1 ? '' : 's'} scored, and an OVR needs at least {ovr.minStats} covering {ovr.minWeightSharePct}% or more of the total weight.</>}
          {ovr.provisional && ' It is marked Provisional.'}
        </p>
        {ovr.reasons?.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">Why provisional or missing: {ovr.reasons.join(' · ')}</p>
        )}
        {b.configChangedSince && (
          <p className="text-xs text-amber-700 mt-1">The benchmarks have been updated since this report was scored ({b.configVersion}); these are the numbers used at the time.</p>
        )}
        {methodologyHref && (
          <a className="text-sm text-blue-700 underline mt-2 inline-block" href={methodologyHref} target="_blank" rel="noopener noreferrer">
            How we score {b.sportName} (method, norms and a worked example)
          </a>
        )}
      </div>

      {ovr.value !== null && (
        <div className="rounded-xl bg-white border border-gray-100 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Each stat’s share of the OVR</h4>
          <div className="space-y-1.5">
            {scoredStats.map(s => (
              <div key={s.key} className="flex items-center gap-3 text-sm">
                <span className="w-24 font-medium">{s.label}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-700" style={{ width: `${s.shareOfOvrPct}%` }} />
                </div>
                <span className="w-48 text-right text-gray-600">{s.exact} × {s.shareOfOvrPct}% = {s.pointsInOvr} pts</span>
              </div>
            ))}
            <div className="flex justify-end text-sm font-semibold pt-1">Total {ovr.exact} → OVR {ovr.value}</div>
          </div>
        </div>
      )}

      {b.stats.map(s => (
        <div key={s.key} className="rounded-xl bg-white border border-gray-100 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-semibold text-gray-900">{s.label} <span className="font-normal text-gray-500">· {s.description}</span></h4>
            <span className="text-lg font-bold">{s.value ?? '—'}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {s.value === null
              ? (s.status === 'not_in_battery' ? 'Not part of this test battery.' : s.status === 'benchmark_pending' ? 'Recorded, but the test has no norms yet, so it isn’t scored.' : 'Not tested this session: never estimated.')
              : <>Average of its test scores, weighted as shown{s.partial ? ' (partial: not every test was done, or a VALD band was used without cut-offs)' : ''}.{s.capped ? ` Capped at ${s.value} because a left/right strength gap is red.` : ''}{s.shareOfOvrPct != null ? ` ${s.shareOfOvrPct}% of the OVR.` : ''}</>}
          </p>
          {s.tests.length > 0 && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500">
                    <th className="pb-1 pr-3 font-medium">Test and norms</th><th className="pb-1 pr-3 font-medium">Result</th>
                    <th className="pb-1 pr-3 font-medium text-right">Score</th><th className="pb-1 font-medium text-right">Weight in {s.label}</th>
                  </tr>
                </thead>
                <tbody>{s.tests.map(t => <TestLine key={t.key} t={t} />)}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {b.flatTests?.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-100 p-4">
          <h4 className="text-sm font-semibold text-gray-900">Tests that only raise flags</h4>
          <p className="text-xs text-gray-500">Scored and shown, but they don’t count towards a stat or the OVR.</p>
          <table className="w-full text-sm mt-2"><tbody>{b.flatTests.map(t => <TestLine key={t.key} t={{ ...t, shareOfStatPct: null }} />)}</tbody></table>
        </div>
      )}

      <div className="rounded-xl bg-white border border-gray-100 p-4">
        <h4 className="text-sm font-semibold text-gray-900">Flags</h4>
        {b.flags.length === 0
          ? <p className="text-sm text-gray-600">No flags this session.</p>
          : <ul className="text-sm text-gray-700 list-disc pl-5">{b.flags.map((f, i) => <li key={i}><b>{f.level.toUpperCase()}</b> · {f.test} · {f.type.replace(/_/g, ' ')}{f.value != null ? ` (${f.value})` : ''}</li>)}</ul>}
      </div>
    </div>
  )
}
