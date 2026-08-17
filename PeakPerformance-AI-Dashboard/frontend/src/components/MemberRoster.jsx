import React from "react";
import Logo from "./Logo";

export default function MemberRoster({ members, selectedMemberId, onSelectMember, loading }) {
  return (
    <div 
      className="dashboard-card overflow-hidden mb-5 shadow-lg"
      style={{ 
        backgroundColor: "#0e0f11", 
        border: "1px solid #26282c", 
        borderRadius: "12px" 
      }}
    >
      {/* Card Header with Logo Aligned Inline */}
      <div 
        className="card-header px-4 py-3 d-flex justify-content-between align-items-center"
        style={{ 
          backgroundColor: "#151619", 
          borderBottom: "1px solid #23252a" 
        }}
      >
        <div className="d-flex align-items-center gap-3">
          <Logo width={60} height={60} className="me-1" />
          <div>
            <div 
              className="fw-bold text-white font-space" 
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "17px", lineHeight: "1.2" }}
            >
              PeakPerformance
            </div>
            <div 
              className="font-ibm-mono" 
              style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6a6a6a", fontSize: "13px", lineHeight: "1.2" }}
            >
              Continuum workspace
            </div>
          </div>
        </div>
        <div 
          className="font-ibm-mono" 
          style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6a6a6a", fontSize: "12px" }}
        >
          {members.length} member{members.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Table Content */}
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table mb-0 align-middle" style={{ backgroundColor: "transparent" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1f2124" }}>
                <th className="ps-4 py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#6a6a6a", fontSize: "10.5px", letterSpacing: "0.5px", backgroundColor: "transparent" }}>Member</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#6a6a6a", fontSize: "10.5px", letterSpacing: "0.5px", backgroundColor: "transparent" }}>Sex</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#6a6a6a", fontSize: "10.5px", letterSpacing: "0.5px", backgroundColor: "transparent" }}>Age</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#6a6a6a", fontSize: "10.5px", letterSpacing: "0.5px", backgroundColor: "transparent" }}>Sport</th>
                <th className="py-3 text-uppercase font-ibm-mono fw-semibold text-center" style={{ color: "#6a6a6a", fontSize: "10.5px", letterSpacing: "0.5px", backgroundColor: "transparent" }}>Sessions</th>
                <th className="pe-4 py-3 text-uppercase font-ibm-mono fw-semibold" style={{ color: "#6a6a6a", fontSize: "10.5px", letterSpacing: "0.5px", backgroundColor: "transparent" }}>Last Tested</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-5 font-monospace" style={{ color: "#8fa3bb" }}>
                    Loading roster data...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-5 font-monospace" style={{ color: "#8fa3bb" }}>
                    No members yet — click “+ Add member” to create your first one.
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const isSelected = m.id === selectedMemberId;
                  const rowBg = isSelected ? "#241109" : "transparent";
                  return (
                    <tr
                      key={m.id}
                      onClick={() => onSelectMember(m.id)}
                      className="roster-row"
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid #1c1e22",
                        transition: "background-color 0.15s ease"
                      }}
                    >
                      <td 
                        className="ps-4 py-3 fw-bold font-space" 
                        style={{ 
                          color: isSelected ? "#ff4b12" : "#E9EEF2", 
                          fontSize: "13.5px",
                          fontFamily: "'Space Grotesk', sans-serif",
                          backgroundColor: rowBg
                        }}
                      >
                        {m.name}
                      </td>
                      <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace", backgroundColor: rowBg }}>{m.sex}</td>
                      <td className="py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace", backgroundColor: rowBg }}>{m.age}</td>
                      <td className="py-3 font-ibm-mono" style={{ backgroundColor: rowBg }}>
                        <span 
                          className="sport-pill font-ibm-mono"
                          style={{
                            backgroundColor: "#1a1c1f",
                            border: "1px solid rgba(139, 153, 166, 0.2)",
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
                      <td className="py-3 font-ibm-mono text-center" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace", backgroundColor: rowBg }}>{m.sessions}</td>
                      <td className="pe-4 py-3 font-ibm-mono" style={{ color: "#8b99a6", fontSize: "12.5px", fontFamily: "'IBM Plex Mono', monospace", backgroundColor: rowBg }}>{m.lastTested}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Card Footer Note */}
      <div className="card-footer bg-transparent border-0 px-4 py-3 font-monospace" style={{ fontSize: "0.8rem", color: "#565656" }}>
        &crarr; click any member to view their profile below
      </div>
    </div>
  );
}