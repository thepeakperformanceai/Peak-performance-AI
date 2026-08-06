import React from "react";
import Logo from "./Logo";

export default function Header() {
  return (
    <header className="mb-4">
      {/* Top Main Logo Flush Aligned */}
      <div className="mb-3 p-0 m-0">
        <Logo width={250} height={78} />
      </div>

      {/* Main Title & Subtitle */}
      <h1 className="fw-bold mb-2 text-white font-space" style={{ fontSize: "1.5rem", letterSpacing: "-0.5px" }}>
        Member Testing Dashboard
      </h1>
      <p className="mb-0 font-inter" style={{ color: "#8b99a6", maxWidth: "700px", fontSize: "0.95rem", lineHeight: "1.5", fontFamily: "'Inter', sans-serif" }}>
        Every Continuum member tested on HumanTrak and Dynamo &mdash; football, padel and strength
        training members side by side, tracked against their own history session over session.
      </p>
    </header>
  );
}
