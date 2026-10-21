// Shows what is read from a VALD Hub report PDF and how each test matches the
// master VALD test list. Reads only; nothing is scored or saved.
//   node scripts/vald-pdf-extract.js path/to/report.pdf [--json]
const fs = require('fs');
const { parseValdHubPdf, matchToMaster } = require('../services/vald/valdHubPdf');
const { valdBattery } = require('../services/customAssessment.service');
const { ALL_TEST_INFO } = require('../services/scoredReport.service');

const masterList = () => Object.fromEntries(Object.entries(valdBattery()).map(([k, t]) => [k, { ...ALL_TEST_INFO[k], bilateral: !!t.bilateral }]));

const main = async () => {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node scripts/vald-pdf-extract.js report.pdf [--json]'); process.exit(1); }
  const parsed = await parseValdHubPdf(fs.readFileSync(file));
  const match = matchToMaster(parsed.tests, masterList());
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ ...parsed, match }, null, 2)); return; }

  console.log('Athlete:', parsed.athlete);
  console.log('\nEXTRACTED');
  const rows = parsed.tests.flatMap(t => t.results.map(r => ({
    Test: t.test, Device: t.device, Side: r.side, Value: r.value === null ? '' : `${r.value} ${r.unit}`,
    Percentile: r.percentile ?? '', Band: r.band ?? ''
  })));
  console.table(rows);
  for (const t of parsed.tests) if (t.warnings.length) console.log(`  ! ${t.test}: ${t.warnings.join('; ')}`);

  console.log('\nMATCHED TO MASTER LIST');
  console.table(match.matched.map(m => ({ 'PDF test': m.test, 'Master test': `${m.label} (${m.key})`, Notes: m.notes.join('; ') })));
  console.log('\nNOT MATCHED');
  console.table(match.unmatched.map(u => ({ 'PDF test': u.test, Device: u.device, Reason: u.reason })));
  console.log('\nMaster tests not in this PDF:', match.notInPdf.join(', ') || 'none');
};
main().catch(e => { console.error(e); process.exit(1); });
