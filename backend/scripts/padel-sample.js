// scripts/padel-sample.js
// Builds a sample padel athlete report (the separate two-page PDF) for a
// made-up athlete, through the real engine, library and checks, with no
// database and no AI key. Writes JSON for a preview page.
//
//   node scripts/padel-sample.js [out.json] [--prose]
//
// Without --prose the report uses the coach text built in code (what ships
// when Gemini is unavailable or rejected). With --prose it uses a sample
// polish that is run through the same checks Gemini's answer must pass.

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

// Sample polish for --prose: warmer versions of the coach text, using only
// numbers that are in the payload (the same checks Gemini's answer must pass).
const sampleProse = (p) => {
  const n = p.first_name;
  return JSON.stringify({
    weapons: [
      `${n}, your hands are a real weapon. A ${p.weapons[0].result} catch means that on the drive side you meet fast, low balls through the middle early and punch the volley instead of just blocking it.`,
      `${n}, your outer hips are strong and almost even, left vs right. That's where your first sideways push to cover the middle comes from, so you get there fast.`
    ],
    priorities: [
      `${n}, as the drive player you dig out chiquitas and low volleys at your feet, and you need to get down there without losing your posture. Every player also has to stay low through long defensive rallies at the back. Better squat mechanics let you do both without tiring your back.`,
      `${n}, on the drive side you cover the middle and chase balls off the side glass. Quicker first steps mean you arrive balanced instead of stretching, and after every lob it's a race back to the net.`,
      `${n}, on your left side your groin is only 67% as strong as your outer hip, and we want 80% or more. Your left side is also 20% weaker than your right. These are the muscles that pull you back to the centre after a wide ball, and a strong groin is your best protection in sudden sideways stops.`
    ],
    planIntro: `${n}, one plan works on all three at once. Give it ${p.plan.weeks} weeks, then we retest on ${p.plan.retest_date} and show you how far you've come.`
  });
};

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
