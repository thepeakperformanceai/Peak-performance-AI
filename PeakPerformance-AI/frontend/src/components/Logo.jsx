import React, { useState } from "react";

export default function Logo({ width = 250, height = 78, className = "" }) {
  const [imageError, setImageError] = useState(false);

  if (!imageError) {
    return (
      <img
        src="/logo.png"
        alt="Peak Performance Logo"
        style={{
          width: typeof width === "number" ? `${width}px` : width,
          height: typeof height === "number" ? `${height}px` : height,
          objectFit: "contain",
          objectPosition: "left center",
          display: "block",
          margin: 0,
          padding: 0
        }}
        className={className}
        onError={() => setImageError(true)}
      />
    );
  }

  // Precision SVG emblem aligned starting flush at X = 0
  return (
    <div className={`d-inline-flex align-items-center ${className}`} style={{ margin: 0, padding: 0 }}>
      <svg width={width} height={height} viewBox="0 0 150 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Emblem starting flush at X = 0 */}
        <g fill="#FFFFFF">
          <path d="M0 6 H22 C32 6, 32 24, 22 24 H10 V38 H0 V6 Z" />
          <path d="M12 0 H34 C44 0, 44 18, 34 18 H22 V32 H12 V0 Z" fill="#CBD5E1" opacity="0.75" />
        </g>
        {/* Text starting at X = 42 */}
        <text x="42" y="20" fill="#FFFFFF" fontSize="11" fontFamily="'Space Grotesk', sans-serif" fontWeight="bold" letterSpacing="0.5">
          PEAK PERFORMANCE
        </text>
        <text x="42" y="30" fill="#64748B" fontSize="6" fontFamily="'JetBrains Mono', monospace" fontWeight="600" letterSpacing="0.8">
          TEST. TRAIN. PERFORM.
        </text>
      </svg>
    </div>
  );
}
