// scripts/build-padel-library.js
// Rebuilds every sport's test library from docs/library/<sport>.md:
// library/padel.json, library/cricket.json and library/football.json.
//
//   node scripts/build-padel-library.js           write the JSON files
//   node scripts/build-padel-library.js --check   exit 1 if any is out of date

const fs = require('fs');
const path = require('path');
const { buildPadelLibrary } = require('../library/buildPadelLibrary');
const { buildCricketLibrary } = require('../library/buildCricketLibrary');
const { buildFootballLibrary } = require('../library/buildFootballLibrary');

const LIBRARIES = [
  { sport: 'padel', build: buildPadelLibrary },
  { sport: 'cricket', build: buildCricketLibrary },
  { sport: 'football', build: buildFootballLibrary }
];

let stale = false;
for (const { sport, build } of LIBRARIES) {
  const MD = path.join(__dirname, `../../docs/library/${sport}.md`);
  const JSON_FILE = path.join(__dirname, `../library/${sport}.json`);
  const current = fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')) : {};
  const built = build(fs.readFileSync(MD, 'utf8'), { draft_notice: current.draft_notice });
  const text = `${JSON.stringify(built, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    if (!fs.existsSync(JSON_FILE) || fs.readFileSync(JSON_FILE, 'utf8') !== text) {
      console.error(`library/${sport}.json is out of date: run node scripts/build-padel-library.js`);
      stale = true;
    } else {
      console.log(`library/${sport}.json matches docs/library/${sport}.md`);
    }
  } else {
    fs.writeFileSync(JSON_FILE, text);
    console.log(`wrote library/${sport}.json (${built.tests.length} tests, ${built.library_version})`);
  }
}
if (stale) process.exit(1);
