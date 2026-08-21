import React, { useState } from 'react'
import { downloadReportPDF } from '../services/Reportpdf.js'

const Icon = ({ name, className = '' }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
)

export default function MemberDetail({ member, loading }) {
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <section className="p-12 text-center text-[12px] tracking-[0.1em] uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#A8A8AD' }}>
        Loading member details…
      </section>
    )
  }
  if (!member) return null

  const report = member.latestReport
  const hasReport = !!(report && report.reportContent && Array.isArray(report.reportContent.ovrScores) && report.reportContent.ovrScores.length > 0)

  const onDownload = async () => {
    if (!hasReport) return
    setBusy(true)
    try { await downloadReportPDF(report) }
    catch (e) { alert(e.message || 'Download failed.') }
    finally { setBusy(false) }
  }

  const info = [
    { label: 'Sex', value: member.sex || '—' },
    { label: 'Age', value: member.age ?? '—' },
    { label: 'Sport', value: member.sport || '—' },
    { label: 'Sessions', value: member.sessions ?? 0 },
    { label: 'Last tested', value: member.lastTestedFull || '—' },
  ]

  return (
    <section className="rounded-lg border mb-16 overflow-hidden" style={{ background: '#131315', borderColor: '#353437' }}>
      <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: '#353437' }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#201f21' }}>
            <Icon name="person" className="!text-[24px]" />
          </div>
          <div>
            <h3 className="text-[22px] font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#F4F3EF' }}>{member.name}</h3>
            <p className="text-[13px]" style={{ fontFamily: "'Inter', sans-serif", color: '#A8A8AD' }}>
              {member.sport || 'Athlete'} · {member.sessions ?? 0} session{member.sessions === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={!hasReport || busy}
          title={hasReport ? "Download this member's report" : 'No report generated yet'}
          className="flex items-center gap-2 text-[13px] font-bold uppercase px-5 py-2.5 rounded-lg transition-opacity"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            background: hasReport ? '#FF4B12' : '#201f21',
            color: hasReport ? '#0A0A0C' : '#5b5b5f',
            cursor: hasReport && !busy ? 'pointer' : 'not-allowed',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Icon name="download" className="!text-[18px]" />
          {busy ? 'Generating…' : hasReport ? 'Download Report' : 'No report yet'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px" style={{ background: '#353437' }}>
        {info.map((it) => (
          <div key={it.label} className="p-5" style={{ background: '#131315' }}>
            <p className="text-[11px] tracking-[0.1em] uppercase mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#5b5b5f' }}>{it.label}</p>
            <p className="text-[16px]" style={{ fontFamily: "'Inter', sans-serif", color: '#F4F3EF' }}>{it.value}</p>
          </div>
        ))}
      </div>

      <div className="p-5 border-t text-[12px] tracking-[0.1em] uppercase flex items-center gap-2" style={{ borderColor: '#353437', fontFamily: "'IBM Plex Mono', monospace", color: '#A8A8AD' }}>
        <Icon name={hasReport ? 'check_circle' : 'schedule'} className="!text-[16px]" style={{ color: hasReport ? '#39d0c8' : '#A8A8AD' }} />
        {hasReport
          ? `Report available — generated ${member.lastTestedFull}`
          : 'This member has not generated a report yet. It appears here once they log in and generate one.'}
      </div>
    </section>
  )
}