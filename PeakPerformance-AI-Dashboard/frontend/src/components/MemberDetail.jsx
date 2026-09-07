import React, { useState } from 'react'
import { downloadReportPDF } from '../services/Reportpdf.js'
import { apiService, apiError } from '../services/api'

const Icon = ({ name, className = '' }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
)

export default function MemberDetail({ member, loading, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState(null)
  const [pwSaving, setPwSaving] = useState(false)

  if (loading) {
    return (
      <section className="p-12 text-center text-[12px] tracking-[0.1em] uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--pp-text-dim)' }}>
        Loading member details…
      </section>
    )
  }
  if (!member) return null

  const report = member.latestReport
  const hasReport = !!(report && report.reportContent && Array.isArray(report.reportContent.ovrScores) && report.reportContent.ovrScores.length > 0)
  const memberId = member.id || member._id

  const onDownload = async () => {
    if (!hasReport) return
    setBusy(true)
    try { await downloadReportPDF(report) }
    catch (e) { alert(e.message || 'Download failed.') }
    finally { setBusy(false) }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      await apiService.deleteMember(memberId)
      setConfirmDelete(false)
      onDeleted?.(memberId)
    } catch (e) {
      alert(apiError(e, 'Could not delete member.'))
    } finally {
      setDeleting(false)
    }
  }

  const savePassword = async () => {
    setPwMsg(null)
    const strong = newPw.length >= 8 && /[A-Z]/.test(newPw) && /[^A-Za-z0-9]/.test(newPw)
    if (!strong) { setPwMsg({ type: 'err', text: 'Min 8 chars, a capital and a special character.' }); return }
    setPwSaving(true)
    try {
      await apiService.changeMemberPassword(memberId, newPw)
      setPwMsg({ type: 'ok', text: 'Password updated.' })
      setNewPw('')
      setTimeout(() => { setPwOpen(false); setPwMsg(null) }, 1200)
    } catch (e) {
      setPwMsg({ type: 'err', text: apiError(e, 'Could not update password.') })
    } finally {
      setPwSaving(false)
    }
  }

  const info = [
    { label: 'Sex', value: member.sex || '—' },
    { label: 'Age', value: member.age ?? '—' },
    { label: 'Sport', value: member.sport || '—' },
    { label: 'Sessions', value: member.sessions ?? 0 },
    { label: 'Last tested', value: member.lastTestedFull || '—' },
  ]

  return (
    <section className="rounded-lg border mb-16 overflow-hidden" style={{ background: 'var(--pp-surface)', borderColor: 'var(--pp-border)' }}>
      {/* header */}
      <div className="flex items-center justify-between p-6 border-b flex-wrap gap-4" style={{ borderColor: 'var(--pp-border)' }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--pp-surface-3)' }}>
            <Icon name="person" className="!text-[24px]" />
          </div>
          <div>
            <h3 className="text-[22px] font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'var(--pp-text)' }}>{member.name}</h3>
            <p className="text-[13px]" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--pp-text-dim)' }}>
              {member.email ? `${member.email} · ` : ''}{member.sport || 'Athlete'} · {member.sessions ?? 0} session{member.sessions === 1 ? '' : 's'}
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
            background: hasReport ? 'var(--pp-orange)' : 'var(--pp-surface-3)',
            color: hasReport ? 'var(--pp-bg)' : 'var(--pp-text-faint)',
            cursor: hasReport && !busy ? 'pointer' : 'not-allowed',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Icon name="download" className="!text-[18px]" />
          {busy ? 'Generating…' : hasReport ? 'Download Report' : 'No report yet'}
        </button>
      </div>

      {/* info grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px" style={{ background: 'var(--pp-border)' }}>
        {info.map((it) => (
          <div key={it.label} className="p-5" style={{ background: 'var(--pp-surface)' }}>
            <p className="text-[11px] tracking-[0.1em] uppercase mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--pp-text-faint)' }}>{it.label}</p>
            <p className="text-[16px]" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--pp-text)' }}>{it.value}</p>
          </div>
        ))}
      </div>

      {/* actions: change password + delete */}
      <div className="p-6 border-t flex flex-wrap items-start gap-3" style={{ borderColor: 'var(--pp-border)' }}>
        {/* Change password */}
        {!pwOpen ? (
          <button
            type="button"
            onClick={() => { setPwOpen(true); setPwMsg(null) }}
            className="flex items-center gap-2 text-[13px] font-bold uppercase px-5 py-2.5 rounded-lg border transition-colors"
            style={{ fontFamily: "'IBM Plex Mono', monospace", borderColor: 'var(--pp-border)', color: 'var(--pp-text)', background: 'transparent' }}
          >
            <Icon name="key" className="!text-[18px]" />Change Password
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg" style={{ background: 'var(--pp-surface-2)', border: '1px solid var(--pp-border)' }}>
            <input
              type="text"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="New password (min 8, capital & symbol)"
              className="text-[14px] px-3 py-2 rounded-md outline-none"
              style={{ fontFamily: "'Inter', sans-serif", background: 'var(--pp-surface)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)', minWidth: 260 }}
            />
            <button
              type="button"
              onClick={savePassword}
              disabled={pwSaving}
              className="text-[13px] font-bold uppercase px-4 py-2 rounded-md"
              style={{ fontFamily: "'IBM Plex Mono', monospace", background: 'var(--pp-orange)', color: 'var(--pp-bg)', opacity: pwSaving ? 0.6 : 1 }}
            >
              {pwSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setPwOpen(false); setNewPw(''); setPwMsg(null) }}
              className="text-[13px] uppercase px-4 py-2 rounded-md"
              style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--pp-text-dim)', background: 'transparent' }}
            >
              Cancel
            </button>
            {pwMsg && (
              <span className="text-[12px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: pwMsg.type === 'ok' ? 'var(--pp-teal)' : '#ff6b5b' }}>
                {pwMsg.text}
              </span>
            )}
          </div>
        )}

        {/* Delete member */}
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 text-[13px] font-bold uppercase px-5 py-2.5 rounded-lg border transition-colors"
            style={{ fontFamily: "'IBM Plex Mono', monospace", borderColor: '#5c2018', color: '#ff6b5b', background: 'transparent' }}
          >
            <Icon name="delete" className="!text-[18px]" />Delete Member
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg" style={{ background: '#1a0f0d', border: '1px solid #5c2018' }}>
            <span className="text-[13px]" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--pp-text)' }}>
              Delete <b>{member.name}</b> and all their sessions? This cannot be undone.
            </span>
            <button
              type="button"
              onClick={doDelete}
              disabled={deleting}
              className="text-[13px] font-bold uppercase px-4 py-2 rounded-md"
              style={{ fontFamily: "'IBM Plex Mono', monospace", background: '#e5342a', color: '#fff', opacity: deleting ? 0.6 : 1 }}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-[13px] uppercase px-4 py-2 rounded-md"
              style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--pp-text-dim)', background: 'transparent' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  )
}