'use client'

import { useEffect, useState } from 'react'

interface Outcome { name: string; price: number }
interface Market {
  id: string
  question: string
  volume: number
  outcomes: Outcome[]
  sport: string
}

const SPORT_TABS = ['NBA', 'NHL', 'NCAAB', 'UFC', 'MLB', 'NFL', 'MLS']
const SPORT_ICONS: Record<string, string> = {
  NBA: '🏀', NHL: '🏒', NCAAB: '🎓', UFC: '🥊', MLB: '⚾', NFL: '🏈', MLS: '⚽',
}

function vol(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function GameCard({ market, sport }: { market: Market; sport: string }) {
  const [a, b] = market.outcomes
  const pctA = Math.round((a?.price || 0) * 100)
  const pctB = Math.round((b?.price || 0) * 100)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const getAnalysis = async () => {
    if (analysis) { setOpen(!open); return }
    setLoading(true)
    setOpen(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: market.question,
          sport,
          teamA: a?.name,
          teamB: b?.name,
          polyOddsA: pctA,
          polyOddsB: pctB,
        }),
      })
      const data = await res.json()
      setAnalysis(data.analysis || 'Analysis unavailable.')
    } catch {
      setAnalysis('Could not load analysis. Try again.')
    } finally {
      setLoading(false)
    }
  }

  // Parse bold markdown for display
  const renderAnalysis = (text: string) => {
    return text.split('\n').map((line, i) => {
      const boldLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      return <p key={i} className="text-sm text-gray-300 leading-relaxed mb-1" dangerouslySetInnerHTML={{ __html: boldLine }} />
    })
  }

  return (
    <div className="border-b border-gray-800 py-4">
      {/* Teams + odds */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <p className="text-white font-semibold text-base leading-snug">{market.question}</p>
          <p className="text-gray-500 text-xs mt-0.5">{vol(market.volume)} vol</p>
        </div>
      </div>

      {/* Win % */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 bg-blue-900/50 border border-blue-800 rounded-xl py-3 text-center">
          <div className="text-white font-bold text-lg">{pctA}%</div>
          <div className="text-blue-300 text-xs mt-0.5 truncate px-2">{a?.name}</div>
        </div>
        <div className="flex-1 bg-purple-900/50 border border-purple-800 rounded-xl py-3 text-center">
          <div className="text-white font-bold text-lg">{pctB}%</div>
          <div className="text-purple-300 text-xs mt-0.5 truncate px-2">{b?.name}</div>
        </div>
      </div>

      {/* Get Pick button */}
      <button
        onClick={getAnalysis}
        className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold transition-colors"
      >
        {loading ? '⏳ Analyzing...' : open && analysis ? '▲ Hide Analysis' : '🎯 Get Pick'}
      </button>

      {/* Analysis */}
      {open && (
        <div className="mt-3 bg-gray-900 rounded-xl p-4">
          {loading ? (
            <p className="text-gray-400 text-sm text-center">Analyzing matchup...</p>
          ) : (
            <div>{analysis && renderAnalysis(analysis)}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSport, setActiveSport] = useState('NBA')
  const [updated, setUpdated] = useState<Date | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/markets')
      if (!res.ok) throw new Error()
      setMarkets(await res.json())
      setUpdated(new Date())
    } catch { }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])

  const counts = markets.reduce((acc, m) => {
    acc[m.sport] = (acc[m.sport] || 0) + 1; return acc
  }, {} as Record<string, number>)

  const displayed = markets.filter(m => m.sport === activeSport)

  useEffect(() => {
    if (!loading && !counts[activeSport]) {
      const first = SPORT_TABS.find(s => counts[s] > 0)
      if (first) setActiveSport(first)
    }
  }, [loading, markets])

  return (
    <div className="max-w-md mx-auto bg-gray-950 min-h-screen pb-10">
      <div className="px-4 pt-8 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Sports Intel</h1>
        {updated && (
          <span className="text-xs text-gray-500">
            {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pb-0 overflow-x-auto border-b border-gray-800">
        {SPORT_TABS.map(sport => {
          const count = counts[sport] || 0
          const active = activeSport === sport
          return (
            <button
              key={sport}
              onClick={() => count > 0 && setActiveSport(sport)}
              className={`flex-shrink-0 flex flex-col items-center px-3 pt-2 pb-2 transition-colors ${
                active ? 'border-b-2 border-white' : ''
              } ${count === 0 ? 'opacity-25 cursor-default' : 'cursor-pointer'}`}
            >
              <span className="text-xl">{SPORT_ICONS[sport]}</span>
              <span className={`text-xs font-semibold mt-0.5 ${active ? 'text-white' : 'text-gray-500'}`}>{sport}</span>
              {count > 0 && <span className="text-xs text-gray-600">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="px-4 mt-2">
        {loading && <p className="text-center text-gray-500 text-sm py-20">Loading games...</p>}
        {!loading && displayed.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-20">No {activeSport} games right now</p>
        )}
        {displayed.map(m => <GameCard key={m.id} market={m} sport={activeSport} />)}
      </div>
    </div>
  )
}
