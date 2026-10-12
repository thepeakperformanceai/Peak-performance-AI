import axios from 'axios'
import html2pdf from 'html2pdf.js'
import { jsPDF } from 'jspdf'
import { clearAuthToken, getAuthToken } from '../utils/auth'
import { footballCardHtml, ensureCardFonts } from '../components/footballCard'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 90000,
})

api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const getReport = (reportId) => api.get(`/report/${reportId}`)

api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      clearAuthToken()
      if (window.location.pathname !== '/') {
        window.location.href = '/'
      } else {
        window.location.reload()
      }
    }
    const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Something went wrong'
    return Promise.reject(new Error(msg))
  }
)

export const generateReport = async (files, athleteProfile) => {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  formData.append('profile', JSON.stringify(athleteProfile))
  return api.post('/report/generate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// Football: manually entered results, scored by the backend's scoring engine.
// VALD PDFs are optional and kept with the report as reference.
export const generateFootballReport = async (files, athleteProfile, footballResults) => {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  formData.append('profile', JSON.stringify(athleteProfile))
  formData.append('football', JSON.stringify(footballResults))
  return api.post('/report/football', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// Padel: same engine-scored flow as football (tests, card, Gemini rules).
export const generatePadelReport = async (files, athleteProfile, padelResults) => {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  formData.append('profile', JSON.stringify(athleteProfile))
  formData.append('results', JSON.stringify(padelResults))
  return api.post('/report/padel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// Cricket: same engine-scored flow as football and padel.
export const generateCricketReport = async (files, athleteProfile, cricketResults) => {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  formData.append('profile', JSON.stringify(athleteProfile))
  formData.append('results', JSON.stringify(cricketResults))
  return api.post('/report/cricket', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// VALD auto-fill (credentials stay on the backend).
export const valdStatus = () => api.get('/vald/status')
export const valdDiagnose = () => api.get('/vald/diagnose', { timeout: 120000 })
export const valdProfiles = (q) => api.get('/vald/profiles', { params: { q } })
export const valdLatest = (profileId, sport) => api.get('/vald/latest', { params: { profileId, sport } })

export const downloadReportPDF = async reportId => {
  try {
    const response = await api.get(`/report/${reportId}/export`)
    const { report } = response
    const rc = report?.reportContent || {}

    // Football (engine-scored) reports: the one-page A4 player card.
    if (rc.configVersion) {
      await ensureCardFonts()
      const card = document.createElement('div')
      card.innerHTML = footballCardHtml(report)
      const cardFile = `PeakPerformance_${(report.athleteName || 'Athlete').replace(/[^a-zA-Z0-9]/g, '_')}_${(report.testDate || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      // html2canvas finds each font's baseline by putting a tiny inline <img>
      // next to sample text in a hidden <div> on <body>. Tailwind's base styles
      // make every img display:block, which drops it a line and pushes all
      // text down in the PDF. Undo that for the measuring div only, while drawing.
      const BASELINE_FIX = 'body > div[style*="visibility: hidden"] > img { display: inline !important; }'
      const addFix = (doc) => {
        const el = doc.createElement('style')
        el.textContent = BASELINE_FIX
        doc.head.appendChild(el)
        return el
      }
      const fix = addFix(document)
      try {
        // Render to one image and place it on exactly one A4 page (html2pdf's
        // own paging pushes a full-height card onto a second page).
        const canvas = await html2pdf().set({
          margin: 0,
          // Card fonts must also be ready inside html2canvas's cloned document.
          html2canvas: {
            scale: 2, useCORS: true, logging: false,
            onclone: (doc) => { addFix(doc); return ensureCardFonts(doc) },
          },
          jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
        }).from(card.firstElementChild).toCanvas().get('canvas')
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)
        pdf.save(cardFile)
      } finally {
        fix.remove()
      }
      return
    }

    const ORANGE = '#ff4b12', INK = '#f2f4f7', MUTED = '#9aa7b4', FAINT = '#5b6b7c'
    const PANEL = '#0e0f11', BORDER = '#22242a', TRACK = '#1c1e22', TEAL = '#39d0c8', BG = '#0a0b0d'
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bar = (score) => `<div style="flex:1;height:15px;background:${TRACK};border-radius:4px;overflow:hidden"><div style="width:${score}%;height:100%;background:${ORANGE};border-radius:4px"></div></div>`
    const tagColor = (t) => t === 'STRENGTH' ? TEAL : t === 'PRIORITY' ? ORANGE : t === 'NOT TESTED' ? FAINT : '#f6c667'
    const pageWrap = (label, inner) => `
      <div style="background:${BG};color:${INK};font-family:Inter,Arial,sans-serif;padding:38px 44px;min-height:760px;page-break-after:always;position:relative">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${BORDER};padding-bottom:14px;margin-bottom:26px">
          <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:20px"><span style="color:#fff">PEAK</span><span style="color:${ORANGE}">PERFORMANCE</span></div>
          <div style="font-family:monospace;font-size:10px;color:${FAINT};text-align:right;letter-spacing:1px">ATHLETE REPORT<br><b style="color:${MUTED}">${label}</b></div>
        </div>${inner}
        <div style="position:absolute;bottom:20px;left:44px;right:44px;display:flex;justify-content:space-between;font-family:monospace;font-size:9px;color:${FAINT};border-top:1px solid ${BORDER};padding-top:10px">
          <span>PEAKPERFORMANCE.PK — SOUTH ASIAN ATHLETE BENCHMARK DATA</span><span>PeakPerformance</span></div>
      </div>`

      const hexSvg = (ovr, overall) => {
        const size = 500, cx = 250, cy = 180, R = 130
        const order = ['Speed','Agility','Power','Endurance','Reaction','Balance']
        const angles = [0,-60,-120,180,120,60].map(d => d*Math.PI/180)
        const pt = (i,r) => [cx+Math.cos(angles[i])*R*r, cy+Math.sin(angles[i])*R*r]
        // Untested stats (score null) get no point: the shape joins measured stats only.
        const scoreOf = (n) => ovr.find(s=>s.name===n)?.score
        const missing = (n) => scoreOf(n) == null
        const measured = order.filter(n => !missing(n))
        const val = (n) => (scoreOf(n) ?? 0)/100
        const ring = (r) => order.map((_,i)=>pt(i,r).join(',')).join(' ')
        const poly = measured.map(n=>pt(order.indexOf(n),val(n)).join(',')).join(' ')
        const lab = { Speed:[cx+R+18,cy+5], Agility:pt(1,1.28), Power:pt(2,1.28), Endurance:[cx-R-18,cy+5], Reaction:pt(4,1.28), Balance:pt(5,1.28) }
        return `<svg viewBox="0 0 ${size} 360" width="500" height="360">
          ${[0.25,0.5,0.75,1].map(r=>`<polygon points="${ring(r)}" fill="none" stroke="#2a2d33" stroke-width="1"/>`).join('')}
          ${order.map((n,i)=>{const[x,y]=pt(i,1);return missing(n)
            ? `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${FAINT}" stroke-dasharray="4 4"/>`
            : `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#2a2d33"/>`}).join('')}
          ${measured.length >= 3 ? `<polygon points="${poly}" fill="${ORANGE}33" stroke="${ORANGE}" stroke-width="2.5"/>` : ''}
          ${measured.length === 2 ? `<polyline points="${poly}" fill="none" stroke="${ORANGE}" stroke-width="2.5"/>` : ''}
          ${measured.map(n=>{const[x,y]=pt(order.indexOf(n),val(n));return `<circle cx="${x}" cy="${y}" r="4" fill="${ORANGE}"/>`}).join('')}
          <text x="${cx}" y="${cy-4}" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="44" fill="${ORANGE}">${overall}</text>
          <text x="${cx}" y="${cy+16}" text-anchor="middle" font-family="monospace" font-size="10" fill="${FAINT}">OVERALL OVR</text>
          ${order.map(n=>{const[x,y]=lab[n];const anc=n==='Endurance'?'end':n==='Speed'?'start':'middle';return `<text x="${x}" y="${y}" text-anchor="${anc}" font-size="13" fill="${missing(n)?FAINT:MUTED}">${n}</text>`
            + (missing(n) ? `<text x="${x}" y="${y+14}" text-anchor="${anc}" font-family="monospace" font-size="9" fill="${FAINT}">NOT TESTED</text>` : '')}).join('')}
        </svg>`
      }
    const ringSvg = (lsi) => {
      const c = 2 * Math.PI * 52, dash = (lsi / 100) * c
      return `<svg viewBox="0 0 130 130" width="120" height="120">
        <circle cx="65" cy="65" r="52" fill="none" stroke="${TRACK}" stroke-width="12"/>
        <circle cx="65" cy="65" r="52" fill="none" stroke="${TEAL}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 65 65)"/>
        <text x="65" y="63" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="22" fill="${TEAL}">${lsi}%</text>
        <text x="65" y="80" text-anchor="middle" font-family="monospace" font-size="9" fill="${FAINT}">LSI</text></svg>`
    }

    const ovr = rc.ovrScores || [], battery = rc.manualBattery || [], dynamo = rc.dynamoStrength || [], ss = rc.symmetrySummary || {}, fm = rc.fieldMeaning || {}
    // Engine-scored (football) reports: missing scores print as "Not tested",
    // plus OVR status, HumanTrak screen and flags. Other reports print as before.
    const engineScored = !!rc.configVersion
    const AMBER = '#f6c667', RED = '#ff5a5a'
    const notTested = (label = 'Not tested') => `<span style="flex:1;font-family:monospace;font-size:11px;color:${FAINT}">${esc(label)}</span>`
    const barOr = (score, label) => score == null ? notTested(label) : bar(score)
    const num = (score) => score ?? '—'
    const overallShown = engineScored && rc.overallOVR == null ? '—' : (rc.overallOVR ?? 0)
    const statusColor = (st = '') => st.startsWith('REVIEW — RED') ? RED : st.startsWith('REVIEW') || st === 'ONE SIDE ONLY' ? AMBER : st === 'NOT TESTED' ? FAINT : TEAL
    const ovrBadge = !engineScored ? '' : rc.ovrStatus === 'pending'
      ? `<div style="font-family:monospace;font-size:11px;color:${AMBER};margin-bottom:12px">${esc(rc.ovrMessage || 'OVR pending: complete testing')}</div>`
      : rc.ovrStatus === 'provisional'
        ? `<div style="margin-bottom:12px"><span style="font-family:monospace;font-size:10px;color:${AMBER};border:1px solid ${AMBER};border-radius:4px;padding:2px 8px 8px">PROVISIONAL OVR</span><span style="color:${FAINT};font-size:12px;margin-left:10px">${esc((rc.ovrReasons || []).join(' · '))}</span></div>`
        : ''
    const p1 = pageWrap('PAGE 1 / 4 — OVR CARD', `
      <div style="display:flex;gap:30px;align-items:center">
        <div style="flex:0 0 400px;text-align:center">${hexSvg(ovr, overallShown)}</div>
        <div style="flex:1">
          <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:34px">${esc(report.athleteName)}</div>
          <div style="color:${MUTED};font-size:14px;margin:6px 0 14px">${esc([rc.sport,rc.position].filter(Boolean).join(' — '))} · ${esc(rc.batteryLabel||'')}</div>
          <div style="font-family:monospace;font-size:12px;color:${FAINT};margin-bottom:16px">
            ${rc.age!=null?`AGE <b style="color:${INK}">${esc(rc.age)}</b>&nbsp;&nbsp;&nbsp;`:''}
            ${rc.sport?`SPORT <b style="color:${INK}">${esc(rc.sport)}</b>&nbsp;&nbsp;&nbsp;`:''}
            ${rc.testDate?`SESSION <b style="color:${INK}">${esc(rc.testDate)}</b>`:''}
          </div>
          ${ovrBadge}
          ${ovr.map(s=>`<div style="display:flex;align-items:center;gap:12px;margin-bottom:11px">
            <span style="width:90px;font-size:14px;color:${INK}">${esc(s.name)}</span>${engineScored ? barOr(s.score) : bar(s.score)}
            <span style="width:26px;text-align:right;font-family:'Space Grotesk',Arial;font-weight:700;color:${INK}">${engineScored ? num(s.score) : s.score}</span></div>`).join('')}
          ${engineScored && rc.summary ? `<p style="color:${MUTED};font-size:13px;line-height:1.5;margin-top:12px">${esc(rc.summary)}</p>` : ''}
        </div>
      </div>`)

    // Page 2
    const p2 = battery.length ? pageWrap('PAGE 2 / 4 — MANUAL TEST BATTERY', `
      <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:24px;margin-bottom:18px">Manual Test Battery</div>
      ${battery.map((t,i)=>`<div style="display:flex;align-items:center;gap:16px;padding:10px 0;${i?`border-top:1px solid ${BORDER}`:''}">
        <span style="flex:0 0 200px;font-size:13px;color:${INK}">${esc(t.test)}</span>${engineScored ? barOr(t.score) : bar(t.score)}
        <span style="width:26px;text-align:right;font-family:'Space Grotesk',Arial;font-weight:700;color:${INK}">${engineScored ? num(t.score) : t.score}</span>
        <span style="flex:0 0 150px;text-align:right;font-family:monospace">
          <span style="color:${ORANGE};font-weight:700;font-size:13px">${esc(t.raw)}</span>
          <span style="color:${FAINT};font-size:10px;display:block">${esc(t.avg)}</span></span></div>`).join('')}`) : ''

    // Page 3
    const p3 = dynamo.length ? pageWrap('PAGE 3 / 4 — DYNAMO STRENGTH & SYMMETRY', `
      <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:24px">Strength & Limb Symmetry</div>
      <div style="color:${MUTED};font-size:13px;margin:4px 0 20px">DynaMo bilateral force testing — Left vs Right, expressed as Limb Symmetry Index (LSI)</div>
      <div style="display:flex;gap:16px;justify-content:center">
        ${dynamo.map(d=>`<div style="flex:1;text-align:center">
          <div style="font-family:'Space Grotesk',Arial;font-weight:700;color:${INK};margin-bottom:10px">${esc(d.joint)}</div>
          ${engineScored && d.lsi == null ? `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:11px;color:${FAINT}">NO LSI<br>(both sides needed)</div>` : ringSvg(d.lsi ?? 0)}
          <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:11px;color:${FAINT};margin:8px 10px 0">
            <span>LEFT<br><b style="color:${MUTED}">${esc(d.left)}</b></span><span>RIGHT<br><b style="color:${MUTED}">${esc(d.right)}</b></span></div>
          <span style="display:inline-block;margin-top:10px;font-family:monospace;font-size:10px;color:${engineScored ? statusColor(d.status) : TEAL};border:1px solid ${engineScored ? statusColor(d.status) : TEAL};border-radius:4px;padding:2px 8px 10px">${esc(d.status)}</span>
        </div>`).join('')}
      </div>
      <div style="border-left:3px solid ${ORANGE};padding-left:16px;margin-top:26px;display:flex;gap:24px">
        <div style="flex:1"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">LOWEST SYMMETRY SCORE</div><div style="color:${INK};font-size:13px;margin-top:6px">${esc(ss.lowest||'')}</div></div>
        <div style="flex:1"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">FLAG</div><div style="color:${INK};font-size:13px;margin-top:6px">${esc(ss.flag||'')}</div></div>
        <div style="flex:1"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">RECOMMENDATION</div><div style="color:${INK};font-size:13px;margin-top:6px">${esc(ss.recommendation||'')}</div></div>
      </div>
      ${(rc.movementScreen||[]).length ? `<div style="margin-top:22px"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">HUMANTRAK MOVEMENT SCREEN</div>
        ${rc.movementScreen.map((m,i)=>`<div style="display:flex;align-items:center;gap:16px;padding:8px 0;${i?`border-top:1px solid ${BORDER}`:''}">
          <span style="flex:0 0 200px;font-size:13px;color:${INK}">${esc(m.test)}${m.feedsOvr?'':`<span style="color:${FAINT};font-size:11px"> · flag only</span>`}</span>${barOr(m.score, m.status==='completed'?'Not tested':m.result)}
          <span style="width:26px;text-align:right;font-family:'Space Grotesk',Arial;font-weight:700;color:${INK}">${num(m.score)}</span>
          <span style="flex:0 0 150px;text-align:right;font-family:monospace">${m.status==='completed'?`<span style="color:${ORANGE};font-weight:700;font-size:12px">${esc(m.result)}</span>`:''}<span style="color:${FAINT};font-size:10px;display:block">${esc(m.band)}</span></span></div>`).join('')}</div>` : ''}
      ${(rc.flags||[]).length ? `<div style="margin-top:18px"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">AREAS TO WORK ON</div>
        ${rc.flags.map(f=>`<div style="margin-top:6px;font-size:12px;color:${INK}"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${f.level==='red'?RED:AMBER};margin-right:8px"></span><b>${esc(f.test)}</b>${f.note?` — ${esc(f.note)}`:''}</div>`).join('')}</div>` : ''}
      ${engineScored && rc.benchmarkNote ? `<div style="color:${FAINT};font-size:10px;margin-top:14px">${esc(rc.benchmarkNote)}</div>` : ''}`) : ''

    // Page 4
    const p4 = (fm.stats||[]).length ? pageWrap('PAGE 4 / 4 — WHAT THIS MEANS ON THE FIELD', `
      <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:24px">What This Means On The Field</div>
      <div style="color:${MUTED};font-size:13px;margin:4px 0 18px">${esc(rc.sport||'')}-specific translation of the six OVR stats — how this profile shows up in a match</div>
      <div style="display:flex;gap:16px;margin-bottom:20px">
        <div style="flex:1;border-left:3px solid ${ORANGE};padding-left:14px"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">PLAYER PROFILE</div><div style="color:${INK};font-size:15px;font-weight:600;margin-top:6px">${esc(fm.playerProfile||'')}</div></div>
        <div style="flex:1"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">DEVELOPMENT PRIORITY</div><div style="color:${ORANGE};font-size:18px;font-weight:700;font-family:'Space Grotesk',Arial;margin-top:6px">${esc(fm.developmentPriority||'')}</div></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:20px">
        ${fm.stats.map(s=>`<div style="flex:0 0 46%">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="display:flex;align-items:center;gap:8px"><span style="width:14px;height:8px;border-radius:4px;background:${tagColor(s.tag)};display:inline-block"></span><b style="color:${INK};font-family:'Space Grotesk',Arial">${esc(s.name)}</b></span>
            <span style="font-family:monospace;font-size:10px;color:${tagColor(s.tag)};border:1px solid ${tagColor(s.tag)};border-radius:4px;padding:2px 7px 10px">${esc(s.tag)}</span></div>
          <div style="font-family:monospace;font-size:11px;color:${FAINT};margin:0 0 6px 22px">${s.score == null ? 'Not tested this session' : `Score: ${s.score}/100`}</div>
          <p style="color:${MUTED};font-size:13px;line-height:1.5;margin:0 0 0 22px">${esc(s.body)}</p></div>`).join('')}
      </div>`) : ''


    const element = document.createElement('div')
    element.innerHTML = p1 + p2 + p3 + p4
    const filename = `PeakPerformance_${(report.athleteName || 'Athlete').replace(/[^a-zA-Z0-9]/g, '_')}_${(report.testDate || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    await html2pdf().set({
      margin: 0, filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: BG, logging: false },
      jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }).from(element).save()
  } catch (error) {
    throw new Error(`Failed to download report: ${error.message}`)
  }
}

export const extractProfile = async (files) => {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  return api.post('/report/extract', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const getAllReports = () => api.get('/report')
export const deleteReport = (reportId) => api.delete(`/report/${reportId}`)

export const getExercises = () => api.get('/exercises')
export const addExercise = data => api.post('/exercises', data)
export const updateExercise = (id, data) => api.put(`/exercises/${id}`, data)
export const deleteExercise = id => api.delete(`/exercises/${id}`)

export const getParameters = () => api.get('/parameters')
export const saveParameters = data => api.post('/parameters', data)