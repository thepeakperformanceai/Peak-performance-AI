import React, { useRef } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Download } from 'lucide-react'

export default function MemberDetail({ member, loading }) {
  const detailRef = useRef(null)

  const handleGeneratePDF = async () => {
    if (!detailRef.current) return
    try {
      const canvas = await html2canvas(detailRef.current, {
        backgroundColor: '#0A0A0C',
        scale: 2,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`${member.name.toLowerCase().replace(/\s+/g, '_')}_testing_report.pdf`)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      window.print()
    }
  }

  if (loading) {
    return (
      <section className="p-12 text-center font-label-caps text-xl text-chalk-dim uppercase">
        Loading member details…
      </section>
    )
  }

  if (!member) return null

  const history = member.history || []
  const workoutSplit = member.workoutSplit || []
  const latestSessionIndex = history.length - 1

  return (
    <section ref={detailRef}>
      <div className="font-label-caps text-xl text-chalk-dim uppercase mb-2">-- MEMBER DETAIL</div>

      <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-chalk font-bold mb-2">{member.name}</h2>
          <p className="font-body-sm text-body-sm text-chalk-dim max-w-xl mb-0">
            Full session history and a straight comparison of this member against their own past sessions — no benchmark
            or cohort data mixed in.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGeneratePDF}
          className="bg-ignite-orange text-void font-button-text text-button-text uppercase px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity shrink-0"
        >
          <Download size={14} strokeWidth={3} />
          Generate PDF
        </button>
      </div>

      <div className="bg-surface border border-surface-variant rounded-lg p-6 md:p-8 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Bio card */}
          <div className="lg:col-span-3">
            <div className="bg-surface-container-lowest border border-surface-variant rounded-lg p-6">
              <h4 className="font-headline-md text-headline-md text-chalk font-bold mb-1">{member.name}</h4>
              <div className="font-headline-md text-ignite-orange mb-6">{member.sport}</div>
              <div className="flex flex-col font-mono text-body-sm">
                {[
                  ['Sex', member.sex],
                  ['Age', member.age],
                  ['Sport', member.sport],
                  ['Sessions', member.sessions],
                  ['Last tested', member.lastTestedFull || member.lastTested],
                ].map(([label, value], i, arr) => (
                  <div
                    key={label}
                    className={`flex justify-between py-2 ${i < arr.length - 1 ? 'border-b border-surface-variant' : ''}`}
                  >
                    <span className="text-chalk-dim">{label}</span>
                    <span className="text-chalk font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-9 flex flex-col gap-6">
            {/* Session comparison charts */}
            <div className="bg-surface-container-lowest border border-surface-variant rounded-lg p-6">
              <div className="font-label-caps text-xl text-chalk-dim uppercase mb-6">
                Session Comparison — S1 → S{history.length}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'CMJ Height (cm)', key: 'cmj', max: 45 },
                  { label: 'Hip Flexion ROM (°)', key: 'hipFlexion', max: 140 },
                  { label: 'Grip Strength (kg)', key: 'grip', max: 50 },
                  { label: 'Landing Asymmetry (%)', key: 'asym', max: 25 },
                ].map(({ label, key, max }) => (
                  <div key={key}>
                    <div className="font-body-sm text-chalk-dim mb-3">{label}</div>
                    <div className="flex items-end gap-1 h-24 border-b border-surface-variant">
                      {history.map((h, i) => {
                        const isLatest = i === latestSessionIndex
                        const heightPct = Math.min((h[key] / max) * 100, 100)
                        return (
                          <div key={i} className="flex flex-col items-center flex-1 h-full justify-end">
                            <div className="font-mono text-chalk-dim text-xs mb-1">{h[key]}</div>
                            <div
                              className={`w-full rounded-t ${isLatest ? 'bg-ignite-orange' : 'bg-surface-container-high'}`}
                              style={{ height: `${heightPct}%`, minHeight: h[key] > 0 ? '2px' : 0 }}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between font-mono text-chalk-dim text-xs mt-1">
                      {history.map((_, i) => (
                        <span key={i} className="flex-1 text-center">
                          S{i + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Session history table */}
            <div className="border border-surface-variant rounded-lg overflow-hidden">
              <div className="grid grid-cols-6 gap-2 p-4 border-b border-surface-variant bg-surface-container-lowest font-label-caps text-xl text-chalk-dim uppercase text-xs">
                <div>Session</div>
                <div>Date</div>
                <div>CMJ Height</div>
                <div>Hip Flexion ROM</div>
                <div>Grip Strength</div>
                <div>Landing Asym.</div>
              </div>
              {history.map((h, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-6 gap-2 p-4 border-b border-surface-variant last:border-b-0 bg-surface font-mono text-body-sm text-chalk-dim"
                >
                  <div>{h.session}</div>
                  <div>{h.date}</div>
                  <div>{h.cmj} cm</div>
                  <div>{h.hipFlexion}°</div>
                  <div>{h.grip} kg</div>
                  <div>{h.asym}%</div>
                </div>
              ))}
            </div>

            {/* Workout split */}
            <div className="border border-surface-variant rounded-lg overflow-hidden">
              <div className="px-6 pt-6 pb-4 font-label-caps text-xl text-chalk-dim uppercase">
                Current Workout Split — {member.sport.toUpperCase()}
              </div>
              {workoutSplit.map((ws, i) => (
                <div key={i} className="flex flex-wrap items-center gap-4 px-6 py-4 border-t border-surface-variant">
                  <span className="font-label-caps text-xl text-ignite-orange min-w-[44px]">{ws.day}</span>
                  <span className="font-headline-md text-body-sm text-chalk font-bold min-w-[160px]">{ws.title}</span>
                  <span className="font-body-sm text-chalk-dim">{ws.details}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 font-mono text-body-sm text-chalk-dim mb-0">
          members · test_sessions · test_results — no roles, no cohort logic, no funnel. Just what was tested, shown back
          clearly, session over session.
        </p>
      </div>
    </section>
  )
}
