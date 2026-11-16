// Wallet pass strip image: the black-and-copper panel in the middle of the
// Apple / Google Wallet pass (OVR shield + stat bars).
//
// Built only from the report's own scoring output (scoring.ovr / scoring.stats),
// so the pass can never show a number the report doesn't have.

const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const FONT = path.join(__dirname, '..', 'assets', 'fonts', 'BebasNeue-Regular.ttf');

// Passcreator's recommended size for store-card images (keeps the same shape
// when Google Wallet crops it).
const SIZE = { w: 1860, h: 738 };

// Standard PeakPerformance card: black with copper metal.
const THEME = {
  panel: '#1E1814', ink: '#F4E6D8', track: '#3A2C22', mute: '#6B5A4C', line: '#3B2E25', fill: '#CD8A52',
  metal: ['#F2C08F', '#C27A44', '#8A4F27', '#D79764'], shieldInk: '#2A170A'
};

// Short labels for the stat rows. Anything else gets its first three letters.
const STAT_LABELS = {
  strength: 'STR', symmetry: 'SYM', movement: 'MOV', mobility: 'MOB', balance: 'BAL',
  speed: 'SPD', agility: 'AGI', power: 'PWR', endurance: 'END', reaction: 'REA'
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isNum = v => typeof v === 'number' && Number.isFinite(v);

/**
 * Turns a report's scoring output into { overall, stats: [{ key, label, value|null }] }.
 * Stats that aren't part of the card at all (not in the battery, hidden until
 * approved) are left out; tested-but-missing ones stay as "not tested".
 */
const stripDataFromScoring = (scoring) => {
  const overall = scoring?.ovr?.value;
  if (!isNum(overall)) {
    const err = new Error('This report has no OVR yet, so it can\'t have a Wallet card.');
    err.statusCode = 400;
    throw err;
  }
  const stats = Object.entries(scoring.stats || {})
    .filter(([, s]) => s && !s.hidden && s.status !== 'not_in_battery')
    .map(([key, s]) => ({
      key,
      label: STAT_LABELS[key] || key.slice(0, 3).toUpperCase(),
      value: isNum(s.value) ? Math.round(s.value) : null
    }))
    // Scored stats first, then "not tested", max five rows.
    .sort((a, b) => (a.value === null) - (b.value === null))
    .slice(0, 5);
  return { overall: Math.round(overall), stats };
};

const buildSvg = ({ overall, stats }) => {
  const t = THEME;
  const m = t.metal;
  const W = 144 * SIZE.w / SIZE.h;
  const sc = Math.min(1, (W - 12) / 375);
  const dx = (W - 375 * sc) / 2;
  const dy = (144 - 144 * sc) / 2;
  const barX = 162, barW = 158, rowGap = 25;
  const rowTop = 22 + (5 - stats.length) * rowGap / 2; // centre fewer rows

  const rows = stats.map((s, i) => {
    const y = rowTop + i * rowGap;
    const tested = s.value !== null;
    const col = tested ? t.ink : t.mute;
    const w = tested ? Math.max(0, Math.min(100, s.value)) / 100 * barW : 0;
    const bar = tested
      ? `<rect x="${barX}" y="${y - 3.5}" width="${barW}" height="7" rx="3.5" fill="${t.track}"/>
         <rect x="${barX}" y="${y - 3.5}" width="${w}" height="7" rx="3.5" fill="url(#barg)"/>
         <circle cx="${barX + w}" cy="${y}" r="4.2" fill="${m[0]}"/>`
      : `<rect x="${barX + 0.5}" y="${y - 3}" width="${barW - 1}" height="6" rx="3" fill="none" stroke="${t.mute}" stroke-width="1" stroke-dasharray="3 2"/>`;
    return `<text x="${barX - 8}" y="${y + 5}" text-anchor="end" font-size="15" fill="${col}" letter-spacing=".5">${esc(s.label)}</text>${bar}
      <text x="${barX + barW + 40}" y="${y + 6}" text-anchor="end" font-size="18" fill="${col}">${tested ? s.value : '–'}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="144" viewBox="0 0 ${W} 144" font-family="Bebas Neue">
  <defs>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m[0]}"/><stop offset=".45" stop-color="${m[1]}"/><stop offset=".7" stop-color="${m[2]}"/><stop offset="1" stop-color="${m[3]}"/></linearGradient>
    <linearGradient id="barg" x1="0" x2="1"><stop offset="0" stop-color="${m[2]}"/><stop offset="1" stop-color="${m[0]}"/></linearGradient>
    <linearGradient id="sheen" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="glow" cx=".2" cy=".5" r=".6"><stop offset="0" stop-color="${m[1]}" stop-opacity=".35"/><stop offset="1" stop-color="${m[1]}" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="${t.ink}" opacity=".07"/></pattern>
    <clipPath id="sh"><polygon points="14,10 118,10 118,117 66,134 14,117"/></clipPath>
  </defs>
  <rect width="${W}" height="144" fill="${t.panel}"/>
  <rect width="${W}" height="144" fill="url(#dots)"/>
  <rect width="${W}" height="144" fill="url(#glow)"/>
  <rect width="${W}" height="3" fill="url(#metal)"/>
  <rect y="141" width="${W}" height="3" fill="url(#metal)"/>
  <g transform="translate(${dx},${dy}) scale(${sc})">
    <g stroke="${t.line}" stroke-width="1.6" fill="none">
      <path d="M170 -10 L300 154"/><path d="M230 -10 L360 154"/>
      <path d="M110 60 L400 60" transform="rotate(-8 250 70)"/>
      <rect x="200" y="12" width="210" height="120" transform="skewX(-22)"/>
    </g>
    <g fill="${t.fill}" opacity=".22"><polygon points="-30,144 50,0 70,0 -10,144"/><polygon points="-6,144 74,0 80,0 0,144"/><polygon points="8,144 88,0 91,0 11,144"/></g>
    <polygon points="11,7 121,7 121,119 66,137 11,119" fill="${m[2]}"/>
    <polygon points="14,10 118,10 118,117 66,134 14,117" fill="url(#metal)"/>
    <g clip-path="url(#sh)"><polygon points="20,10 50,10 10,134 -20,134" fill="url(#sheen)"/><polygon points="62,10 70,10 30,134 22,134" fill="url(#sheen)" opacity=".6"/></g>
    <text x="66" y="90" text-anchor="middle" font-size="86" fill="${t.shieldInk}">${overall}</text>
    <rect x="28" y="98" width="76" height="1.5" fill="${t.shieldInk}" opacity=".55"/>
    <text x="66" y="116" text-anchor="middle" font-size="14" letter-spacing="3" fill="${t.shieldInk}">OVERALL</text>
    ${rows}
  </g>
</svg>`;
};

/** PNG buffer (1860 x 738) for a report's scoring output. */
const renderStrip = (scoring) => {
  const svg = buildSvg(stripDataFromScoring(scoring));
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: SIZE.w },
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Bebas Neue' }
  });
  return resvg.render().asPng();
};

module.exports = { renderStrip, stripDataFromScoring, buildSvg, STAT_LABELS, SIZE };
