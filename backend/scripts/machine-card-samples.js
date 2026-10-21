// scripts/machine-card-samples.js
// Sample client cards (VALD machine tests only) for football, padel and
// cricket at every tier, from one VALD Hub PDF. Writes [{ file, report }]
// for the card renderer.
//
//   node scripts/machine-card-samples.js report.pdf out.json
//
// Real results are used wherever they land on a tier; the other tiers are
// previews with the PDF's results adjusted, named "Sample Athlete" and
// labelled on the card. The PDF has no sex, position or hand: placeholders.

const fs = require('fs');
const { readPages, parsePages } = require('../services/vald/valdHubPdf');
const { buildMachineReport, machineTestsFromPdf } = require('../services/machineCard.service');
const { loadConfig } = require('../scoring/scoring');

const POSITION = { football: 'MID', padel: 'RIGHT', cricket: 'ALL' };
const clone = (x) => JSON.parse(JSON.stringify(x));

// The sport battery's Dynamo test keys.
const dynamoOf = (sport) => { const t = loadConfig(sport).tests; return Object.keys(t).filter(k => t[k].dynamo); };

// Football's battery Dynamo tests (hip and knee extension) aren't in this
// PDF: previews borrow the PDF's hip abduction and shoulder ER results
// (values scaled, percentiles kept). Made up, and the card says so.
const withFootballDynamo = (tests) => {
  const by = Object.fromEntries(tests.map(t => [t.key, t]));
  const scaled = (src, key, label, k) => ({
    ...clone(src), key, label,
    sides: Object.fromEntries(Object.entries(src.sides).map(([s, v]) => [s, { ...v, value: Math.round(v.value * k) }]))
  });
  return [...tests, scaled(by.hip_abduction, 'hip_extension', 'Hip Extension', 2.7), scaled(by.shoulder_er, 'knee_extension', 'Knee Extension', 5)];
};

// Adjust the battery's Dynamo percentiles and left/right balance, and the
// mobility bands, to show a tier.
const adjust = (tests, sport, { pctBase, weakerPct, arc }) => clone(tests).map(t => {
  if (dynamoOf(sport).includes(t.key)) {
    const vals = Object.values(t.sides).map(s => s.value);
    const strong = Math.max(...vals);
    for (const s of Object.values(t.sides)) {
      if (s.percentile !== null) s.percentile = pctBase + (s.percentile % 8);
      if (s.value < strong) s.value = Math.round(strong * weakerPct / 100);
    }
  }
  if (t.key === 'arc_of_motion' && arc) { t.sides.left.band = arc[0]; t.sides.right.band = arc[1]; }
  return t;
});

const main = async () => {
  const [file, out] = process.argv.slice(2);
  if (!file || !out) { console.error('Usage: node scripts/machine-card-samples.js report.pdf out.json'); process.exit(1); }
  const parsed = parsePages(await readPages(fs.readFileSync(file)));
  const real = machineTestsFromPdf(parsed);
  const a = parsed.athlete;
  const testDate = '2026-10-21';

  const cards = [];
  for (const sport of ['football', 'padel', 'cricket']) {
    const base = sport === 'football' ? withFootballDynamo(real) : real;
    const madeUp = sport === 'football' ? ' Hip and Knee Extension are made up (not in this PDF).' : '';
    const variants = [
      ['unrated', real, false, null],
      ['bronze', base, true, sport === 'football' ? `TIER PREVIEW: the PDF's results.${madeUp}` : null],
      ['silver', adjust(base, sport, { pctBase: 55, weakerPct: 93, arc: ['within_normal', 'within_normal'] }), true, `TIER PREVIEW: the PDF's results adjusted to show this tier. Not a real result.${madeUp}`],
      ['gold', adjust(base, sport, { pctBase: 82, weakerPct: 97, arc: ['slightly_above', 'within_normal'] }), true, `TIER PREVIEW: the PDF's results adjusted to show this tier. Not a real result.${madeUp}`]
    ];
    for (const [tier, tests, useProposed, preview] of variants) {
      const name = preview ? 'Sample Athlete' : a.name;
      const profile = { name, age: a.age, position: POSITION[sport], dominantHand: 'R', testDate };
      const { card, reportContent } = buildMachineReport({
        tests, sport, profile, useProposed,
        narrative: {
          playerProfile: 'Machine-tested profile from VALD Dynamo and HumanTrak, against people of the same age and sex.',
          summary: 'Sample coach\'s note: the AI writes this part from the scored stats. Every number on this card comes from the VALD report.'
        },
        footNote: preview ? `${preview} *Symmetry: proposed – pending clinical review.` : null
      });
      const ovr = card.ovr.value;
      const got = ovr === null ? 'unrated' : ovr >= 75 ? 'gold' : ovr >= 65 ? 'silver' : 'bronze';
      if (got !== tier) throw new Error(`${sport} ${tier}: landed on ${got} (OVR ${ovr})`);
      cards.push({ file: `${sport}-${tier}`, report: { athleteName: name, reportContent }, summary: { sport, tier, real: !preview, ovr, stats: Object.fromEntries(Object.entries(card.stats).map(([k, v]) => [k, v.value])) } });
    }
  }
  fs.writeFileSync(out, JSON.stringify(cards, null, 2));
  for (const c of cards) console.log(`${c.summary.sport.padEnd(8)} ${c.summary.tier.padEnd(8)} ${c.summary.real ? 'REAL   ' : 'preview'} OVR ${String(c.summary.ovr ?? '—').padStart(3)}  ${Object.entries(c.summary.stats).map(([k, v]) => `${k} ${v ?? '--'}`).join(' · ')}`);
};
main().catch(e => { console.error(e); process.exit(1); });
