// services/vald/valdSearch.js
// Forgiving athlete-name search over VALD profiles: ignores case, accents,
// extra spaces and punctuation, matches part of the first name, last name or
// both, and offers close spellings when nothing matches.

// "  Fáraz   KHAWAJA " -> "faraz khawaja"; "O'Brien" -> "obrien"; "Al-Amin" -> "al amin"
const normalize = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
  .toLowerCase()
  .replace(/['’`.]/g, '')                              // O'Brien = OBrien
  .replace(/[^a-z0-9]+/g, ' ')                         // hyphens etc. split words
  .trim();

const tokens = (s) => normalize(s).split(' ').filter(Boolean);

// Edit distance, for "did you mean" suggestions.
const distance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
};

/**
 * searchProfiles(profiles, query) -> { matches, suggestions }
 *
 * matches: every profile where each word typed is the start of a word in the
 *   name ("arhum", "latif", "arh lat" all find "Arhum Latif"), or equals the
 *   external ID. Only if none, words found anywhere inside the name.
 *   Best first: exact full name, then names starting with the query, then A–Z.
 * suggestions: when nothing matches, up to 5 names spelt closest to the query
 *   (e.g. "faraz khawaja" -> "Faraz Khwaja").
 */
const searchProfiles = (profiles, query = '') => {
  const q = tokens(query);
  if (!q.length) return { matches: profiles, suggestions: [] };
  const qText = q.join(' ');
  const prepared = profiles.map(p => ({ p, words: tokens(p.name), text: normalize(p.name) }));

  const byPrefix = prepared.filter(({ p, words }) =>
    q.every(t => words.some(w => w.startsWith(t))) || normalize(p.externalId) === qText);
  const found = byPrefix.length ? byPrefix
    : prepared.filter(({ text }) => q.every(t => text.includes(t)));

  const rank = ({ text }) => (text === qText ? 0 : text.startsWith(qText) ? 1 : 2);
  const matches = found
    .sort((a, b) => rank(a) - rank(b) || a.p.name.localeCompare(b.p.name))
    .map(x => x.p);
  if (matches.length) return { matches, suggestions: [] };

  // Close spellings: each typed word against its nearest name word.
  const score = ({ words }) => q.reduce((sum, t) =>
    sum + Math.min(...words.map(w => Math.min(distance(t, w), distance(t, w.slice(0, t.length))))), 0);
  const allowed = Math.max(1, Math.round(qText.length / 4));   // ~1 typo per 4 letters
  const suggestions = prepared
    .filter(x => x.words.length)
    .map(x => ({ x, s: score(x) }))
    .filter(({ s }) => s <= allowed)
    .sort((a, b) => a.s - b.s || a.x.p.name.localeCompare(b.x.p.name))
    .slice(0, 5)
    .map(({ x }) => x.p);
  return { matches: [], suggestions };
};

module.exports = { normalize, searchProfiles };
