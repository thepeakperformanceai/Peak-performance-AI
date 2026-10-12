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
// Transparent Peak Performance logo in the card's dark ink (same artwork as
// the dashboard's logo.png), so it sits cleanly on every tier colour.
import LOGO_URL from '../assets/pp-logo-card.png'

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
const MON_TXT = '#2f4a66', MON_BG = '#e3ecf5'

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
  groin_risk: 'Groin risk',
  shoulder_balance: 'Shoulder balance',
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
  const pendingStat = (n) => (rc.ovrScores || []).find(s => s.name === n)?.status === 'benchmark_pending'
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
        ? `<div style="font-family:${TEXT};font-size:7.5px;font-weight:700;letter-spacing:0.6px;color:${FAINT};margin-top:2px">${pendingStat(n) ? 'PENDING' : 'NOT TESTED'}</div>`
        : `<span style="font-family:${DISPLAY};font-size:19px;color:${t.deep};margin-left:3px">${esc(scoreOf(n))}</span>`}
    </div>`
  }).join('')

  return `<div style="position:relative;width:${W}px;height:${H}px;flex:0 0 ${W}px">${svg}${labels}</div>`
}

// ---------- stat bars ----------
function statBars(rc, t, captions = {}) {
  return STATS.map(({ name, short }) => {
    const s = (rc.ovrScores || []).find(x => x.name === name) || {}
    const missing = s.score == null
    const bar = missing
      ? `<div style="flex:1;height:22px;border:1.5px dashed #c9c3b8;border-radius:6px;display:flex;align-items:center;padding-left:10px;box-sizing:border-box">
           <span style="font-family:${TEXT};font-size:10px;font-weight:700;letter-spacing:0.8px;color:${MUTED}">${s.status === 'benchmark_pending' ? 'NOT SCORED' : 'NOT TESTED'}</span>
           <span style="font-family:${TEXT};font-size:9.5px;color:${FAINT};margin-left:6px">${s.status === 'not_in_battery' ? 'not in this battery' : s.status === 'benchmark_pending' ? 'recorded, benchmarks pending' : 'this session'}</span>
         </div>`
      : `<div style="flex:1;height:14px;background:${t.track};border-radius:7px;overflow:hidden">
           <div style="width:${Math.max(0, Math.min(100, s.score))}%;height:100%;background:${t.bar};border-radius:7px"></div>
         </div>`
    return `<div style="display:flex;align-items:center;gap:12px;height:34px">
      <div style="flex:0 0 92px;line-height:1;white-space:nowrap">
        <div style="font-family:${DISPLAY};font-size:27px;letter-spacing:0.5px;color:${missing ? FAINT : TXT}">${short}</div>
        <div style="font-family:${TEXT};font-size:8.5px;font-weight:600;letter-spacing:0.4px;color:${FAINT};text-transform:uppercase">${captions[name] || name}${s.partial ? ' · partial' : ''}</div>
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
  // Longer batteries (cricket has 11 tests) get tighter rows so the card
  // still fits one A4 page. 9-test batteries (football, padel) are unchanged.
  const cp = rows.length > 9
  const pad = cp ? '2px 8px' : '4px 8px'
  const chipExtra = cp ? 'font-size:8.5px;padding:2px 6px 3px' : ''
  const th = (txt, align = 'left', w = '') =>
    `<th style="text-align:${align};${w}font-family:${TEXT};font-size:9px;font-weight:700;letter-spacing:0.8px;color:${FAINT};padding:0 8px 6px;border-bottom:1.5px solid ${t.deep}">${txt}</th>`
  const body = rows.map((r, i) => {
    const done = r.status === 'completed'
    let status
    if (done && r.benchmarkPending) {
      status = chip('RECORDED · BENCHMARK PENDING', MON_TXT, MON_BG, chipExtra)
    } else if (done) {
      const notes = [r.partial ? 'band only' : '', r.oneSideOnly ? 'one side' : ''].filter(Boolean).join(' · ')
      status = `<span style="font-family:${TEXT};font-size:10px;font-weight:600;color:${TXT}">✓ Scored</span>${notes ? `<span style="font-family:${TEXT};font-size:9.5px;color:${MUTED}"> · ${esc(notes)}</span>` : ''}`
    } else if (r.status === 'invalid') {
      status = chip(STATUS_TEXT.invalid, RED_TXT, RED_BG, chipExtra)
    } else {
      status = chip(STATUS_TEXT[r.status] || 'NOT TESTED', AMBER_TXT, AMBER_BG, chipExtra)
    }
    const unit = r.unit ? `${r.unit}${r.timing === 'hand' ? ' · hand-timed' : ''}` : ''
    const bg = i % 2 ? '#faf6ef' : BODY
    return `<tr style="background:${bg}">
      <td style="padding:${pad};font-family:${TEXT};font-size:11px;font-weight:600;color:${TXT};white-space:nowrap">${esc(r.test)}${r.feedsOvr === false ? `<span style="font-weight:500;color:${FAINT}"> · flag only</span>` : ''}</td>
      <td style="padding:${pad};font-family:${TEXT};font-size:11px;font-weight:600;color:${done ? TXT : FAINT};white-space:nowrap">${esc(r.result)}</td>
      <td style="padding:${pad};font-family:${TEXT};font-size:10px;color:${MUTED};white-space:nowrap">${esc(unit)}</td>
      <td style="padding:${cp ? '1px 8px' : '2px 8px'};text-align:right;font-family:${DISPLAY};font-size:${cp ? 18 : 20}px;line-height:1;color:${done ? TXT : FAINT}">${r.score == null ? '—' : esc(r.score)}</td>
      <td style="padding:${cp ? '1px 8px' : '3px 8px'}">${status}</td>
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
    // Padel: dominant-arm shoulder gap is common in racket players — monitor only.
    const monitor = f.level === 'monitor'
    const what = monitor
      ? (/cricket/i.test(rc.sport || '') ? 'Bowling arm weaker · common in cricketers, monitor' : 'Dominant arm weaker · common in racket players, monitor')
      : (FLAG_TEXT[f.type] || f.type)
    const value = f.value == null ? ''
      : f.type === 'LSI' ? ` (LSI ${f.value}%)`
        : f.type === 'groin_risk' ? ` (adduction ${f.value}% of abduction)`
          : f.type === 'shoulder_balance' ? ` (external ${f.value}% of internal rotation)`
          : ` (${f.value})`
    const [label, fg, bg] = red ? ['RED', RED_TXT, RED_BG] : monitor ? ['MONITOR', MON_TXT, MON_BG] : ['AMBER', AMBER_TXT, AMBER_BG]
    return `<div style="font-family:${TEXT};font-size:${compact ? 10.5 : 11}px;line-height:1.45;color:${TXT};margin-bottom:${compact ? 5 : 8}px">
      ${chip(label, fg, bg, 'font-size:8.5px;padding:1px 5px 2px;margin-right:6px')}<b>${esc(f.test)}</b> · ${esc(what)}${esc(value)}${f.note && !compact ? `<div style="color:${MUTED}">${esc(f.note)}</div>` : ''}
    </div>`
  }).join('')
}

// ---------- padel look ----------
// Top-down padel court (20 m x 10 m): walls, net, service lines and the centre
// service line, drawn faintly behind the header. No text inside the SVG.
function padelCourt(t) {
  const W = 340, H = 170, k = W / 20         // 1 m = k px
  const net = W / 2, svc = 6.95 * k, glass = 4 * k
  const ink = 'rgba(255,255,255,0.62)'
  const line = (x1, y1, x2, y2, w = 3) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`
  return `<div style="position:absolute;left:140px;top:56px;width:${W}px;height:${H}px;transform:rotate(-14deg)">
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0">
      <rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="#ffffff" fill-opacity="0.16" stroke="${ink}" stroke-width="4" rx="3"/>
      ${line(3, 3, 3, H - 3, 9)}${line(W - 3, 3, W - 3, H - 3, 9)}
      ${line(3, 3, glass, 3, 9)}${line(3, H - 3, glass, H - 3, 9)}
      ${line(W - glass, 3, W - 3, 3, 9)}${line(W - glass, H - 3, W - 3, H - 3, 9)}
      ${line(net, -6, net, H + 6, 5)}
      ${line(net - svc, 3, net - svc, H - 3)}
      ${line(net + svc, 3, net + svc, H - 3)}
      ${line(net - svc, H / 2, net + svc, H / 2)}
    </svg>
  </div>`
}

// Padel stat captions (the short labels and scores are the same as football).
const PADEL_CAPTIONS = {
  Speed: 'Court speed', Power: 'Smash power', Endurance: 'Rally endurance',
  Balance: 'Balance', Reaction: 'Net reactions', Agility: 'Agility',
}

// Original padel racket + optic-yellow ball, beside the "· PADEL" badge.
// Wrapped in a fixed box with the SVG positioned inside it, like the hexagon:
// html2canvas clips an SVG that is a direct flex item.
const padelIcon = (t) => `<div style="position:relative;width:62px;height:46px;margin-left:10px;flex:0 0 62px"><svg width="62" height="46" viewBox="0 0 46 34" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0">
  <g transform="rotate(-35 14 15)">
    <ellipse cx="14" cy="11" rx="10" ry="11" fill="none" stroke="${t.ink}" stroke-width="2.6"/>
    ${[[10, 7], [18, 7], [14, 11], [10, 15], [18, 15]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${t.ink}"/>`).join('')}
    <rect x="12" y="21.5" width="4" height="11" rx="1.6" fill="${t.ink}"/>
  </g>
  <circle cx="36" cy="22" r="7.5" fill="#d9ef3a" stroke="${t.ink}" stroke-width="1.6"/>
  <path d="M30.2 18.5 C 34 21, 34 23, 30.2 25.8 M41.8 18.5 C 38 21, 38 23, 41.8 25.8" fill="none" stroke="#ffffff" stroke-width="1.4"/>
</svg></div>`

// ---------- cricket look ----------
// Top-down pitch: 22-yard strip with bowling and popping creases, return
// creases and stumps at each end (width exaggerated so it reads at this size).
function cricketPitch() {
  const W = 360, H = 84, ink = 'rgba(255,255,255,0.62)'
  const k = W / 22.56                         // strip incl. 1.22 m beyond each popping crease
  const bowl1 = 1.22 * k, bowl2 = W - 1.22 * k
  const pop1 = bowl1 + 1.22 * k, pop2 = bowl2 - 1.22 * k
  const line = (x1, y1, x2, y2, w = 3) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`
  const stumps = (x) => [H / 2 - 9, H / 2, H / 2 + 9].map(y => `<circle cx="${x.toFixed(1)}" cy="${y}" r="3.2" fill="${ink}"/>`).join('')
  return `<div style="position:absolute;left:130px;top:92px;width:${W}px;height:${H}px;transform:rotate(-14deg)">
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0">
      <rect x="2" y="2" width="${W - 4}" height="${H - 4}" fill="#ffffff" fill-opacity="0.16" stroke="${ink}" stroke-width="2" rx="4"/>
      ${line(bowl1, 14, bowl1, H - 14)}${line(bowl2, 14, bowl2, H - 14)}
      ${line(pop1, 4, pop1, H - 4, 4)}${line(pop2, 4, pop2, H - 4, 4)}
      ${line(bowl1 - 8, 14, pop1, 14)}${line(bowl1 - 8, H - 14, pop1, H - 14)}
      ${line(pop2, 14, bowl2 + 8, 14)}${line(pop2, H - 14, bowl2 + 8, H - 14)}
      ${stumps(bowl1)}${stumps(bowl2)}
    </svg>
  </div>`
}

// Kept short so they fit the label column (Power often carries "· partial").
const CRICKET_CAPTIONS = {
  Speed: 'Quick singles', Power: 'Power', Endurance: 'Repeat efforts',
  Balance: 'Balance', Reaction: 'Close catching', Agility: 'Turn speed',
}

// Original cricket bat + red ball, beside the "· CRICKET" badge (fixed box,
// SVG absolutely positioned inside, as html2canvas needs).
const cricketIcon = (t) => `<div style="position:relative;width:62px;height:46px;margin-left:10px;flex:0 0 62px"><svg width="62" height="46" viewBox="0 0 46 34" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0">
  <g transform="rotate(-38 14 17)">
    <rect x="10" y="2" width="8" height="21" rx="3" fill="none" stroke="${t.ink}" stroke-width="2.4"/>
    <line x1="14" y1="5" x2="14" y2="20" stroke="${t.ink}" stroke-width="1.2"/>
    <rect x="12.6" y="23" width="2.8" height="9" rx="1.2" fill="${t.ink}"/>
  </g>
  <circle cx="36" cy="22" r="7.5" fill="#b3261e" stroke="${t.ink}" stroke-width="1.6"/>
  <path d="M30.6 18.2 C 34.5 20.5, 37.5 23.5, 41.4 25.8" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-dasharray="1.6 1.2"/>
</svg></div>`

// Field-green page behind a cricket card, with the boundary rope in the margin.
const CRICKET_PAGE_LINES = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0">
  <ellipse cx="${CARD_WIDTH / 2}" cy="${CARD_HEIGHT / 2}" rx="${CARD_WIDTH / 2 - 8}" ry="${CARD_HEIGHT / 2 - 8}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4"/>
  <rect x="9" y="9" width="${CARD_WIDTH - 18}" height="${CARD_HEIGHT - 18}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
</svg>`

// Field-green strip with a white line, under the cricket header.
const CRICKET_TURF = `<div style="height:9px;background:#2e6b34;border-top:2px solid #ffffff;border-bottom:2px solid #22522a"></div>`

// Court-blue page behind a padel card, with court lines in the margin.
const PADEL_PAGE_LINES = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0">
  <rect x="9" y="9" width="${CARD_WIDTH - 18}" height="${CARD_HEIGHT - 18}" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3"/>
  <line x1="0" y1="${CARD_HEIGHT / 2}" x2="${CARD_WIDTH}" y2="${CARD_HEIGHT / 2}" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4"/>
  <line x1="0" y1="${CARD_HEIGHT / 2 - 386}" x2="${CARD_WIDTH}" y2="${CARD_HEIGHT / 2 - 386}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3"/>
  <line x1="0" y1="${CARD_HEIGHT / 2 + 386}" x2="${CARD_WIDTH}" y2="${CARD_HEIGHT / 2 + 386}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3"/>
  <line x1="${CARD_WIDTH / 2}" y1="0" x2="${CARD_WIDTH / 2}" y2="${CARD_HEIGHT}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3"/>
</svg>`

// Court-blue turf strip with a white line, under the padel header.
const PADEL_TURF = `<div style="height:9px;background:#1f5f8f;border-top:2px solid #ffffff;border-bottom:2px solid #174a70"></div>`

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
  // Fit the name beside the logo (~316px): Bebas Neue is about 0.41em per character.
  const nameSize = Math.max(34, Math.min(64, Math.floor(316 / (Math.max(name.length, 1) * 0.41))))
  const pending = rc.overallOVR == null
  const provisional = !pending && (rc.ovrStatus === 'provisional' || rc.ovrProvisional)
  const reasons = (rc.ovrReasons || []).join(' · ')
  const meta = [
    ['SPORT', rc.sport || 'Football'],
    ['AGE', rc.age],
    ['SESSION', rc.testDate],
    ['HAND', rc.dominantHand === 'R' ? 'Right' : rc.dominantHand === 'L' ? 'Left' : null],
  ].filter(([, v]) => v != null && v !== '')

  const statusBadge = pending
    ? chip('OVR PENDING · COMPLETE TESTING', '#ffffff', '#1c1f24', 'font-size:10px;padding:4px 8px 5px')
    : provisional
      ? chip('PROVISIONAL', '#ffffff', '#1c1f24', 'font-size:11px;letter-spacing:1.2px;padding:4px 9px 5px')
      : ''

  // Padel gets its own look (court diagram + court-blue turf strip); football
  // keeps its stripes. Tiers, layout and numbers are the same for both.
  const padel = /padel/i.test(rc.sport || '')
  const cricket = /cricket/i.test(rc.sport || '')
  const look = padel
    ? { word: '· PADEL', motif: padelCourt(t), icon: padelIcon(t), captions: PADEL_CAPTIONS, page: '#1f5f8f', lines: PADEL_PAGE_LINES, turf: PADEL_TURF }
    : cricket
      ? { word: '· CRICKET', motif: cricketPitch(), icon: cricketIcon(t), captions: CRICKET_CAPTIONS, page: '#2e6b34', lines: CRICKET_PAGE_LINES, turf: CRICKET_TURF }
      : null
  const header = `
  <div style="position:relative;height:238px;background:${t.band};overflow:hidden">
${look ? look.motif : `    <div style="position:absolute;left:232px;top:-120px;width:90px;height:520px;background:${t.stripe};transform:rotate(-28deg)"></div>
    <div style="position:absolute;left:186px;top:-120px;width:26px;height:520px;background:${t.stripe};transform:rotate(-28deg)"></div>
    <div style="position:absolute;left:142px;top:-120px;width:10px;height:520px;background:${t.stripe};transform:rotate(-28deg)"></div>`}

    <div style="position:absolute;right:30px;top:20px;width:168px;text-align:center">
      <div style="font-family:${DISPLAY};font-size:${pending ? 104 : 118}px;line-height:0.86;color:${t.ink};letter-spacing:1px">${pending ? '—' : esc(rc.overallOVR)}</div>
      <div style="font-family:${TEXT};font-size:10px;font-weight:700;letter-spacing:2px;color:${t.soft};margin-top:4px">OVERALL</div>
      <div style="height:2px;background:${t.ink};opacity:0.35;margin:8px 22px"></div>
      <div style="font-family:${DISPLAY};font-size:46px;line-height:0.9;color:${t.ink};letter-spacing:2px">${esc(rc.position || '—')}</div>
      <div style="margin-top:10px">${statusBadge}</div>
    </div>

    <div style="position:absolute;right:222px;top:30px;bottom:30px;width:2px;background:${t.ink};opacity:0.18"></div>

    <img src="${LOGO_URL}" alt="Peak Performance" width="134" height="102" style="position:absolute;left:24px;top:18px;width:134px;height:102px;opacity:0.92">

    <div style="position:absolute;left:28px;right:248px;top:22px">
      <div style="display:flex;align-items:center;margin-left:150px">
        <span style="font-family:${DISPLAY};font-size:18px;letter-spacing:2.5px;color:${t.ink};border:2px solid ${t.ink};border-radius:5px;padding:1px 8px 0">${t.label} ${look ? look.word : 'CARD'}</span>${look ? look.icon : ''}
      </div>
      <div style="font-family:${DISPLAY};font-size:${nameSize}px;line-height:0.95;color:${t.ink};letter-spacing:1px;margin-top:16px;margin-left:150px">${esc(name.toUpperCase())}</div>
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
      <div style="flex:1">${statBars(rc, t, look ? look.captions : {})}</div>
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
      <span style="white-space:nowrap">peakperformance.pk · ${esc(rc.batteryLabel || '')}${rc.configVersion ? ` · ${esc(rc.configVersion)}` : ''}</span>
    </div>
  </div>`

  return `
<div style="width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;box-sizing:border-box;padding:20px;background:${look ? look.page : t.page};font-family:${TEXT}${look ? ';position:relative' : ''}">${look ? look.lines : ''}
  <div style="height:100%;box-sizing:border-box;padding:6px;border-radius:26px;background:${t.foil}${look ? ';position:relative' : ''}">
    <div style="position:relative;height:100%;border-radius:21px;background:${BODY};overflow:hidden">
      ${header}
      ${look ? look.turf : ''}
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
