import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  hassanStatus, hassanLeads, hassanLead, hassanReply, hassanPause, hassanStart,
  hassanBookings, hassanBookingStatus
} from '../services/api'

// Hassan's WhatsApp inbox: every chat, who's handling it, and the bookings.

const STAGES = {
  new:          { label: 'New',          cls: 'bg-gray-100 text-gray-700' },
  qualified:    { label: 'Qualified',    cls: 'bg-blue-50 text-blue-700' },
  slot_offered: { label: 'Slot offered', cls: 'bg-amber-50 text-amber-700' },
  booked:       { label: 'Booked',       cls: 'bg-green-50 text-green-700' },
  handoff:      { label: 'Needs you',    cls: 'bg-pp-orangeLite text-pp-orangeDark' },
  lost:         { label: 'Lost',         cls: 'bg-gray-100 text-gray-500' },
}

const SERVICES = {
  assessment: 'Full Body Assessment',
  physio: 'Physio session',
  older_adult_lab: 'Older adults check',
  older_adult_home: 'Home visit',
}

const timeAgo = (d) => {
  if (!d) return ''
  const s = Math.round((Date.now() - new Date(d)) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const when = (d) => new Date(d).toLocaleString('en-GB', {
  timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
})

const StageBadge = ({ stage }) => {
  const s = STAGES[stage] || STAGES.new
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${s.cls}`}>{s.label}</span>
}

export default function InboxPage() {
  const [tab, setTab] = useState('chats')
  const [status, setStatus] = useState(null)

  useEffect(() => {
    hassanStatus().then(setStatus).catch(() => {})
  }, [])

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <StatusStrip status={status} />
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[['chats', 'Chats'], ['bookings', 'Bookings']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`py-1.5 px-4 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'chats' ? <Chats /> : <Bookings />}
    </div>
  )
}

function StatusStrip({ status }) {
  if (!status) return null
  const items = [
    [status.enabled, status.enabled ? 'Hassan is on' : 'Hassan is off'],
    [status.whatsappConnected, status.whatsappConnected ? 'WhatsApp connected' : 'WhatsApp not connected'],
    [status.aiConnected, status.aiConnected ? 'AI connected' : 'AI not connected'],
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {items.map(([ok, text]) => (
        <span key={text} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${ok ? 'border-green-200 text-green-700 bg-green-50' : 'border-gray-200 text-gray-500 bg-white'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-gray-400'}`} />{text}
        </span>
      ))}
      <span className="text-gray-500">
        {status.freeMode ? 'Free mode' : 'Paid mode'} · {status.freeRepliesUsed} of {status.freeRepliesLimit} free replies used this month (ad leads don't count)
      </span>
    </div>
  )
}

function Chats() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(() => {
    hassanLeads()
      .then(setLeads)
      .catch(() => toast.error('Could not load chats.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const shown = leads.filter(l =>
    filter === 'all' ? true :
    filter === 'needs_you' ? l.paused :
    filter === 'booked' ? l.stage === 'booked' :
    !l.paused && l.stage !== 'booked')
  const needsYou = leads.filter(l => l.paused).length

  return (
    <div className="flex bg-white border border-gray-100 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 210px)', minHeight: 420 }}>
      {/* List */}
      <div className="w-80 border-r border-gray-100 flex flex-col">
        <div className="p-2 border-b border-gray-100">
          <button onClick={() => { setStarting(true); setSelected(null) }}
            className="w-full text-sm font-medium bg-pp-orange text-white rounded-lg py-2 hover:opacity-90">
            + New message
          </button>
        </div>
        <div className="flex gap-1 p-2 border-b border-gray-100 text-xs">
          {[['all', 'All'], ['needs_you', `Needs you${needsYou ? ` (${needsYou})` : ''}`], ['active', 'Hassan'], ['booked', 'Booked']].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`px-2 py-1 rounded-md ${filter === id ? 'bg-pp-orangeLite text-pp-orangeDark font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
          {!loading && !shown.length && <p className="p-4 text-sm text-gray-400">No chats yet. When someone messages your WhatsApp, they show up here.</p>}
          {shown.map(l => (
            <button key={l.phone} onClick={() => { setSelected(l.phone); setStarting(false) }}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${selected === l.phone ? 'bg-pp-orangeLite/60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">{l.name || `+${l.phone}`}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(l.lastMessage?.at || l.updatedAt)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <StageBadge stage={l.stage} />
                {l.fromAd && <span className="text-[10px] text-gray-400">Ad</span>}
                {l.mentionedPain && <span className="text-[10px] text-red-600">Pain / injury</span>}
                {l.paused && <span className="text-[10px] text-pp-orangeDark">Hassan paused</span>}
              </div>
              {l.lastMessage && (
                <p className="text-xs text-gray-500 truncate mt-1">
                  {l.lastMessage.by === 'lead' ? '' : l.lastMessage.by === 'staff' ? 'You: ' : l.lastMessage.by === 'hassan' ? 'Hassan: ' : ''}{l.lastMessage.text}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {starting ? (
          <NewMessage onDone={(phone) => { setStarting(false); setSelected(phone); load() }} onCancel={() => setStarting(false)} />
        ) : selected ? <Thread phone={selected} onChange={load} /> : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Pick a chat</div>
        )}
      </div>
    </div>
  )
}

function Thread({ phone, onChange }) {
  const [lead, setLead] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef(null)

  const load = useCallback(() => {
    hassanLead(phone).then(setLead).catch(() => toast.error('Could not load this chat.'))
  }, [phone])

  useEffect(() => {
    setLead(null); setText(''); setError('')
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [lead?.messages?.length])

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) { setError('Type a message first.'); return }
    setSending(true); setError('')
    try {
      setLead(await hassanReply(phone, text.trim()))
      setText('')
      onChange()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not send.')
    } finally {
      setSending(false)
    }
  }

  const togglePause = async () => {
    try {
      setLead(await hassanPause(phone, !lead.paused))
      onChange()
      toast.success(lead.paused ? 'Hassan is back on this chat' : 'Hassan paused: you are handling this chat')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change that.')
    }
  }

  if (!lead) return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>

  return (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">{lead.name || `+${lead.phone}`}</p>
            <StageBadge stage={lead.stage} />
          </div>
          <p className="text-xs text-gray-500 truncate">
            +{lead.phone}{lead.service ? ` · ${SERVICES[lead.service] || lead.service}` : ''}{lead.fromAd ? ' · from an ad' : ''}{lead.mentionedPain ? ' · mentioned pain or injury' : ''}
            {lead.paused && lead.handoffReason ? ` · ${lead.handoffReason}` : ''}
          </p>
        </div>
        <button onClick={togglePause}
          className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border ${lead.paused ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-pp-orangeMid text-pp-orangeDark hover:bg-pp-orangeLite'}`}>
          {lead.paused ? 'Turn Hassan back on' : 'Pause Hassan'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50/60">
        {lead.messages.map((m, i) => <Bubble key={i} m={m} />)}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="border-t border-gray-100 p-3">
        {!lead.canReply && (
          <p className="text-xs text-gray-500 mb-2">WhatsApp only allows replies within 24 hours of their last message. You can reply again when they message you.</p>
        )}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); if (error) setError('') }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e) }}
            disabled={!lead.canReply || sending}
            rows={2}
            placeholder={lead.canReply ? (lead.paused ? 'Reply as the team…' : 'Reply as the team (Hassan keeps going unless you pause him)…') : 'Reply window closed'}
            className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-pp-orange disabled:bg-gray-50"
          />
          <button type="submit" disabled={!lead.canReply || sending}
            className="px-4 text-sm font-medium rounded-lg bg-pp-orange text-white hover:bg-pp-orangeDark disabled:opacity-40">
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      </form>
    </>
  )
}

function Bubble({ m }) {
  if (m.by === 'system') {
    return <p className={`text-center text-[11px] ${m.failed ? 'text-red-500' : 'text-gray-400'}`}>{m.text}</p>
  }
  const mine = m.by !== 'lead'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
        m.by === 'lead' ? 'bg-white border border-gray-100 text-gray-800' :
        m.by === 'staff' ? 'bg-pp-sidebar text-white' : 'bg-pp-orangeLite text-gray-900'}`}>
        {m.text}
        <div className={`text-[10px] mt-1 ${m.by === 'staff' ? 'text-white/50' : 'text-gray-400'}`}>
          {m.by === 'hassan' ? 'Hassan · ' : m.by === 'staff' ? 'Team · ' : ''}{when(m.at)}{m.kind === 'template' ? ' · template' : ''}
        </div>
      </div>
    </div>
  )
}

function Bookings() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => hassanBookings().then(setRows).catch(() => toast.error('Could not load bookings.')).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const setStatus = async (id, status) => {
    try { await hassanBookingStatus(id, status); load() } catch { toast.error('Could not update booking.') }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>
  if (!rows.length) return <p className="text-sm text-gray-400">No bookings yet. Bookings Hassan makes show up here.</p>

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="text-left font-medium px-4 py-2">When</th>
            <th className="text-left font-medium px-4 py-2">Client</th>
            <th className="text-left font-medium px-4 py-2">Service</th>
            <th className="text-left font-medium px-4 py-2">Where</th>
            <th className="text-left font-medium px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(b => (
            <tr key={b._id} className="border-t border-gray-50">
              <td className="px-4 py-2.5 whitespace-nowrap">{when(b.start)}</td>
              <td className="px-4 py-2.5">{b.fullName}<div className="text-xs text-gray-400">+{b.phone}</div></td>
              <td className="px-4 py-2.5">{SERVICES[b.service] || b.service}<div className="text-xs text-gray-400">PKR {Number(b.price).toLocaleString('en-US')}</div></td>
              <td className="px-4 py-2.5 text-gray-600">{b.location}</td>
              <td className="px-4 py-2.5">
                <select value={b.status} onChange={e => setStatus(b._id, e.target.value)}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white">
                  <option value="booked">Booked</option>
                  <option value="done">Came in</option>
                  <option value="no_show">No-show</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Start a chat with someone who hasn't messaged yet. WhatsApp only allows an
// approved template for this; once they reply, the chat works as normal.
function NewMessage({ onDone, onCancel }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const first = name.trim().split(/\s+/)[0] || 'there'

  const send = async (e) => {
    e.preventDefault()
    if (!phone.trim()) { setError('Enter their WhatsApp number.'); return }
    setSending(true); setError('')
    try {
      const lead = await hassanStart(phone.trim(), name.trim())
      toast.success('Message sent')
      onDone(lead.phone)
    } catch (err) {
      setError(err.message || 'Could not send.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={send} className="p-6 max-w-lg space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">New message</h3>
        <p className="text-xs text-gray-500 mt-1">
          For people who haven't messaged you yet. WhatsApp only allows this approved opening message, and Meta charges a small fee for each one.
          When they reply, the chat shows up here and Hassan takes it from there.
        </p>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">WhatsApp number</span>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0300 1234567"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Name</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ali Khan"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </label>
      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
        <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">They will receive</p>
        Hi {first}, Hassan here from Peak Performance. Following up on your interest in a session at our lab in Khayaban-e-Rahat. Would you like me to share this week's available slots?
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={sending}
          className="bg-pp-orange text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
          {sending ? 'Sending…' : 'Send'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 px-3">Cancel</button>
      </div>
    </form>
  )
}
