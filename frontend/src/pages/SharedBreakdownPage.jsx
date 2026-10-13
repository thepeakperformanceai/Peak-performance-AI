// Public page reached only through a report's private link: /breakdown/<token>.
// Shows how that report's OVR was calculated. No login needed; the link is
// random and can be turned off from the report.

import { useEffect, useState } from 'react'
import { getSharedBreakdown } from '../services/api'
import ScoreBreakdown from '../components/ScoreBreakdown'
import LOGO_URL from '../assets/pp-logo-card.png'

export default function SharedBreakdownPage({ token }) {
  const [b, setB] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // Keep private links out of search engines.
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    getSharedBreakdown(token).then(r => setB(r.breakdown)).catch(e => setError(e.message))
    return () => meta.remove()
  }, [token])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src={LOGO_URL} alt="Peak Performance" className="h-10 w-auto" style={{ display: 'inline' }} />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{b ? `${b.athleteName}: how the OVR was calculated` : 'How the OVR was calculated'}</h1>
            {b && <p className="text-xs text-gray-500">{b.sportName} · session {b.testDate}</p>}
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {error && <p className="text-sm text-red-600">{/not found/i.test(error) ? 'This link isn’t valid, or it has been turned off.' : `Couldn’t load: ${error}`}</p>}
        {!b && !error && <p className="text-sm text-gray-500">Loading…</p>}
        {b && <ScoreBreakdown b={b} methodologyHref={b.methodologyPath} />}
      </main>
    </div>
  )
}
