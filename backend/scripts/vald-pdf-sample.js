// scripts/vald-pdf-sample.js
// Sample report from a VALD Hub PDF, through the real engine and report
// pipeline, with no database and no AI key. Writes the saved-report JSON the
// report page renders (athleteName + reportContent).
//
//   node scripts/vald-pdf-sample.js report.pdf out.json --sport=padel --sex=M|F
//        [--bodyweight=70] [--position=RIGHT] [--hand=R]
//
// Name, date of birth and test date come from the PDF. The PDF has no sex,
// bodyweight, position or hand, so those are given here (the real form asks
// the tester). VALD results: VALD's percentile (Dynamo) or band (HumanTrak),
// never cut-offs; tests VALD gave no rating are measured, not rated. Tests
// outside the sport's battery are shown as additional results, not scored.
//
// The coach's note is stand-in text written from the payload and run through
// the same number check the AI's answer must pass.

const fs = require('fs');
const { forSport } = require('../services/scoredReport.service');
const { valdPdfForForm } = require('../services/vald/valdPdfForm');

const arg = (name, dflt) => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};

// Stand-in coach's note: words from the payload only (numbers copied as-is).
const standInNarrative = (payload) => {
  const scored = payload.tests.filter(t => t.score !== null && t.score !== undefined);
  const pctLine = scored.filter(t => t.vald_percentile_left !== undefined || t.vald_percentile_right !== undefined)
    .map(t => `${t.name}: stronger than ${t.vald_percentile_left ?? t.vald_percentile_right}% of people your age and sex on the left and ${t.vald_percentile_right ?? t.vald_percentile_left}% on the right`);
  const unrated = payload.tests.filter(t => t.benchmark === 'not_rated').map(t => t.name);
  return JSON.stringify({
    playerProfile: 'Strength results from VALD Dynamo, compared with people of the same age and sex.',
    summary: [
      pctLine.length ? `${pctLine.join('. ')}.` : '',
      unrated.length ? `${unrated.join(', ')} was measured but not rated, as VALD gave no band for it.` : '',
      'The rest of the battery was not tested this session.'
    ].filter(Boolean).join(' '),
    stats: { speed: '', power: 'Power comes from the Dynamo strength tests in this session.', agility: '', endurance: '', balance: '', reaction: '' },
    symmetry: 'Left and right strength are shown for each Dynamo test.',
    recommendation: 'Complete the remaining tests for a full rating.',
    flags: payload.flags.map(() => 'An area to work on.')
  });
};

const main = async () => {
  const [file, out] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const sport = arg('sport', 'padel');
  const sex = arg('sex');
  if (!file || !out || !['M', 'F'].includes(sex)) {
    console.error('Usage: node scripts/vald-pdf-sample.js report.pdf out.json --sport=padel --sex=M|F [--bodyweight=70] [--position=RIGHT] [--hand=R]');
    process.exit(1);
  }
  // Exactly what POST /api/report/vald-pdf returns to the upload page.
  const fromPdf = await valdPdfForForm({ files: [{ name: file, buffer: fs.readFileSync(file) }], sport });
  const pipeline = forSport(sport);

  const a = fromPdf.athlete;
  const profileIn = {
    name: a.name, dob: a.dob, testDate: a.testDate, sex,
    position: arg('position', pipeline.sport.positions[0]), dominantHand: arg('hand', 'R'),
    bodyweight: arg('bodyweight', '70'), trainingLevel: 'Not specified'
  };
  const { profile, session } = pipeline.validateInput(profileIn, {
    timingMethod: 'electronic', tests: fromPdf.tests, additionalVald: fromPdf.additionalVald
  });
  const { reportContent, payload, scored } = await pipeline.runPipeline(profile, session, { callModel: async (_sys, prompt) => standInNarrative(JSON.parse(prompt.slice(prompt.indexOf('{')))) });

  fs.writeFileSync(out, JSON.stringify({ athleteName: profile.name, reportContent }, null, 2));
  console.log(`Sport battery: ${pipeline.sport.batteryLabel}`);
  console.log('Scored from the PDF:', Object.keys(fromPdf.tests).join(', '));
  console.log('Shown, not scored:', fromPdf.additionalVald.map(r => r.test).join(', '));
  console.log('Flagged for the tester:\n  ' + fromPdf.problems.map(p => `${p.level}: ${p.text}`).join('\n  '));
  console.log('\nEngine result per test:');
  for (const t of scored.tests.filter(x => x.status === 'completed')) {
    console.log(`  ${t.name}: score ${t.score ?? '—'} (${t.benchmark})${t.percentiles ? ` percentiles ${t.percentiles.join('/')}` : ''}`);
  }
  console.log(`OVR: ${scored.ovr.value ?? 'pending'} · reasons: ${scored.ovr.reasons.join('; ')}`);
  console.log(`\nAI payload VALD tests: ${JSON.stringify(payload.tests.filter(t => t.benchmark && t.benchmark !== 'research'), null, 0)}`);
  console.log(`\nWrote ${out}`);
};
main().catch(e => { console.error(e); process.exit(1); });
