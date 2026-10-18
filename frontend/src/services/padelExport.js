// Download for the padel athlete report (components/padelOutputs.js): two A4
// pages, drawn with html2canvas (via html2pdf, as the player card PDF is).

import html2pdf from 'html2pdf.js'
import { jsPDF } from 'jspdf'
import { ensureCardFonts } from '../components/footballCard'
import { padelReportPagesHtml, PAGE_WIDTH, PAGE_HEIGHT } from '../components/padelOutputs'

// See downloadReportPDF: html2canvas measures font baselines with an inline
// <img>; Tailwind makes every img block-level, which shifts text down.
const BASELINE_FIX = 'body > div[style*="visibility: hidden"] > img { display: inline !important; }'
const addFix = (doc) => {
  const el = doc.createElement('style')
  el.textContent = BASELINE_FIX
  doc.head.appendChild(el)
  return el
}

const fileBase = (report, what) =>
  `PeakPerformance_${what}_${(report.athleteName || 'Athlete').replace(/[^a-zA-Z0-9]/g, '_')}_${(report.testDate || '').replace(/[^a-zA-Z0-9]/g, '_')}`

// Mounts the HTML off screen (so links can be measured), draws it, removes it.
const drawHtml = async (html, { width, height, scale }) => {
  await ensureCardFonts()
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none'
  holder.innerHTML = html
  document.body.appendChild(holder)
  const el = holder.firstElementChild
  const fix = addFix(document)
  try {
    const links = [...el.querySelectorAll('a[href]')].map(a => {
      const r = a.getBoundingClientRect(), o = el.getBoundingClientRect()
      return { href: a.getAttribute('href'), x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }
    })
    const canvas = await html2pdf().set({
      margin: 0,
      html2canvas: {
        scale, useCORS: true, logging: false, width, height, windowWidth: width,
        onclone: (doc) => { addFix(doc); return ensureCardFonts(doc) },
      },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
    }).from(el).toCanvas().get('canvas')
    return { canvas, links }
  } finally {
    fix.remove()
    holder.remove()
  }
}

/** The two-page athlete report. The Rebuild button is clickable once its link is set. */
export const padelReportPdf = async (report) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pages = padelReportPagesHtml(report)
  for (let i = 0; i < pages.length; i++) {
    const { canvas, links } = await drawHtml(pages[i], { width: PAGE_WIDTH, height: PAGE_HEIGHT, scale: 2 })
    if (i) pdf.addPage('a4', 'portrait')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)
    const sx = 210 / PAGE_WIDTH, sy = 297 / PAGE_HEIGHT
    for (const l of links) {
      if (/^https?:\/\//.test(l.href)) pdf.link(l.x * sx, l.y * sy, l.w * sx, l.h * sy, { url: l.href })
    }
  }
  return pdf
}
export const downloadPadelReportPdf = async (report) => (await padelReportPdf(report)).save(`${fileBase(report, 'Report')}.pdf`)
