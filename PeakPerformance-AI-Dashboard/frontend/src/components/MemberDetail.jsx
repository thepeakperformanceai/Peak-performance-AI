import React, { useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Download } from "lucide-react";

export default function MemberDetail({ member, loading }) {
  const detailRef = useRef(null);

  const handleGeneratePDF = async () => {
    if (!detailRef.current) return;
    try {
      const canvas = await html2canvas(detailRef.current, {
        backgroundColor: "#06090e",
        scale: 2
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${member.name.toLowerCase().replace(/\s+/g, "_")}_testing_report.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      window.print();
    }
  };

  if (loading) {
    return (
      <section className="mb-5 p-5 text-center font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px" }}>
        Loading member details...
      </section>
    );
  }

  if (!member) return null;

  const history = member.history || [];
  const workoutSplit = member.workoutSplit || [];
  const latestSessionIndex = history.length - 1;

  return (
    <section className="mb-5" ref={detailRef}>
      {/* Section Tag */}
      <div 
        className="text-uppercase font-ibm-mono fw-semibold mb-2 d-flex align-items-center gap-2" 
        style={{ color: "#ff4b12", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "1px" }}
      >
        <span>&mdash;&mdash;</span>
        <span>MEMBER DETAIL</span>
      </div>

      {/* Header & PDF Button Row */}
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h2 className="fw-bold mb-2 font-space" style={{ fontSize: "1.5rem", color: "#E9EEF2", fontFamily: "'Space Grotesk', sans-serif" }}>
            {member.name}
          </h2>
          <p className="mb-0 font-inter" style={{ color: "#8b99a6", maxWidth: "600px", fontSize: "13.5px", lineHeight: "1.5", fontFamily: "'Inter', sans-serif" }}>
            Full session history and a straight comparison of this member against their own past sessions
            <br />— no benchmark or cohort data mixed in.
          </p>
        </div>

        <button
          onClick={handleGeneratePDF}
          className="btn btn-generate-pdf font-ibm-mono rounded-3 d-flex align-items-center gap-2 px-3 py-2"
          style={{ 
            fontFamily: "'IBM Plex Mono', monospace", 
            fontWeight: "700",
            fontSize: "12.5px",
            color: "#0A0E13",
            backgroundColor: "#ff4b12",
            whiteSpace: "nowrap",
            WebkitTextStroke: "0.5px #0A0E13"
          }}
        >
          <Download size={14} strokeWidth={3} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: "700", fontSize: "12.5px", WebkitTextStroke: "0.1px #0A0E13" }}>Generate PDF</span>
        </button>
      </div> 

      {/* Outer Card Container matching Squad Comparison */}
      <div 
        className="dashboard-card p-4 overflow-hidden shadow-lg mb-4"
        style={{ backgroundColor: "#0b141f", border: "1px solid #162436", borderRadius: "16px" }}
      >
        {/* Main Grid: Left Bio Card + Right Content */}
        <div className="row g-4">
          {/* Left Column: Bio Card */}
          <div className="col-12 col-lg-3">
            <div 
              className="p-4"
              style={{ backgroundColor: "#0e1823", border: "1px solid #172333", borderRadius: "12px", width: "fit-content", minWidth: "100%" }}
            >
              <h4 className="fw-bold mb-1 font-space" style={{ fontSize: "1.1rem", color: "#E9EEF2", fontFamily: "'Space Grotesk', sans-serif" }}>
                {member.name}
              </h4>
              <div className="fw-semibold mb-4 font-space" style={{ color: "#ff4b12", fontSize: "0.9rem", fontFamily: "'Space Grotesk', sans-serif" }}>
                {member.sport}
              </div>

              <div className="d-flex flex-column gap-0 font-ibm-mono" style={{ fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>
                <div className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: "1px solid #172333" }}>
                  <span style={{ color: "#5a6875" }}>Sex</span>
                  <span className="fw-semibold" >{member.sex}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: "1px solid #172333" }}>
                  <span style={{ color: "#5a6875" }}>Age</span>
                  <span className="fw-semibold" >{member.age}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: "1px solid #172333" }}>
                  <span style={{ color: "#5a6875" }}>Sport</span>
                  <span className="fw-bold" >{member.sport}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: "1px solid #172333" }}>
                  <span style={{ color: "#5a6875" }}>Sessions</span>
                  <span className="fw-semibold" >{member.sessions}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-2">
                  <span style={{ color: "#5a6875" }}>Last tested</span>
                  <span className="fw-bold">{member.lastTestedFull || member.lastTested}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Session Comparison Charts, History Table, Workout Split */}
          <div className="col-12 col-lg-9 d-flex flex-column gap-4">

            {/* Box 1: Session Comparison Bar Charts */}
            <div 
              className="p-4"
              style={{ backgroundColor: "#0e1823", border: "1px solid #172333", borderRadius: "12px" }}
            >
              <div 
                className="font-ibm-mono text-uppercase mb-4" 
                style={{ color: "#5a6875", fontSize: "11.5px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "1px" }}
              >
                SESSION COMPARISON &mdash; S1 &rarr; S{history.length}
              </div>

              <div className="row g-3">
                {/* CMJ Height */}
                <div className="col-6 col-md-3">
                  <div className="font-inter mb-3" style={{ color: "#8b99a6", fontSize: "11px", fontFamily: "'Inter', sans-serif" }}>CMJ Height (cm)</div>
                  <div className="d-flex align-items-end gap-1" style={{ height: "100px", paddingBottom: "4px", borderBottom: "1px solid #172333" }}>
                    {history.map((h, i) => {
                      const isLatest = i === latestSessionIndex;
                      const heightPct = Math.min((h.cmj / 45) * 100, 100);
                      return (
                        <div key={i} className="d-flex flex-column align-items-center flex-fill h-100 justify-content-end">
                          <div className="font-ibm-mono mb-1" style={{ color: "#8b99a6", fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.cmj}</div>
                          <div className="w-100 rounded-top-1" style={{ height: `${heightPct}%`, backgroundColor: isLatest ? "#ff4b12" : "#1c2e42", transition: "all 0.3s ease" }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="d-flex justify-content-between font-ibm-mono mt-1" style={{ color: "#5a6875", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {history.map((_, i) => <span key={i} className="flex-fill text-center">S{i + 1}</span>)}
                  </div>
                </div>

                {/* Hip Flexion ROM */}
                <div className="col-6 col-md-3">
                  <div className="font-inter mb-3" style={{ color: "#8b99a6", fontSize: "11px", fontFamily: "'Inter', sans-serif" }}>Hip Flexion ROM (&deg;)</div>
                  <div className="d-flex align-items-end gap-1" style={{ height: "100px", paddingBottom: "4px", borderBottom: "1px solid #172333" }}>
                    {history.map((h, i) => {
                      const isLatest = i === latestSessionIndex;
                      const heightPct = Math.min((h.hipFlexion / 140) * 100, 100);
                      return (
                        <div key={i} className="d-flex flex-column align-items-center flex-fill h-100 justify-content-end">
                          <div className="font-ibm-mono mb-1" style={{ color: "#8b99a6", fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.hipFlexion}</div>
                          <div className="w-100 rounded-top-1" style={{ height: `${heightPct}%`, backgroundColor: isLatest ? "#ff4b12" : "#1c2e42", transition: "all 0.3s ease" }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="d-flex justify-content-between font-ibm-mono mt-1" style={{ color: "#5a6875", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {history.map((_, i) => <span key={i} className="flex-fill text-center">S{i + 1}</span>)}
                  </div>
                </div>

                {/* Grip Strength */}
                <div className="col-6 col-md-3">
                  <div className="font-inter mb-3" style={{ color: "#8b99a6", fontSize: "11px", fontFamily: "'Inter', sans-serif" }}>Grip Strength (kg)</div>
                  <div className="d-flex align-items-end gap-1" style={{ height: "100px", paddingBottom: "4px", borderBottom: "1px solid #172333" }}>
                    {history.map((h, i) => {
                      const isLatest = i === latestSessionIndex;
                      const heightPct = Math.min((h.grip / 50) * 100, 100);
                      return (
                        <div key={i} className="d-flex flex-column align-items-center flex-fill h-100 justify-content-end">
                          <div className="font-ibm-mono mb-1" style={{ color: "#8b99a6", fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.grip}</div>
                          <div className="w-100 rounded-top-1" style={{ height: `${heightPct}%`, backgroundColor: isLatest ? "#ff4b12" : "#1c2e42", transition: "all 0.3s ease" }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="d-flex justify-content-between font-ibm-mono mt-1" style={{ color: "#5a6875", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {history.map((_, i) => <span key={i} className="flex-fill text-center">S{i + 1}</span>)}
                  </div>
                </div>

                {/* Landing Asymmetry */}
                <div className="col-6 col-md-3">
                  <div className="font-inter mb-3" style={{ color: "#8b99a6", fontSize: "11px", fontFamily: "'Inter', sans-serif" }}>Landing Asymmetry (%)</div>
                  <div className="d-flex align-items-end gap-1" style={{ height: "100px", paddingBottom: "4px", borderBottom: "1px solid #172333" }}>
                    {history.map((h, i) => {
                      const isLatest = i === latestSessionIndex;
                      const heightPct = Math.min((h.asym / 25) * 100, 100);
                      return (
                        <div key={i} className="d-flex flex-column align-items-center flex-fill h-100 justify-content-end">
                          <div className="font-ibm-mono mb-1" style={{ color: "#8b99a6", fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.asym}</div>
                          <div className="w-100 rounded-top-1" style={{ height: `${heightPct}%`, backgroundColor: isLatest ? "#ff4b12" : "#1c2e42", transition: "all 0.3s ease" }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="d-flex justify-content-between font-ibm-mono mt-1" style={{ color: "#5a6875", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {history.map((_, i) => <span key={i} className="flex-fill text-center">S{i + 1}</span>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Box 2: Session History Table */}
            <div 
              className="overflow-hidden"
              style={{ backgroundColor: "#0e1823", border: "1px solid #172333", borderRadius: "12px" }}
            >
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead>
                    <tr style={{ color: "#5a6875", borderBottom: "1px solid #172333", fontSize: "12px", letterSpacing: "1px" }}>
                      <th className="ps-4 py-3 text-uppercase font-ibm-mono" style={{ color: "#5a6875", fontSize: "12px" }}>Session</th>
                      <th className="py-3 text-uppercase font-ibm-mono" style={{ color: "#5a6875", fontSize: "12px" }}>Date</th>
                      <th className="py-3 text-uppercase font-ibm-mono" style={{ color: "#5a6875", fontSize: "12px" }}>CMJ Height</th>
                      <th className="py-3 text-uppercase font-ibm-mono" style={{ color: "#5a6875", fontSize: "12px" }}>Hip Flexion ROM</th>
                      <th className="py-3 text-uppercase font-ibm-mono" style={{ color: "#5a6875", fontSize: "12px" }}>Grip Strength</th>
                      <th className="pe-4 py-3 text-uppercase font-ibm-mono" style={{ color: "#5a6875", fontSize: "12px" }}>Landing Asym.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #132030" }}>
                        <td className="ps-4 py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.session}</td>
                        <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.date}</td>
                        <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.cmj} cm</td>
                        <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.hipFlexion}&deg;</td>
                        <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.grip} kg</td>
                        <td className="pe-4 py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{h.asym}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Box 3: Current Workout Split */}
            <div 
              style={{ backgroundColor: "#0e1823", border: "1px solid #172333", borderRadius: "12px", overflow: "hidden" }}
            >
              {/* Header */}
              <div 
                className="px-4 pt-4 pb-3 font-ibm-mono text-uppercase" 
                style={{ color: "#5a6875", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "1px" }}
              >
                CURRENT WORKOUT SPLIT &mdash; {member.sport.toUpperCase()}
              </div>

              {/* Rows with separators */}
              <div className="d-flex flex-column">
                {workoutSplit.map((ws, i) => (
                  <div 
                    key={i} 
                    className="d-flex align-items-center px-4 py-3"
                    style={{ borderTop: "1px solid #172333" }}
                  >
                    <span
                      className="font-ibm-mono fw-bold flex-shrink-0"
                      style={{
                        color: "#ff4b12",
                        fontSize: "11.5px",
                        minWidth: "44px",
                        fontFamily: "'IBM Plex Mono', monospace",
                        letterSpacing: "0.5px"
                      }}
                    >
                      {ws.day}
                    </span>
                    <span 
                      className="fw-bold font-space flex-shrink-0" 
                      style={{ color: "#e9eef2", fontSize: "13.5px", fontFamily: "'Space Grotesk', sans-serif", minWidth: "200px" }}
                    >
                      {ws.title}
                    </span>
                    <span 
                      className="font-inter" 
                      style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'Inter', sans-serif" }}
                    >
                      {ws.details}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Footer Text inside Outer Box */}
        <div 
          className="mt-4 pt-2 font-ibm-mono" 
          style={{ color: "#5a6875", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", lineHeight: "1.6" }}
        >
          members &middot; test_sessions &middot; test_results &mdash; no roles, no cohort logic, no funnel. Just what was
          <br />
          tested, shown back clearly, session over session.
        </div>
      </div>
    </section>
  );
}