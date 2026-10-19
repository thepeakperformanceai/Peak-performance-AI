// scripts/build-padel-library.js
// Rebuilds library/padel.json from docs/library/padel.md.
//
//   node scripts/build-padel-library.js           write library/padel.json
//   node scripts/build-padel-library.js --check   exit 1 if it's out of date

const fs = require('fs');
const path = require('path');
const { buildPadelLibrary } = require('../library/buildPadelLibrary');

const MD = path.join(__dirname, '../../docs/library/padel.md');
const JSON_FILE = path.join(__dirname, '../library/padel.json');

const current = fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')) : {};
const built = buildPadelLibrary(fs.readFileSync(MD, 'utf8'), { draft_notice: current.draft_notice });
const text = `${JSON.stringify(built, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (fs.readFileSync(JSON_FILE, 'utf8') !== text) {
    console.error('library/padel.json is out of date: run node scripts/build-padel-library.js');
    process.exit(1);
  }
  console.log('library/padel.json matches docs/library/padel.md');
} else {
  fs.writeFileSync(JSON_FILE, text);
  console.log(`wrote library/padel.json (${built.tests.length} tests, ${built.library_version})`);
}
