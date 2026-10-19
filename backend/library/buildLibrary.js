// library/buildLibrary.js
// Shared by every sport's test library (docs/library/<sport>.md ->
// library/<sport>.json). One format for every sport: nickname, "You'll
// notice it when", "Why" versions, "Fix it and", rules, fixes, drills and
// retest. Each sport's builder supplies its ENGINE map (which engine check
// decides each rule and "Why" version) and its top-level settings.


const plain = (s) => s.replace(/\*\*/g, '').replace(/\*/g, '').trim();

// "(6 weeks, 2 sessions a week)" -> { weeks: 6, frequency: '2 sessions a week' }
const fixTiming = (paren) => {
  if (!paren) return { weeks: null, frequency: null };
  const m = /^(\d+) weeks?(?:,\s*(.+))?$/.exec(paren.trim());
  return m ? { weeks: Number(m[1]), frequency: m[2] || null } : { weeks: null, frequency: paren.trim() };
};

const bulletsAfter = (lines, i) => {
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim()) { if (out.length) break; continue; }
    if (!l.startsWith('- ')) break;
    out.push(l.slice(2).trim());
  }
  return out;
};

function parseTest(title, body, fail) {
  const head = /^\d+\.\s+(.+?)\s+\(([^)]+)\)$/.exec(title) || fail(`bad test heading "${title}"`);
  const lines = body.split('\n');
  const find = (re) => lines.findIndex(l => re.test(l));
  const lineAfter = (prefix) => {
    const l = lines.find(x => x.startsWith(prefix));
    if (!l) fail(`${head[1]}: missing "${prefix}"`);
    return l.slice(prefix.length).trim();
  };

  const measuredAt = find(/^\*\*What we measured\.\*\*/);
  const nickLine = lines.slice(measuredAt + 1).find(l => /^\*\*[^*]+\*\*$/.test(l.trim()));
  if (!nickLine) fail(`${head[1]}: missing nickname`);

  const whyAt = find(/^\*\*Why:\*\*/);
  if (whyAt === -1) fail(`${head[1]}: missing "Why:"`);
  const why = bulletsAfter(lines, whyAt).map(b => {
    const m = /^\*([^*]+):\*\s+(.+)$/.exec(b) || fail(`${head[1]}: bad Why line "${b}"`);
    return { label: m[1].trim(), text: m[2].trim() };
  });

  const rulesAt = find(/^\*\*How we read your result\.\*\*/);
  const rules = bulletsAfter(lines, rulesAt).map(b => {
    const m = /→\s+(also\s+)?show\s+\*\*Fix ([A-C]): ([^*]+)\*\*\.?\s*(.*)$/.exec(b) || fail(`${head[1]}: bad rule "${b}"`);
    return { text: plain(b), fix: m[2], also: !!m[1], proposed: /\(proposed\)|proposed\)/.test(b), coach_note: m[4].trim() || null };
  });

  const fixes = {};
  let drills = [];
  lines.forEach((l, i) => {
    const f = /^\*Fix ([A-C]): ([^(*]+?)(?:\s+\(([^)]*)\))?\*$/.exec(l.trim());
    if (f) fixes[f[1]] = { title: f[2].trim(), ...fixTiming(f[3]), exercises: bulletsAfter(lines, i) };
    if (/^\*(?:Court|Pitch) drills/.test(l.trim())) drills = bulletsAfter(lines, i);
  });

  const retest = /^(\d+) weeks?\.\s*(.*)$/.exec(lineAfter('**Retest:**')) || fail(`${head[1]}: bad retest`);
  return {
    name: head[1],
    what_we_measured: lineAfter('**What we measured.**'),
    nickname: plain(nickLine),
    notice: lineAfter("**You'll notice it when**"),
    why,
    fix_it: lineAfter('**Fix it and**'),
    rules,
    fixes,
    court_drills: drills,
    retest_weeks: Number(retest[1]),
    retest_note: retest[2].trim() || null
  };
}

const STRENGTH_EVENNESS = { even: 'almost even, left vs right', fair: 'fairly even, left vs right', uneven: 'stronger on your {side} side by {pct}%', one_side: 'measured on one side only' };

/**
 * <sport>.md text -> test entries, checked against the sport's ENGINE map.
 * The build fails if the .md and ENGINE disagree on a test's rules, "Why"
 * versions or fixes.
 */
function buildTests(md, engine, file) {
  const fail = (msg) => { throw new Error(`${file}: ${msg}`); };
  const date = (/^([A-Z][a-z]{2} \d{1,2}, \d{4})/m.exec(md) || [])[1] || '';
  const sections = md.split(/^## /m).slice(1).filter(s => /^\d+\./.test(s));
  if (sections.length !== engine.length) fail(`expected ${engine.length} tests, found ${sections.length}`);

  const tests = sections.map((sec, i) => {
    const [title, ...rest] = sec.split('\n');
    const t = parseTest(title.trim(), rest.join('\n'), fail);
    const e = engine[i];
    if (t.why.length !== e.why.length) fail(`${t.name}: ${t.why.length} Why versions, engine expects ${e.why.length}`);
    if (t.rules.length !== e.rules.length) fail(`${t.name}: ${t.rules.length} rules, engine expects ${e.rules.length}`);
    const letters = Object.keys(t.fixes).sort().join('');
    if (letters !== Object.keys(e.kinds).sort().join('')) fail(`${t.name}: fixes ${letters}, engine expects ${Object.keys(e.kinds).join('')}`);
    return {
      key: e.key,
      name: t.name,
      plain_name: e.plain_name,
      measures: e.measures,
      what_we_measured: t.what_we_measured,
      nickname: t.nickname,
      notice: t.notice,
      why: t.why.map((w, k) => ({ label: w.label, when: e.why[k], text: w.text })),
      fix_it: t.fix_it,
      rules: t.rules.map((r, k) => ({
        when: e.rules[k], fix: r.fix, text: r.text,
        ...(r.also ? { also: true } : {}), ...(r.proposed ? { proposed: true } : {}), ...(r.coach_note ? { coach_note: r.coach_note } : {})
      })),
      ...(e.needs_observation ? { needs_observation: e.needs_observation } : {}),
      fixes: Object.fromEntries(Object.entries(t.fixes).map(([k, f]) => [k, { title: f.title, kind: e.kinds[k], weeks: f.weeks, frequency: f.frequency, exercises: f.exercises }])),
      maintain_fix: e.maintain_fix,
      court_drills: t.court_drills,
      retest_weeks: t.retest_weeks,
      retest_note: t.retest_note,
      weapon: { ...e.weapon, ...(e.weapon.evenness === 'strength' ? { evenness: STRENGTH_EVENNESS } : {}) }
    };
  });

  return { date, tests };
}

module.exports = { buildTests, STRENGTH_EVENNESS };
