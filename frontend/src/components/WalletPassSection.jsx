import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getWalletPass, getWalletStripPreview, saveWalletPass } from '../services/api'

// "Wallet card" under the player card: makes the athlete's Apple / Google
// Wallet pass (Passcreator), or updates the pass they already have after a retest.
export default function WalletPassSection({ report }) {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [fix, setFix] = useState('')
  const [retestBy, setRetestBy] = useState('')
  const [sendEmail, setSendEmail] = useState(false)
  const [link, setLink] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const toggle = async () => {
    setOpen(o => !o)
    if (info || !report._id) return
    try {
      const r = await getWalletPass(report._id)
      setInfo(r)
      setFix(r.values.fix || '')
      setEmail(r.walletPass?.email || '')
      setLink(r.walletPass?.link || '')
      const blob = await getWalletStripPreview(report._id)
      setPreview(URL.createObjectURL(blob))
    } catch (e) { setError(e.message) }
  }

  const save = async () => {
    if (sendEmail && !email.trim()) { toast.error('Add the athlete\'s email to send it'); return }
    setBusy(true)
    try {
      const r = await saveWalletPass(report._id, { email: email.trim(), fix: fix.trim(), retestBy: retestBy || undefined, sendEmail })
      setLink(r.link)
      setInfo(i => ({ ...i, values: r.values, walletPass: { link: r.link }, updatesPreviousPass: null }))
      const msg = r.action === 'created' ? 'Wallet card created'
        : r.action === 'updated-after-retest' ? 'Their existing Wallet card now shows the new results'
          : 'Wallet card updated'
      toast.success(r.emailed ? `${msg} and emailed` : msg)
      if (r.emailError) toast.error(`Email not sent: ${r.emailError}`, { duration: 8000 })
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  if (!report?._id) return null

  const v = info?.values
  const firstName = v?.firstName ? v.firstName.charAt(0) + v.firstName.slice(1).toLowerCase() : ''
  const whatsappText = `Hi ${firstName}, your PeakPerformance rating is ready. Tap to add your card to your phone's Wallet: ${link}`
  const exists = !!info?.walletPass
  const buttonLabel = exists ? 'Update Wallet card'
    : info?.updatesPreviousPass ? 'Update their Wallet card with these results'
      : 'Create Wallet card'

  return (
    <div style={{ marginTop: 16 }} className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
      <button type="button" className="btn text-sm" onClick={toggle}>{open ? '▾' : '▸'} Apple / Google Wallet card</button>
      {open && error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {open && !info && !error && <p className="text-sm text-gray-500 mt-2">Loading…</p>}
      {open && info && (
        <div className="mt-3 space-y-3">
          {!info.configured && (
            <p className="text-sm text-amber-700">Wallet cards aren't connected yet. Add PASSCREATOR_API_KEY and PASSCREATOR_TEMPLATE_ID on the server.</p>
          )}
          {preview && <img src={preview} alt="Wallet card strip" style={{ width: '100%', maxWidth: 520, borderRadius: 8 }} />}
          <div className="text-sm text-gray-700">
            <b>{v.sport}</b> · {v.firstName} · tested {v.tested}
          </div>
          {info.updatesPreviousPass && (
            <p className="text-sm text-blue-700">
              {report.athleteName} already has a Wallet card (from {info.updatesPreviousPass.testDate || 'an earlier test'}).
              It will update with these results, and their phone gets a notification.
            </p>
          )}
          <div className="grid gap-2" style={{ maxWidth: 520 }}>
            <label className="text-xs text-gray-600">#1 thing to fix (back of the card)
              <input className="inp w-full text-sm" value={fix} maxLength={140} onChange={e => setFix(e.target.value)} />
            </label>
            <label className="text-xs text-gray-600">Retest by (default {v.retestBy}, 6 weeks after the test)
              <input type="date" className="inp w-full text-sm" value={retestBy} onChange={e => setRetestBy(e.target.value)} />
            </label>
            <label className="text-xs text-gray-600">Athlete's email
              <input type="email" className="inp w-full text-sm" value={email} placeholder="name@example.com" onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="text-xs text-gray-600 flex items-center gap-2">
              <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
              Email it to them now (uses the email template set up in Passcreator)
            </label>
          </div>
          <button type="button" className="btn text-sm" disabled={busy || !info.configured} onClick={save}>
            {busy ? 'Working…' : buttonLabel}
          </button>
          {link && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              Add-to-Wallet link: <input readOnly className="inp text-xs w-72" value={link} onFocus={e => e.target.select()} />
              <button type="button" className="btn text-xs" onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success('Copied'))}>Copy</button>
              <a className="btn text-xs" href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
