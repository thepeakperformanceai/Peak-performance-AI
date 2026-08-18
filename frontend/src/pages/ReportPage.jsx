import { useState } from 'react'
import { useReportStore } from '../store/reportStore'
import toast from 'react-hot-toast'
import { downloadReportPDF } from '../services/api'

/* Athlete Test Battery Report — 4-page dark card (matches dashboard) */
const ORANGE = '#ff4b12', INK = '#f2f4f7', MUTED = '#9aa7b4', FAINT = '#5b6b7c'
const PANEL = '#0e0f11', BORDER = '#22242a', TRACK = '#1c1e22', TEAL = '#39d0c8'

const page = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 18 }
const pageTag = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: FAINT, letterSpacing: 1, textTransform: 'uppercase' }
const h1 = { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: INK, margin: 0 }

function Hexagon({ scores, overall }) {
  const size = 300, cx = 150, cy = 150, R = 110
  const order = ['Speed', 'Agility', 'Power', 'Endurance', 'Reaction', 'Balance']
  const val = (n) => (scores.find(s => s.name === n)?.score ?? 0) / 100
  const angles = [0, -60, -120, 180, 120, 60].map(d => (d * Math.PI) / 180)
  const pt = (i, r) => [cx + Math.cos(angles[i]) * R * r, cy + Math.sin(angles[i]) * R * r]
  const ring = (r) => order.map((_, i) => pt(i, r).join(',')).join(' ')
  const poly = order.map((n, i) => pt(i, val(n)).join(',')).join(' ')
  const lab = { Speed: [cx + R + 24, cy], Agility: pt(1, 1.35), Power: pt(2, 1.35), Endurance: [cx - R - 40, cy], Reaction: pt(4, 1.35), Balance: pt(5, 1.35) }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 340 }}>
      {[0.25, 0.5, 0.75, 1].map(r => <polygon key={r} points={ring(r)} fill="none" stroke="#2a2d33" strokeWidth="1" />)}
      {order.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#2a2d33" /> })}
      <polygon points={poly} fill={`${ORANGE}33`} stroke={ORANGE} strokeWidth="2.5" />
      {order.map((n) => { const [x, y] = pt(order.indexOf(n), val(n)); return <circle key={n} cx={x} cy={y} r="4" fill={ORANGE} /> })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="46" fill={ORANGE}>{overall}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="10" fill={FAINT} letterSpacing="1">OVERALL OVR</text>
      {order.map(n => { const [x, y] = lab[n]; return <text key={n} x={x} y={y} textAnchor="middle" fontFamily="Inter" fontSize="12" fill={MUTED}>{n}</text> })}
    </svg>
  )
}
const ScoreBar = ({ score }) => (
  <div style={{ flex: 1, height: 16, background: TRACK, borderRadius: 4, overflow: 'hidden' }}>
    <div style={{ width: `${score}%`, height: '100%', background: ORANGE, borderRadius: 4 }} />
  </div>
)
function Ring({ lsi }) {
  const size = 130, r = 52, c = 2 * Math.PI * r, dash = (lsi / 100) * c
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: 130, height: 130 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={TRACK} strokeWidth="12" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={TEAL} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${dash} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 - 2} textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="22" fill={TEAL}>{lsi}%</text>
      <text x={size/2} y={size/2 + 16} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill={FAINT}>LSI</text>
    </svg>
  )
}
const tagColor = (t) => t === 'STRENGTH' ? TEAL : t === 'PRIORITY' ? ORANGE : '#f6c667'
const Tag = ({ t }) => <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: tagColor(t), border: `1px solid ${tagColor(t)}`, borderRadius: 4, padding: '2px 7px', letterSpacing: 0.5 }}>{t}</span>

function EmptyState() {
  return (
    <div style={{ maxWidth: 640, margin: '60px auto', textAlign: 'center', color: MUTED }}>
      <h2 style={{ ...h1, fontSize: 22, color: INK }}>No report loaded</h2>
      <p style={{ marginTop: 8 }}>Generate a report to see the athlete test battery card.</p>
    </div>
  )
}

export default function ReportPage() {
  const report = useReportStore(s => s.report)
  const [downloading, setDownloading] = useState(false)
  if (!report) return <EmptyState />

  const rc = report.reportContent || {}
  const ovr = rc.ovrScores || [], battery = rc.manualBattery || [], dynamo = rc.dynamoStrength || []
  const ss = rc.symmetrySummary || {}, fm = rc.fieldMeaning || {}

  const handleDownload = async () => {
    setDownloading(true)
    try { await downloadReportPDF(report._id); toast.success('PDF downloaded!') }
    catch (err) { toast.error(err.message || 'Download failed. Please try again.') }
    finally { setDownloading(false) }
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={handleDownload} disabled={downloading}
          style={{ background: ORANGE, color: '#0A0E13', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.6 : 1, fontFamily: "'IBM Plex Mono', monospace" }}>
          {downloading ? '⏳ Generating…' : '⬇ Download PDF'}
        </button>
      </div>

      {/* PAGE 1 */}
      <div style={page}>
        <div style={pageTag}>Page 1 / 4 — OVR Card</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <div style={{ flex: '1 1 300px', textAlign: 'center' }}><Hexagon scores={ovr} overall={rc.overallOVR ?? 0} /></div>
          <div style={{ flex: '1 1 340px' }}>
            <h1 style={{ ...h1, fontSize: 34 }}>{report.athleteName}</h1>
            <p style={{ color: MUTED, margin: '6px 0 14px', fontSize: 14 }}>{[rc.sport, rc.position].filter(Boolean).join(' — ')} · {rc.batteryLabel}</p>
            <div style={{ display: 'flex', gap: 20, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: FAINT, marginBottom: 16 }}>
              {rc.age != null && <span>AGE <b style={{ color: INK }}>{rc.age}</b></span>}
              {rc.sport && <span>SPORT <b style={{ color: INK }}>{rc.sport}</b></span>}
              {rc.testDate && <span>SESSION <b style={{ color: INK }}>{rc.testDate}</b></span>}
            </div>
            {ovr.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ width: 92, fontSize: 14, color: INK }}>{s.name}</span><ScoreBar score={s.score} />
                <span style={{ width: 28, textAlign: 'right', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: INK }}>{s.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PAGE 2 */}
      {battery.length > 0 && (
        <div style={page}>
          <div style={pageTag}>Page 2 / 4 — Manual Test Battery</div>
          <h1 style={{ ...h1, fontSize: 24, margin: '8px 0 18px' }}>Manual Test Battery</h1>
          {battery.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
              <span style={{ flex: '0 0 200px', fontSize: 13, color: INK }}>{t.test}</span><ScoreBar score={t.score} />
              <span style={{ width: 28, textAlign: 'right', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: INK }}>{t.score}</span>
              <span style={{ flex: '0 0 150px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                <span style={{ color: ORANGE, fontWeight: 700, fontSize: 13 }}>{t.raw}</span>
                <span style={{ color: FAINT, fontSize: 10.5, display: 'block' }}>{t.avg}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* PAGE 3 */}
      {dynamo.length > 0 && (
        <div style={page}>
          <div style={pageTag}>Page 3 / 4 — DynaMo Strength & Symmetry</div>
          <h1 style={{ ...h1, fontSize: 24, margin: '8px 0 4px' }}>Strength & Limb Symmetry</h1>
          <p style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>DynaMo bilateral force testing — Left vs Right, expressed as Limb Symmetry Index (LSI)</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {dynamo.map((d, i) => (
              <div key={i} style={{ flex: '1 1 200px', textAlign: 'center', minWidth: 200 }}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: INK, marginBottom: 10 }}>{d.joint}</div>
                <Ring lsi={d.lsi ?? 0} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: FAINT, margin: '8px 12px 0' }}>
                  <span>LEFT<br /><b style={{ color: MUTED }}>{d.left}</b></span><span>RIGHT<br /><b style={{ color: MUTED }}>{d.right}</b></span>
                </div>
                <span style={{ display: 'inline-block', marginTop: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 4, padding: '2px 8px' }}>{d.status}</span>
              </div>
            ))}
          </div>
          {(ss.lowest || ss.flag || ss.recommendation) && (
            <div style={{ borderLeft: `3px solid ${ORANGE}`, paddingLeft: 16, marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              <div><div style={pageTag}>Lowest Symmetry Score</div><div style={{ color: INK, fontSize: 13, marginTop: 6 }}>{ss.lowest}</div></div>
              <div><div style={pageTag}>Flag</div><div style={{ color: INK, fontSize: 13, marginTop: 6 }}>{ss.flag}</div></div>
              <div><div style={pageTag}>Recommendation</div><div style={{ color: INK, fontSize: 13, marginTop: 6 }}>{ss.recommendation}</div></div>
            </div>
          )}
        </div>
      )}

      {/* PAGE 4 */}
      {(fm.stats || []).length > 0 && (
        <div style={page}>
          <div style={pageTag}>Page 4 / 4 — What This Means On The Field</div>
          <h1 style={{ ...h1, fontSize: 24, margin: '8px 0 4px' }}>What This Means On The Field</h1>
          <p style={{ color: MUTED, fontSize: 13, marginBottom: 18 }}>{rc.sport}-specific translation of the six OVR stats — how this profile shows up in a match</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ borderLeft: `3px solid ${ORANGE}`, paddingLeft: 14 }}>
              <div style={pageTag}>Player Profile</div><div style={{ color: INK, fontSize: 15, fontWeight: 600, marginTop: 6 }}>{fm.playerProfile}</div>
            </div>
            <div><div style={pageTag}>Development Priority</div><div style={{ color: ORANGE, fontSize: 18, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: 6 }}>{fm.developmentPriority}</div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {fm.stats.map((s, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 14, height: 8, borderRadius: 4, background: tagColor(s.tag), display: 'inline-block' }} />
                    <b style={{ color: INK, fontFamily: "'Space Grotesk', sans-serif" }}>{s.name}</b>
                  </span>
                  <Tag t={s.tag} />
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: FAINT, marginBottom: 6, paddingLeft: 22 }}>Score: {s.score}/100</div>
                <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.55, margin: 0, paddingLeft: 22 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}