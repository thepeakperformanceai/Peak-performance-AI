import axios from 'axios'
import html2pdf from 'html2pdf.js'
import { clearAuthToken, getAuthToken } from '../utils/auth'

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

export const downloadReportPDF = async reportId => {
  try {
    const response = await api.get(`/report/${reportId}/export`)
    const { report } = response
    const rc = report?.reportContent || {}

    const ORANGE = '#ff4b12', INK = '#f2f4f7', MUTED = '#9aa7b4', FAINT = '#5b6b7c'
    const PANEL = '#0e0f11', BORDER = '#22242a', TRACK = '#1c1e22', TEAL = '#39d0c8', BG = '#0a0b0d'
    const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const bar = (score) => `<div style="flex:1;height:15px;background:${TRACK};border-radius:4px;overflow:hidden"><div style="width:${score}%;height:100%;background:${ORANGE};border-radius:4px"></div></div>`
    const tagColor = (t) => t==='STRENGTH'?TEAL:t==='PRIORITY'?ORANGE:'#f6c667'
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
      const cx=180,cy=150,R=100, order=['Speed','Agility','Power','Endurance','Reaction','Balance']
      const ang=[0,-60,-120,180,120,60].map(d=>d*Math.PI/180)
      const pt=(i,r)=>[cx+Math.cos(ang[i])*R*r, cy+Math.sin(ang[i])*R*r]
      const val=(n)=>(ovr.find(s=>s.name===n)?.score??0)/100
      const ring=(r)=>order.map((_,i)=>pt(i,r).join(',')).join(' ')
      const poly=order.map((n,i)=>pt(i,val(n)).join(',')).join(' ')
      const lab={Speed:[cx+R+30,cy+4],Agility:pt(1,1.34),Power:pt(2,1.34),Endurance:[cx-R-34,cy+4],Reaction:pt(4,1.34),Balance:pt(5,1.34)}
      return `<svg viewBox="0 0 360 300" width="360" height="300">
        ${[0.25,0.5,0.75,1].map(r=>`<polygon points="${ring(r)}" fill="none" stroke="#2a2d33"/>`).join('')}
        ${order.map((_,i)=>{const[x,y]=pt(i,1);return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#2a2d33"/>`}).join('')}
        <polygon points="${poly}" fill="${ORANGE}33" stroke="${ORANGE}" stroke-width="2.5"/>
        ${order.map(n=>{const[x,y]=pt(order.indexOf(n),val(n));return `<circle cx="${x}" cy="${y}" r="4" fill="${ORANGE}"/>`}).join('')}
        <text x="${cx}" y="${cy-4}" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="44" fill="${ORANGE}">${overall}</text>
        <text x="${cx}" y="${cy+16}" text-anchor="middle" font-family="monospace" font-size="10" fill="${FAINT}">OVERALL OVR</text>
        ${order.map(n=>{const[x,y]=lab[n];const anc=n==='Endurance'?'start':n==='Speed'?'end':'middle';return `<text x="${x}" y="${y}" text-anchor="${anc}" font-size="12" fill="${MUTED}">${n}</text>`}).join('')}</svg>`
    }
    const ringSvg = (lsi) => { const c=2*Math.PI*52, dash=(lsi/100)*c
      return `<svg viewBox="0 0 130 130" width="120" height="120">
        <circle cx="65" cy="65" r="52" fill="none" stroke="${TRACK}" stroke-width="12"/>
        <circle cx="65" cy="65" r="52" fill="none" stroke="${TEAL}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 65 65)"/>
        <text x="65" y="63" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="22" fill="${TEAL}">${lsi}%</text>
        <text x="65" y="80" text-anchor="middle" font-family="monospace" font-size="9" fill="${FAINT}">LSI</text></svg>`
    }

    const ovr=rc.ovrScores||[], battery=rc.manualBattery||[], dynamo=rc.dynamoStrength||[], ss=rc.symmetrySummary||{}, fm=rc.fieldMeaning||{}
    const p1 = pageWrap('PAGE 1 / 4 — OVR CARD', `
      <div style="display:flex;gap:30px;align-items:center">
        <div style="flex:0 0 300px;text-align:center">${hexSvg(ovr, rc.overallOVR ?? 0)}</div>
        <div style="flex:1">
          <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:34px">${esc(report.athleteName)}</div>
          <div style="color:${MUTED};font-size:14px;margin:6px 0 14px">${esc([rc.sport,rc.position].filter(Boolean).join(' — '))} · ${esc(rc.batteryLabel||'')}</div>
          <div style="font-family:monospace;font-size:12px;color:${FAINT};margin-bottom:16px">
            ${rc.age!=null?`AGE <b style="color:${INK}">${esc(rc.age)}</b>&nbsp;&nbsp;&nbsp;`:''}${rc.sport?`SPORT <b style="color:${INK}">${esc(rc.sport)}</b>&nbsp;&nbsp;&nbsp;`:''}${rc.testDate?`SESSION <b style="color:${INK}">${esc(rc.testDate)}</b>`:''}</div>
          ${ovr.map(s=>`<div style="display:flex;align-items:center;margin-bottom:11px"><span style="flex:0 0 96px;font-size:14px;color:${INK}">${esc(s.name)}</span><span style="flex:1;display:flex;align-items:center">${bar(s.score)}</span><span style="flex:0 0 34px;text-align:right;font-family:'Space Grotesk',Arial;font-weight:700;font-size:15px;color:${INK}">${s.score}</span></div>`).join('')}
        </div></div>`)
    const p2 = battery.length ? pageWrap('PAGE 2 / 4 — MANUAL TEST BATTERY', `
      <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:24px;margin-bottom:18px">Manual Test Battery</div>
      ${battery.map((t,i)=>`<div style="display:flex;align-items:center;padding:11px 0;${i?`border-top:1px solid ${BORDER}`:''}"><span style="flex:0 0 210px;font-size:13px;color:${INK}">${esc(t.test)}</span><span style="flex:1;display:flex;align-items:center;padding-right:16px">${bar(t.score)}</span><span style="flex:0 0 34px;text-align:right;font-family:'Space Grotesk',Arial;font-weight:700;font-size:15px;color:${INK}">${t.score}</span><span style="flex:0 0 130px;text-align:right;font-family:monospace;padding-left:16px"><span style="color:${ORANGE};font-weight:700;font-size:13px">${esc(t.raw)}</span><span style="color:${FAINT};font-size:10px;display:block">${esc(t.avg)}</span></span></div>`).join('')}`) : ''
    const p3 = dynamo.length ? pageWrap('PAGE 3 / 4 — DYNAMO STRENGTH & SYMMETRY', `
      <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:24px">Strength & Limb Symmetry</div>
      <div style="color:${MUTED};font-size:13px;margin:4px 0 20px">DynaMo bilateral force testing — Left vs Right, expressed as Limb Symmetry Index (LSI)</div>
      <div style="display:flex;gap:24px;justify-content:center">${dynamo.map(d=>`<div style="flex:1 1 0;max-width:280px;text-align:center;display:flex;flex-direction:column;align-items:center"><div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:15px;color:${INK};margin-bottom:12px">${esc(d.joint)}</div>${ringSvg(d.lsi??0)}<div style="display:flex;justify-content:space-between;width:100%;max-width:200px;font-family:monospace;font-size:11px;color:${FAINT};margin:12px 0 0"><span style="text-align:left">LEFT<br><b style="color:${MUTED};font-size:12px">${esc(d.left)}</b></span><span style="text-align:right">RIGHT<br><b style="color:${MUTED};font-size:12px">${esc(d.right)}</b></span></div><span style="display:inline-block;margin-top:12px;font-family:monospace;font-size:10px;color:${TEAL};border:1px solid ${TEAL};border-radius:4px;padding:3px 10px">${esc(d.status)}</span></div>`).join('')}</div>
      <div style="border-left:3px solid ${ORANGE};padding-left:16px;margin-top:26px;display:flex;gap:24px">
        <div style="flex:1"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">LOWEST SYMMETRY SCORE</div><div style="color:${INK};font-size:13px;margin-top:6px">${esc(ss.lowest||'')}</div></div>
        <div style="flex:1"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">FLAG</div><div style="color:${INK};font-size:13px;margin-top:6px">${esc(ss.flag||'')}</div></div>
        <div style="flex:1"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">RECOMMENDATION</div><div style="color:${INK};font-size:13px;margin-top:6px">${esc(ss.recommendation||'')}</div></div></div>`) : ''
    const p4 = (fm.stats||[]).length ? pageWrap('PAGE 4 / 4 — WHAT THIS MEANS ON THE FIELD', `
      <div style="font-family:'Space Grotesk',Arial;font-weight:700;font-size:24px">What This Means On The Field</div>
      <div style="color:${MUTED};font-size:13px;margin:4px 0 18px">${esc(rc.sport||'')}-specific translation of the six OVR stats — how this profile shows up in a match</div>
      <div style="display:flex;gap:16px;margin-bottom:20px"><div style="flex:1;border-left:3px solid ${ORANGE};padding-left:14px"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">PLAYER PROFILE</div><div style="color:${INK};font-size:15px;font-weight:600;margin-top:6px">${esc(fm.playerProfile||'')}</div></div><div style="flex:1"><div style="font-family:monospace;font-size:10px;color:${FAINT};letter-spacing:1px">DEVELOPMENT PRIORITY</div><div style="color:${ORANGE};font-size:18px;font-weight:700;font-family:'Space Grotesk',Arial;margin-top:6px">${esc(fm.developmentPriority||'')}</div></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:20px 40px">${fm.stats.map(s=>`<div style="flex:0 0 calc(50% - 20px);box-sizing:border-box"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><span style="display:flex;align-items:center;gap:8px"><span style="width:14px;height:8px;border-radius:4px;background:${tagColor(s.tag)};display:inline-block"></span><b style="color:${INK};font-family:'Space Grotesk',Arial">${esc(s.name)}</b></span><span style="font-family:monospace;font-size:10px;color:${tagColor(s.tag)};border:1px solid ${tagColor(s.tag)};border-radius:4px;padding:2px 7px">${esc(s.tag)}</span></div><div style="font-family:monospace;font-size:11px;color:${FAINT};margin:0 0 6px 22px">Score: ${s.score}/100</div><p style="color:${MUTED};font-size:13px;line-height:1.5;margin:0 0 0 22px">${esc(s.body)}</p></div>`).join('')}</div>`) : ''

    const element = document.createElement('div')
    element.innerHTML = p1 + p2 + p3 + p4
    const filename = `PeakPerformance_${(report.athleteName||'Athlete').replace(/[^a-zA-Z0-9]/g,'_')}_${(report.testDate||'').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`
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