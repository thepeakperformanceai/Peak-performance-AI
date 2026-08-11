import React, { useState } from 'react'
import { downloadReportPDF } from '../services/reportpdf'

/**
 * Renders the FULL Peak Performance report on-screen (white/orange document —
 * same content the main app shows and the PDF produces), from a report object
 * that already contains reportContent. Skips any /export fetch.
 */

const ORANGE = '#ff4b12'
const card = { background: '#fff', border: '1px solid #eef0f2', borderRadius: 16, padding: 20, marginBottom: 18, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }
const h3 = { fontSize: 14, fontWeight: 600, color: '#111827', margin: '0 0 14px', display: 'flex', gap: 8, alignItems: 'center' }
const th = { padding: '8px 12px', textAlign: 'left', fontWeight: 500 }
const td = { padding: '8px 12px', color: '#374151' }

const STATUS = {
  priority:   { label: '❌ Priority',   bg: '#fef2f2', fg: '#b91c1c', bd: '#fca5a5' },
  needs_work: { label: '⚠️ Needs work', bg: '#fffbeb', fg: '#b45309', bd: '#fcd34d' },
  monitor:    { label: '⚠️ Monitor',    bg: '#fffbeb', fg: '#b45309', bd: '#fcd34d' },
  good:       { label: '✅ Good',        bg: '#f0fdf4', fg: '#15803d', bd: '#86efac' },
  normal:     { label: '✅ Normal',      bg: '#f0fdf4', fg: '#15803d', bd: '#86efac' },
  excellent:  { label: '✅ Excellent',   bg: '#eff6ff', fg: '#1d4ed8', bd: '#93c5fd' },
}
const badge = (s) => {
  const c = STATUS[(s || '').toLowerCase()] || STATUS.good
  return <span style={{ fontSize: 11, fontWeight: 600, color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>{c.label}</span>
}

function Table({ rows }) {
  if (!rows || !rows.length) return null
  const [header, ...body] = rows
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: '#1f2937', color: '#fff' }}>{header.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>{body.map((r, ri) => (
          <tr key={ri} style={{ background: ri % 2 ? '#f9fafb' : '#fff' }}>{r.map((c, ci) => <td key={ci} style={td}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export default function FullReport({ report }) {
  const [busy, setBusy] = useState(false)
  const rc = report?.reportContent || {}

  const onDownload = async () => {
    setBusy(true)
    try { await downloadReportPDF(report) }
    catch (e) { alert(e.message || 'Download failed.') }
    finally { setBusy(false) }
  }

  const findings = rc.findings || []
  const onCourt = rc.onCourt || {}
  const tp = rc.trainingPlan || {}
  const targets = rc.reassessmentTargets || []

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>{report.athleteName}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              {report.testDate && <span>📅 {report.testDate}</span>}
              {report.sport && <span>🏃 {report.sport}</span>}
              {report.age != null && <span>👤 {report.age} years</span>}
              {report.practitioner && <span>🩺 {report.practitioner}</span>}
            </div>
          </div>
          <button onClick={onDownload} disabled={busy}
            style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? '⏳ Generating…' : '⬇ Download PDF'}
          </button>
        </div>
        {rc.overallSummary && (
          <div style={{ marginTop: 16, padding: 16, background: '#fff5f1', border: `1px solid ${ORANGE}33`, borderRadius: 12, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
            {rc.overallSummary}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Areas to address', val: rc.areasToAddress ?? '—' },
          { label: 'Tests completed', val: rc.testsCompleted ?? '—' },
          { label: 'Jump height', val: rc.jumpHeight ?? '—' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #eef0f2', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 4px' }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 600, color: ORANGE, margin: 0 }}>{c.val}</p>
          </div>
        ))}
      </div>

      {/* Area summary */}
      {(rc.areaSummary || []).length > 0 && (
        <div style={card}><h3 style={h3}>📊 Area summary</h3><Table rows={rc.areaSummary} /></div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div style={card}>
          <h3 style={h3}>🔬 Test findings</h3>
          {findings.map((f, i) => (
            <div key={i} style={{ border: '1px solid #eef0f2', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#fafafa' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{i + 1}. {f.title}</span>
                {badge(f.status)}
              </div>
              <div style={{ padding: '12px 14px' }}>
                {f.description && <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, margin: '0 0 10px' }}>{f.description}</p>}
                <Table rows={f.metrics} />
                {f.exercises?.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Exercises:</span>
                    {f.exercises.map(ex => <span key={ex} style={{ fontSize: 12, background: '#fff5f1', color: ORANGE, padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>{ex}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* On court */}
      {(onCourt.intro || (onCourt.sections || []).length > 0) && (
        <div style={card}>
          <h3 style={h3}>🏟️ What this means on court</h3>
          {onCourt.intro && <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 14 }}>{onCourt.intro}</p>}
          {(onCourt.sections || []).map((s, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${ORANGE}`, paddingLeft: 14, marginBottom: 12 }}>
              {s.title && <h4 style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>{s.title}</h4>}
              {s.body && <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, margin: 0 }}>{s.body}</p>}
              {s.example && <p style={{ fontSize: 13, color: '#6b7280', fontStyle: 'italic', lineHeight: 1.6, marginTop: 4 }}>{s.example}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Training plan */}
      {(tp.intro || (tp.priorities || []).length > 0 || (tp.weeklySchedule || []).length > 0) && (
        <div style={card}>
          <h3 style={h3}>🏋️ Training plan</h3>
          {tp.intro && <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, marginBottom: 14 }}>{tp.intro}</p>}
          {(tp.priorities || []).map((p, i) => (
            <div key={i} style={{ border: '1px solid #eef0f2', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: p.color || '#1d4ed8' }}>{p.title}</div>
              <div style={{ padding: '12px 14px', background: '#fafafa' }}>
                {p.note && <p style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6, margin: '0 0 10px' }}>{p.note}</p>}
                {p.bullets?.length > 0 && <ul style={{ fontSize: 12, color: '#374151', margin: '0 0 10px', paddingLeft: 18 }}>{p.bullets.map((b, bi) => <li key={bi}>{b}</li>)}</ul>}
                {p.exercises?.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: '#f3f4f6' }}>{['Exercise','Sets','Reps','Rest','Cues'].map(h => <th key={h} style={{ ...th, color: '#6b7280' }}>{h}</th>)}</tr></thead>
                      <tbody>{p.exercises.map((ex, ei) => (
                        <tr key={ei} style={{ background: ei % 2 ? '#f9fafb' : '#fff' }}>
                          <td style={{ ...td, fontWeight: 600, color: '#1f2937' }}>{ex.name}</td>
                          <td style={td}>{ex.sets}</td><td style={td}>{ex.reps}</td><td style={td}>{ex.rest}</td><td style={td}>{ex.cues}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(tp.weeklySchedule || []).length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 8 }}>Weekly schedule</h4>
              <Table rows={[['Day','Focus','Exercises'], ...tp.weeklySchedule.map(r => [r.day, r.focus, r.exercises])]} />
            </div>
          )}
          {tp.progression && <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', lineHeight: 1.6, marginTop: 14 }}>{tp.progression}</p>}
        </div>
      )}

      {/* Reassessment */}
      {targets.length > 0 && (
        <div style={card}>
          <h3 style={h3}>🎯 Reassessment targets</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: ORANGE, color: '#fff' }}>{['Area','Current','Target','Priority'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{targets.map((t, i) => (
                <tr key={i} style={{ background: i % 2 ? '#f9fafb' : '#fff' }}>
                  <td style={{ ...td, fontWeight: 600, color: '#1f2937' }}>{t.area}</td>
                  <td style={td}>{t.current}</td><td style={td}>{t.target}</td><td style={td}>{badge(t.priority)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}