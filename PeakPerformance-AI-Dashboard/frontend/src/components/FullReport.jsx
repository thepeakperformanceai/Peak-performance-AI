import React, { useState } from 'react'
import { downloadReportPDF } from '../services/Reportpdf.js'

/**
 * Full Peak Performance report rendered on-screen in the DARK dashboard theme.
 * (The downloadable PDF stays the white printed document.)
 */

const TEAL = '#54d9c4'
const BG_CARD = '#0e1823'
const BORDER = '#172333'
const INK = '#e9eef2'
const MUTED = '#8b99a6'
const FAINT = '#566e85'
const ROW_ALT = '#0b141f'

const card = { background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 18 }
const h3 = { fontSize: 14, fontWeight: 700, color: INK, margin: '0 0 14px', display: 'flex', gap: 8, alignItems: 'center', fontFamily: "'Space Grotesk', sans-serif" }
const th = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#c3d0dd' }
const td = { padding: '8px 12px', color: '#c3d0dd', borderTop: `1px solid ${BORDER}` }

const STATUS = {
  priority:   { label: '❌ Priority',   bg: '#2a1113', fg: '#ff8a8a', bd: '#5b1f22' },
  critical:   { label: '❌ Critical',   bg: '#2a1113', fg: '#ff8a8a', bd: '#5b1f22' },
  needs_work: { label: '⚠️ Needs work', bg: '#2a2410', fg: '#f6c667', bd: '#5a4e1e' },
  monitor:    { label: '⚠️ Monitor',    bg: '#2a2410', fg: '#f6c667', bd: '#5a4e1e' },
  good:       { label: '✅ Good',        bg: '#0f2620', fg: TEAL,     bd: '#1d4a40' },
  normal:     { label: '✅ Normal',      bg: '#0f2620', fg: TEAL,     bd: '#1d4a40' },
  balanced:   { label: '✅ Balanced',    bg: '#0f2620', fg: TEAL,     bd: '#1d4a40' },
  excellent:  { label: '✅ Excellent',   bg: '#0f2030', fg: '#7fb2ff', bd: '#254063' },
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
        <thead><tr style={{ background: '#0a1622' }}>{header.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>{body.map((r, ri) => (
          <tr key={ri} style={{ background: ri % 2 ? ROW_ALT : 'transparent' }}>{r.map((c, ci) => <td key={ci} style={td}>{c}</td>)}</tr>
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
            <h2 style={{ fontSize: 24, fontWeight: 700, color: INK, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>{report.athleteName}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 12, color: MUTED }}>
              {report.testDate && <span>📅 {report.testDate}</span>}
              {report.sport && <span>🏃 {report.sport}</span>}
              {report.age != null && <span>👤 {report.age} years</span>}
              {report.practitioner && <span>🩺 {report.practitioner}</span>}
            </div>
          </div>
          <button onClick={onDownload} disabled={busy}
            style={{ background: TEAL, color: '#0A0E13', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: "'IBM Plex Mono', monospace" }}>
            {busy ? '⏳ Generating…' : '⬇ Download PDF'}
          </button>
        </div>
        {rc.overallSummary && (
          <div style={{ marginTop: 16, padding: 16, background: '#0f2620', border: `1px solid ${TEAL}44`, borderRadius: 12, fontSize: 13, color: '#c3d0dd', lineHeight: 1.6 }}>
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
          <div key={c.label} style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 12, color: FAINT, margin: '0 0 4px' }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: TEAL, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>{c.val}</p>
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
            <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#0a1622' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{i + 1}. {f.title}</span>
                {badge(f.status)}
              </div>
              <div style={{ padding: '12px 14px' }}>
                {f.description && <p style={{ fontSize: 13, color: '#aeb9c4', lineHeight: 1.6, margin: '0 0 10px' }}>{f.description}</p>}
                <Table rows={f.metrics} />
                {f.exercises?.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: MUTED }}>Exercises:</span>
                    {f.exercises.map(ex => <span key={ex} style={{ fontSize: 12, background: '#0f2620', color: TEAL, padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>{ex}</span>)}
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
          {onCourt.intro && <p style={{ fontSize: 13, color: '#c3d0dd', lineHeight: 1.6, marginBottom: 14 }}>{onCourt.intro}</p>}
          {(onCourt.sections || []).map((s, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${TEAL}`, paddingLeft: 14, marginBottom: 12 }}>
              {s.title && <h4 style={{ fontSize: 13, fontWeight: 600, color: INK, margin: '0 0 4px' }}>{s.title}</h4>}
              {s.body && <p style={{ fontSize: 13, color: '#aeb9c4', lineHeight: 1.6, margin: 0 }}>{s.body}</p>}
              {s.example && <p style={{ fontSize: 13, color: MUTED, fontStyle: 'italic', lineHeight: 1.6, marginTop: 4 }}>{s.example}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Training plan */}
      {(tp.intro || (tp.priorities || []).length > 0 || (tp.weeklySchedule || []).length > 0) && (
        <div style={card}>
          <h3 style={h3}>🏋️ Training plan</h3>
          {tp.intro && <p style={{ fontSize: 13, color: '#aeb9c4', lineHeight: 1.6, marginBottom: 14 }}>{tp.intro}</p>}
          {(tp.priorities || []).map((p, i) => (
            <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#0A0E13', background: p.color || TEAL }}>{p.title}</div>
              <div style={{ padding: '12px 14px', background: ROW_ALT }}>
                {p.note && <p style={{ fontSize: 12, color: '#aeb9c4', lineHeight: 1.6, margin: '0 0 10px' }}>{p.note}</p>}
                {p.bullets?.length > 0 && <ul style={{ fontSize: 12, color: '#c3d0dd', margin: '0 0 10px', paddingLeft: 18 }}>{p.bullets.map((b, bi) => <li key={bi}>{b}</li>)}</ul>}
                {p.exercises?.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: '#0a1622' }}>{['Exercise','Sets','Reps','Rest','Cues'].map(h => <th key={h} style={{ ...th, color: MUTED }}>{h}</th>)}</tr></thead>
                      <tbody>{p.exercises.map((ex, ei) => (
                        <tr key={ei} style={{ background: ei % 2 ? BG_CARD : 'transparent' }}>
                          <td style={{ ...td, fontWeight: 600, color: INK }}>{ex.name}</td>
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
              <h4 style={{ fontSize: 12, fontWeight: 500, color: MUTED, marginBottom: 8 }}>Weekly schedule</h4>
              <Table rows={[['Day','Focus','Exercises'], ...tp.weeklySchedule.map(r => [r.day, r.focus, r.exercises])]} />
            </div>
          )}
          {tp.progression && <p style={{ fontSize: 12, color: MUTED, fontStyle: 'italic', lineHeight: 1.6, marginTop: 14 }}>{tp.progression}</p>}
        </div>
      )}

      {/* Reassessment */}
      {targets.length > 0 && (
        <div style={card}>
          <h3 style={h3}>🎯 Reassessment targets</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#0a1622' }}>{['Area','Current','Target','Priority'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{targets.map((t, i) => (
                <tr key={i} style={{ background: i % 2 ? ROW_ALT : 'transparent' }}>
                  <td style={{ ...td, fontWeight: 600, color: INK }}>{t.area}</td>
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