// Athlete report (padel, cricket, football: one format) as a real-text PDF (selectable, searchable, readable
// on a phone): drawn with jsPDF's own text and shapes, not a screenshot.
// The report page shows this same PDF, so screen and download always match.
// Built from reportContent.athleteReport; every number is the engine's.
//
// Three pages: what it means for your game, how to improve, your full results.
// Pure module (only jsPDF), so it also runs in Node for checks and samples.

import { jsPDF } from 'jspdf'

const W = 210, H = 297, M = 16, CW = W - 2 * M
const FOOT = H - 14
const TOP = 31                          // content starts here on every page
const TXT = '#1c1f24', MUTED = '#5c636e', FAINT = '#8d949e', RULE = '#e7e2d9', BODY = '#fffdf9'

// Flat versions of the card's medal colours (gold 75+, silver 65–74, bronze).
const TIERS = {
  gold: { label: 'GOLD', fill: '#f6e3a1', deep: '#8a6410', ink: '#271a00', soft: '#5b4510', track: '#efe4c4' },
  silver: { label: 'SILVER', fill: '#e3e7ec', deep: '#4a5562', ink: '#151b22', soft: '#46505c', track: '#e2e6ea' },
  bronze: { label: 'BRONZE', fill: '#f1cfae', deep: '#8c4f22', ink: '#241103', soft: '#5a3217', track: '#efdfd0' },
  unrated: { label: 'UNRATED', fill: '#dfe3e8', deep: '#46515d', ink: '#141a21', soft: '#3c4651', track: '#e1e5e9' },
}
const tierKeyOf = (score) => (score == null ? 'unrated' : score >= 75 ? 'gold' : score >= 65 ? 'silver' : 'bronze')
const tierByLabel = (label) => TIERS[String(label || '').toLowerCase()] || TIERS.unrated

const PT = 0.3528                       // mm per point
const lineH = (size, lead = 1.35) => size * PT * lead


/**
 * Builds the two-page report. opts.logo = { dataUrl, w, h } (mm), optional.
 * Returns the jsPDF document.
 */
export function buildPadelReportPdf(report, opts = {}) {
  const rc = report.reportContent || {}
  const ar = rc.athleteReport
  if (!ar) throw new Error('This report has no athlete report')
  const prose = ar.prose || {}
  const t = TIERS[tierKeyOf(rc.overallOVR)]
  // Same layout for every sport; only the sport's name and drills label change.
  const sport = /cricket/i.test(rc.sport || '') ? 'Cricket' : /football/i.test(rc.sport || '') ? 'Football' : 'Padel'
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `${sport} athlete report: ${report.athleteName || ar.athleteName}`, subject: 'What it means for your game · How to improve', author: 'PeakPerformance' })

  let y = 0
  let pageNo = 0

  // ---------- primitives ----------

  const font = (size, style = 'normal', color = TXT) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(color)
  }
  const wrap = (text, w) => doc.splitTextToSize(String(text ?? ''), w)
  // Draws wrapped text at (x, y) and returns its height; draw=false only measures.
  const para = (text, x, yy, w, size, style = 'normal', color = TXT, draw = true, lead = 1.35) => {
    font(size, style, color)
    const lines = wrap(text, w)
    const lh = lineH(size, lead)
    if (draw) lines.forEach((ln, i) => doc.text(ln, x, yy + size * PT + i * lh))
    return lines.length * lh
  }
  const pill = (text, xRight, yy, fg, bg) => {
    font(7.5, 'bold', fg)
    const w = doc.getTextWidth(text) + 4
    doc.setFillColor(bg)
    doc.roundedRect(xRight - w, yy, w, 4.6, 1.2, 1.2, 'F')
    doc.text(text, xRight - w + 2, yy + 3.3)
    return w
  }

  const footer = () => {
    doc.setDrawColor(RULE)
    doc.setLineWidth(0.25)
    doc.line(M, FOOT, W - M, FOOT)
    font(6.8, 'normal', FAINT)
    doc.text('Every number comes from your test results. Priorities are ranked by score points below Gold (75).', M, FOOT + 4)
    doc.text(`peakperformance.pk · ${ar.libraryVersion || ''}`, W - M, FOOT + 4, { align: 'right' })
    // Library setting draft_notice: on every page until clinical review is done.
    if (ar.draftNotice) {
      font(7.5, 'bold', '#9f1d14')
      doc.text(ar.draftNotice, W / 2, FOOT + 8.5, { align: 'center' })
    }
  }

  const newPage = (title, kicker) => {
    if (pageNo) { footer(); doc.addPage() }
    pageNo += 1
    doc.setFillColor(BODY)
    doc.rect(0, 0, W, H, 'F')
    doc.setFillColor(t.deep)
    doc.rect(0, 0, W, 2.2, 'F')
    if (opts.logo) doc.addImage(opts.logo.dataUrl, 'PNG', M, 7, opts.logo.w, opts.logo.h)
    font(7, 'bold', FAINT)
    doc.text(`${sport.toUpperCase()} ATHLETE REPORT · PAGE ${pageNo}`, W - M, 11, { align: 'right', charSpace: 0.3 })
    font(15, 'bold', TXT)
    doc.text(String(report.athleteName || ar.athleteName || '').toUpperCase(), W - M, 17.5, { align: 'right' })
    font(8, 'normal', MUTED)
    doc.text(`${sport} · OVR ${rc.overallOVR ?? '--'} ${t.label} · tested ${rc.testDate || ''}`, W - M, 22, { align: 'right' })
    y = TOP
    if (kicker) {
      font(7.5, 'bold', t.deep)
      doc.text(kicker, M, y, { charSpace: 0.4 })
      y += 2
    }
    if (title) {
      font(24, 'bold', TXT)
      doc.text(title, M, y + 8)
      y += 13
    }
  }
  // Starts a new page when the next h mm wouldn't fit.
  const ensure = (h) => { if (y + h > FOOT - 4) newPage(null, null) }

  const section = (title, sub) => {
    ensure(14)
    y += 3
    font(14, 'bold', TXT)
    doc.text(title, M, y + 5)
    if (sub) {
      const tw = doc.getTextWidth(title)
      font(8, 'normal', FAINT)
      doc.text(sub, M + tw + 3, y + 5)
    }
    y += 9
  }

  // ---------- page 1: what it means for your game ----------

  newPage('What it means for your game', `${sport.toUpperCase()} · ${String(ar.firstName).toUpperCase()}`)

  section('Your weapons', 'your two best results')
  if (ar.weapons.length) {
    const gap = 6, bw = (CW - gap) / 2, pad = 4
    const weaponBlock = (w, i, x, top, draw) => {
      const c = tierByLabel(w.tier)
      let yy = top + pad
      font(7, 'bold', c.soft)
      if (draw) doc.text(String(w.nickname || w.plainName).toUpperCase(), x + pad, yy + 2.5, { charSpace: 0.3 })
      yy += 4.5
      yy += para(w.headline, x + pad, yy, bw - 2 * pad, 13, 'bold', c.ink, draw, 1.15) + 1.5
      font(17, 'bold', c.ink)
      if (draw) doc.text(w.number.value, x + pad, yy + 6)
      const nw = doc.getTextWidth(w.number.value)
      font(7.5, 'bold', c.soft)
      if (draw) doc.text(w.number.isScore ? `out of 99 · ${w.tier}` : w.tier, x + pad + nw + 2.5, yy + 6)
      yy += 9
      yy += para(prose.weapons?.[i] || '', x + pad, yy, bw - 2 * pad, 8.5, 'normal', c.ink, draw)
      return yy + pad - top
    }
    const hgt = Math.max(...ar.weapons.map((w, i) => weaponBlock(w, i, M, 0, false)))
    ensure(hgt)
    ar.weapons.forEach((w, i) => {
      const x = M + i * (bw + gap)
      doc.setFillColor(tierByLabel(w.tier).fill)
      doc.roundedRect(x, y, bw, hgt, 3, 3, 'F')
      weaponBlock(w, i, x, y, true)
    })
    y += hgt + 2
  } else {
    y += para('No scored tests yet.', M, y, CW, 9, 'normal', MUTED)
  }

  section('Your top 3 priorities', 'biggest gap to Gold first')
  if (!ar.priorities.length) {
    y += para('Every scored test is at Gold or above: nothing below target to prioritise.', M, y, CW, 9, 'normal', MUTED)
  }
  // Each priority: the library's nickname, "You'll notice it when…", the
  // matching "Why" line(s) and "Fix it and…", in that order, drawn piece by
  // piece so any piece that wouldn't fit above the footer moves to the next page.
  for (const p of ar.priorities) {
    const x = M + 13, w = CW - 13
    const c = tierByLabel(p.tier)
    // Reports made before library v2 have no notice / Why / Fix it: show what they have.
    const why = Array.isArray(p.why) && p.why.length ? p.why : [p.scoreLine, ...(p.ruleNotes || [])].filter(Boolean)
    font(9, 'normal', TXT)
    const headH = 13 + (p.notice ? wrap(p.notice, w).length * lineH(9) : lineH(9))
    ensure(headH)
    doc.setDrawColor(RULE)
    doc.setLineWidth(0.25)
    doc.line(M, y, W - M, y)
    doc.setFillColor(TXT)
    doc.circle(M + 4.5, y + 7, 4.5, 'F')
    font(12, 'bold', '#ffffff')
    doc.text(String(p.rank), M + 4.5, y + 8.6, { align: 'center' })
    pill(p.tier.toUpperCase(), W - M, y + 3, c.ink, c.track)
    font(12.5, 'bold', TXT)
    doc.text(p.nickname || p.name, x, y + 7)
    font(7.5, 'normal', FAINT)
    doc.text(p.name, x, y + 11)
    y += 13
    const pieces = [
      { text: p.notice, style: 'normal', color: TXT },
      ...why.map(t => ({ text: t, style: 'bold', color: TXT, bullet: true })),
      { text: p.fixIt, style: 'bold', color: c.deep }
    ].filter(piece => piece.text)
    for (const piece of pieces) {
      const indent = piece.bullet ? 3 : 0
      font(9, piece.style, piece.color)
      const h = wrap(piece.text, w - indent).length * lineH(9)
      ensure(h + 1)
      if (piece.bullet) {
        font(9, 'normal', c.deep)
        doc.text('•', x, y + 9 * PT)
      }
      para(piece.text, x + indent, y, w - indent, 9, piece.style, piece.color)
      y += h + 1.4
    }
    y += 1.5
  }

  // ---------- page 2: how to improve ----------

  newPage('How to improve', `ONE COMBINED ${ar.plan.weeks}-WEEK PLAN`)
  y += para(prose.planIntro || '', M, y, CW, 9.5, 'normal', TXT) + 3

  if (ar.priorities.length) {
    const phases = ar.plan.phases
    const gap = 5, n = phases.length, colW = (CW - gap * (n - 1)) / n, pad = 3.5
    const phaseBlock = (ph, x, top, draw) => {
      let yy = top + pad
      font(12, 'bold', t.deep)
      if (draw) doc.text(ph.label, x + pad, yy + 4)
      yy += 6.5
      for (const b of ph.blocks) {
        const head = `${b.test} · ${b.kind === 'addon' ? 'Add on' : 'Fix'} ${b.fix}: ${b.title}${b.frequency ? ` (${b.frequency})` : ''}`
        yy += para(head, x + pad, yy, colW - 2 * pad, 8.5, 'bold', TXT, draw) + 0.3
        if (b.switchedFrom) yy += para(`After ${b.switchedFrom.join(', ')}`, x + pad, yy, colW - 2 * pad, 7, 'normal', FAINT, draw)
        for (const e of b.exercises) {
          const text = `${e.text}${e.alsoFor.length ? ` (also covers ${e.alsoFor.join(', ')})` : ''}`
          font(8.2, 'normal', t.deep)
          if (draw) doc.text('•', x + pad, yy + 8.2 * PT)
          yy += para(text, x + pad + 3, yy, colW - 2 * pad - 3, 8.2, 'normal', TXT, draw) + 0.4
        }
        yy += 1.6
      }
      return yy + pad - top
    }
    const hgt = Math.max(...phases.map(ph => phaseBlock(ph, M, 0, false)))
    if (hgt <= FOOT - 4 - TOP) {
      ensure(hgt)
      phases.forEach((ph, i) => {
        const x = M + i * (colW + gap)
        doc.setFillColor('#ffffff')
        doc.setDrawColor(RULE)
        doc.setLineWidth(0.4)
        doc.roundedRect(x, y, colW, hgt, 2.5, 2.5, 'FD')
        phaseBlock(ph, x, y, true)
      })
      y += hgt + 2
    } else {
      // Too long for one page side by side: one phase after another, each
      // line moving to the next page if it wouldn't fit above the footer.
      for (const ph of phases) {
        ensure(12)
        font(12, 'bold', t.deep)
        doc.text(ph.label, M, y + 4)
        y += 6.5
        for (const b of ph.blocks) {
          const head = `${b.test} · ${b.kind === 'addon' ? 'Add on' : 'Fix'} ${b.fix}: ${b.title}${b.frequency ? ` (${b.frequency})` : ''}`
          ensure(10)
          y += para(head, M, y, CW, 8.5, 'bold', TXT) + 0.3
          for (const e of b.exercises) {
            const text = `${e.text}${e.alsoFor.length ? ` (also covers ${e.alsoFor.join(', ')})` : ''}`
            font(8.2, 'normal', TXT)
            ensure(wrap(text, CW - 3).length * lineH(8.2) + 0.4)
            font(8.2, 'normal', t.deep)
            doc.text('•', M, y + 8.2 * PT)
            y += para(text, M + 3, y, CW - 3, 8.2, 'normal', TXT) + 0.4
          }
          y += 1.6
        }
      }
    }
  }

  for (const p of ar.priorities.filter(q => q.fixPending)) {
    ensure(8)
    y += para(`${p.name}: ${p.fixPending}`, M, y, CW, 8.5, 'normal', MUTED) + 1
  }
  for (const p of ar.priorities) {
    for (const note of p.coachNotes || []) { ensure(6); y += para(`${p.name}: ${note}`, M, y, CW, 8.5, 'normal', MUTED) + 1 }
  }

  if (ar.plan.courtDrills?.length) {
    section(ar.drillsLabel || 'Court drills', 'add to your sessions')
    for (const d of ar.plan.courtDrills) {
      font(8.2, 'normal', TXT)
      const h = wrap(d.text, CW - 3).length * lineH(8.2)
      ensure(h + 1)
      font(8.2, 'normal', t.deep)
      doc.text('•', M, y + 8.2 * PT)
      para(d.text, M + 3, y, CW - 3, 8.2, 'normal', TXT)
      y += h + 0.8
    }
  }

  // Retest date
  y += 4
  const rw = 80, pad = 4.5
  const retestH = (draw, top) => {
    let yy = top + pad
    font(7, 'bold', t.soft)
    if (draw) doc.text('RETEST', M + pad, yy + 2.5, { charSpace: 0.4 })
    yy += 4.5
    yy += para(ar.retest.dateText || ar.retest.date, M + pad, yy, rw - 2 * pad, 15, 'bold', t.ink, draw, 1.1) + 1
    yy += para(`${ar.retest.weeks} weeks after testing`, M + pad, yy, rw - 2 * pad, 8.5, 'normal', t.ink, draw)
    return yy + pad - top
  }
  const boxH = retestH(false, 0)
  ensure(boxH)
  doc.setFillColor(t.fill)
  doc.roundedRect(M, y, rw, boxH, 3, 3, 'F')
  retestH(true, y)
  y += boxH

  // ---------- page 3: your full results ----------

  newPage('Your full results', `EVERY TEST YOU DID · ${String(ar.firstName).toUpperCase()}`)
  const cols = [M, M + 70, M + 108, M + 130]          // test, result, level, next step
  font(6.8, 'bold', FAINT)
  ;['TEST', 'YOUR RESULT', 'LEVEL', 'NEXT STEP'].forEach((h, i) => doc.text(h, cols[i], y + 3, { charSpace: 0.3 }))
  y += 5
  for (const r of ar.fullResults || []) {
    const betterText = r.fixIt || ''
    // Wrapped once, in the body font, leaving room for the bold lead-in.
    font(8.2, 'normal', TXT)
    const betterLines = betterText ? wrap(betterText, CW - 3) : []
    const betterH = betterLines.length * lineH(8.2)
    ensure(9 + betterH)
    doc.setDrawColor(RULE)
    doc.setLineWidth(0.25)
    doc.line(M, y, W - M, y)
    font(9.5, 'bold', TXT)
    doc.text(r.test, cols[0], y + 5.6)
    font(9.5, 'normal', TXT)
    doc.text(r.result, cols[1], y + 5.6)
    const c = tierByLabel(r.tier)
    font(7.5, 'bold', c.ink)
    const pw = doc.getTextWidth(r.tier.toUpperCase()) + 4
    pill(r.tier.toUpperCase(), cols[2] + pw, y + 2.4, c.ink, c.track)
    font(9, 'normal', MUTED)
    doc.text(r.next, cols[3], y + 5.6)
    y += 8
    if (betterText) {
      // "Fix it and" in the tier colour, then the rest of the library line.
      font(8.2, 'bold', c.deep)
      const lead = 'Fix it and '
      const lines = betterLines
      doc.text(lead, M, y + 8.2 * PT)
      const lw = doc.getTextWidth(lead)
      font(8.2, 'normal', TXT)
      doc.text(lines[0].slice(lead.length), M + lw, y + 8.2 * PT)
      lines.slice(1).forEach((ln, i) => doc.text(ln, M, y + 8.2 * PT + (i + 1) * lineH(8.2)))
      y += betterH + 1.5
    }
  }
  y += 3
  para('Timed tests are shown in seconds or centimetres; every other test as a score out of 99. Gold starts at 75, Silver at 65.', M, y, CW, 7.5, 'normal', FAINT)

  footer()
  return doc
}
