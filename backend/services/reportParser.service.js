// services/reportParser.service.js
// Parses + normalizes the AI's ATHLETE TEST BATTERY report JSON (4-page card).

const stripMarkdown = (text) => {
  if (!text) return text;
  let t = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // If the model wrapped JSON in prose, extract the outermost {...} object.
  if (t[0] !== '{') {
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  }
  return t;
};

const clampScore = (n, fallback = 0) => {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(100, v));
};

const OVR_STATS = ['Speed', 'Agility', 'Power', 'Endurance', 'Reaction', 'Balance'];

const parseReportJson = (aiResponse) => {
  try {
    const reportData = JSON.parse(stripMarkdown(aiResponse));

    // --- profile / header ---
    reportData.athleteName = reportData.athleteName || 'Athlete';
    reportData.age = reportData.age ?? null;
    reportData.sport = reportData.sport || '';
    reportData.position = reportData.position || '';
    reportData.testDate = reportData.testDate || '';
    reportData.batteryLabel = reportData.batteryLabel || 'Manual + DynaMo Battery';

    // --- OVR scores (force the six, clamp) ---
    let ovr = Array.isArray(reportData.ovrScores) ? reportData.ovrScores : [];
    const byName = {};
    ovr.forEach(o => { if (o && o.name) byName[o.name.toLowerCase()] = clampScore(o.score); });
    reportData.ovrScores = OVR_STATS.map(name => ({
      name, score: byName[name.toLowerCase()] ?? 0
    }));

    // --- manual battery ---
    reportData.manualBattery = (Array.isArray(reportData.manualBattery) ? reportData.manualBattery : [])
      .map(t => ({
        test: t.test || '',
        raw: t.raw || '—',
        avg: t.avg || '',
        score: clampScore(t.score)
      }));

    // --- dynamo strength ---
    reportData.dynamoStrength = (Array.isArray(reportData.dynamoStrength) ? reportData.dynamoStrength : [])
      .map(d => {
        const lsi = d.lsi != null ? Math.round(Number(d.lsi) * 10) / 10 : null;
        return {
          joint: d.joint || '',
          left: d.left || '',
          right: d.right || '',
          lsi,
          status: d.status || (lsi != null && lsi < 90 ? 'REVIEW' : 'WITHIN RANGE')
        };
      });

    if (!reportData.symmetrySummary || typeof reportData.symmetrySummary !== 'object') {
      reportData.symmetrySummary = { lowest: '', flag: '', recommendation: '' };
    }

    // --- field meaning ---
    if (!reportData.fieldMeaning || typeof reportData.fieldMeaning !== 'object') {
      reportData.fieldMeaning = { playerProfile: '', developmentPriority: '', stats: [] };
    }
    reportData.fieldMeaning.playerProfile = reportData.fieldMeaning.playerProfile || '';
    reportData.fieldMeaning.developmentPriority = reportData.fieldMeaning.developmentPriority || '';
    reportData.fieldMeaning.stats = (Array.isArray(reportData.fieldMeaning.stats) ? reportData.fieldMeaning.stats : [])
      .map(s => ({
        name: s.name || '',
        score: clampScore(s.score),
        tag: (s.tag || 'SOLID').toUpperCase(),
        body: s.body || ''
      }));

    return reportData;
  } catch (error) {
    const posMatch = error.message.match(/position (\d+)/);
    let context = '';
    if (posMatch) {
      const pos = Number(posMatch[1]);
      const cleanJson = stripMarkdown(aiResponse);
      const start = Math.max(0, pos - 150);
      context = `\n...${cleanJson.slice(start, pos + 150)}...`;
    }
    throw new Error(`Failed to parse AI report JSON: ${error.message}${context}`);
  }
};

// Normalizer: fill computed fields (overall OVR, lowest symmetry) if the AI left them off.
const validateAsymmetry = (reportData) => {
  // overall OVR = rounded average of six
  const scores = (reportData.ovrScores || []).map(o => o.score);
  if (scores.length) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (reportData.overallOVR == null || Number.isNaN(Number(reportData.overallOVR))) {
      reportData.overallOVR = avg;
    } else {
      reportData.overallOVR = clampScore(reportData.overallOVR, avg);
    }
  }

  // lowest symmetry if missing
  const ds = reportData.dynamoStrength || [];
  if (ds.length && (!reportData.symmetrySummary.lowest)) {
    const low = [...ds].filter(d => d.lsi != null).sort((a, b) => a.lsi - b.lsi)[0];
    if (low) reportData.symmetrySummary.lowest = `${low.lsi}% — ${low.joint}`;
  }

  // development priority = lowest OVR stat if missing
  if (!reportData.fieldMeaning.developmentPriority && reportData.ovrScores.length) {
    const low = [...reportData.ovrScores].sort((a, b) => a.score - b.score)[0];
    if (low) reportData.fieldMeaning.developmentPriority = low.name;
  }

  return reportData;
};

module.exports = {
  parseReportJson,
  validateAsymmetry,
};