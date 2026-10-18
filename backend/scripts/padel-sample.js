// scripts/padel-sample.js
// Builds a sample padel athlete report (the separate two-page PDF) for a
// made-up athlete, through the real engine, library and checks, with no
// database and no AI key. Writes JSON for a preview page.
//
//   node scripts/padel-sample.js [out.json] [--prose]
//
// Without --prose the report uses the library's own text (what ships when
// Gemini is unavailable or rejected). With --prose it uses sample friendly
// wording that is run through the same checks Gemini's answer must pass.

const fs = require('fs');
const { forSport } = require('../services/scoredReport.service');
const R = require('../services/padelAthleteReport.service');

const PROFILE_IN = {
  name: 'Ali Khan', dob: '2001-03-02', testDate: '2026-10-18', sex: 'M', position: 'RIGHT',
  dominantHand: 'R', bodyweight: '74', trainingLevel: 'Intermediate'
};
const RESULTS_IN = {
  timingMethod: 'electronic',
  tests: {
    sprint_10m: { status: 'completed', value: '2.05' },
    ruler_drop: { status: 'completed', value: '12.0' },
    beep_test: { status: 'completed', level: '9', shuttle: '5' },
    single_leg_stand: { status: 'completed', left: '9', right: '21', cutoffs: ['3', '8', '15', '25'] },
    trunk_rotation: { status: 'completed', left: '38', right: '50', cutoffs: ['20', '30', '40', '55'] },
    overhead_squat: { status: 'completed', value: '55', cutoffs: ['30', '50', '65', '80'], fault: 'arms_back' },
    shoulder_er: { status: 'completed', left: '160', right: '140', cutoffs: ['60', '100', '150', '220'] },
    hip_abduction: { status: 'completed', left: '300', right: '290', cutoffs: ['100', '180', '260', '340'] },
    hip_adduction: { status: 'completed', left: '200', right: '250', cutoffs: ['100', '180', '260', '340'] }
  }
};

// Sample wording for --prose: only words plus numbers copied from the payload.
const sampleProse = (p) => JSON.stringify({
  weapons: [
    `${p.first_name}, your hands are your secret weapon: a ${p.weapons[0].result} catch puts your reactions at ${p.weapons[0].tier} level, so you win the quick-fire exchanges at the net.`,
    `Your outer hips are strong (${p.weapons[1].result}), so your first lateral step to cover the middle is fast and your knees stay straight on every lunge.`
  ],
  priorities: p.priorities.map((x, i) => [
    `Your overhead squat scored ${x.result.replace(' (HumanTrak score)', '')} (${x.next_tier}). Getting low to dig out chiquitas and low volleys without losing posture is your job on the drive side, and better squat mechanics let you stay low through long rallies without tiring your back.`,
    `Your 10m sprint was ${x.result}, just ${x.next_tier}. On the drive side you chase balls off the side glass; a quicker first few steps means arriving balanced, and after every lob it's the race back to the net.`,
    `Your groin strength came in at ${x.result} (${x.next_tier}). As the drive player, these muscles pull you back to the centre after every wide ball, and a strong groin, roughly as strong as your outer hip, is your best protection in sudden sideways stops.`
  ][i]),
  planIntro: `${p.first_name}, here is one plan that works on all three at once. Train it for ${p.plan.weeks} weeks, then we retest on ${p.plan.retest_date} to show you how far you've moved.`
});

const main = async () => {
  const [out = 'padel-sample.json'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const withProse = process.argv.includes('--prose');
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
