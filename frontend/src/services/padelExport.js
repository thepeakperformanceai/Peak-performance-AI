// Download for the padel athlete report: a real-text PDF built by
// components/padelReportPdf.js (selectable, searchable, readable on a phone).
// The player card's own PDF is unchanged (services/api.js).

import { buildPadelReportPdf } from '../components/padelReportPdf'
import LOGO_URL from '../assets/pp-logo-card.png'

const fileBase = (report, what) =>
  `PeakPerformance_${what}_${(report.athleteName || 'Athlete').replace(/[^a-zA-Z0-9]/g, '_')}_${(report.testDate || '').replace(/[^a-zA-Z0-9]/g, '_')}`

// The logo as a PNG data URL plus its size on the page (22 mm wide).
const loadLogo = () => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    resolve({ dataUrl: c.toDataURL('image/png'), w: 22, h: 22 * img.naturalHeight / img.naturalWidth })
  }
  img.onerror = () => resolve(null)       // the report still works without the logo
  img.src = LOGO_URL
})

/** The two-page athlete report. The Rebuild button is clickable once its link is set. */
export const padelReportPdf = async (report) => buildPadelReportPdf(report, { logo: await loadLogo() })
export const downloadPadelReportPdf = async (report) => (await padelReportPdf(report)).save(`${fileBase(report, 'Report')}.pdf`)
