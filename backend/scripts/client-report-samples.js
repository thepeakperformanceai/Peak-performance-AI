// scripts/client-report-samples.js
// Sample client card reports (VALD machine tests only), one per sport, from
// one VALD Hub PDF, through the real pipeline with no database and no AI key
// (so the report uses the sentences chosen in code). Writes [{ file, report }].
//
//   node scripts/client-report-samples.js report.pdf out.json [--sex=M|F] [--hand=R|L]
//
// The PDF has no sex or hand: given here (the real form asks the tester).

const fs = require('fs');
const { readPages, parsePages, toIsoDate } = require('../services/vald/valdHubPdf');
const { machineTestsFromPdf, SPORTS } = require('../services/machineCard.service');
const { validateClientInput, runClientPipeline } = require('../services/clientReport.service');

const arg = (name, dflt) => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : dflt; };
const POSITION = { football: 'MID', padel: 'RIGHT', cricket: 'ALL', general: 'GYM' };

const main = async () => {
  const [file, out] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!file || !out) { console.error('Usage: node scripts/client-report-samples.js report.pdf out.json [--sex=M|F] [--hand=R|L]'); process.exit(1); }
  const parsed = parsePages(await readPages(fs.readFileSync(file)));
  const tests = machineTestsFromPdf(parsed);
  const a = parsed.athlete;
  const noAi = { callModel: async () => { throw new Error('no AI key in this environment'); } };
  const reports = [];
  for (const sport of SPORTS) {
    const input = validateClientInput(
      { name: a.name, dob: toIsoDate(a.dob), testDate: toIsoDate(a.reportDate), sex: arg('sex', 'M'), dominantHand: arg('hand', 'R'), position: POSITION[sport] },
      { sport, tests });
    const { card, reportContent, polish } = await runClientPipeline(input, noAi);
    reports.push({ file: `report-${sport}`, report: { athleteName: input.profile.name, reportContent } });
    console.log(`${sport.padEnd(8)} OVR ${String(card.ovr.value ?? 'pending').padEnd(8)} ${Object.entries(card.stats).map(([k, v]) => `${k} ${v.value ?? '--'}`).join(' · ')}  (text: ${polish.source})`);
  }
  fs.writeFileSync(out, JSON.stringify(reports, null, 2));
};
main().catch(e => { console.error(e); process.exit(1); });
