// backend/services/profileParser.service.js
// Extracts athlete fields from VALD PDF text (HumanTrak / Dynamo).
// Tuned to the real VALD header, e.g.:
//   Ayla Benazir Farhan
//   DOB: 12 March 2009 (17 years)
//   Last test: 9 June 2026
//   Practitioner: Faraz Khawaja

const firstMatch = (text, patterns) => {
  for (const re of patterns) {
    const m = text.match(re)
    if (m && m[1]) return m[1].trim()
  }
  return ''
}

const titleCase = s =>
  s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim()

const parseLooseDate = (s) => {
  const num = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (num) {
    let [, d, m, y] = num
    if (y.length === 2) y = '20' + y
    const date = new Date(Number(y), Number(m) - 1, Number(d)) // day-first
    return isNaN(date) ? null : date
  }
  const t = Date.parse(s) // handles "12 March 2009"
  return isNaN(t) ? null : new Date(t)
}

const cleanName = (raw) => {
  if (!raw) return ''
  let name = raw.replace(/\r/g, ' ').trim()
  // PDF text often glues "Last" onto the surname before "Last test:"
  name = name.replace(/([a-z])Last$/i, '$1').trim()
  // Keep only the final line if the match spilled over a newline
  // (e.g. "...Strength Assessment\nAyla Benazir Farhan" -> "Ayla Benazir Farhan")
  const lines = name.split(/\n+/).map(l => l.trim()).filter(Boolean)
  if (lines.length > 1) name = lines[lines.length - 1]
  // Drop leading report/section words that sometimes precede the name
  name = name.replace(
    /^(?:athlete performance report|movement (?:&|and) strength assessment|strength assessment|assessment|report)\s+/i,
    ''
  ).trim()
  return name
}

// Markers that indicate "we've left the name/title header and hit the
// details table" — used to find where the header block ends. Different
// report templates lead with different fields (DOB vs Age vs Height/Weight),
// and pdf-parse frequently glues the label directly onto the value with NO
// space at all (e.g. "DOB18 November 1997", "PractitionerFaraz Khawaja") —
// so these must NOT end in \b or require a colon, since a trailing \b fails
// to match between two word characters (e.g. "B" and "1") and a required
// colon fails when there isn't one.
const HEADER_STOP_MARKERS = [
  /\bDOB/i,
  /\bdate of birth/i,
  /\bAge\s*[:\-]?\s*\d/i,
  /\bHeight\s*\/\s*Weight/i,
  /\b(?:Assessment|Test)\s*Date/i,
  /\bPractitioner/i,
]

// Boilerplate lines (report titles, taglines, company branding) that can
// end up in the header block above the athlete's name — never the name
// itself, so they're filtered out before picking the "last line".
const BOILERPLATE_LINE = new RegExp(
  [
    '^peak performance$',
    '^test\\.?\\s*train\\.?\\s*perform\\.?$',
    '.*performance assessment$',
    '.*athlete performance report$',
    '^youth athlete performance report$',
    '^movement (?:&|and) strength assessment$',
    '^strength assessment$',
    '^assessment$',
    '^report$',
    "^pakistan'?s first data-driven athlete testing service$",
    '^peakperformance\\.pk$',
  ].join('|'),
  'i'
)

// Finds the header lines — everything BEFORE the line that first contains
// any stop-marker. Line-based (not a raw character-offset slice) on
// purpose: some templates put other text on the same line as the marker
// (e.g. "Football Player  |  Age: 12  |  ~40 kg"), and slicing by offset
// would leave a stray fragment of that line ("Football Player  |") as the
// last "header line" — clobbering the real name line above it.
const findHeaderLines = (text) => {
  const lines = text.split(/\n+/)
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_STOP_MARKERS.some(re => re.test(lines[i]))) {
      return lines.slice(0, i)
    }
  }
  return lines
}

const parseName = (text) => {
  // 1) "Patient:" / "Athlete:" label (appears on VALD detail pages)
  let name = firstMatch(text, [
    /\b(?:[Pp]atient|[Aa]thlete|[Cc]lient|[Pp]layer|[Nn]ame)\s*[:\-]\s*([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,4})/,
  ])
  if (name) return cleanName(name)

  // 2) Capitalised name on the last non-boilerplate line before the first
  //    line that contains a details-table marker (DOB / Age / Height-Weight
  //    / Test Date / etc.) — whichever field this template leads with.
  const headerLines = findHeaderLines(text)
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !BOILERPLATE_LINE.test(l))

  const lastLine = headerLines[headerLines.length - 1] || ''
  const m = lastLine.match(/([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,4})\s*$/)
  if (m) name = m[1].trim()
  return cleanName(name)
}

const parseProfileFromText = (text = '') => {
  const t = text.replace(/\r/g, ' ')

  const name = parseName(text) // pass original (with newlines) so line logic works

  // ── DOB ──  "DOB: 12 March 2009", "DOB 18 November 1997", or "DOB: 12/03/2009"
  const dob = firstMatch(t, [
    /\b(?:date of birth|d\.?o\.?b\.?)\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{2,4})/i,
    /\b(?:date of birth|d\.?o\.?b\.?)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
  ])

  // ── Age ──  "(17 years)" or "Age: 17", else derive from DOB
  let age = firstMatch(t, [
    /\(\s*(\d{1,3})\s*years?\s*\)/i,
    /\bage\s*[:\-]\s*(\d{1,3})/i,
  ])
  if (!age && dob) {
    const d = parseLooseDate(dob)
    if (d) {
      const yrs = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5))
      if (yrs > 0 && yrs < 120) age = String(yrs)
    }
  }

  // ── Weight ──  "Weight: 37 kg", "38 kg" (youth summary line), or
  // "Height / Weight 178 cm / 86 kg (BMI 27.1)" (combined field — take the
  // number right before "kg")
  const weight = firstMatch(t, [
    /\bweight\s*[:\-]?\s*(\d{1,3}(?:\.\d)?\s*kg)/i,
    /\/\s*(\d{1,3}(?:\.\d)?)\s*kg\b/i,
    /\b(\d{1,3}(?:\.\d)?)\s*kg\b/i,
    /\bweight\s*[:\-]?\s*(\d{1,3}(?:\.\d)?)/i,
  ])

  // ── Sport ──  "Sport: Cricket" or "SportCricket" — restricted to the
  // header zone (text before the first blank line) so this doesn't match
  // the word "sport" turning up incidentally in body prose (e.g. "...before
  // the demands of sport increase" would otherwise wrongly capture "Increase").
  const headerZone = t.split(/\n\s*\n/)[0] || t
  const sport = firstMatch(headerZone, [/\bsport\s*[:\-]?\s*([A-Za-z]{2,30})/i])

  // ── Test date ──  "Last test: 9 June 2026" or "Test Date 4 June 2026"
  const testDate = firstMatch(t, [
    /\b(?:last test|test date|assessment date|date of (?:test|assessment))\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{2,4})/i,
    /\b(?:last test|test date|assessment date)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
  ])

  // ── Practitioner ──  "Practitioner: Faraz Khawaja" or "PractitionerFaraz Khawaja"
  // (same-line whitespace only — \s would also match \n and swallow the
  // next line's text, e.g. a "Pakistan's ..." tagline right below it)
  const practitioner = firstMatch(t, [
    /\b[Pp]ractitioner\s*[:\-]?[ \t]*([A-Z][a-zA-Z.'-]+(?:[ \t]+[A-Z][a-zA-Z.'-]+){0,2})/,
  ])

  return {
    name,
    dob,
    age,
    weight,
    sport: sport ? titleCase(sport) : '',
    testDate,
    practitioner,
  }
}

module.exports = { parseProfileFromText }