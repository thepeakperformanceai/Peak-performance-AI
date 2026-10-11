// Football player card — one A4 page, used for both the report page and the
// PDF so the two always match. Returns an HTML string (every dynamic value is
// escaped). Every number shown is the scoring engine's number, unchanged.
//
// Built for html2canvas (the PDF renderer): inline styles only, no clip-path,
// no background-clip text, and no text inside the SVG (SVG is rasterised
// without web fonts), so all labels are HTML positioned over the chart.

import '@fontsource/bebas-neue/400.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'

export const CARD_WIDTH = 794    // A4 at 96 dpi
export const CARD_HEIGHT = 1122  // a hair under 297 mm so html2pdf keeps one page

const DISPLAY = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif"
const TEXT = "Inter, 'Helvetica Neue', Arial, sans-serif"

// Card tiers by OVR: bronze < 65, silver 65–74, gold 75+.
// "unrated" is used only while the OVR is pending.
const TIERS = {
  gold: {
    label: 'GOLD',
    page: '#f6efdc',
    foil: 'linear-gradient(135deg, #7a5a0e 0%, #e3bc4f 26%, #fff3c4 50%, #d2a535 74%, #7f5c0f 100%)',
    band: 'linear-gradient(155deg, #fbe7a6 0%, #eac25a 48%, #c99a2a 100%)',
    ink: '#271a00', soft: '#5b4510', deep: '#8a6410', bar: '#b8891f', track: '#efe4c4', stripe: 'rgba(255,255,255,0.28)',
  },
  silver: {
    label: 'SILVER',
    page: '#eceff2',
    foil: 'linear-gradient(135deg, #59626e 0%, #c9d0d8 26%, #ffffff 50%, #aeb7c1 74%, #5f6873 100%)',
    band: 'linear-gradient(155deg, #f7f9fb 0%, #d5dbe2 48%, #a9b2bc 100%)',
    ink: '#151b22', soft: '#46505c', deep: '#4a5562', bar: '#66727f', track: '#e2e6ea', stripe: 'rgba(255,255,255,0.45)',
  },
  bronze: {
    label: 'BRONZE',
    page: '#f3e8de',
    foil: 'linear-gradient(135deg, #5a3216 0%, #c0814c 26%, #f3cfab 50%, #ab6a37 74%, #5e3518 100%)',
    band: 'linear-gradient(155deg, #f6d3b2 0%, #dca06b 48%, #b9773f 100%)',
    ink: '#241103', soft: '#5a3217', deep: '#8c4f22', bar: '#a8642f', track: '#efdfd0', stripe: 'rgba(255,255,255,0.28)',
  },
  unrated: {
    label: 'UNRATED',
    page: '#e9ecf0',
    foil: 'linear-gradient(135deg, #2f3742 0%, #77818e 30%, #c3cad2 50%, #6c7682 72%, #2f3742 100%)',
    band: 'linear-gradient(155deg, #d9dee4 0%, #b3bcc6 50%, #8e98a4 100%)',
    ink: '#141a21', soft: '#3c4651', deep: '#46515d', bar: '#5c6773', track: '#e1e5e9', stripe: 'rgba(255,255,255,0.35)',
  },
}

export const tierFor = (ovr) =>
  ovr == null ? 'unrated' : ovr >= 75 ? 'gold' : ovr >= 65 ? 'silver' : 'bronze'

// Shared ink for the card body (all tiers).
const BODY = '#fffdf9', TXT = '#1c1f24', MUTED = '#5c636e', FAINT = '#8d949e', RULE = '#e7e2d9'
const AMBER_TXT = '#8a5a00', AMBER_BG = '#fdf0d2', AMBER_DOT = '#e0a21a'
const RED_TXT = '#9f1d14', RED_BG = '#fde6e3', RED_DOT = '#d83a2c'

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STATS = [
  { name: 'Speed', short: 'SPD' },
  { name: 'Power', short: 'PWR' },
  { name: 'Endurance', short: 'END' },
  { name: 'Balance', short: 'BAL' },
  { name: 'Reaction', short: 'REA' },
  { name: 'Agility', short: 'AGI' },
]

const STATUS_TEXT = {
  not_done: 'NOT TESTED · NOT DONE',
  injured: 'NOT TESTED · INJURED',
  equipment_fault: 'NOT TESTED · EQUIPMENT FAULT',
  invalid: 'INVALID · RE-CHECK VALUE',
}

const FLAG_TEXT = {
  LSI: 'Left/right strength gap',
  one_side_only: 'One side only',
  asymmetry: 'Left/right balance gap',
  mobility: 'Rotation range',
  movement_quality: 'Movement quality',
}

const chip = (text, fg, bg, extra = '') =>
  `<span style="display:inline-block;font-family:${TEXT};font-size:9.5px;font-weight:700;letter-spacing:0.6px;color:${fg};background:${bg};border-radius:4px;padding:3px 7px 4px;white-space:nowrap;${extra}">${esc(text)}</span>`

// ---------- hexagon ----------
// Same axis order as the rest of the app. Untested stats get no point: the
// shape joins measured stats only; their spoke is dashed and labelled.
function hexagon(rc, t) {
  const W = 250, H = 222, cx = 125, cy = 111, R = 78
  const order = ['Speed', 'Agility', 'Power', 'Endurance', 'Reaction', 'Balance']
  const short = Object.fromEntries(STATS.map(s => [s.name, s.short]))
  const scoreOf = (n) => (rc.ovrScores || []).find(s => s.name === n)?.score
  const missing = (n) => scoreOf(n) == null
  const measured = order.filter(n => !missing(n))
  const angles = [0, -60, -120, 180, 120, 60].map(d => (d * Math.PI) / 180)
  const pt = (i, r) => [cx + Math.cos(angles[i]) * R * r, cy + Math.sin(angles[i]) * R * r]
  const ring = (r) => order.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(',')).join(' ')
  const val = (n) => (scoreOf(n) ?? 0) / 100
  const poly = measured.map(n => pt(order.indexOf(n), val(n)).map(v => v.toFixed(1)).join(',')).join(' ')

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0">
    ${[0.25, 0.5, 0.75, 1].map(r => `<polygon points="${ring(r)}" fill="${r === 1 ? t.track : 'none'}" fill-opacity="${r === 1 ? 0.55 : 0}" stroke="#d9d3c8" stroke-width="1"/>`).join('')}
    ${order.map((n, i) => { const [x, y] = pt(i, 1); return missing(n)
      ? `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${FAINT}" stroke-width="1.2" stroke-dasharray="4 4"/>`
      : `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d9d3c8" stroke-width="1"/>` }).join('')}
    ${measured.length >= 3 ? `<polygon points="${poly}" fill="${t.bar}" fill-opacity="0.30" stroke="${t.deep}" stroke-width="2.5" stroke-linejoin="round"/>` : ''}
    ${measured.length === 2 ? `<polyline points="${poly}" fill="none" stroke="${t.deep}" stroke-width="2.5"/>` : ''}
    ${measured.map(n => { const [x, y] = pt(order.indexOf(n), val(n)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${t.deep}" stroke="${BODY}" stroke-width="2"/>` }).join('')}
  </svg>`

  // HTML labels just outside each vertex
  const labels = order.map((n, i) => {
    const [x, y] = pt(i, 1.24)
    const miss = missing(n)
    const w = 70
    return `<div style="position:absolute;left:${(x - w / 2).toFixed(1)}px;top:${(y - 13).toFixed(1)}px;width:${w}px;text-align:center;line-height:1">
      <span style="font-family:${DISPLAY};font-size:19px;letter-spacing:0.5px;color:${miss ? FAINT : TXT}">${short[n]}</span>
      ${miss
        ? `<div style="font-family:${TEXT};font-size:7.5px;font-weight:700;letter-spacing:0.6px;color:${FAINT};margin-top:2px">NOT TESTED</div>`
        : `<span style="font-family:${DISPLAY};font-size:19px;color:${t.deep};margin-left:3px">${esc(scoreOf(n))}</span>`}
    </div>`
  }).join('')

  return `<div style="position:relative;width:${W}px;height:${H}px;flex:0 0 ${W}px">${svg}${labels}</div>`
}

// ---------- stat bars ----------
function statBars(rc, t) {
  return STATS.map(({ name, short }) => {
    const s = (rc.ovrScores || []).find(x => x.name === name) || {}
    const missing = s.score == null
    const bar = missing
      ? `<div style="flex:1;height:22px;border:1.5px dashed #c9c3b8;border-radius:6px;display:flex;align-items:center;padding-left:10px;box-sizing:border-box">
           <span style="font-family:${TEXT};font-size:10px;font-weight:700;letter-spacing:0.8px;color:${MUTED}">NOT TESTED</span>
           <span style="font-family:${TEXT};font-size:9.5px;color:${FAINT};margin-left:6px">${s.status === 'not_in_battery' ? 'not in this battery' : 'this session'}</span>
         </div>`
      : `<div style="flex:1;height:14px;background:${t.track};border-radius:7px;overflow:hidden">
           <div style="width:${Math.max(0, Math.min(100, s.score))}%;height:100%;background:${t.bar};border-radius:7px"></div>
         </div>`
    return `<div style="display:flex;align-items:center;gap:12px;height:34px">
      <div style="flex:0 0 92px;line-height:1;white-space:nowrap">
        <div style="font-family:${DISPLAY};font-size:27px;letter-spacing:0.5px;color:${missing ? FAINT : TXT}">${short}</div>
        <div style="font-family:${TEXT};font-size:8.5px;font-weight:600;letter-spacing:0.4px;color:${FAINT};text-transform:uppercase">${name}${s.partial ? ' · partial' : ''}</div>
      </div>
      ${bar}
      <div style="flex:0 0 44px;text-align:right;font-family:${DISPLAY};font-size:32px;line-height:1;color:${missing ? FAINT : TXT}">${missing ? '—' : esc(s.score)}</div>
    </div>`
  }).join('')
}

// ---------- tests table ----------
// Prefers the backend's testTable; older football reports fall back to the
// card arrays they already have.
function testRows(rc) {
  if (Array.isArray(rc.testTable) && rc.testTable.length) return rc.testTable
  const rows = []
  for (const m of rc.manualBattery || []) rows.push({ test: m.test, result: m.raw, unit: '', score: m.score, status: m.status || 'completed', feedsOvr: true })
  for (const m of rc.movementScreen || []) rows.push({ test: m.test, result: m.status === 'completed' ? m.result : '—', unit: '', score: m.score, status: m.status || 'completed', feedsOvr: m.feedsOvr })
  for (const d of rc.dynamoStrength || []) rows.push({ test: d.joint, result: d.left === '—' ? '—' : `L ${d.left} · R ${d.right}`, unit: '', score: d.score ?? null, status: d.status === 'NOT TESTED' ? 'not_done' : 'completed', feedsOvr: true })
  return rows
}

function testsTable(rc, t) {
  const rows = testRows(rc)
  const th = (txt, align = 'left', w = '') =>
    `<th style="text-align:${align};${w}font-family:${TEXT};font-size:9px;font-weight:700;letter-spacing:0.8px;color:${FAINT};padding:0 8px 6px;border-bottom:1.5px solid ${t.deep}">${txt}</th>`
  const body = rows.map((r, i) => {
    const done = r.status === 'completed'
    let status
    if (done) {
      const notes = [r.partial ? 'band only' : '', r.oneSideOnly ? 'one side' : ''].filter(Boolean).join(' · ')
      status = `<span style="font-family:${TEXT};font-size:10px;font-weight:600;color:${TXT}">✓ Scored</span>${notes ? `<span style="font-family:${TEXT};font-size:9.5px;color:${MUTED}"> · ${esc(notes)}</span>` : ''}`
    } else if (r.status === 'invalid') {
      status = chip(STATUS_TEXT.invalid, RED_TXT, RED_BG)
    } else {
      status = chip(STATUS_TEXT[r.status] || 'NOT TESTED', AMBER_TXT, AMBER_BG)
    }
    const unit = r.unit ? `${r.unit}${r.timing === 'hand' ? ' · hand-timed' : ''}` : ''
    const bg = i % 2 ? '#faf6ef' : BODY
    return `<tr style="background:${bg}">
      <td style="padding:4px 8px;font-family:${TEXT};font-size:11px;font-weight:600;color:${TXT};white-space:nowrap">${esc(r.test)}${r.feedsOvr === false ? `<span style="font-weight:500;color:${FAINT}"> · flag only</span>` : ''}</td>
      <td style="padding:4px 8px;font-family:${TEXT};font-size:11px;font-weight:600;color:${done ? TXT : FAINT};white-space:nowrap">${esc(r.result)}</td>
      <td style="padding:4px 8px;font-family:${TEXT};font-size:10px;color:${MUTED};white-space:nowrap">${esc(unit)}</td>
      <td style="padding:2px 8px;text-align:right;font-family:${DISPLAY};font-size:20px;line-height:1;color:${done ? TXT : FAINT}">${r.score == null ? '—' : esc(r.score)}</td>
      <td style="padding:3px 8px">${status}</td>
    </tr>`
  }).join('')
  return `<table style="width:100%;border-collapse:collapse">
    <thead><tr>${th('TEST')}${th('RESULT')}${th('UNIT')}${th('SCORE', 'right')}${th('STATUS')}</tr></thead>
    <tbody>${body}</tbody>
  </table>`
}

// ---------- flags + notes ----------
function flagsList(rc) {
  const flags = rc.flags || []
  if (!flags.length) {
    return `<div style="font-family:${TEXT};font-size:11.5px;color:${MUTED}">No flags this session.</div>`
  }
  const compact = flags.length > 3
  return flags.map(f => {
    const red = f.level === 'red'
    const what = FLAG_TEXT[f.type] || f.type
    const value = f.value != null ? (f.type === 'LSI' ? ` (LSI ${f.value}%)` : ` (${f.value})`) : ''
    return `<div style="font-family:${TEXT};font-size:${compact ? 10.5 : 11}px;line-height:1.45;color:${TXT};margin-bottom:${compact ? 5 : 8}px">
      ${chip(red ? 'RED' : 'AMBER', red ? RED_TXT : AMBER_TXT, red ? RED_BG : AMBER_BG, 'font-size:8.5px;padding:1px 5px 2px;margin-right:6px')}<b>${esc(f.test)}</b> · ${esc(what)}${esc(value)}${f.note && !compact ? `<div style="color:${MUTED}">${esc(f.note)}</div>` : ''}
    </div>`
  }).join('')
}

const sectionTitle = (txt, t, extra = '') =>
  `<div style="font-family:${DISPLAY};font-size:21px;letter-spacing:1px;color:${t.deep};line-height:1;margin-bottom:8px">${txt}${extra}</div>`

/**
 * Full card. `report` is the saved report (athleteName + reportContent).
 */
export function footballCardHtml(report) {
  const rc = report.reportContent || {}
  const tierKey = tierFor(rc.overallOVR)
  const t = TIERS[tierKey]
  const name = report.athleteName || rc.athleteName || 'Athlete'
  const nameSize = name.length <= 14 ? 64 : name.length <= 20 ? 52 : 42
  const pending = rc.overallOVR == null
  const provisional = !pending && (rc.ovrStatus === 'provisional' || rc.ovrProvisional)
  const reasons = (rc.ovrReasons || []).join(' · ')
  const meta = [
    ['SPORT', rc.sport || 'Football'],
    ['AGE', rc.age],
    ['SESSION', rc.testDate],
  ].filter(([, v]) => v != null && v !== '')

  const statusBadge = pending
    ? chip('OVR PENDING · COMPLETE TESTING', '#ffffff', '#1c1f24', 'font-size:10px;padding:4px 8px 5px')
    : provisional
      ? chip('PROVISIONAL', '#ffffff', '#1c1f24', 'font-size:11px;letter-spacing:1.2px;padding:4px 9px 5px')
      : ''

  const header = `
  <div style="position:relative;height:238px;background:${t.band};overflow:hidden">
    <div style="position:absolute;left:420px;top:-120px;width:90px;height:520px;background:${t.stripe};transform:rotate(28deg)"></div>
    <div style="position:absolute;left:530px;top:-120px;width:26px;height:520px;background:${t.stripe};transform:rotate(28deg)"></div>
    <div style="position:absolute;left:590px;top:-120px;width:10px;height:520px;background:${t.stripe};transform:rotate(28deg)"></div>

    <div style="position:absolute;left:30px;top:20px;width:168px;text-align:center">
      <div style="font-family:${DISPLAY};font-size:${pending ? 104 : 118}px;line-height:0.86;color:${t.ink};letter-spacing:1px">${pending ? '—' : esc(rc.overallOVR)}</div>
      <div style="font-family:${TEXT};font-size:10px;font-weight:700;letter-spacing:2px;color:${t.soft};margin-top:4px">OVERALL</div>
      <div style="height:2px;background:${t.ink};opacity:0.35;margin:8px 22px"></div>
      <div style="font-family:${DISPLAY};font-size:46px;line-height:0.9;color:${t.ink};letter-spacing:2px">${esc(rc.position || '—')}</div>
      <div style="margin-top:10px">${statusBadge}</div>
    </div>

    <div style="position:absolute;left:222px;top:30px;bottom:30px;width:2px;background:${t.ink};opacity:0.18"></div>

    <div style="position:absolute;left:248px;right:28px;top:22px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-family:${TEXT};font-size:10px;font-weight:700;letter-spacing:2.2px;color:${t.soft}">PEAKPERFORMANCE.PK</span>
        <span style="font-family:${DISPLAY};font-size:18px;letter-spacing:2.5px;color:${t.ink};border:2px solid ${t.ink};border-radius:5px;padding:1px 8px 0">${t.label} CARD</span>
      </div>
      <div style="font-family:${DISPLAY};font-size:${nameSize}px;line-height:0.95;color:${t.ink};letter-spacing:1px;margin-top:16px">${esc(name.toUpperCase())}</div>
      ${rc.fieldMeaning?.playerProfile ? `<div style="font-family:${TEXT};font-size:12.5px;font-style:italic;color:${t.soft};margin-top:6px;line-height:1.35">${esc(rc.fieldMeaning.playerProfile)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        ${meta.map(([k, v]) => `<span style="font-family:${TEXT};font-size:10.5px;color:${t.ink};background:rgba(255,255,255,0.55);border-radius:5px;padding:4px 9px"><span style="font-weight:700;letter-spacing:0.8px;color:${t.soft}">${k}</span>&nbsp; <b>${esc(v)}</b></span>`).join('')}
      </div>
    </div>
  </div>`

  const summary = rc.summary
    ? `<div style="font-family:${TEXT};font-size:${rc.summary.length > 320 ? 10.5 : 11.5}px;line-height:1.5;color:${TXT}">${esc(rc.summary)}</div>`
    : ''
  const priority = rc.fieldMeaning?.developmentPriority
    ? `<div style="margin-bottom:8px;display:flex;align-items:baseline;gap:10px">
         <span style="font-family:${TEXT};font-size:9px;font-weight:700;letter-spacing:1px;color:${FAINT}">DEVELOPMENT PRIORITY</span>
         <span style="font-family:${DISPLAY};font-size:30px;line-height:1;color:${t.deep};letter-spacing:1px">${esc(String(rc.fieldMeaning.developmentPriority).toUpperCase())}</span>
       </div>`
    : ''

  const body = `
  <div style="padding:16px 26px 0">
    <div style="display:flex;align-items:center;gap:26px">
      ${hexagon(rc, t)}
      <div style="flex:1">${statBars(rc, t)}</div>
    </div>

    <div style="margin-top:10px">
      ${sectionTitle('ALL TESTS', t, `<span style="font-family:${TEXT};font-size:9.5px;font-weight:500;letter-spacing:0;color:${FAINT};margin-left:10px">raw results exactly as entered · scores out of 99</span>`)}
      ${testsTable(rc, t)}
    </div>

    <div style="display:flex;gap:24px;margin-top:14px">
      <div style="flex:1">${sectionTitle('AREAS TO WORK ON', t)}${flagsList(rc)}</div>
      <div style="flex:1.15;border-left:1.5px solid ${RULE};padding-left:22px">${sectionTitle("COACH'S NOTE", t)}${priority}${summary}</div>
    </div>
  </div>`

  const footer = `
  <div style="position:absolute;left:0;right:0;bottom:0;padding:10px 26px 12px;border-top:1.5px solid ${RULE};background:#faf6ef">
    ${provisional || pending ? `<div style="font-family:${TEXT};font-size:10px;color:${TXT};margin-bottom:4px"><b>${pending ? 'OVR pending' : 'Provisional OVR'}:</b> ${esc(pending ? (rc.ovrMessage || 'complete testing') : reasons)}${pending && reasons ? ` · ${esc(reasons)}` : ''}${provisional ? ' · firms up once the remaining tests are completed.' : ''}</div>` : ''}
    <div style="display:flex;justify-content:space-between;gap:16px;font-family:${TEXT};font-size:8.5px;color:${FAINT};line-height:1.4">
      <span>${esc(rc.benchmarkNote || '')}</span>
      <span style="white-space:nowrap">${esc(rc.batteryLabel || '')}${rc.configVersion ? ` · ${esc(rc.configVersion)}` : ''}</span>
    </div>
  </div>`

  return `
<div style="width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;box-sizing:border-box;padding:20px;background:${t.page};font-family:${TEXT}">
  <div style="height:100%;box-sizing:border-box;padding:6px;border-radius:26px;background:${t.foil}">
    <div style="position:relative;height:100%;border-radius:21px;background:${BODY};overflow:hidden">
      ${header}
      ${body}
      ${footer}
    </div>
  </div>
</div>`
}

// The PDF renderer draws with whatever fonts are loaded at that moment, so
// make sure both card fonts are ready first.
export async function ensureCardFonts(doc = document) {
  const fonts = doc.fonts
  if (!fonts?.load) return
  await Promise.all([
    fonts.load(`400 40px 'Bebas Neue'`),
    fonts.load('400 12px Inter'),
    fonts.load('500 12px Inter'),
    fonts.load('600 12px Inter'),
    fonts.load('700 12px Inter'),
  ])
  await fonts.ready
}
