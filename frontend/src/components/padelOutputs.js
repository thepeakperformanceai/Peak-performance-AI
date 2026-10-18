// Padel athlete report: two A4 pages, "What it means for your game" and
// "How to improve", from reportContent.athleteReport (chosen by the engine
// from library/padel.json). The player card itself is footballCard.js.
//
// Returns HTML strings (every dynamic value escaped), built for html2canvas:
// inline styles only, no text inside SVG. Every number shown is the scoring
// engine's number.

import { tierFor } from './footballCard'
import LOGO_URL from '../assets/pp-logo-card.png'

export const PAGE_WIDTH = 794     // A4 at 96 dpi
export const PAGE_HEIGHT = 1122

const DISPLAY = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif"
const TEXT = "Inter, 'Helvetica Neue', Arial, sans-serif"
const BODY = '#fffdf9', TXT = '#1c1f24', MUTED = '#5c636e', FAINT = '#8d949e', RULE = '#e7e2d9'
const NO_DATA = '--'

// Medal colours, matching the player card's tiers (gold 75+, silver 65–74, bronze).
const TIERS = {
  gold: { label: 'GOLD', foil: 'linear-gradient(135deg, #7a5a0e 0%, #e3bc4f 26%, #fff3c4 50%, #d2a535 74%, #7f5c0f 100%)',
    band: 'linear-gradient(155deg, #fbe7a6 0%, #eac25a 48%, #c99a2a 100%)', ink: '#271a00', soft: '#5b4510', deep: '#8a6410', track: '#efe4c4' },
  silver: { label: 'SILVER', foil: 'linear-gradient(135deg, #59626e 0%, #c9d0d8 26%, #ffffff 50%, #aeb7c1 74%, #5f6873 100%)',
    band: 'linear-gradient(155deg, #f7f9fb 0%, #d5dbe2 48%, #a9b2bc 100%)', ink: '#151b22', soft: '#46505c', deep: '#4a5562', track: '#e2e6ea' },
  bronze: { label: 'BRONZE', foil: 'linear-gradient(135deg, #5a3216 0%, #c0814c 26%, #f3cfab 50%, #ab6a37 74%, #5e3518 100%)',
    band: 'linear-gradient(155deg, #f6d3b2 0%, #dca06b 48%, #b9773f 100%)', ink: '#241103', soft: '#5a3217', deep: '#8c4f22', track: '#efdfd0' },
  unrated: { label: 'UNRATED', foil: 'linear-gradient(135deg, #2f3742 0%, #77818e 30%, #c3cad2 50%, #6c7682 72%, #2f3742 100%)',
    band: 'linear-gradient(155deg, #d9dee4 0%, #b3bcc6 50%, #8e98a4 100%)', ink: '#141a21', soft: '#3c4651', deep: '#46515d', track: '#e1e5e9' },
}

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SIDE_LABEL = { RIGHT: 'Drive', LEFT: 'Revés', BOTH: 'Both' }
export const playingSideOf = (rc) => SIDE_LABEL[rc.position] || rc.position || NO_DATA

const longDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return String(iso || '')
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// ---------- the report ----------

const tierColour = (label) => TIERS[String(label || '').toLowerCase()] || TIERS.unrated

const pageShell = (report, pageNo, title, kicker, inner) => {
  const rc = report.reportContent || {}
  const ar = rc.athleteReport || {}
  const t = TIERS[tierFor(rc.overallOVR)]
  return `
<div style="width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;box-sizing:border-box;background:${BODY};font-family:${TEXT};color:${TXT};position:relative;overflow:hidden">
  <div style="height:8px;background:${t.foil}"></div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:22px 44px 0">
    <img src="${LOGO_URL}" alt="Peak Performance" width="84" height="64" style="width:84px;height:64px">
    <div style="text-align:right;line-height:1.35">
      <div style="font-family:${TEXT};font-size:10px;font-weight:700;letter-spacing:2px;color:${FAINT}">PADEL ATHLETE REPORT · PAGE ${pageNo}</div>
      <div style="font-family:${DISPLAY};font-size:26px;letter-spacing:1px;color:${TXT}">${esc((report.athleteName || ar.athleteName || '').toUpperCase())}</div>
      <div style="font-size:10.5px;color:${MUTED}">${esc(ar.side?.label || playingSideOf(rc))} side · OVR ${rc.overallOVR == null ? NO_DATA : esc(rc.overallOVR)} ${esc(t.label)} · tested ${esc(rc.testDate || '')}</div>
    </div>
  </div>
  <div style="padding:16px 44px 0">
    <div style="font-family:${TEXT};font-size:10px;font-weight:700;letter-spacing:2.5px;color:${t.deep}">${esc(kicker)}</div>
    <div style="font-family:${DISPLAY};font-size:46px;line-height:1;letter-spacing:1px;color:${TXT};margin-top:2px">${esc(title)}</div>
  </div>
  <div style="padding:14px 44px 0">${inner}</div>
  <div style="position:absolute;left:44px;right:44px;bottom:18px;border-top:1px solid ${RULE};padding-top:8px;display:flex;justify-content:space-between;font-size:8.5px;color:${FAINT}">
    <span>Every number comes from your test results. Priorities are ranked by score points below Gold (75); left/right and ratio rules come from the PeakPerformance padel library.</span>
    <span style="white-space:nowrap;margin-left:12px">peakperformance.pk · ${esc(ar.libraryVersion || '')}</span>
  </div>
</div>`
}

const sectionLabel = (txt, extra = '') =>
  `<div style="display:flex;align-items:baseline;gap:10px;margin:14px 0 8px"><span style="font-family:${DISPLAY};font-size:24px;letter-spacing:1px;color:${TXT}">${esc(txt)}</span>${extra}</div>`

const pill = (text, fg, bg) =>
  `<span style="display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:0.6px;color:${fg};background:${bg};border-radius:5px;padding:3px 7px 4px;white-space:nowrap">${esc(text)}</span>`

// The one plain number under a weapon's headline: a time or distance, or a score.
const numberLabel = (w) => (w.number.isScore ? `out of 99 · ${w.tier}` : w.tier)

function weaponCard(w, prose) {
  const t = tierColour(w.tier)
  return `<div style="flex:1;box-sizing:border-box;border-radius:14px;padding:14px 16px;background:${t.band};min-height:150px">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:${t.soft}">${esc(String(w.plainName).toUpperCase())}</div>
    <div style="font-family:${DISPLAY};font-size:27px;line-height:1.02;letter-spacing:0.5px;color:${t.ink};margin-top:4px">${esc(w.headline)}</div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px">
      <span style="font-family:${DISPLAY};font-size:34px;line-height:1;color:${t.ink}">${esc(w.number.value)}</span>
      <span style="font-size:10.5px;font-weight:700;color:${t.soft}">${esc(numberLabel(w))}</span>
    </div>
    <div style="font-size:11px;line-height:1.45;color:${t.ink};margin-top:6px">${esc(prose)}</div>
  </div>`
}

function priorityBlock(p, prose) {
  const t = tierColour(p.tier)
  return `<div style="display:flex;gap:14px;padding:12px 0;border-top:1px solid ${RULE}">
    <div style="flex:0 0 42px;height:42px;border-radius:21px;background:${TXT};color:#ffffff;font-family:${DISPLAY};font-size:28px;line-height:44px;text-align:center">${p.rank}</div>
    <div style="flex:1">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
        <div style="font-family:${DISPLAY};font-size:24px;letter-spacing:0.5px">${esc(p.name)}</div>
        <div style="white-space:nowrap">${pill(p.tier.toUpperCase(), t.ink, t.track)}</div>
      </div>
      <div style="font-size:12.5px;font-weight:700;line-height:1.4;margin:2px 0 5px">${esc(p.scoreLine)}</div>
      <div style="font-size:11.5px;line-height:1.5;color:${TXT}">${esc(prose)}</div>
    </div>
  </div>`
}

// Small print under the priorities: tests that couldn't be ranked.
export const unrankedNotes = (ar) => [
  ar.notTested?.length ? `Not tested this session, so not ranked: ${ar.notTested.join(', ')}.` : '',
  ar.notInBattery?.length ? `Not part of this report yet: ${ar.notInBattery.join(', ')}.` : '',
].filter(Boolean)

/** Page 1: "What it means for your game". */
export function padelReportPage1Html(report) {
  const ar = report.reportContent?.athleteReport
  if (!ar) return ''
  const prose = ar.prose || {}
  const weapons = ar.weapons.length
    ? `<div style="display:flex;gap:14px">${ar.weapons.map((w, i) => weaponCard(w, prose.weapons?.[i] || '')).join('')}</div>`
    : `<div style="font-size:12px;color:${MUTED}">No scored tests yet.</div>`
  const priorities = ar.priorities.length
    ? ar.priorities.map((p, i) => priorityBlock(p, prose.priorities?.[i] || '')).join('')
    : `<div style="font-size:12px;color:${MUTED};padding:10px 0">Every scored test is at Gold or above: nothing below target to prioritise.</div>`
  const notes = unrankedNotes(ar).map(t => `<div style="font-size:9.5px;color:${FAINT};margin-top:6px">${esc(t)}</div>`).join('')
  return pageShell(report, 1, 'What it means for your game', `FOR ${String(ar.side.label).toUpperCase()}-SIDE PLAYERS · ${String(ar.firstName).toUpperCase()}`, `
    ${sectionLabel('Your weapons', `<span style="font-size:10.5px;color:${FAINT}">your two best results</span>`)}
    ${weapons}
    ${sectionLabel('Your top 3 priorities', `<span style="font-size:10.5px;color:${FAINT}">biggest gap to Gold first</span>`)}
    ${priorities}
    ${notes}`)
}

/** Page 2: "How to improve". */
export function padelReportPage2Html(report, pageNo = 2) {
  const rc = report.reportContent || {}
  const ar = rc.athleteReport
  if (!ar) return ''
  const t = TIERS[tierFor(rc.overallOVR)]
  const prose = ar.prose || {}

  const block = (b) => `<div style="margin-top:8px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:700">${esc(b.test)}</span>
        <span style="font-size:11px;color:${MUTED}">${b.kind === 'addon' ? 'Add on' : 'Fix'} ${esc(b.fix)}: ${esc(b.title)}</span>
        ${b.frequency ? pill(b.frequency, t.ink, t.track) : ''}
        ${b.switchedFrom ? `<span style="font-size:9.5px;color:${FAINT}">(after ${esc(b.switchedFrom.join(', '))})</span>` : ''}
      </div>
      ${b.exercises.map(e => `<div style="display:flex;gap:7px;font-size:11px;line-height:1.45;margin-top:2px;padding-left:2px">
        <span style="color:${t.deep}">■</span><span>${esc(e.text)}${e.alsoFor.length ? ` <span style="color:${FAINT}">(also covers ${esc(e.alsoFor.join(', '))})</span>` : ''}</span></div>`).join('')}
    </div>`

  const phases = ar.plan.phases.map(ph => `<div style="flex:1;min-width:0;box-sizing:border-box;border:1.5px solid ${RULE};border-radius:12px;padding:10px 14px 12px;background:#ffffff">
      <div style="font-family:${DISPLAY};font-size:22px;letter-spacing:1px;color:${t.deep}">${esc(ph.label)}</div>
      ${ph.blocks.map(block).join('')}
    </div>`).join('')

  const pending = ar.priorities.filter(p => p.fixPending)
    .map(p => `<div style="font-size:10.5px;color:${MUTED};margin-top:6px"><b>${esc(p.name)}:</b> ${esc(p.fixPending)}</div>`).join('')
  const notes = ar.priorities.flatMap(p => (p.coachNotes || []).map(n => `${p.name}: ${n}`))
    .map(n => `<div style="font-size:10.5px;color:${MUTED};margin-top:4px">${esc(n)}</div>`).join('')

  const drills = ar.plan.roleDrills.map(d => `<div style="display:flex;gap:8px;font-size:10.5px;line-height:1.4;margin-top:3px">
      <span style="flex:0 0 74px;font-weight:700;color:${MUTED}">${esc(d.label)}</span><span>${esc(d.text)}</span></div>`).join('')

  const rebuildUrl = ar.rebuild?.url || ''
  return pageShell(report, pageNo, 'How to improve', `ONE COMBINED ${ar.plan.weeks}-WEEK PLAN`, `
    <div style="font-size:12px;line-height:1.5;color:${TXT};max-width:660px">${esc(prose.planIntro || '')}</div>
    ${ar.priorities.length ? `<div style="display:flex;gap:12px;margin-top:10px">${phases}</div>` : ''}
    ${pending}${notes}
    ${drills ? `${sectionLabel('Role drills', `<span style="font-size:10.5px;color:${FAINT}">add to your sessions · ${esc(ar.side.label)} side</span>`)}${drills}` : ''}
    <div style="display:flex;gap:14px;margin-top:16px">
      <div style="flex:0 0 220px;box-sizing:border-box;border-radius:14px;padding:14px 16px;background:${t.band}">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:${t.soft}">RETEST</div>
        <div style="font-family:${DISPLAY};font-size:30px;line-height:1.05;color:${t.ink};margin-top:4px">${esc(ar.retest.dateText || longDate(ar.retest.date))}</div>
        <div style="font-size:10.5px;color:${t.ink};margin-top:4px">${esc(ar.retest.weeks)} weeks after testing</div>
      </div>
      <div style="flex:1;box-sizing:border-box;border-radius:14px;padding:14px 18px;background:${TXT};color:#ffffff">
        <div style="font-family:${DISPLAY};font-size:24px;letter-spacing:1px;color:#ffffff">PeakPerformance Rebuild</div>
        <div style="font-size:11.5px;line-height:1.5;margin-top:4px;color:#e9e4da">${esc(ar.rebuild?.text || '')}</div>
        <a href="${esc(rebuildUrl)}" data-rebuild-link="1" style="display:inline-block;margin-top:10px;font-size:11px;font-weight:700;letter-spacing:1px;color:${TXT};background:#ffffff;border-radius:6px;padding:6px 12px;text-decoration:none">BOOK REBUILD →</a>
      </div>
    </div>`)
}

// One test's block on the "test by test" pages.
function testBlock(t) {
  const c = t.tier ? tierColour(t.tier) : null
  return `<div style="padding:10px 0;border-top:1px solid ${RULE}">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
      <div style="font-family:${DISPLAY};font-size:21px;letter-spacing:0.5px;color:${t.status === 'scored' ? TXT : FAINT}">${esc(t.name)}</div>
      <div style="white-space:nowrap">${c ? pill(t.tier.toUpperCase(), c.ink, c.track) : pill('NOT TESTED', FAINT, '#f1eee8')}</div>
    </div>
    <div style="font-size:11.5px;font-weight:700;line-height:1.4;margin:2px 0 5px;color:${t.status === 'scored' ? TXT : MUTED}">${esc(t.scoreLine || t.statusLine)}</div>
    <div style="display:flex;gap:16px">
      <div style="flex:1"><div style="font-size:9px;font-weight:700;letter-spacing:1.2px;color:${FAINT}">WHAT IT MEANS FOR YOUR GAME</div>
        <div style="font-size:10.5px;line-height:1.45;margin-top:2px">${esc(t.meaning)}</div></div>
      <div style="flex:1"><div style="font-size:9px;font-weight:700;letter-spacing:1.2px;color:${c ? c.deep : FAINT}">${esc(t.improveTitle.toUpperCase())}</div>
        <div style="font-size:10.5px;line-height:1.45;margin-top:2px">${esc(t.improve)}</div></div>
    </div>
  </div>`
}

// Tests per on-screen page: fewer when the athlete plays both sides (three lines each).
const testsPerPage = (ar) => (ar.side?.key === 'BOTH' ? 3 : 4)

/** "Your game, test by test": every padel test, on as many pages as it needs. */
export function padelTestByTestPagesHtml(report, firstPage = 2) {
  const ar = report.reportContent?.athleteReport
  if (!ar?.testByTest?.length) return []
  const per = testsPerPage(ar)
  const pages = []
  for (let i = 0; i < ar.testByTest.length; i += per) {
    pages.push(pageShell(report, firstPage + pages.length, i ? 'Your game, test by test (continued)' : 'Your game, test by test',
      `EVERY TEST · ${String(ar.side.label).toUpperCase()} SIDE`, ar.testByTest.slice(i, i + per).map(testBlock).join('')))
  }
  return pages
}

export const padelReportPagesHtml = (report) => {
  if (!report.reportContent?.athleteReport) return []
  const tests = padelTestByTestPagesHtml(report, 2)
  return [padelReportPage1Html(report), ...tests, padelReportPage2Html(report, 2 + tests.length)]
}
