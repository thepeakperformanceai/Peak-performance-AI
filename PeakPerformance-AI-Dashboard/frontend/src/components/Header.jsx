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
    </header>
  );
}
