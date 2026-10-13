// Public page (no login): /how-we-score/<sport>.
// "How your OVR is calculated" in plain words. Every number on this page is
// fetched from the backend, which reads it from the same config files the
// scoring engine uses; the worked example is the engine's own result.

import { useEffect, useState } from 'react'
import { getMethodology } from '../services/api'
import LOGO_URL from '../assets/pp-logo-card.png'

const SPORT_TABS = [
  { key: 'football', name: 'Football' },
  { key: 'padel', name: 'Padel' },
  { key: 'cricket', name: 'Cricket' },
  { key: 'custom', name: 'Custom Assessment' },
]

const Section = ({ title, children }) => (
  <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 space-y-3">
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    {children}
  </section>
)

const Pill = ({ children, tone = 'gray' }) => {
  const tones = { gray: 'bg-gray-100 text-gray-700', amber: 'bg-amber-50 text-amber-800 border border-amber-200', blue: 'bg-blue-50 text-blue-800' }
  return <span className={`inline-block text-[11px] font-semibold rounded px-1.5 py-0.5 ${tones[tone]}`}>{children}</span>
}

function Anchors({ b, unit }) {
  if (!b.anchors) return null
  const u = b.anchorUnit === 'm' ? 'm' : b.anchorUnit === 'level' ? '' : unit
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-gray-600">
      {b.anchors.map(a => (
        <span key={a.score} className="rounded bg-gray-50 border border-gray-100 px-1.5 py-0.5">
          {b.anchorUnit === 'level' ? `level ${a.value}` : `${a.value} ${u}`} → <b>{a.score}</b>
        </span>
      ))}
      <span className="text-gray-500">({b.higherIsBetter ? 'higher is better' : 'lower is better'}; in between is scored on a straight line)</span>
    </div>
  )
}

function TestCard({ t, ovr }) {
  return (
    <div className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-900">{t.label}</span>
        <Pill tone="blue">{t.device}</Pill>
        {t.stat ? <Pill>Counts towards {t.stat[0].toUpperCase() + t.stat.slice(1)}</Pill> : <Pill>Flags only, not in the OVR</Pill>}
        {t.benchmark?.interim && <Pill tone="amber">Interim / approximate norms</Pill>}
      </div>
      {t.what && <p className="text-sm text-gray-600 mt-0.5">{t.what}</p>}
      <p className="text-sm text-gray-700 mt-1">
        {t.benchmark.text}
        {t.benchmark.type === 'vald_age_sex' && (t.bothSides ? ' Each side is scored, then the two are averaged.' : '')}
        {t.handTimingAddSeconds != null && ` If timed by hand with a stopwatch, we add ${t.handTimingAddSeconds} s first (stopwatches read faster than timing gates).`}
        {t.plausible && ` Results outside ${t.plausible[0]}–${t.plausible[1]} ${t.unit} are treated as a mistake ("invalid") and not scored.`}
      </p>
      {t.benchmark.type === 'research' && <Anchors b={t.benchmark} unit={t.unit} />}
      {t.benchmark.source && <p className="text-[11px] text-gray-500 mt-1">Source: {t.benchmark.source}</p>}
      {t.benchmark.type === 'research' && (
        <p className="text-[11px] text-gray-500">Scores never go below {ovr.scoreFloor} or above {ovr.scoreCap}.</p>
      )}
    </div>
  )
}

const BASIS = {
  study: { pill: 'Published study', tone: 'blue' },
  vald: { pill: 'VALD norms', tone: 'blue' },
  interim: { pill: 'Interim', tone: 'amber' },
  pending: { pill: 'No benchmark yet', tone: 'gray' },
}

function BenchmarkSources({ list }) {
  return (
    <ul className="text-sm text-gray-700 divide-y divide-gray-100">
      {list.map(b => (
        <li key={b.key} className="py-2 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{b.label}</span>
            <Pill tone={BASIS[b.basis].tone}>{BASIS[b.basis].pill}</Pill>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {b.basis === 'interim' ? 'Interim: approximate, research-based norms; no study cited yet. Will be replaced with a cited or local benchmark.'
              : b.basis === 'pending' ? 'Recorded on the card but not scored until there is an agreed benchmark.'
              : b.source}
          </p>
        </li>
      ))}
    </ul>
  )
}

function WorkedExample({ w }) {
  const scoredStats = w.stats.filter(s => s.value !== null)
  return (
    <div className="space-y-3 text-sm text-gray-700">
      <p>An example {w.athlete.sex} athlete aged {w.athlete.age}, timed with {w.timing}. These numbers come straight from our scoring engine.</p>
      <ol className="space-y-3 list-decimal pl-5">
        <li>
          <b>Score each test.</b>
          <ul className="mt-1 space-y-0.5">
            {w.stats.flatMap(s => s.tests).concat(w.flatTests || []).map(t => (
              <li key={t.key}>
                {t.label}: {t.left !== undefined ? `left ${t.left}, right ${t.right}` : `${t.value}`}{t.metres !== undefined ? ` (${t.metres} m)` : ''} {t.unit}
                {t.bands ? ` (VALD band: ${t.bands.filter(Boolean).join(' / ')})` : ''} → <b>{t.score ?? 'not scored'}</b>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <b>Combine tests into stats</b> (a weighted average):
          <ul className="mt-1 space-y-0.5">
            {w.stats.map(s => (
              <li key={s.key}>
                {s.label}: {s.value === null
                  ? 'not tested'
                  : <>{s.tests.filter(t => t.score !== null).map(t => `${t.score} × ${t.shareOfStatPct}%`).join(' + ')} = <b>{s.value}</b></>}
              </li>
            ))}
          </ul>
        </li>
        <li>
          <b>Combine stats into the OVR</b>: {w.ovr.value === null
            ? <>not enough stats scored ({w.ovr.statsScored} of the {w.ovr.minStats} needed), so no OVR.</>
            : <>{scoredStats.map(s => `${s.exact} × ${s.shareOfOvrPct}%`).join(' + ')} = {w.ovr.exact}, rounded to <b>OVR {w.ovr.value}</b>.</>}
          {w.ovr.provisional && <> It is marked Provisional ({w.ovr.reasons.join('; ')}).</>}
        </li>
      </ol>
    </div>
  )
}

export default function HowWeScorePage({ sport }) {
  const [m, setM] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setM(null); setError('')
    getMethodology(sport).then(setM).catch(e => setError(e.message))
    document.title = 'How we score · PeakPerformance'
  }, [sport])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src={LOGO_URL} alt="Peak Performance" className="h-10 w-auto" style={{ display: 'inline' }} />
          <div>
            <h1 className="text-xl font-bold text-gray-900">How your OVR is calculated</h1>
            <p className="text-xs text-gray-500">PeakPerformance player cards, explained for athletes and parents</p>
          </div>
        </div>
        <nav className="max-w-4xl mx-auto px-4 pb-3 flex flex-wrap gap-1.5">
          {SPORT_TABS.map(s => (
            <a key={s.key} href={`/how-we-score/${s.key}`}
              className={`text-sm px-3 py-1.5 rounded-lg ${s.key === sport ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{s.name}</a>
          ))}
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {error && <p className="text-sm text-red-600">{error === 'Unknown sport' ? 'We don’t have a page for that sport.' : `Couldn’t load this page: ${error}`}</p>}
        {!m && !error && <p className="text-sm text-gray-500">Loading…</p>}
        {m && (
          <>
            <Section title={`${m.name}: the short version`}>
              <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
                <li><b>Every test gets a score out of 99</b>, by comparing the result with norms: published research for the tests we run by hand, and VALD’s own age-and-sex bands for VALD equipment (Dynamo strength, HumanTrak movement).</li>
                <li><b>Tests are combined into six stats</b>: Speed, Power, Agility, Endurance, Balance and Reaction.</li>
                <li><b>The stats are combined into the OVR</b>, the big number on the card. A missing test is never guessed: it shows as “Not tested”.</li>
              </ol>
              <p className="text-sm text-gray-700">Our benchmarks come from published international sports-science research and VALD’s global athlete database, matched by age and sex where available. As we test more athletes in Pakistan, we’ll add local benchmarks too.</p>
              {m.interim && (
                <p className="text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3"><b>Interim norms.</b> {m.notes.replace(/^interim[.:]?\s*/i, '')}</p>
              )}
              {!m.interim && m.notes && <p className="text-sm text-gray-600">{m.notes}</p>}
              <p className="text-[11px] text-gray-400">Method version {m.configVersion}. Every number on this page is read from the files our scoring engine uses.</p>
            </Section>

            <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">More detail</h2>

            <Section title="Where each benchmark comes from">
              <p className="text-sm text-gray-700">Every test is compared with a named benchmark. Where we haven’t yet tied a benchmark to a published study, we label it <b>interim</b> rather than claim one.</p>
              <BenchmarkSources list={m.benchmarkSources} />
            </Section>

            {m.tests && (
              <Section title="The tests">
                <div className="space-y-3">{m.tests.map(t => <TestCard key={t.key} t={t} ovr={m.ovr} />)}</div>
              </Section>
            )}

            {m.manualTests && (
              <Section title="The tests">
                <p className="text-sm text-gray-700">A custom assessment uses the tests chosen for that session. Tests we run by hand:</p>
                <ul className="text-sm text-gray-700 space-y-1.5">
                  {m.manualTests.map(t => (
                    <li key={t.key}>
                      <b>{t.label}</b> {t.interim && !t.pending && <Pill tone="amber">Interim / approximate norms</Pill>}
                      {t.what && <span className="text-gray-600"> · {t.what}</span>}
                      <div className="text-xs text-gray-500">
                        {t.pending ? 'Recorded but not scored yet: no agreed norms.' : `Counts towards ${t.stat}. Norms: the chosen sport's, or ${t.normsFrom}'s if that sport doesn't use this test.`}
                        {t.handTimingAddSeconds != null && ` Hand-timed: +${t.handTimingAddSeconds} s.`}
                        {t.source && ` Source: ${t.source}`}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-gray-700">{m.statRule}</p>
              </Section>
            )}

            <Section title="From tests to stats, and stats to the OVR">
              {m.stats && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1">Stat</th><th className="pb-1">Tests (share within the stat)</th><th className="pb-1 text-right">Share of the OVR</th></tr></thead>
                    <tbody>
                      {m.stats.map(s => (
                        <tr key={s.key} className="border-t border-gray-100 align-top">
                          <td className="py-2 pr-3"><b>{s.label}</b><div className="text-[11px] text-gray-500">{s.description}</div></td>
                          <td className="py-2 pr-3 text-gray-700">{s.inBattery ? s.tests.map(t => `${t.label} (${t.sharePct}%)`).join(', ') : <span className="text-gray-500">Not in this battery: shown as “Not tested”</span>}</td>
                          <td className="py-2 text-right font-semibold">{s.ovrWeightPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {m.statWeights && (
                <p className="text-sm text-gray-700">Every stat that has a score counts equally towards the OVR.</p>
              )}
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                <li>A stat is the weighted average of the test scores that feed it. Tests not done are left out, never filled in.</li>
                <li>The OVR is the weighted average of the stats that have a score, rounded to a whole number. If a stat is missing, the others share its weight.</li>
                <li>An OVR needs at least <b>{m.ovr.minStats} stats</b>{m.ovr.minWeightSharePct ? <> covering at least <b>{m.ovr.minWeightSharePct}%</b> of the total weight</> : null}. Otherwise the card shows {m.sport === 'custom' ? '“No OVR: custom session”' : '“OVR pending”'}, and the stats and tests still show.</li>
                <li>If any left/right strength gap is red, Power is capped at <b>{m.ovr.powerCap}</b>.</li>
              </ul>
            </Section>

            <Section title="VALD tests: bands">
              <p className="text-sm text-gray-700">VALD compares each result with athletes of the same age and sex, and gives four cut-offs that split results into five bands. A result scores within its band’s range, higher the further it sits in the band. If only the band is known (no cut-offs), it scores the middle of the band and the stat is marked “partial”.</p>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1 pr-6">VALD band</th><th className="pb-1 pr-6">Score range</th><th className="pb-1">Band only</th></tr></thead>
                  <tbody>{m.valdBands.map(b => <tr key={b.key} className="border-t border-gray-100"><td className="py-1 pr-6">{b.label}</td><td className="pr-6">{b.scoreFrom}–{b.scoreTo}</td><td>{b.bandOnlyScore}</td></tr>)}</tbody>
                </table>
              </div>
            </Section>

            <Section title="Flags: areas to work on">
              <p className="text-sm text-gray-700">Flags point to things worth training. They are never a diagnosis or an injury prediction.</p>
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">{m.flags.map((f, i) => <li key={i}>{f.text}</li>)}</ul>
            </Section>

            <Section title="What the labels mean">
              <dl className="text-sm text-gray-700 space-y-2">
                <div><dt className="font-semibold">Not tested</dt><dd>The test or stat wasn’t done this session. We never estimate a missing result.</dd></div>
                <div><dt className="font-semibold">Provisional</dt><dd>
                  The OVR is real but may change: a battery test wasn’t completed, a test has no norms yet,
                  the athlete is under {m.ovr.provisionalUnderAge} (our norms are for adults){m.ovr.provisionalSexes?.includes('F') ? ', or the athlete is female (our norms are currently for men)' : ''}.
                </dd></div>
                <div><dt className="font-semibold">{m.sport === 'custom' ? 'No OVR: custom session' : 'OVR pending'}</dt><dd>Too few stats were scored for a fair overall number. The stats and tests that were done still count.</dd></div>
                <div><dt className="font-semibold">Card colour</dt><dd>
                  {m.tiers.filter(t => t.from !== null).map(t => `${t.label} ${t.from}–${t.to}`).join(' · ')}. {m.tiers.find(t => t.from === null)?.label}: {m.tiers.find(t => t.from === null)?.meaning}
                </dd></div>
              </dl>
            </Section>

            <Section title="A worked example">
              <WorkedExample w={m.workedExample} />
            </Section>
          </>
        )}
        <p className="text-center text-xs text-gray-400 pt-2">PeakPerformance.pk · Test. Train. Perform.</p>
      </main>
    </div>
  )
}
