import { useState } from 'react'
import { useReportStore } from '../store/reportStore'
import toast from 'react-hot-toast'
import { downloadReportPDF } from '../services/api'
import logo from "../assets/pplogo.png"

const STATUS_CONFIG = {
  priority:   { label: '❌ Priority',    badge: 'badge-red',    numBg: 'bg-red-50 text-red-700' },
  needs_work: { label: '⚠️ Needs work',  badge: 'badge-orange', numBg: 'bg-amber-50 text-amber-800' },
  good:       { label: '✅ Good',         badge: 'badge-green',  numBg: 'bg-green-50 text-green-800' },
  excellent:  { label: '✅ Excellent',    badge: 'badge-blue',   numBg: 'bg-blue-50 text-blue-800' },
}

export default function ReportPage() {
  const report = useReportStore(s => s.report)

  if (!report) return <EmptyState />

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <ReportHeader report={report} />
      <SummaryCards report={report} />
      <AreaSummary areaSummary={report.reportContent?.areaSummary} />
      <FindingsSection findings={report.reportContent?.findings} />
      <OnCourtSection onCourt={report.reportContent?.onCourt} />
      <TrainingPlan plan={report.reportContent?.trainingPlan} />
      <ReassessmentTargets targets={report.reportContent?.reassessmentTargets} />
    </div>
  )
}

function ReportHeader({ report }) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadReportPDF(report._id)
      toast.success('PDF downloaded!')
    } catch (err) {
      toast.error(err.message || 'Download failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-gray-900">{report.athleteName}</h2>
          <div className="flex flex-wrap gap-4 mt-2">
            {[
              { icon: '📅', val: report.testDate },
              { icon: '🏃', val: report.sport },
              { icon: '👤', val: `${report.age} years` },
              { icon: '🩺', val: report.practitioner },
            ].map(({ icon, val }) => (
              <span key={val} className="text-xs text-gray-500 flex items-center gap-1">
                {icon} {val}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button 
  onClick={() => {
    useReportStore.setState({ report: null })
    window.location.href = '/'
  }}
  className="btn text-xs"
>
  🔄 Re-generate
</button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn btn-primary text-xs"
          >
            {downloading ? '⏳' : '⬇'} Download PDF
          </button>
        </div>
      </div>

      {report.reportContent?.overallSummary && (
        <div className="mt-4 p-4 bg-pp-orangeLite rounded-xl border border-pp-orangeMid text-sm text-gray-700 leading-relaxed">
          {report.reportContent.overallSummary}
        </div>
      )}
    </div>
  )
}

function SummaryCards({ report }) {
  const cards = [
    { label: 'Areas to address', val: report.reportContent?.areasToAddress ?? '—', color: 'text-amber-700' },
    { label: 'Tests completed',  val: report.reportContent?.testsCompleted  ?? '—', color: 'text-pp-orange'  },
    { label: 'Jump height',      val: report.reportContent?.jumpHeight      ?? '—', color: 'text-pp-orange'  },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-xl p-4 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">{c.label}</p>
          <p className={`text-2xl font-semibold ${c.color}`}>{c.val}</p>
        </div>
      ))}
    </div>
  )
}

function FindingsSection({ findings = [] }) {
  const [open, setOpen] = useState(0)

  return (
    <div className="card">
      <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
        🔬 Test findings
      </h3>
      <div className="space-y-2">
        {findings.map((f, idx) => {
          const cfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.good
          const isOpen = open === idx
          return (
            <div key={idx} className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
                onClick={() => setOpen(isOpen ? -1 : idx)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${cfg.numBg}`}>
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium text-gray-900">{f.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cfg.badge}>{cfg.label}</span>
                  <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">{f.description}</p>
                  {f.metrics && f.metrics.length > 0 && (
                    <div className="overflow-x-auto mb-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-800 text-white">
                            {f.metrics[0].map((h, i) => (
                              <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {f.metrics.slice(1).map((row, ri) => (
                            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              {row.map((cell, ci) => (
                                <td key={ci} className="px-3 py-2 text-gray-700">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {f.exercises && f.exercises.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs font-medium text-gray-500 mr-1">Exercises:</span>
                      {f.exercises.map(ex => (
                        <span key={ex} className="text-xs bg-pp-orangeLite text-pp-orange px-2 py-0.5 rounded-md font-medium">
                          {ex}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AreaSummary({ areaSummary = [] }) {
  if (!areaSummary.length) return null
  const [header, ...rows] = areaSummary

  return (
    <div className="card">
      <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
        📊 Area summary
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-800 text-white">
              {header.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-gray-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OnCourtSection({ onCourt }) {
  const sections = onCourt?.sections || []
  if (!onCourt?.intro && !sections.length) return null

  return (
    <div className="card">
      <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
        🏟️ What this means on court
      </h3>
      {onCourt.intro && (
        <p className="text-sm text-gray-700 leading-relaxed mb-4">{onCourt.intro}</p>
      )}
      <div className="space-y-4">
        {sections.map((s, i) => (
          <div key={i} className="border-l-2 border-pp-orange pl-4">
            {s.title && <h4 className="text-sm font-semibold text-gray-900 mb-1">{s.title}</h4>}
            {s.body && <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>}
            {s.example && (
              <p className="text-sm text-gray-500 italic leading-relaxed mt-1">{s.example}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TrainingPlan({ plan }) {
  if (!plan) return null

  const priorities = plan.priorities || []
  const weeklySchedule = plan.weeklySchedule || []
  const legacyPhases = [
    { key: 'phase1', title: 'Phase 1 — Weeks 1–3: Build the foundation', color: 'bg-blue-50 text-blue-800' },
    { key: 'phase2', title: 'Phase 2 — Weeks 4–6: Load and progress',    color: 'bg-pp-orangeLite text-pp-orange' },
  ]
  const hasLegacy = priorities.length === 0 && legacyPhases.some(p => (plan[p.key] || []).length > 0)

  if (priorities.length === 0 && !hasLegacy && weeklySchedule.length === 0) return null

  return (
    <div className="card">
      <h3 className="text-sm font-medium text-gray-900 mb-4">🏋️ Training plan</h3>
      {plan.intro && (
        <p className="text-sm text-gray-600 leading-relaxed mb-4">{plan.intro}</p>
      )}

      {priorities.length > 0 && (
        <div className="space-y-3">
          {priorities.map((p, i) => (
            <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
              <div
                className="px-4 py-3 text-sm font-medium text-white"
                style={{ backgroundColor: p.color || '#1d4ed8' }}
              >
                {p.title}
              </div>
              <div className="px-4 py-3 bg-gray-50">
                {p.note && (
                  <p className="text-xs text-gray-600 leading-relaxed mb-3">{p.note}</p>
                )}
                {p.bullets?.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-gray-700 space-y-1 mb-3">
                    {p.bullets.map((b, bi) => <li key={bi}>{b}</li>)}
                  </ul>
                )}
                {p.exercises?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-200">
                          {['Exercise', 'Sets', 'Reps', 'Rest', 'Cues'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.exercises.map((ex, ei) => (
                          <tr key={ei} className={`border-b border-gray-100 ${ei % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="px-3 py-2 font-medium text-gray-800">{ex.name}</td>
                            <td className="px-3 py-2 text-gray-600">{ex.sets}</td>
                            <td className="px-3 py-2 text-gray-600">{ex.reps}</td>
                            <td className="px-3 py-2 text-gray-600">{ex.rest}</td>
                            <td className="px-3 py-2 text-gray-600 leading-relaxed">{ex.cues}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasLegacy && legacyPhases.map(phase => {
        const exercises = plan[phase.key] || []
        if (!exercises.length) return null
        return (
          <div key={phase.key} className="border border-gray-100 rounded-xl overflow-hidden mt-3">
            <div className={`px-4 py-3 text-sm font-medium ${phase.color}`}>
              {phase.title}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Exercise', 'Sets × reps', 'Load', 'Instructions'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exercises.map((ex, i) => (
                    <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-3 py-2.5 font-medium text-gray-800">{ex.name}</td>
                      <td className="px-3 py-2.5 text-gray-600">{ex.setsReps}</td>
                      <td className="px-3 py-2.5 text-gray-600">{ex.load}</td>
                      <td className="px-3 py-2.5 text-gray-600 leading-relaxed">{ex.instructions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {weeklySchedule.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2">Weekly schedule</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800 text-white">
                  {['Day', 'Focus', 'Exercises'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeklySchedule.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-medium text-gray-800">{row.day}</td>
                    <td className="px-3 py-2 text-gray-600">{row.focus}</td>
                    <td className="px-3 py-2 text-gray-600">{row.exercises}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {plan.progression && (
        <p className="text-xs text-gray-500 leading-relaxed mt-4 italic">{plan.progression}</p>
      )}
    </div>
  )
}

function ReassessmentTargets({ targets = [] }) {
  if (!targets.length) return null

  const priorityColor = {
    Critical: 'badge-red',
    High:     'badge-orange',
    Monitor:  'badge-green',
  }

  return (
    <div className="card">
      <h3 className="text-sm font-medium text-gray-900 mb-4">🎯 6-week reassessment targets</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-pp-orange text-white">
              {['Area', 'Current', '6-week target', 'Priority'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.map((t, i) => (
              <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="px-3 py-2.5 font-medium text-gray-800">{t.area}</td>
                <td className="px-3 py-2.5 text-gray-600">{t.current}</td>
                <td className="px-3 py-2.5 text-gray-600">{t.target}</td>
                <td className="px-3 py-2.5">
                  <span className={priorityColor[t.priority] || 'badge-green'}>
                    {t.priority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
      <div className="text-5xl text-gray-200">📋</div>
      <p className="text-sm font-medium text-gray-500">No report generated yet</p>
      <p className="text-xs text-gray-400">Upload VALD files and fill in athlete details to generate a report</p>
    </div>
  )
}