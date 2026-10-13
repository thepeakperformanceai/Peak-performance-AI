// Admin tools for VALD:
//  - ValdMapping: every VALD test type found in the organisation's tests.
//    For each, the admin chooses a stat (Speed, Power, …) or "show only";
//    for HumanTrak, which metric to report. Nothing is assigned automatically.
//    These tests appear under "Additional VALD results" on the report and
//    are never counted in the OVR.
//  - ValdRaw: an athlete's raw VALD tests (name, body region, movement, side,
//    date), for checking what VALD actually sends.

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { valdMappings, valdSaveMapping, valdDeleteMapping, valdProfiles, valdRaw } from '../services/api'

const day = (iso) => (iso ? String(iso).slice(0, 10) : '')
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')

export function ValdMapping() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('unmapped')
  const [saving, setSaving] = useState('')

  const load = () => {
    setError('')
    valdMappings().then(setData).catch(e => setError(e.message))
  }
  useEffect(load, [])

  const save = async (t, choice) => {
    setSaving(t.key)
    try {
      if (choice === '') {
        await valdDeleteMapping(t.key)
        setData(d => ({ ...d, types: d.types.map(x => (x.key === t.key ? { ...x, mapping: null } : x)) }))
      } else {
        const metric = t.mapping?.metric || null
        const body = choice === 'show' ? { use: 'show', metric } : { use: 'stat', stat: choice, metric }
        const { mapping } = await valdSaveMapping(t.key, { ...body, device: t.device, test: t.test })
        setData(d => ({ ...d, types: d.types.map(x => (x.key === t.key ? { ...x, mapping } : x)) }))
      }
      toast.success('Saved')
    } catch (e) { toast.error(e.message) } finally { setSaving('') }
  }

  const saveMetric = async (t, metric) => {
    setSaving(t.key)
    try {
      const use = t.mapping?.use || 'show'
      const { mapping } = await valdSaveMapping(t.key, { use, stat: t.mapping?.stat || null, metric: metric || null, device: t.device, test: t.test })
      setData(d => ({ ...d, types: d.types.map(x => (x.key === t.key ? { ...x, mapping } : x)) }))
      toast.success('Saved')
    } catch (e) { toast.error(e.message) } finally { setSaving('') }
  }

  if (error) return <div className="card text-sm text-red-600">Could not load VALD test types: {error}</div>
  if (!data) return <div className="card text-sm text-gray-500">Reading the organisation's VALD tests… (the first time can take a minute)</div>

  const shown = data.types.filter(t => filter === 'all' || (filter === 'unmapped' ? !t.mapping && !t.batterySports.length : !!t.mapping))

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-900">VALD test mapping</h2>
        <div className="flex gap-1 text-xs">
          {['unmapped', 'mapped', 'all'].map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded-md ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{cap(f)}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Every VALD test type found in your organisation's tests (last year). Choose the stat each one belongs to, or “Show only”.
        These appear under “Additional VALD results” on reports, grouped by stat, and are never counted in the OVR.
        Battery tests are matched automatically by name and still fill the test form.
      </p>

      {shown.length === 0 && <p className="text-sm text-gray-500">{filter === 'unmapped' ? 'No unmapped test types. 🎉' : 'Nothing here.'}</p>}

      <div className="divide-y divide-gray-100">
        {shown.map(t => {
          const choice = t.mapping ? (t.mapping.use === 'show' ? 'show' : t.mapping.stat) : ''
          return (
            <div key={t.key} className="py-2 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-medium text-gray-900">{t.test}</p>
                <p className="text-[11px] text-gray-500">
                  {t.device}{t.bodyRegion ? ` · ${t.bodyRegion} / ${t.movement}` : ''}{t.testTypeCode ? ` · ${t.testTypeCode}` : ''}
                  {' · '}{t.count} test(s), last {day(t.lastDate)}
                  {t.batterySports.length > 0 && ` · battery test for ${t.batterySports.join(', ')}`}
                </p>
              </div>
              {t.device === 'HumanTrak' && t.metrics?.length > 0 && (
                <select className="inp text-xs w-48" value={t.mapping?.metric || ''} disabled={saving === t.key}
                  onChange={e => saveMetric(t, e.target.value)}>
                  <option value="">{t.metrics.length === 1 ? `Metric: ${t.metrics[0].name}` : 'Metric to report…'}</option>
                  {t.metrics.map(m => <option key={m.code} value={m.code}>{m.name}{m.unit ? ` (${m.unit})` : ''}</option>)}
                </select>
              )}
              <select className="inp text-xs w-40" value={choice} disabled={saving === t.key} onChange={e => save(t, e.target.value)}>
                <option value="">Not mapped</option>
                {data.stats.map(s => <option key={s} value={s}>{cap(s)}</option>)}
                <option value="show">Show only</option>
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ValdRaw() {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [athlete, setAthlete] = useState(null)
  const [raw, setRaw] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const search = async () => {
    setBusy(true); setError(''); setRaw(null); setAthlete(null)
    try { setFound(await valdProfiles(query)) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const open = async (p) => {
    setBusy(true); setError(''); setAthlete(p); setFound(null)
    try { setRaw(await valdRaw(p.profileId)) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card flex flex-col gap-3">
      <h2 className="text-sm font-medium text-gray-900">VALD raw tests</h2>
      <p className="text-xs text-gray-500">Exactly what VALD sends for one athlete (last year), one row per test and side.</p>
      <div className="flex gap-2">
        <input className="inp flex-1" value={query} placeholder="Athlete name in VALD" onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search() }} />
        <button type="button" className="btn text-xs" onClick={search} disabled={busy}>{busy ? 'Working…' : 'Find'}</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {found && (
        <div className="space-y-1">
          {found.profiles.length === 0 && <p className="text-xs text-gray-500">No athlete in VALD matches “{query}”.</p>}
          {found.profiles.map(p => (
            <button key={p.profileId} type="button" onClick={() => open(p)}
              className="block w-full text-left text-sm px-3 py-1.5 rounded-md bg-white border border-gray-100 hover:border-blue-300">
              {p.name} <span className="text-xs text-gray-500">{p.dateOfBirth ? `· born ${day(p.dateOfBirth)}` : ''}{p.lastTest ? ` · last test ${day(p.lastTest.date)}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {athlete && raw && (
        <>
          <p className="text-xs text-gray-600"><b>{athlete.name}</b> · {raw.dynamoTests} Dynamo test(s), {raw.humantrakTests} HumanTrak test(s)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-1 pr-2">Date</th><th className="pr-2">Device</th><th className="pr-2">Test</th>
                  <th className="pr-2">Body region</th><th className="pr-2">Movement / metric</th><th className="pr-2">Side</th><th className="pr-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {raw.rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{day(r.date)}</td>
                    <td className="pr-2">{r.device}</td>
                    <td className="pr-2">{r.test}{r.testTypeCode ? <span className="text-gray-400"> ({r.testTypeCode})</span> : ''}</td>
                    <td className="pr-2">{r.bodyRegion || '—'}</td>
                    <td className="pr-2">{r.device === 'Dynamo' ? (r.movement || '—') : (r.metric || '—')}{r.position ? <span className="text-gray-400"> · {r.position}</span> : ''}</td>
                    <td className="pr-2">{r.side || '—'}</td>
                    <td className="pr-2 whitespace-nowrap">
                      {r.device === 'Dynamo'
                        ? [r.maxForceN !== null ? `${r.maxForceN} N` : null, r.maxRomDeg !== null ? `${r.maxRomDeg}°` : null].filter(Boolean).join(' · ') || '—'
                        : r.max !== null && r.max !== undefined ? `max ${r.max}${r.unit ? ` ${r.unit}` : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {raw.rows.length === 0 && <p className="text-xs text-gray-500">VALD has no Dynamo or HumanTrak tests for this athlete in the last year.</p>}
        </>
      )}
    </div>
  )
}
