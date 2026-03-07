'use client'

import { useEffect, useState } from 'react'

interface Outcome { name: string; price: number }
interface Market {
  id: string
  question: string
  volume: number
  outcomes: Outcome[]
  sport: string
  gameStartTime?: string
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

function GameCard({ market }: { market: Market }) {
  const [a, b] = market.outcomes
  const pctA = Math.round((a?.price || 0) * 100)
  const pctB = Math.round((b?.price || 0) * 100)

  return (
    <div className="border-b border-gray-800 py-5">
      {/* Matchup title */}
      <div className="flex justify-between items-start mb-4">
        <p className="text-white font-semibold text-base leading-snug pr-4">{market.question}</p>
        <span className="text-gray-500 text-xs whitespace-nowrap">{vol(market.volume)}</span>
      </div>

      {/* Win % buttons */}
      <div className="flex gap-2">
        <button className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-2xl py-4 text-center transition-colors">
          <div className="text-white font-bold text-xl">{pctA}%</div>
          <div className="text-blue-200 text-xs mt-0.5 truncate px-1">{a?.name}</div>
        </button>
        <button className="flex-1 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 rounded-2xl py-4 text-center transition-colors">
          <div className="text-white font-bold text-xl">{pctB}%</div>
          <div className="text-purple-200 text-xs mt-0.5 truncate px-1">{b?.name}</div>
        </button>
      </div>
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
    } catch { /* keep old data */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  const counts = markets.reduce((acc, m) => {
    acc[m.sport] = (acc[m.sport] || 0) + 1; return acc
  }, {} as Record<string, number>)

  const displayed = markets.filter(m => m.sport === activeSport)

  // Auto-switch to first available sport
  useEffect(() => {
    if (!loading && !counts[activeSport]) {
      const first = SPORT_TABS.find(s => counts[s] > 0)
      if (first) setActiveSport(first)
    }
  }, [loading, markets])

  return (
    <div className="max-w-md mx-auto bg-gray-950 min-h-screen pb-8">
      {/* Header */}
      <div className="px-4 pt-8 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Sports</h1>
        {updated && (
          <span className="text-xs text-gray-500">
            {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Sport tabs */}
      <div className="flex gap-1 px-3 pb-1 overflow-x-auto border-b border-gray-800">
        {SPORT_TABS.map(sport => {
          const count = counts[sport] || 0
          const active = activeSport === sport
          return (
            <button
              key={sport}
              onClick={() => count > 0 && setActiveSport(sport)}
              className={`flex-shrink-0 flex flex-col items-center px-3 pt-2 pb-2 rounded-t-lg transition-colors ${
                active ? 'border-b-2 border-white' : ''
              } ${count === 0 ? 'opacity-25 cursor-default' : 'cursor-pointer'}`}
            >
              <span className="text-xl">{SPORT_ICONS[sport]}</span>
              <span className={`text-xs font-semibold mt-0.5 ${active ? 'text-white' : 'text-gray-400'}`}>
                {sport}
              </span>
              {count > 0 && (
                <span className="text-xs text-gray-600">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Game list */}
      <div className="px-4 mt-2">
        {loading && (
          <p className="text-center text-gray-500 text-sm py-20">Loading...</p>
        )}
        {!loading && displayed.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-20">
            No {activeSport} games right now
          </p>
        )}
        {displayed.map(m => <GameCard key={m.id} market={m} />)}
      </div>
    </div>
  )
}
