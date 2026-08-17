import React from "react";

export default function SquadComparison({ 
  squadData, 
  sportFilter, 
  sexFilter, 
  onSportFilterChange, 
  onSexFilterChange, 
  loading 
}) {
  const sports = ["All", "Football", "Padel", "S&C"];
  const sexes = ["All", "M", "F"];

  const cmjBars = squadData?.groupAverages?.CMJ || [];
  const asymBars = squadData?.groupAverages?.Asymmetry || [];

  return (
    <section className="mb-5">
      {/* Section Tag */}
      <div 
        className="text-uppercase font-ibm-mono fw-semibold mb-1 d-flex align-items-center gap-2" 
        style={{ color: "#ff4b12", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "1px" }}
      >
        <span>&mdash;&mdash;</span>
        <span>SQUAD COMPARISON</span>
      </div>
      
      <h2 className="fw-bold text-white mb-2 font-space" style={{ fontSize: "1.5rem" }}>
        Compare Members
      </h2>
      <p 
        className="mb-4 font-inter" 
        style={{ color: "#8b99a6", maxWidth: "560px", fontSize: "13.5px", lineHeight: "1.5", fontFamily: "'Inter', sans-serif" }}
      >
        Filter by sport or sex to see how sub-groups are trending &mdash; same data, sliced the way a coach actually thinks about a squad.
      </p>

      {/* Outer Card Container */}
      <div 
        className="dashboard-card p-4 overflow-hidden shadow-lg"
        style={{ backgroundColor: "#0b141f", border: "1px solid #162436", borderRadius: "16px" }}
      >
        {/* Filter Pills Bar */}
        <div className="d-flex flex-wrap align-items-center gap-4 mb-4 pb-1">
          {/* Sport Filters */}
          <div className="d-flex align-items-center gap-2">
            <span 
              className="font-ibm-mono text-uppercase me-2" 
              style={{ color: "#5a6875", fontSize: "10.5px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "1px" }}
            >
              SPORT
            </span>
            {sports.map((sp) => {
              const active = sportFilter === sp;
              return (
                <button
                  key={sp}
                  onClick={() => onSportFilterChange(sp)}
                  className="btn btn-sm rounded-pill font-ibm-mono transition-all"
                  style={{
                    backgroundColor: active ? "rgba(84, 217, 196, 0.08)" : "#0f1a28",
                    color: active ? "#ff4b12" : "#8b99a6",
                    border: active ? "1px solid #ff4b12" : "1px solid #1b2d42",
                    padding: "4px 18px",
                    fontWeight: "500",
                    fontSize: "12.5px",
                    fontFamily: "'IBM Plex Mono', monospace"
                  }}
                >
                  {sp}
                </button>
              );
            })}
          </div>

          {/* Sex Filters */}
          <div className="d-flex align-items-center gap-2 ms-md-2">
            <span 
              className="font-ibm-mono text-uppercase me-2" 
              style={{ color: "#5a6875", fontSize: "10.5px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "1px" }}
            >
              SEX
            </span>
            {sexes.map((sx) => {
              const active = sexFilter === sx;
              return (
                <button
                  key={sx}
                  onClick={() => onSexFilterChange(sx)}
                  className="btn btn-sm rounded-pill font-ibm-mono transition-all"
                  style={{
                    backgroundColor: active ? "rgba(84, 217, 196, 0.08)" : "#0f1a28",
                    color: active ? "#ff4b12" : "#8b99a6",
                    border: active ? "1px solid #ff4b12" : "1px solid #1b2d42",
                    padding: "4px 16px",
                    fontWeight: "500",
                    fontSize: "12.5px",
                    fontFamily: "'IBM Plex Mono', monospace"
                  }}
                >
                  {sx}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4 KPI Summary Stat Cards */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <div className="p-3 rounded-3" style={{ backgroundColor: "#0e1a27", border: "1px solid #192a3e" }}>
              <div 
                className="font-ibm-mono text-uppercase mb-2" 
                style={{ color: "#5a6875", fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.5px" }}
              >
                MEMBERS
              </div>
              <div 
                className="font-ibm-mono" 
                style={{ color: "#e9eef2", fontSize: "21px", fontWeight: "600", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {loading ? "..." : squadData?.totalMembers ?? 0}
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="p-3 rounded-3" style={{ backgroundColor: "#0e1a27", border: "1px solid #192a3e" }}>
              <div 
                className="font-ibm-mono text-uppercase mb-2" 
                style={{ color: "#5a6875", fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.5px" }}
              >
                AVG CMJ HEIGHT
              </div>
              <div 
                className="font-ibm-mono d-flex align-items-baseline gap-2" 
                style={{ color: "#e9eef2", fontSize: "21px", fontWeight: "600", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <span>{loading ? "..." : squadData?.avgCMJ ?? "0.0"}</span>
                <span className="font-ibm-mono text-lowercase fw-normal" style={{ color: "#8b99a6", fontSize: "12.5px" }}>cm</span>
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="p-3 rounded-3" style={{ backgroundColor: "#0e1a27", border: "1px solid #192a3e" }}>
              <div 
                className="font-ibm-mono text-uppercase mb-2" 
                style={{ color: "#5a6875", fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.5px" }}
              >
                AVG GRIP STRENGTH
              </div>
              <div 
                className="font-ibm-mono d-flex align-items-baseline gap-2" 
                style={{ color: "#e9eef2", fontSize: "21px", fontWeight: "600", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <span>{loading ? "..." : squadData?.avgGrip ?? "0.0"}</span>
                <span className="font-ibm-mono text-lowercase fw-normal" style={{ color: "#8b99a6", fontSize: "12.5px" }}>kg</span>
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="p-3 rounded-3" style={{ backgroundColor: "#0e1a27", border: "1px solid #192a3e" }}>
              <div 
                className="font-ibm-mono text-uppercase mb-2" 
                style={{ color: "#5a6875", fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.5px" }}
              >
                AVG LANDING ASYM.
              </div>
              <div 
                className="font-ibm-mono d-flex align-items-baseline gap-2" 
                style={{ color: "#e9eef2", fontSize: "21px", fontWeight: "600", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <span>{loading ? "..." : squadData?.avgAsym ?? "0.0"}</span>
                <span className="font-ibm-mono fw-normal" style={{ color: "#8b99a6", fontSize: "12.5px" }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Group Averages by Sport Chart Block */}
        <div className="p-4 rounded-3 mb-4" style={{ backgroundColor: "#0e1925", border: "1px solid #18283a" }}>
          <div 
            className="font-ibm-mono text-uppercase mb-3" 
            style={{ color: "#5a6875", fontSize: "11.5px", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "1px" }}
          >
            GROUP AVERAGES BY SPORT (LATEST SESSION, ALL MEMBERS)
          </div>

          <div className="row g-4">
            {/* CMJ Height Bars */}
            <div className="col-12 col-md-6">
              <div 
                className="font-ibm-mono mb-3" 
                style={{ color: "#8b99a6", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Avg. CMJ Height (cm)
              </div>
              <div className="d-flex align-items-end justify-content-between gap-3 px-2" style={{ height: "110px", paddingBottom: "4px" }}>
                {cmjBars.map((b, idx) => {
                  const heightPercent = Math.min((b.value / 40) * 100, 100);
                  return (
                    <div key={idx} className="d-flex flex-column align-items-center flex-fill h-100 justify-content-end">
                      <div className="font-ibm-mono small mb-2" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{b.value}</div>
                      <div 
                        className="w-100 rounded-top-2" 
                        style={{ 
                          height: `${heightPercent}%`, 
                          backgroundColor: "#ff4b12",
                          transition: "height 0.4s ease"
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="d-flex justify-content-between font-ibm-mono mt-2 px-2" style={{ color: "#5a6875", fontSize: "10.5px", fontFamily: "'IBM Plex Mono', monospace" }}>
                {cmjBars.map((b, idx) => (
                  <div key={idx} className="flex-fill text-center">{b.shortName}</div>
                ))}
              </div>
            </div>

            {/* Landing Asymmetry Bars */}
            <div className="col-12 col-md-6">
              <div 
                className="font-ibm-mono mb-3" 
                style={{ color: "#8b99a6", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Avg. Landing Asymmetry (%)
              </div>
              <div className="d-flex align-items-end justify-content-between gap-3 px-2" style={{ height: "110px", paddingBottom: "4px" }}>
                {asymBars.map((b, idx) => {
                  const heightPercent = Math.min((b.value / 22) * 100, 100);
                  return (
                    <div key={idx} className="d-flex flex-column align-items-center flex-fill h-100 justify-content-end">
                      <div className="font-ibm-mono small mb-2" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{b.value}</div>
                      <div 
                        className="w-100 rounded-top-2" 
                        style={{ 
                          height: `${heightPercent}%`, 
                          backgroundColor: "#ff4b12",
                          transition: "height 0.4s ease"
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="d-flex justify-content-between font-ibm-mono mt-2 px-2" style={{ color: "#5a6875", fontSize: "10.5px", fontFamily: "'IBM Plex Mono', monospace" }}>
                {asymBars.map((b, idx) => (
                  <div key={idx} className="flex-fill text-center">{b.shortName}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Squad Members Breakdown Table */}
        <div className="table-responsive rounded-3 overflow-hidden" style={{ border: "1px solid #162436" }}>
          <table className="table table-dark table-hover mb-0 align-middle">
            <thead>
              <tr style={{ color: "#5a6875", borderBottom: "1px solid #162436", fontSize: "10.5px", letterSpacing: "1px" }}>
                <th className="ps-4 py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#5a6875", fontSize: "10.5px" }}>Member</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#5a6875", fontSize: "11.5px" }}>Sex</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#5a6875", fontSize: "11.5px" }}>Age</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#5a6875", fontSize: "11.5px" }}>Sport</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#5a6875", fontSize: "11.5px" }}>Latest CMJ</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#5a6875", fontSize: "11.5px" }}>Latest Grip</th>
                <th className="pe-4 py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#5a6875", fontSize: "10.5px" }}>Latest Asym.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-4 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px" }}>
                    Filtering squad members...
                  </td>
                </tr>
              ) : squadData?.members?.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-4 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px" }}>
                    No members found matching selected filters.
                  </td>
                </tr>
              ) : (
                squadData?.members?.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #132030" }}>
                    <td 
                      className="ps-4 py-3 fw-bold font-space" 
                      style={{ color: "#E9EEF2", fontSize: "13.5px", fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {m.name}
                    </td>
                    <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{m.sex}</td>
                    <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{m.age}</td>
                    <td className="py-3 font-ibm-mono">
                      <span 
                        className="sport-pill font-ibm-mono"
                        style={{ 
                          backgroundColor: "#111d2c", 
                          border: "1px solid #1b2d42", 
                          color: "#8b99a6", 
                          padding: "3px 12px", 
                          borderRadius: "16px",
                          fontSize: "12.5px",
                          fontFamily: "'IBM Plex Mono', monospace" 
                        }}
                      >
                        {m.sport}
                      </span>
                    </td>
                    <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{m.latestCMJ} cm</td>
                    <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{m.latestGrip} kg</td>
                    <td className="pe-4 py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace" }}>{m.latestAsym}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}