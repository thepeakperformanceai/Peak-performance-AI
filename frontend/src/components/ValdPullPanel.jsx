// "Pull from VALD": finds the athlete in VALD and fills their latest
// HumanTrak and Dynamo results into the test form. Only raw results are
// filled; the tester still enters the VALD cut-offs or band for each test.
// Once picked, the athlete's VALD profile is remembered, so next time the
// same name is found automatically.

import { useEffect, useState } from 'react'
import { valdStatus, valdProfiles, valdLatest, valdDiagnose, valdGetLink, valdSaveLink } from '../services/api'

const LABELS = {
  single_leg_stand: 'Single Leg Stand', trunk_rotation: 'Trunk Rotation', overhead_squat: 'Overhead Squat',
  hip_extension: 'Hip Extension', knee_extension: 'Knee Extension', shoulder_er: 'Shoulder ER',
  shoulder_ir: 'Shoulder IR', elbow_extension: 'Elbow Extension', hip_abduction: 'Hip Abduction', hip_adduction: 'Hip Adduction',
}

const day = (iso) => (iso ? String(iso).slice(0, 10) : '')

// Result of /vald/diagnose: one line per VALD call, pass or fail, no secrets.
function ValdCheck() {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { setResult(await valdDiagnose()) } catch (e) { setResult({ steps: [], advice: e.message }) } finally { setBusy(false) }
  }
  return (
    <div className="mt-2">
      <button type="button" className="btn text-xs" onClick={run} disabled={busy}>{busy ? 'Checking VALD…' : 'Run VALD check'}</button>
      {result && (
        <div className="mt-2 rounded-md border border-gray-100 bg-white p-2 text-xs">
          {result.steps.map((st, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span className={st.ok ? 'text-green-700' : 'text-red-600'}>{st.ok ? '✓' : '✗'}</span>
              <span className="font-medium text-gray-800 w-56">{st.step}</span>
              <span className="text-gray-500">
                {st.status ? `HTTP ${st.status}` : ''}{st.call ? ` · ${st.call}` : ''}
                {st.detail ? ` · ${typeof st.detail === 'string' ? st.detail : Object.entries(st.detail).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}
              </span>
            </div>
          ))}
          <p className="mt-1 font-medium text-gray-800">{result.advice}</p>
        </div>
      )}
    </div>
  )
}

// One VALD athlete: name, date of birth, last test.
function ProfileLine({ p }) {
  return (
    <>
      <span className="font-medium text-gray-900">{p.name || 'Unnamed'}</span>
      <span className="text-xs text-gray-500">
        {' · '}{p.dateOfBirth ? `born ${day(p.dateOfBirth)}` : 'no date of birth in VALD'}
        {' · '}{p.lastTest ? `last test ${day(p.lastTest.date)} (${p.lastTest.device})` : 'no Dynamo or HumanTrak test in the last year'}
      </span>
    </>
  )
}

export default function ValdPullPanel({ sportKey, athleteName, results, onChange }) {
  const [status, setStatus] = useState(null)        // null = checking
  const [query, setQuery] = useState(athleteName || '')
  const [found, setFound] = useState(null)          // { profiles, suggestions, matches, total }
  const [link, setLink] = useState(null)            // saved VALD athlete for this name
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let cancelled = false
    valdStatus()
      .then(s => { if (!cancelled) setStatus(s) })
      .catch(() => { if (!cancelled) setStatus({ configured: false, problems: ['VALD status check failed'] }) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { if (athleteName && !query) setQuery(athleteName) }, [athleteName])

  // Saved link for the athlete named on the form (checked after typing stops).
  const ready = status?.configured && status.connected !== false
  useEffect(() => {
    setLink(null)
    if (!ready || !athleteName?.trim()) return
    let cancelled = false
    const t = setTimeout(() => {
      valdGetLink(athleteName).then(r => { if (!cancelled) setLink(r.link) }).catch(() => {})
    }, 600)
    return () => { cancelled = true; clearTimeout(t) }
  }, [athleteName, ready])

  if (!status) return <p className="text-xs text-gray-400 mb-3">Checking VALD connection…</p>
  if (!ready) {
    return (
      <div className="mb-3">
        <p className="text-xs text-gray-400">
          VALD auto-fill unavailable: {String(status.error || (status.problems || []).join('; ') || 'not connected').replace(/\.$/, '')}. Enter HumanTrak and Dynamo results by hand.
        </p>
        <ValdCheck />
      </div>
    )
  }

  const search = async () => {
    setBusy(true); setError(''); setSummary(null)
    try {
      setFound(await valdProfiles(query))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const pull = async (profile) => {
    setBusy(true); setError('')
    try {
      const out = await valdLatest(profile.profileId, sportKey)
      const tests = { ...results.tests }
      for (const [key, fill] of Object.entries(out.fills)) {
        if (!tests[key]) continue
        const src = out.sources[key] || {}
        tests[key] = {
          ...tests[key],
          status: 'completed',
          left: fill.left !== undefined ? String(fill.left) : '',
          right: fill.right !== undefined ? String(fill.right) : '',
          value: fill.value !== undefined ? String(fill.value) : tests[key].value,
          vald: { device: src.device, date: src.date },
        }
      }
      onChange({ ...results, tests })
      setSummary({ name: profile.name, ...out })
      setFound(null)
      // Remember the pick for the athlete named on the form.
      const name = (athleteName || '').trim()
      if (name) {
        valdSaveLink(name, profile.profileId)
          .then(() => setLink({ ...profile, athleteName: name }))
          .catch(() => {})
      }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const list = (profiles) => profiles.map(p => (
    <button
      key={p.profileId} type="button" onClick={() => pull(p)} disabled={busy}
      className="block w-full text-left text-sm px-3 py-1.5 rounded-md bg-white border border-gray-100 hover:border-blue-300"
    >
      <ProfileLine p={p} />
    </button>
  ))

  return (
    <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
      {link && !summary && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold text-blue-900">Linked VALD athlete:</span>
          <ProfileLine p={link} />
          <button type="button" className="btn text-xs" onClick={() => pull(link)} disabled={busy}>{busy ? 'Working…' : 'Pull results'}</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-blue-900">{link ? 'Or find another VALD athlete' : 'Pull from VALD'}</span>
        <input
          className="inp w-56" value={query} placeholder="First name, last name or both"
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search() } }}
        />
        <button type="button" className="btn text-xs" onClick={search} disabled={busy}>{busy ? 'Working…' : 'Find athlete'}</button>
        <span className="text-[11px] text-gray-500">Fills HumanTrak and Dynamo results. You still enter the VALD cut-offs or band.</span>
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {error && <ValdCheck />}

      {found && (
        <div className="mt-2 space-y-1">
          {found.profiles.length > 0 && (
            <>
              <p className="text-[11px] text-gray-500">
                {query.trim() ? `${found.matches} athlete(s) match “${query.trim()}”` : 'All athletes, A–Z'} · pick the right person
                {found.matches > found.profiles.length ? ` · showing the first ${found.profiles.length}, type more of the name to narrow` : ''}
              </p>
              {list(found.profiles)}
            </>
          )}
          {found.profiles.length === 0 && (
            <>
              <p className="text-sm text-amber-800">
                No athlete in VALD matches “{query.trim()}” ({found.total} athletes searched).
                Check how the name is spelt in VALD Hub (Profiles), then search again with that spelling.
              </p>
              {found.suggestions?.length > 0 && (
                <>
                  <p className="text-[11px] text-gray-500">Closest names in VALD:</p>
                  {list(found.suggestions)}
                </>
              )}
              {!found.total && <ValdCheck />}
            </>
          )}
        </div>
      )}
      {summary && (
        <div className="mt-2 text-xs text-gray-700 space-y-1">
          <p>
            <b>Filled from VALD for {summary.name}:</b>{' '}
            {Object.keys(summary.fills).length
              ? Object.keys(summary.fills).map(k => `${LABELS[k] || k} (${summary.sources[k]?.device}, ${day(summary.sources[k]?.date)})`).join(' · ')
              : 'nothing found in the last year'}
          </p>
          {summary.missing.length > 0 && (
            <p className="text-amber-700">Not found in VALD, enter by hand: {summary.missing.map(k => LABELS[k] || k).join(', ')}</p>
          )}
          {summary.unmatched.filter(u => u.reason !== 'not in this battery').length > 0 && (
            <p className="text-gray-500">
              VALD results that couldn’t be matched automatically:{' '}
              {summary.unmatched.filter(u => u.reason !== 'not in this battery').map(u => `${u.device} ${u.test} (${u.reason})`).join('; ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
