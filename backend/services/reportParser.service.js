/**
 * Normalizes exercises - extracts names from objects or keeps strings as-is
 */
const normalizeExercises = (exercises) => {
  if (!Array.isArray(exercises)) return [];

  return exercises.map(ex => {
    if (typeof ex === 'string') return ex;
    if (typeof ex === 'object' && ex.name) return ex.name;
    return String(ex);
  }).filter(Boolean);
};

/**
 * Strips markdown backticks from AI response
 */
const stripMarkdown = (text) => {
  return text.replace(/```json\n?|\n?```/g, '').trim();
};

/**
 * Parses AI JSON response and validates required fields with fallbacks
 */
const parseReportJson = (aiResponse) => {
  try {
    const cleanJson = stripMarkdown(aiResponse);
    const reportData = JSON.parse(cleanJson);
    // ── Cover / identity ──
    reportData.athleteName = reportData.athleteName || '';
    reportData.dob = reportData.dob || '';
    reportData.weight = reportData.weight || '';
    reportData.sport = reportData.sport || '';
    reportData.academy = reportData.academy || '';

    // ── Summary ──
    reportData.overallSummary = reportData.overallSummary || 'Assessment completed. See detailed findings below.';
    if (!Array.isArray(reportData.areaSummary)) reportData.areaSummary = [];
    reportData.areasToAddress = reportData.areasToAddress || 0;
    reportData.testsCompleted = reportData.testsCompleted || 0;
    reportData.jumpHeight = reportData.jumpHeight || '';

    // ── Findings ──
    if (!Array.isArray(reportData.findings)) reportData.findings = [];
    reportData.findings.forEach((finding, index) => {
      if (!finding.title) finding.title = `Finding ${index + 1}`;
      if (!finding.status) finding.status = 'good';
      if (!finding.description) finding.description = '';
      finding.exercises = finding.exercises ? normalizeExercises(finding.exercises) : [];
      if (!Array.isArray(finding.metrics)) finding.metrics = [];
      if (!['priority', 'needs_work', 'good', 'excellent'].includes(finding.status)) {
        finding.status = 'good';
      }
    });

    // ── Section 3: What This Means on Court ──
    if (!reportData.onCourt || typeof reportData.onCourt !== 'object') {
      reportData.onCourt = { intro: '', sections: [] };
    }
    reportData.onCourt.intro = reportData.onCourt.intro || '';
    if (!Array.isArray(reportData.onCourt.sections)) reportData.onCourt.sections = [];
    reportData.onCourt.sections.forEach(s => {
      s.title = s.title || '';
      s.body = s.body || '';
      s.example = s.example || '';
    });

    // ── Section 4: Training Plan ──
    if (!reportData.trainingPlan || typeof reportData.trainingPlan !== 'object') {
      reportData.trainingPlan = {};
    }
    const tp = reportData.trainingPlan;
    tp.intro = tp.intro || '';
    tp.progression = tp.progression || '';
    if (!Array.isArray(tp.priorities)) tp.priorities = [];
    if (!Array.isArray(tp.weeklySchedule)) tp.weeklySchedule = [];

    // Normalize each priority's exercises (objects with name/sets/reps/rest/cues)
    tp.priorities.forEach(p => {
      if (!Array.isArray(p.bullets)) p.bullets = p.bullets ? [p.bullets] : [];
      if (!Array.isArray(p.exercises)) p.exercises = [];
      p.exercises = p.exercises
        .filter(ex => ex && (ex.name || typeof ex === 'string'))
        .map(ex => (typeof ex === 'string'
          ? { name: ex, sets: '', reps: '', rest: '', cues: '' }
          : {
              name: ex.name || '',
              sets: ex.sets ?? '',
              reps: ex.reps ?? ex.setsReps ?? '',
              rest: ex.rest ?? ex.load ?? '',
              cues: ex.cues ?? ex.instructions ?? ''
            }));
    });

    // Legacy fallback only when no priorities were produced
    if (tp.priorities.length === 0) {
      if (!Array.isArray(tp.phase1)) tp.phase1 = [];
      if (!Array.isArray(tp.phase2)) tp.phase2 = [];
    }

    // ── Section 5: Reassessment ──
    reportData.retestNote = reportData.retestNote || 'Target retest: 8–10 weeks';
    if (!Array.isArray(reportData.reassessmentTargets)) reportData.reassessmentTargets = [];
    reportData.reassessmentTargets.forEach(target => {
      if (!['Critical', 'High', 'Moderate', 'Monitor'].includes(target.priority)) {
        target.priority = 'Monitor';
      }
    });

    return reportData;
  } catch (error) {
    // JSON.parse errors include a character position (e.g. "position 13411") —
    // pull it out and log the surrounding text so a future failure is
    // immediately readable instead of requiring reproduction.
    const posMatch = error.message.match(/position (\d+)/);
    if (posMatch) {
      const pos = Number(posMatch[1]);
      const cleanJson = stripMarkdown(aiResponse);
      const start = Math.max(0, pos - 150);
      const end = Math.min(cleanJson.length, pos + 150);
      console.error('--- JSON PARSE FAILURE CONTEXT ---');
      console.error(`Response length: ${cleanJson.length} chars`);
      console.error(`Failure near char ${pos}:`);
      console.error(cleanJson.slice(start, end));
      console.error(`Last 200 chars of response (checks for truncation):`);
      console.error(cleanJson.slice(-200));
      console.error('--- END CONTEXT ---');
    }
    throw new Error(`Report parsing failed: ${error.message}`);
  }
};

/**
 * Validates asymmetry and flags concerns above 10%
 */
const validateAsymmetry = (reportData) => {
  (reportData.findings || []).forEach(finding => {
    if (finding.metrics) {
      finding.metrics.forEach((row) => {
        const differenceCol = row.findIndex(cell =>
          typeof cell === 'string' &&
          (cell.toLowerCase().includes('difference') || cell.toLowerCase().includes('asymmetry'))
        );
        if (differenceCol !== -1) {
          for (let i = 1; i < finding.metrics.length; i++) {
            const diff = finding.metrics[i][differenceCol];
            if (typeof diff === 'string') {
              const percentMatch = diff.match(/(\d+)%/);
              if (percentMatch) {
                const percentage = parseInt(percentMatch[1]);
                if (percentage > 10 && finding.status !== 'priority') {
                  finding.status = 'priority';
                }
              }
            }
          }
        }
      });
    }
  });

  return reportData;
};

module.exports = {
  parseReportJson,
  validateAsymmetry,
  stripMarkdown
};