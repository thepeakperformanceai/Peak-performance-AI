// Derives dashboard summary metrics from the new battery-report shape.
const scoreOf = (ovr, name) => {
    const hit = (ovr || []).find(o => (o.name || '').toLowerCase() === name.toLowerCase());
    return hit ? hit.score : null;
  };
  const extractDashboardMetrics = (reportContent = {}) => {
    const ovr = reportContent.ovrScores || [];
    const ds = reportContent.dynamoStrength || [];
    // worst (lowest) LSI as the asymmetry proxy: asym% = 100 - lsi
    let worstAsym = null;
    ds.forEach(d => { if (d.lsi != null) { const a = Math.round((100 - d.lsi) * 10) / 10; if (worstAsym == null || a > worstAsym) worstAsym = a; } });
    return {
      cmj: scoreOf(ovr, 'Power'),        // Power stat as the jump/power proxy
      grip: scoreOf(ovr, 'Balance'),     // no grip in battery; use Balance as a stand-in
      asym: worstAsym,
      hipFlexion: scoreOf(ovr, 'Speed'), // Speed as the mobility/speed proxy
      overallOVR: reportContent.overallOVR ?? null
    };
  };
  module.exports = { extractDashboardMetrics };