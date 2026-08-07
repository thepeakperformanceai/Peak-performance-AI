/**
 * Derives dashboard metrics (CMJ, grip, asymmetry, hip flexion) from a generated
 * report's content. Returned by the service generate endpoint so the gym-dashboard
 * backend can store clean numbers without re-parsing the report.
 */
const num = (v) => {
    if (v == null) return null;
    const m = String(v).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };
  const fromFindings = (findings, keywords) => {
    for (const f of findings || []) {
      const hay = (f.title || '').toLowerCase();
      const hit = keywords.some(k => hay.includes(k));
      for (const row of f.metrics || []) {
        const label = String(row[0] || '').toLowerCase();
        const rowHit = keywords.some(k => label.includes(k));
        if (hit || rowHit) {
          for (let i = 1; i < row.length; i++) { const n = num(row[i]); if (n != null) return n; }
        }
      }
    }
    return null;
  };
  const worstAsymmetry = (findings) => {
    let worst = null;
    const scan = (text) => {
      const re = /(\d+(?:\.\d+)?)\s*%/g; let m;
      while ((m = re.exec(text || '')) !== null) {
        const v = parseFloat(m[1]); if (worst == null || v > worst) worst = v;
      }
    };
    for (const f of findings || []) {
      if (/asymmet/i.test(f.title) || /asymmet/i.test(f.description)) {
        scan(f.description);
        for (const row of f.metrics || []) row.forEach(c => scan(String(c)));
      }
    }
    return worst;
  };
  const extractDashboardMetrics = (reportContent = {}) => {
    const findings = reportContent.findings || [];
    return {
      cmj: num(reportContent.jumpHeight),
      grip: fromFindings(findings, ['grip', 'hand strength']),
      asym: worstAsymmetry(findings),
      hipFlexion: fromFindings(findings, ['hip flexion', 'hip flex'])
    };
  };
  module.exports = { extractDashboardMetrics };