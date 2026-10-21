// services/vald/valdHubPdf.js
// Reads a VALD Hub report PDF (the "powered by VALD" export with one card per
// test) and returns, per test: name, metric, device, side, value, unit and
// what VALD itself printed for that side:
//   Dynamo    -> the age/sex-matched percentile chip ("31st pct.")
//   HumanTrak -> the normative band chip ("Within normal", "Slightly below")
// Nothing is computed here and no cut-offs are involved.
//
// The plain text of these PDFs lists every chip at the end of the page, away
// from its card, so the text is read with positions: a card is a title with a
// "Max ..." metric line under it, in the left or right column; everything in
// that column down to the next card belongs to it. Chips are read left to
// right: the first is Left (blue), the second Right (orange). A test with one
// result has one chip.
//
// matchToMaster() then matches each card to the VALD battery tests in the
// sport configs by the words in its name, so "Hip Abduction Supine" and a
// cut-short "Shoulder External Rotation Sea..." still match. Tests that match
// nothing (or more than one) are listed, never guessed.

const pdfParse = require('pdf-parse');

// VALD's normative bands, as printed, lowest first.
const VALD_BANDS = ['Significantly below', 'Slightly below', 'Within normal', 'Slightly above', 'Significantly above'];
const bandKey = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const BAND_BY_TEXT = new Map(VALD_BANDS.map(b => [bandKey(b), b]));

const PERCENTILE = /^(\d{1,3})\s*(?:st|nd|rd|th)\s*pct\.?$/i;
const VALUE = /^(-?\d+(?:\.\d+)?)\s*(N|Nm|°|deg|cm|mm|m|s|ms|kg|%|W)$/;
const ASYM = /^Asym\.\s*(\d+(?:\.\d+)?)\s*%\s*(Left|Right)?\b/i;   // axis ticks may follow on the same line

// ---------- reading the PDF ----------

/** PDF bytes -> [{ width, height, items: [{ str, x, y, w, h }] }] per page. */
const readPages = async (buffer) => {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: async (page) => {
      const vp = page.getViewport(1);
      const content = await page.getTextContent();
      pages.push({
        width: vp.width,
        height: vp.height,
        items: content.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || 0 }))
      });
      return '';
    }
  });
  return pages;
};

// Fragments of one word or phrase ("Shoulder Ar" + "c of Motion",
// "31st" + " " + "pct.") are printed as separate items with no gap between
// them. Join those into segments; a real gap (value and its unit, two chips)
// keeps them apart.
const segments = (items) => {
  // Lines first (top to bottom; a unit sits a hair off its number's baseline),
  // then left to right within each line.
  const byY = items.filter(i => i.str !== '').map(i => ({ ...i })).sort((a, b) => b.y - a.y);
  let line = -1;
  let lineY = Infinity;
  for (const i of byY) {
    if (lineY - i.y >= 1.5) { line++; lineY = i.y; }
    i.line = line;
  }
  const sorted = byY.sort((a, b) => a.line - b.line || a.x - b.x);
  const out = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    const gap = last ? i.x - last.end : null;
    if (last && last.line === i.line && gap > -1 && gap < 2.5) {
      last.str += i.str;
      last.end = i.x + i.w;
      continue;
    }
    out.push({ str: i.str, x: i.x, y: i.y, end: i.x + i.w, h: i.h, line: i.line });
  }
  for (const s of out) s.str = s.str.replace(/\s+/g, ' ').trim();
  return out.filter(s => s.str !== '');
};

// Two segments on one line, the second just after the first ("149" "N").
const sameLine = (a, b) => Math.abs(a.y - b.y) < 3;

// ---------- one page -> cards ----------

const parsePage = (page, pageNo) => {
  const segs = segments(page.items);
  const mid = page.width / 2;
  const colOf = (s) => (s.x < mid ? 0 : 1);

  // Card = "Max ..." metric line with the title just above it.
  const cards = [];
  for (const m of segs.filter(s => /^Max\b/.test(s.str))) {
    const title = segs
      .filter(s => colOf(s) === colOf(m) && Math.abs(s.x - m.x) < 4 && s.y > m.y && s.y - m.y < 30)
      .sort((a, b) => a.y - b.y)[0];
    if (!title) continue;
    cards.push({ col: colOf(m), top: title.y, title, metric: m });
  }

  return cards.map(card => {
    const below = cards.filter(c => c.col === card.col && c.top < card.top).map(c => c.top);
    const floor = below.length ? Math.max(...below) : -Infinity;
    const own = segs.filter(s => colOf(s) === card.col && s.y <= card.top + 1 && s.y > floor + 1 && s !== card.title && s !== card.metric);

    // Side labels: "Left" / "Right" at the card's left edge, above the asymmetry line.
    const asymLabel = own.find(s => s.str === 'Asym.' || ASYM.test(s.str));
    const asymRow = asymLabel ? own.filter(s => sameLine(s, asymLabel)).sort((a, b) => a.x - b.x) : [];
    const sideLabels = own.filter(s => /^(Left|Right)$/.test(s.str) && !asymRow.includes(s));
    const edge = sideLabels.length ? Math.min(...sideLabels.map(s => s.x)) : null;

    // A value is a number with its unit on the same line ("149" "N", "33.2" "cm").
    const valueAt = (seg) => {
      const unit = own.find(u => u !== seg && sameLine(u, seg) && u.x > seg.x && u.x - seg.end < 12 && /^\D+$/.test(u.str));
      const m = VALUE.exec(unit ? `${seg.str}${unit.str}`.replace(/\s+/g, '') : seg.str.replace(/\s+/g, ''));
      return m ? { value: Number(m[1]), unit: m[2] === 'deg' ? '°' : m[2] } : null;
    };
    const numbers = own.filter(s => /^-?\d+(\.\d+)?/.test(s.str)).map(s => ({ seg: s, v: valueAt(s) })).filter(n => n.v);

    const results = [];
    if (sideLabels.length) {
      for (const lab of sideLabels.sort((a, b) => b.y - a.y)) {
        const n = numbers
          .filter(({ seg }) => Math.abs(seg.x - lab.x) < 6 && seg.y < lab.y && lab.y - seg.y < 30)
          .sort((a, b) => b.seg.y - a.seg.y)[0];
        results.push({ side: lab.str.toLowerCase(), ...(n ? n.v : { value: null, unit: null }) });
      }
    } else if (numbers.length) {
      // One result: the left-most number with a unit (axis ticks have no unit).
      const n = numbers.sort((a, b) => a.seg.x - b.seg.x || b.seg.y - a.seg.y)[0];
      results.push({ side: 'value', ...n.v });
    }

    // Chips: above the first result, left to right.
    const firstRow = sideLabels.length ? Math.max(...sideLabels.map(s => s.y)) : (numbers[0] ? numbers[0].seg.y : -Infinity);
    const chips = own
      .filter(s => s.y >= firstRow - 8 && (PERCENTILE.test(s.str) || BAND_BY_TEXT.has(bandKey(s.str)) || / pct\.?$/.test(s.str) || /\b(below|above|normal)$/i.test(s.str)))
      .filter(s => edge === null || s.x > edge + 20)
      .sort((a, b) => a.x - b.x);

    const warnings = [];
    if (chips.length && chips.length !== results.length) {
      warnings.push(`${chips.length} percentile/band chip(s) for ${results.length} result(s): sides not assigned`);
    }
    results.forEach((r, i) => {
      const chip = chips.length === results.length ? chips[i] : null;
      r.percentile = null;
      r.band = null;
      if (!chip) return;
      const p = PERCENTILE.exec(chip.str);
      if (p) { r.percentile = Number(p[1]); return; }
      const b = BAND_BY_TEXT.get(bandKey(chip.str));
      if (b) { r.band = b; return; }
      warnings.push(`unrecognised chip "${chip.str}" on ${r.side}`);
      r.chip = chip.str;
    });
    if (results.some(r => r.value === null)) warnings.push('a side label has no value under it');

    const asym = ASYM.exec(asymRow.map(s => s.str).join(' ').replace(/Asym\.\s*/, 'Asym. '));
    const hasPct = results.some(r => r.percentile !== null);
    const hasBand = results.some(r => r.band !== null);
    const force = /force/i.test(card.metric.str) || results.some(r => r.unit === 'N' || r.unit === 'Nm');
    return {
      page: pageNo,
      test: card.title.str,
      truncated: /(\.\.\.|…)$/.test(card.title.str),
      metric: card.metric.str,
      // Dynamo prints percentiles, HumanTrak prints bands. With neither, force -> Dynamo.
      device: hasPct ? 'Dynamo' : hasBand ? 'HumanTrak' : force ? 'Dynamo' : 'HumanTrak',
      results,
      asymmetry: asym ? { percent: Number(asym[1]), higher: asym[2] ? asym[2].toLowerCase() : null } : null,
      warnings,
      _top: card.top,
      _col: card.col
    };
  });
};

// "Profile: Afzal Wali", "Report Date: 21 Oct 2026", "Age: 23 (11 Feb 2003)".
const parseHeader = (page) => {
  const segs = segments(page.items);
  const after = (label) => {
    const l = segs.find(s => s.str.replace(/\s*:$/, '') === label);
    if (!l) return null;
    const v = segs.filter(s => sameLine(s, l) && s.x > l.x && s.str !== ':').sort((a, b) => a.x - b.x)[0];
    return v ? v.str.replace(/^:\s*/, '') : null;
  };
  const ageSeg = segs.find(s => /^Age:/.test(s.str));
  const age = ageSeg && /^Age:\s*(\d+)\s*\(([^)]+)\)/.exec(ageSeg.str);
  return {
    name: after('Profile'),
    reportDate: after('Report Date'),
    reportBy: after('Report By'),
    age: age ? Number(age[1]) : null,
    dob: age ? age[2].trim() : null
  };
};

/** Pages (from readPages) -> { athlete, tests }. Pure, for tests. */
const parsePages = (pages) => {
  const cards = pages.flatMap((p, i) => parsePage(p, i + 1));
  // Reading order: page, then row (cards side by side share a title height),
  // then left column before right.
  const row = (c) => Math.round(c._top / 10);
  cards.sort((a, b) => a.page - b.page || row(b) - row(a) || a._col - b._col);
  for (const c of cards) { delete c._top; delete c._col; }
  return { athlete: pages.length ? parseHeader(pages[0]) : null, tests: cards };
};

/** PDF bytes -> { athlete, tests, isValdHub }. */
const parseValdHubPdf = async (buffer) => {
  const pages = await readPages(buffer);
  const parsed = parsePages(pages);
  const text = pages.flatMap(p => p.items.map(i => i.str)).join(' ');
  return { ...parsed, isValdHub: /powered by/i.test(text) && parsed.tests.length > 0 };
};

// ---------- matching to the master test list ----------

// Words that identify each battery test. Every group must be present in the
// PDF test name (any word in a group will do). Words are compared by stem, so
// "Abductor"/"Abduction" and a cut-short "Rot..." still count.
const MASTER_WORDS = {
  hip_abduction: [['hip'], ['abduction', 'abductor', 'abd']],
  hip_adduction: [['hip'], ['adduction', 'adductor', 'add']],
  hip_extension: [['hip'], ['extension', 'extensor', 'ext']],
  knee_extension: [['knee'], ['extension', 'extensor', 'ext']],
  shoulder_er: [['shoulder'], ['external', 'er']],
  shoulder_ir: [['shoulder'], ['internal', 'ir']],
  elbow_extension: [['elbow'], ['extension', 'extensor', 'ext']],
  trunk_rotation: [['trunk'], ['rotation', 'rot']],
  single_leg_stand: [['single', 'one', 'sl'], ['stand', 'balance']],
  overhead_squat: [['overhead', 'ohs'], ['squat']]
};
// Words that rule a test out even when its words match: a single leg *squat*
// is not a single leg stand, a hip extension at the knee is not one either.
const MASTER_EXCLUDE = {
  single_leg_stand: ['squat', 'jump', 'hop'],
  overhead_squat: ['single'],
  hip_extension: ['knee'],
  knee_extension: ['hip']
};

const words = (s) => String(s || '')
  .replace(/(\.\.\.|…)$/, ' …')
  .toLowerCase()
  .split(/[^a-z0-9…]+/)
  .filter(Boolean);

// One word of the PDF name matches a master word: equal, same stem (first 6
// letters), or the PDF word is cut short ("rot…") and starts the master word.
const wordMatches = (pdfWord, masterWord, cutShort) => {
  if (pdfWord === masterWord) return true;
  if (pdfWord.length >= 6 && masterWord.length >= 6 && pdfWord.slice(0, 6) === masterWord.slice(0, 6)) return true;
  return cutShort && pdfWord.length >= 3 && masterWord.startsWith(pdfWord);
};

const matchName = (name) => {
  const ws = words(name);
  const cut = ws[ws.length - 1] === '…';
  const list = ws.filter(w => w !== '…');
  const has = (masterWord) => list.some((w, i) => wordMatches(w, masterWord, cut && i === list.length - 1));
  return Object.keys(MASTER_WORDS).filter(key =>
    MASTER_WORDS[key].every(group => group.some(has)) &&
    !(MASTER_EXCLUDE[key] || []).some(has));
};

/**
 * Parsed tests -> { matched, unmatched, notInPdf }.
 *   master: { key: { label, unit, bilateral } } for the VALD battery tests.
 */
const matchToMaster = (tests, master) => {
  const matched = [];
  const unmatched = [];
  for (const t of tests) {
    const keys = matchName(t.test).filter(k => master[k]);
    if (keys.length !== 1) {
      unmatched.push({ test: t.test, device: t.device, reason: keys.length ? `matches more than one master test (${keys.map(k => master[k].label).join(', ')})` : 'no master test with these words' });
      continue;
    }
    const key = keys[0];
    const m = master[key];
    const notes = [];
    const units = [...new Set(t.results.map(r => r.unit).filter(Boolean))];
    if (m.unit && units.length && !units.includes(m.unit)) notes.push(`unit in PDF is ${units.join('/')}, master test is ${m.unit}`);
    const sides = t.results.map(r => r.side);
    if (m.bilateral && !sides.some(s => s === 'left' || s === 'right')) notes.push('master test is left/right, PDF has one value');
    if (!m.bilateral && !sides.includes('value')) notes.push('master test is one value, PDF has left/right');
    if (!t.results.some(r => r.percentile !== null || r.band !== null)) notes.push('no percentile or band printed for this test');
    matched.push({ key, label: m.label, test: t.test, device: t.device, notes });
  }
  const keysFound = new Set(matched.map(m => m.key));
  for (const m of matched) {
    if (matched.filter(x => x.key === m.key).length > 1) m.notes.push('more than one test in the PDF matches this master test');
  }
  return { matched, unmatched, notInPdf: Object.keys(master).filter(k => !keysFound.has(k)) };
};

module.exports = { parseValdHubPdf, parsePages, readPages, matchToMaster, matchName, VALD_BANDS };
