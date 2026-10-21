// What was read from the uploaded VALD Hub PDF, for the tester to check
// before saving: every test and side with its value and VALD's percentile or
// band, where it went on the form, and every test that could not be read or
// matched. The report can't be generated until the tester ticks "checked".

const LEVEL_STYLE = {
  error: ['text-red-700', '✗', 'Needs attention'],
  warn: ['text-amber-700', '⚠', 'Check'],
  info: ['text-gray-600', 'ℹ', 'Note'],
}
const SIDE = { left: 'Left', right: 'Right', value: '' }

const ordinal = (n) => {
  const v = Math.round(n)
  return `${v}${(v % 100 >= 11 && v % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th')}`
}

export default function ValdPdfReview({ read, checked, onChecked, onDismiss }) {
  if (!read) return null
  const problems = read.problems || []
  const order = { error: 0, warn: 1, info: 2 }
  const sorted = [...problems].sort((a, b) => order[a.level] - order[b.level])
  const errors = problems.filter(p => p.level === 'error').length

  return (
    <div className="card border border-blue-100">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-medium text-gray-900">📄 Results read from the VALD PDF: please check</h2>
        <button type="button" className="text-xs text-gray-400 hover:text-red-600" onClick={onDismiss} title="Stop using the PDF's results">✕</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {read.athlete?.name ? <><b>{read.athlete.name}</b>{read.athlete.testDate ? ` · tested ${read.athlete.testDate}` : ''} · </> : null}
        These are filled into the form below. Compare them with the VALD report, correct anything in the form, then tick the box.
        VALD's own percentile (Dynamo) or band (HumanTrak) is used for scoring: no cut-offs.
      </p>

      {sorted.length > 0 && (
        <div className="mb-3 rounded-md bg-gray-50 border border-gray-100 p-2 space-y-0.5">
          {sorted.map((p, i) => {
            const [cls, icon, word] = LEVEL_STYLE[p.level] || LEVEL_STYLE.info
            return <div key={i} className={`text-xs ${cls}`}>{icon} <b>{word}:</b> {p.text}</div>
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-1 pr-3 font-medium">Test in the PDF</th>
              <th className="py-1 pr-3 font-medium">Side</th>
              <th className="py-1 pr-3 font-medium text-right">Value</th>
              <th className="py-1 pr-3 font-medium">VALD rating</th>
              <th className="py-1 font-medium">Goes to</th>
            </tr>
          </thead>
          <tbody>
            {read.review.map((r, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1 pr-3 text-gray-800">{r.test}<span className="text-gray-400"> · {r.device}</span></td>
                <td className="py-1 pr-3 text-gray-600">{SIDE[r.side] ?? r.side}</td>
                <td className="py-1 pr-3 text-right text-gray-800 whitespace-nowrap">{r.value == null ? <span className="text-red-700">not read</span> : `${r.value} ${r.unit || ''}`}</td>
                <td className="py-1 pr-3 whitespace-nowrap">
                  {r.percentile != null ? `${ordinal(r.percentile)} percentile` : r.band ? r.band : <span className="text-gray-400">none (measured, not rated)</span>}
                </td>
                <td className={`py-1 ${r.goesTo.kind === 'battery' ? 'text-green-700' : 'text-gray-500'}`}>
                  {r.goesTo.kind !== 'battery' ? r.goesTo.label
                    : r.percentile == null && !r.band ? `✓ ${r.goesTo.label} (measured, not rated)` : `✓ ${r.goesTo.label} (scored)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className={`mt-3 flex items-center gap-2 text-sm ${checked ? 'text-green-700' : 'text-gray-800'}`}>
        <input type="checkbox" checked={checked} onChange={e => onChecked(e.target.checked)} />
        I've checked these results against the VALD report{errors ? ` (${errors} item${errors > 1 ? 's' : ''} needing attention above)` : ''}
      </label>
    </div>
  )
}
