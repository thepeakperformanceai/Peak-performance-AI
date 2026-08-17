import React, { useState, useRef } from 'react'
import Logo from '../components/Logo'
import { Upload, FileText, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { authApi, apiError } from '../services/authApi'

const page = { minHeight: '100vh', backgroundColor: '#06090e', padding: '40px 16px' }
const card = { maxWidth: '640px', margin: '0 auto', backgroundColor: '#0e1823', border: '1px solid #172333', borderRadius: '16px', padding: '32px' }
const btn = (d) => ({ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', backgroundColor: '#ff4b12', color: '#0A0E13', fontWeight: 700, fontSize: '13px', fontFamily: "'IBM Plex Mono', monospace", cursor: d ? 'default' : 'pointer', opacity: d ? 0.6 : 1, marginTop: 18 })
const SPORTS = ['Football', 'Padel', 'Strength & Conditioning', 'Other']

export default function GenerateReportPage({ onGenerated, firstTime }) {
  const { user, logout } = useAuth()
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [sport, setSport] = useState(user?.memberProfile?.sport || 'Football')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stage, setStage] = useState('')

  const addFiles = (list) => {
    const valid = [...list].filter(f => f.type === 'application/pdf' || f.name.endsWith('.csv'))
    if (valid.length !== list.length) setError('Only PDF or CSV files are accepted.')
    setFiles(prev => [...prev, ...valid])
  }
  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const submit = async () => {
    setError('')
    if (files.length === 0) return setError('Upload your assessment file to generate a report.')
    setBusy(true); setStage('Uploading & analysing your assessment…')
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      fd.append('profile', JSON.stringify({ sport, name: user?.name, age: user?.memberProfile?.age }))
      const res = await authApi.generateReport(fd)
      onGenerated(res.data)
    } catch (err) {
      setError(apiError(err, 'Could not generate your report. Please try again.'))
    } finally { setBusy(false); setStage('') }
  }

  return (
    <div style={page}>
      <div style={{ maxWidth: 640, margin: '0 auto 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo width={150} height={46} />
        <button onClick={logout} className="font-ibm-mono" style={{ background: 'none', border: '1px solid #1c2e42', color: '#8b99a6', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Log out</button>
      </div>

      <div style={card}>
        <div className="font-ibm-mono text-uppercase" style={{ color: '#ff4b12', fontSize: 12, letterSpacing: 1, marginBottom: 10 }}>
          —— {firstTime ? 'Step 1 · Generate your first report' : 'New assessment'}
        </div>
        <h1 className="font-space" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#e9eef2', marginBottom: 6 }}>
          Generate your report
        </h1>
        <p className="font-inter" style={{ color: '#8b99a6', fontSize: 13.5, lineHeight: 1.5, marginBottom: 24 }}>
          {firstTime
            ? 'Upload your assessment to generate your first report. This unlocks your dashboard.'
            : 'Upload a new assessment to add a session to your history.'}
        </p>

        {/* Dropzone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
          style={{ border: '1.5px dashed #24384f', borderRadius: 12, padding: '30px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#0b141f' }}
        >
          <Upload size={22} color="#ff4b12" />
          <div className="font-inter" style={{ color: '#c3d0dd', fontSize: 13.5, marginTop: 8 }}>Click or drop your VALD PDF / scanned sheet</div>
          <div className="font-ibm-mono" style={{ color: '#566e85', fontSize: 11, marginTop: 4 }}>PDF or CSV</div>
          <input ref={inputRef} type="file" accept="application/pdf,.csv" multiple hidden
                 onChange={e => addFiles(e.target.files)} />
        </div>

        {/* File list */}
        {files.map((f, i) => (
          <div key={i} className="d-flex align-items-center justify-content-between" style={{ marginTop: 10, padding: '9px 12px', backgroundColor: '#0b141f', border: '1px solid #1c2e42', borderRadius: 8 }}>
            <span className="font-ibm-mono d-flex align-items-center gap-2" style={{ color: '#8b99a6', fontSize: 12 }}>
              <FileText size={14} color="#ff4b12" /> {f.name}
            </span>
            <X size={14} color="#8b99a6" style={{ cursor: 'pointer' }} onClick={() => removeFile(i)} />
          </div>
        ))}

        {/* Sport */}
        <div style={{ marginTop: 18 }}>
          <label className="font-ibm-mono text-uppercase" style={{ color: '#566e85', fontSize: 11, letterSpacing: 1 }}>Sport</label>
          <select value={sport} onChange={e => setSport(e.target.value)}
                  style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10, backgroundColor: '#0b141f', border: '1px solid #1c2e42', color: '#e9eef2', fontSize: 14, outline: 'none' }}>
            {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {error && <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 12 }}>{error}</div>}
        {busy && stage && <div className="font-ibm-mono" style={{ color: '#ff4b12', fontSize: 12, marginTop: 12 }}>{stage}</div>}

        <button style={btn(busy)} disabled={busy} onClick={submit}>
          {busy ? 'Generating…' : 'Generate report'}
        </button>
      </div>
    </div>
  )
}