const slugify = (n) => (n || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shortDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
const fullDate  = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
const shortSport = (s) => (s === 'Strength & Conditioning' ? 'S&C' : s);

/**
 * Build the dashboard member object (roster/detail shape) from a member user
 * and their sessions. Shared by the gym-owner views and the member's own view.
 */
const buildMemberObject = (member, sessions) => {
  const sorted = [...sessions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const latest = sorted[sorted.length - 1];
  const m = latest?.dashboardMetrics || {};
  return {
    id: slugify(member.name) || String(member._id),
    _id: member._id,
    name: member.name,
    sex: member.memberProfile?.sex || '',
    age: member.memberProfile?.age ?? (latest?.age ?? null),
    sport: member.memberProfile?.sport || latest?.sport || '',
    sessions: sorted.length,
    lastTested: latest ? shortDate(latest.createdAt) : '—',
    lastTestedFull: latest ? fullDate(latest.createdAt) : '—',
    latestCMJ: m.cmj ?? null, latestGrip: m.grip ?? null, latestAsym: m.asym ?? null,
    history: sorted.map((s, i) => ({
      session: i === 0 ? 'S1 · Baseline' : `S${i + 1} · Retest`,
      date: shortDate(s.createdAt),
      cmj: s.dashboardMetrics?.cmj ?? null,
      hipFlexion: s.dashboardMetrics?.hipFlexion ?? null,
      grip: s.dashboardMetrics?.grip ?? null,
      asym: s.dashboardMetrics?.asym ?? null
    })),
    workoutSplit: (latest?.reportContent?.trainingPlan?.weeklySchedule || []).map(w => ({
      day: (w.day || '').slice(0, 3).toUpperCase(), title: w.focus || '', details: w.exercises || ''
    })),
    latestReportContent: latest?.reportContent || null
  };
};

module.exports = { buildMemberObject, slugify, shortDate, fullDate, shortSport };
