// scripts/padel-sample.js
// Builds a sample padel athlete report (the separate two-page PDF) for a
// made-up athlete, through the real engine, library and checks, with no
// database and no AI key. Writes JSON for a preview page.
//
//   node scripts/padel-sample.js [out.json] [--prose] [--side=LEFT|RIGHT|BOTH] [--name="First Last"]
//
// Without --prose the report uses the coach text built in code (what ships
// when Gemini is unavailable or rejected). With --prose it uses a sample
// polish that is run through the same checks Gemini's answer must pass.

const fs = require('fs');
const { forSport } = require('../services/scoredReport.service');
const R = require('../services/padelAthleteReport.service');

const PROFILE_IN = {
  name: 'Test Reves', dob: '2001-03-02', testDate: '2026-10-18', sex: 'M', position: 'RIGHT',
  dominantHand: 'R', bodyweight: '74', trainingLevel: 'Intermediate'
};
const RESULTS_IN = {
  timingMethod: 'electronic',
  tests: {
    sprint_10m: { status: 'completed', value: '2.05' },
    ruler_drop: { status: 'completed', value: '12.0' },
    cod_505: { status: 'completed', left: '2.62', right: '2.55' },
    single_leg_stand: { status: 'completed', left: '9', right: '21', cutoffs: ['3', '8', '15', '25'] },
    trunk_rotation: { status: 'completed', left: '38', right: '50', cutoffs: ['20', '30', '40', '55'] },
    overhead_squat: { status: 'completed', value: '55', cutoffs: ['30', '50', '65', '80'], fault: 'arms_drop' },
    shoulder_er: { status: 'completed', left: '160', right: '140', cutoffs: ['60', '100', '150', '220'] },
    hip_abduction: { status: 'completed', left: '300', right: '290', cutoffs: ['100', '180', '260', '340'] },
    hip_adduction: { status: 'completed', left: '200', right: '250', cutoffs: ['100', '180', '260', '340'] }
  }
};

// Sample polish for --prose: warmer versions of the coach text, using only
// numbers that are in the payload (the same checks Gemini's answer must pass).
const sampleProse = (p) => {
  const n = p.first_name;
  return JSON.stringify({
    weapons: [
      `${n}, your hands are a real weapon: a ${p.weapons[0].result} catch.`,
      `${n}, your outer hips are strong and almost even, left vs right.`
    ],
    planIntro: `${n}, one plan works on all three at once. Give it ${p.plan.weeks} weeks, then we retest on ${p.plan.retest_date} and show you how far you've come.`
  });
};

const main = async () => {
  const [out = 'padel-sample.json'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const withProse = process.argv.includes('--prose');
  const sideArg = (process.argv.find(a => a.startsWith('--side=')) || '').split('=')[1];
  if (sideArg) PROFILE_IN.position = sideArg;
  const nameArg = (process.argv.find(a => a.startsWith('--name=')) || '').split('=')[1];
  if (nameArg) PROFILE_IN.name = nameArg;
  const padel = forSport('padel');
  const { profile, session } = padel.validateInput(PROFILE_IN, RESULTS_IN);
  session.observations = R.cleanObservations({ overhead_squat_fault: RESULTS_IN.tests.overhead_squat.fault });
  // The player card's own text isn't part of this report: plain placeholder words.
  const cardText = async (sys, prompt) => {
    const payload = JSON.parse(prompt.split('PAYLOAD:\n')[1]);
    return JSON.stringify({ playerProfile: 'Drive-side player with sharp hands at the net.', summary: 'Sample session.',
      stats: {}, symmetry: '', recommendation: '', flags: payload.flags.map(() => 'An area to build on.') });
  };
  const { scored, reportContent } = await padel.runPipeline(profile, session, { callModel: cardText });
  const ar = R.buildAthleteReport({ profile, scored, session, cfg: padel.cfg });
  await R.narrateAthleteReport(ar, {
    callModel: withProse ? async (sys, prompt) => sampleProse(JSON.parse(prompt.split('PAYLOAD:\n')[1])) : async () => { throw new Error('no AI in the sample'); }
  });
  reportContent.athleteReport = ar;
  const report = { _id: 'sample', athleteName: profile.name, testDate: profile.testDate, reportContent };
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`wrote ${out}: OVR ${reportContent.overallOVR} · prose ${ar.prose.source}${ar.prose.reason ? ` (${ar.prose.reason})` : ''}`);
};

main().catch(e => { console.error(e); process.exit(1); });
