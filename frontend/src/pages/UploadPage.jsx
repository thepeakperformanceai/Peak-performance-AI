import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { generateReport, generateFootballReport, generatePadelReport, generateCricketReport, generateCustomReport, extractProfile } from '../services/api'
import { useReportStore } from '../store/reportStore'
import { useParamStore } from '../store/paramStore'
import { sanitizeInput } from '../utils/sanitize'
import FootballResultsForm, { SCORED_SPORTS, emptyResults, footballProblems } from '../components/FootballResultsForm'


const SPORTS = ['Football', 'Cricket', 'Padel', 'Custom Assessment']

const STEPS = [
  { num: 1, label: 'Upload files' },
  { num: 2, label: 'Athlete details' },
  { num: 3, label: 'Generate' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)

const emptyFootballProfile = () => ({ dob: '', sex: '', bodyweight: '', position: '', dominantHand: '', testDate: todayISO() })

// Test results kept per engine-scored sport, so switching sport doesn't mix tests.
const emptyResultsBySport = () => Object.fromEntries(Object.entries(SCORED_SPORTS).map(([name, s]) => [name, emptyResults(s.key)]))

// Whole years on the test date, for display; the backend recalculates it.
function ageFromDob(dob, onDate) {
  if (!dob || !onDate) return null
  const b = new Date(`${dob}T00:00:00Z`), d = new Date(`${onDate}T00:00:00Z`)
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null
  let age = d.getUTCFullYear() - b.getUTCFullYear()
  const m = d.getUTCMonth() - b.getUTCMonth()
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--
  return age
}

function mergeProfileIntoForm(prev, profile) {
  const applied = []
  const next = { ...prev }
  if (profile.name?.trim() && !prev.name?.trim()) {
    next.name = profile.name.trim()
    applied.push('name')
  }
  if (profile.age && !prev.age) {
    next.age = String(profile.age)
    applied.push('age')
  }
  if (profile.sport?.trim()) {
    const match = SPORTS.find(s => s.toLowerCase() === profile.sport.trim().toLowerCase())
    if (match && match !== prev.sport) {
      next.sport = match
      applied.push('sport')
    }
  }
  return { next, applied }
}

export default function UploadPage({ onReportGenerated }) {
  const [files, setFiles]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [loadMsg, setLoadMsg]   = useState('')
  const [currentStep, setStep]  = useState(1)
  const setReport               = useReportStore(s => s.setReport)
  const enabledParams           = useParamStore(s => s.params.filter(p => p.enabled))

  const [form, setForm] = useState({
    name: '', age: '', sport: 'Football',
    position: '', trainingLevel: 'Semi-Professional',
    knownInjuries: '',
  })

  // Football only: extra required profile fields + the test results.
  const [fbProfile, setFbProfile] = useState(emptyFootballProfile)
  const [resultsBySport, setResultsBySport] = useState(emptyResultsBySport)
  // Sports scored by the engine (Football, Padel) use the results form;
  // the others keep the PDF upload flow unchanged.
  const scored = SCORED_SPORTS[form.sport]
  const isScored = !!scored
  const fbResults = resultsBySport[form.sport]
  const setFbResults = r => setResultsBySport(prev => ({ ...prev, [form.sport]: r }))
  const fbAge = ageFromDob(fbProfile.dob, fbProfile.testDate)
  const handleFbChange = e =>
    setFbProfile(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const onDrop = useCallback(accepted => {
    const valid = accepted.filter(f =>
      f.type === 'application/pdf' || f.name.endsWith('.csv')
    )
    if (valid.length !== accepted.length) {
      toast.error('Please upload PDF or CSV files only.')
    }
    if (valid.length > 3) {
      toast.error('Maximum 3 files allowed.')
      return
    }
    setFiles(prev => [...prev, ...valid].slice(0, 3))
    autofillFromPdf(valid.filter(f => f.type === 'application/pdf'))
    setStep(2)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'text/csv': ['.csv'] },
    maxFiles: 3,
  })

  const removeFile = idx =>
    setFiles(prev => prev.filter((_, i) => i !== idx))

  const handleChange = e =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const validateFootball = () => {
    if (!form.name.trim())         { toast.error('Athlete name is required.'); return false }
    if (!fbProfile.dob)            { toast.error('Date of birth is required.'); return false }
    if (fbAge === null || fbAge < 5 || fbAge > 80) { toast.error('Please check the date of birth.'); return false }
    if (!fbProfile.sex)            { toast.error('Sex is required.'); return false }
    if (scored.positions && !scored.positions.some(p => p.value === fbProfile.position)) { toast.error(`${scored.positionLabel} is required.`); return false }
    if (scored.handLabel && !scored.handOptional && !fbProfile.dominantHand) { toast.error(`${scored.handLabel} is required.`); return false }
    if (!fbProfile.bodyweight)     { toast.error('Bodyweight is required.'); return false }
    const bw = Number(fbProfile.bodyweight)
    if (bw < 30 || bw > 160)       { toast.error('Bodyweight must be 30–160 kg. Please re-check it.'); return false }
    for (const p of enabledParams) {
      if (p.required && !form[p.key]?.toString().trim()) {
        toast.error(`${p.label} is required.`)
        return false
      }
    }
    const problems = footballProblems(fbResults, scored.key)
    if (problems.length) { toast.error(problems[0]); return false }
    return true
  }

  const validate = () => {
    if (isScored) return validateFootball()
    if (files.length === 0) { toast.error('Please upload at least one file.'); return false }
    if (!form.name.trim())  { toast.error('Athlete name is required.'); return false }
    if (!form.age)          { toast.error('Age is required.'); return false }
    if (!form.sport)        { toast.error('Sport is required.'); return false }
    // check required dynamic params
    for (const p of enabledParams) {
      if (p.required && !form[p.key]?.toString().trim()) {
        toast.error(`${p.label} is required.`)
        return false
      }
    }
    return true
  }

  const autofillFromPdf = async (pdfFiles) => {
    if (pdfFiles.length === 0) return
    const toastId = toast.loading('Reading athlete details from PDF…')

    // Extract with one automatic retry — the backend (Render free tier) can be
    // cold-starting on the first request, which rejects; a warmed retry succeeds.
    const tryExtract = async () => {
      try {
        return await extractProfile(pdfFiles)
      } catch (err) {
        const msg = (err?.message || '').toLowerCase()
        const isColdStart =
          msg.includes('timeout') || msg.includes('network') ||
          msg.includes('502') || msg.includes('503') || msg.includes('504')
        if (isColdStart) {
          toast.loading('Server waking up — retrying…', { id: toastId })
          await new Promise(r => setTimeout(r, 3000))
          return await extractProfile(pdfFiles) // second attempt; throws if still failing
        }
        throw err
      }
    }

    try {
      const { profile } = await tryExtract()
      let mergeResult = { applied: [] }
      setForm(prev => {
        mergeResult = mergeProfileIntoForm(prev, profile)
        return mergeResult.next
      })

      const hasExtracted = !!(profile.name?.trim() || profile.age || profile.sport?.trim())
      if (mergeResult.applied.length) {
        toast.success(`Autofilled ${mergeResult.applied.join(', ')} from PDF`, { id: toastId })
      } else if (!hasExtracted) {
        toast('No athlete details found in PDF — please fill in manually.', { id: toastId, icon: 'ℹ️' })
      } else {
        toast.dismiss(toastId)
      }
    } catch (err) {
      // Surface the ACTUAL failure so it's clear whether this is a server/network
      // issue vs. a genuine parsing problem — instead of a generic message.
      const raw = err?.message || 'Unknown error'
      console.error('Autofill failed:', raw)
      const low = raw.toLowerCase()
      const friendly =
        low.includes('timeout') ? 'Server timed out — it may be waking up. Try again in a moment.' :
        (low.includes('network') || low.includes('502') || low.includes('503') || low.includes('504'))
          ? 'Cannot reach the server right now. Try again in a moment.' :
        `Autofill failed: ${raw}. You can fill in manually.`
      toast.error(friendly, { id: toastId, duration: 6000 })
    }
  }

  const handleGenerate = async () => {
    if (!validate()) return
    setLoading(true)

    const messages = isScored
      ? ['Scoring test results…', 'Writing the report…', 'Checking every number…', 'Almost done…']
      : [
      'Extracting VALD data…',
      'Building AI prompt…',
      'Generating report…',
      'Almost done…',
    ]
    let i = 0
    setLoadMsg(messages[0])
    const iv = setInterval(() => {
      i = Math.min(i + 1, messages.length - 1)
      setLoadMsg(messages[i])
    }, 800)

    try {
      const sanitizedForm = {
        ...form,
        name:          sanitizeInput(form.name),
        knownInjuries: sanitizeInput(form.knownInjuries),
        position:      sanitizeInput(form.position),
      }
      const scoredProfile = { ...sanitizedForm, ...fbProfile, age: fbAge }
      const data = form.sport === 'Football'
        ? await generateFootballReport(files, scoredProfile, fbResults)
        : form.sport === 'Padel'
          ? await generatePadelReport(files, scoredProfile, fbResults)
          : form.sport === 'Cricket'
            ? await generateCricketReport(files, scoredProfile, fbResults)
            : form.sport === 'Custom Assessment'
              ? await generateCustomReport(files, scoredProfile, fbResults)
              : await generateReport(files, sanitizedForm)
      setReport(data)
      toast.success('Report generated!')
      onReportGenerated()
    } catch (err) {
      if (isScored && /route not found/i.test(err.message || '')) {
        toast.error(`The backend this site uses has no ${form.sport.toLowerCase()} scoring yet. Redeploy it from the scoring branch.`, { duration: 8000 })
        return
      }
      toast.error(err.message || 'Report generation failed. Please try again.')
    } finally {
      clearInterval(iv)
      setLoading(false)
    }
  }

  if (loading) return <LoadingScreen message={loadMsg} />

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Step bar */}
      <div className="card flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const done   = step.num < currentStep
          const active = step.num === currentStep
          return (
            <div key={step.num} className="flex items-center flex-1">
              <div className="flex items-center gap-2.5">
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0
                  ${done   ? 'bg-pp-orange text-white' : ''}
                  ${active ? 'bg-pp-orange text-white' : ''}
                  ${!done && !active ? 'bg-gray-100 text-gray-400 border border-gray-200' : ''}
                `}>
                  {done ? '✓' : step.num}
                </div>
                <span className={`text-xs font-medium ${active ? 'text-gray-900' : done ? 'text-pp-orange' : 'text-gray-400'}`}>
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-4 ${done ? 'bg-pp-orange' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Upload zone */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
          📁 Upload VALD files
          <span className="text-xs text-gray-400 font-normal">
            {isScored ? `(optional for ${form.sport.toLowerCase()}: kept with the report as reference)` : '(up to 3 files)'}
          </span>
        </h2>

        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${isDragActive
              ? 'border-pp-orange bg-pp-orangeLite'
              : 'border-gray-200 hover:border-pp-orange hover:bg-pp-orangeLite'}
          `}
        >
          <input {...getInputProps()} />
          <div className="text-3xl text-gray-300 mb-2">☁</div>
          <p className="text-sm font-medium text-gray-700 mb-1">
            {isDragActive ? 'Drop files here' : 'Drag & drop VALD files here'}
          </p>
          <p className="text-xs text-gray-400">
            Supports PDF and CSV — HumanTrak & Dynamo exports
          </p>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-pp-orange text-lg">📄</span>
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{file.name}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pp-orangeLite text-pp-orange">
                  {file.name.endsWith('.csv') ? 'CSV' : 'PDF'}
                </span>
                <button
                  onClick={() => removeFile(idx)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                  aria-label="Remove file"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Athlete form */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
          👤 Athlete details
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Athlete name *</label>
            <input
              name="name" value={form.name} onChange={handleChange}
              className="inp" placeholder="Full name"
            />
          </div>

          {isScored ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                Date of birth * {fbAge !== null && <span className="text-gray-400">(age {fbAge} on test day)</span>}
              </label>
              <input name="dob" value={fbProfile.dob} onChange={handleFbChange} type="date" className="inp" />
            </div>
          ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Age *</label>
            <input
              name="age" value={form.age} onChange={handleChange}
              type="number" min="1" max="99" className="inp" placeholder="Years"
            />
          </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Sport *</label>
            <select name="sport" value={form.sport} onChange={handleChange} className="inp">
              {SPORTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {isScored && !scored.positions ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">{scored.positionLabel}</label>
              <input name="position" value={fbProfile.position} onChange={handleFbChange} maxLength={12} className="inp" placeholder="e.g. Wing, Sprinter" />
            </div>
          ) : isScored ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">{scored.positionLabel} *</label>
              <select name="position" value={scored.positions.some(p => p.value === fbProfile.position) ? fbProfile.position : ''} onChange={handleFbChange} className="inp">
                <option value="">Select…</option>
                {scored.positions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Position / role</label>
            <input
              name="position" value={form.position} onChange={handleChange}
              className="inp" placeholder="e.g. Fast Bowler"
            />
          </div>
          )}

          {isScored && (
            <>
              {scored.handLabel && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">{scored.handLabel}{scored.handOptional ? '' : ' *'}</label>
                  <select name="dominantHand" value={fbProfile.dominantHand} onChange={handleFbChange} className="inp">
                    <option value="">Select…</option>
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Sex *</label>
                <select name="sex" value={fbProfile.sex} onChange={handleFbChange} className="inp">
                  <option value="">Select…</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Bodyweight (kg) *</label>
                <input
                  name="bodyweight" value={fbProfile.bodyweight} onChange={handleFbChange}
                  type="number" step="0.1" min="30" max="160" className="inp" placeholder="e.g. 71.4"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Test date *</label>
                <input name="testDate" value={fbProfile.testDate} onChange={handleFbChange} type="date" className="inp" />
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Training level *</label>
            <select name="trainingLevel" value={form.trainingLevel} onChange={handleChange} className="inp">
              <option>Recreational</option>
              <option>Semi-Professional</option>
              <option>Elite</option>
            </select>
          </div>

          {/* ── Dynamic parameters from Admin settings ── */}
          {enabledParams.map(param => (
            <DynamicField
              key={param.key}
              param={param}
              value={form[param.key] ?? ''}
              onChange={val => setForm(prev => ({ ...prev, [param.key]: val }))}
            />
          ))}

          <div className="space-y-1 col-span-2">
            <label className="text-xs font-medium text-gray-500">Known injuries (optional)</label>
            <textarea
              name="knownInjuries" value={form.knownInjuries} onChange={handleChange}
              className="inp resize-none h-[72px]"
              placeholder="e.g. Previous left knee sprain (2024)"
            />
          </div>
        </div>
      </div>

      {isScored && <FootballResultsForm key={form.sport} sport={form.sport} results={fbResults} onChange={setFbResults} athleteName={form.name} />}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          className="btn"
          onClick={() => {
            setFiles([])
            // 'General Fitness' isn't in SPORTS: the dropdown still showed Football
            // while reports silently went through the non-football pipeline.
            setForm({ name:'', age:'', sport:'Football', position:'', trainingLevel:'Semi-Professional', knownInjuries:'' })
            setFbProfile(emptyFootballProfile())
            setResultsBySport(emptyResultsBySport())
            setStep(1)
          }}
        >
          Clear
        </button>
        <button onClick={handleGenerate} className="btn btn-primary px-5 py-2.5 text-sm font-semibold">
          ⚡ Generate report
        </button>
      </div>

    </div>
  )
}

/* ── Dynamic field renderer ─────────────────────────────────── */
function DynamicField({ param, value, onChange }) {
  const label = (
    <label className="text-xs font-medium text-gray-500">
      {param.label} {param.required && <span className="text-red-500">*</span>}
    </label>
  )

  if (param.type === 'dropdown') {
    return (
      <div className="space-y-1">
        {label}
        <select
          className="inp"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {param.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  if (param.type === 'number') {
    return (
      <div className="space-y-1">
        {label}
        <input
          type="number" min="1"
          className="inp"
          placeholder={param.label}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  // default: text
  return (
    <div className="space-y-1 col-span-2">
      {label}
      <textarea
        className="inp resize-none h-[60px]"
        placeholder={param.label}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

function LoadingScreen({ message }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <div className="w-10 h-10 border-4 border-pp-orangeMid border-t-pp-orange rounded-full animate-spin" />
      <p className="text-sm text-gray-600">{message}</p>
      <p className="text-xs text-gray-400">This usually takes 20–40 seconds</p>
    </div>
  )
}