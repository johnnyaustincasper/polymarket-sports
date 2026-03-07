'use client'

import { useEffect, useState } from 'react'

interface Outcome {
  name: string
  price: number
}

interface Market {
  id: string
  question: string
  volume: number
  outcomes: Outcome[]
  sport: string
  status: string
  endDate?: string
}

const SPORT_TABS = ['NBA', 'NHL', 'NCAAB', 'UFC', 'MLS', 'MLB', 'NFL']

const SPORT_ICONS: Record<string, string> = {
  NBA: '🏀',
  NHL: '🏒',
  NCAAB: '🎓',
  UFC: '🥊',
  MLS: '⚽',
  MLB: '⚾',
  NFL: '🏈',
}

function getProbColor(pct: number): string {
  if (pct >= 65) return 'bg-purple-600'
  if (pct <= 35) return 'bg-blue-600'
  return 'bg-gray-600'
}

function parseTeams(question: string): [string, string] {
  // "NBA: Lakers vs. Celtics 2026-03-06" → ["Lakers", "Celtics"]
  const cleaned = question.replace(/^(NBA|NHL|NCAAB|NFL|MLB|MLS|UFC):\s*/i, '').replace(/\d{4}-\d{2}-\d{2}.*$/, '').trim()
  const parts = cleaned.split(/\s+vs\.?\s+/i)
  return [parts[0]?.trim() || '', parts[1]?.trim() || '']
}

function GameCard({ market }: { market: Market }) {
  const vol = market.volume >= 1000000
    ? `$${(market.volume / 1000000).toFixed(1)}M`
    : `$${(market.volume / 1000).toFixed(0)}K`

  const [teamA, teamB] = parseTeams(market.question)
  const outcomeA = market.outcomes.find(o => o.name.toLowerCase().includes(teamA.split(' ').pop()?.toLowerCase() || '')) || market.outcomes[0]
  const outcomeB = market.outcomes.find(o => o !== outcomeA) || market.outcomes[1]

  const pctA = Math.round((outcomeA?.price || 0) * 100)
  const pctB = Math.round((outcomeB?.price || 0) * 100)

  return (
    <div className="border-b border-gray-800 py-4">
      {/* Teams */}
      <div className="mb-3 space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-white font-medium text-base">{teamA || outcomeA?.name}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-white font-medium text-base">{teamB || outcomeB?.name}</span>
          <span className="text-gray-500 text-xs">{vol} vol</span>
        </div>
      </div>

      {/* Probability buttons */}
      <div className="flex gap-2">
        <button className={`flex-1 py-3 rounded-xl font-bold text-white text-sm ${getProbColor(pctA)}`}>
          {outcomeA?.name?.split(' ').pop()?.toUpperCase()} {pctA}%
        </button>
        <button className={`flex-1 py-3 rounded-xl font-bold text-white text-sm ${getProbColor(pctB)}`}>
          {outcomeB?.name?.split(' ').pop()?.toUpperCase()} {pctB}%
        </button>
      </div>
    </div>
  )
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSport, setActiveSport] = useState('NBA')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchMarkets = async () => {
    try {
      const res = await fetch('/api/markets')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setMarkets(data)
      setLastUpdated(new Date())
    } catch {
      // silent fail — keep showing old data
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMarkets()
    const interval = setInterval(fetchMarkets, 30000)
    return () => clearInterval(interval)
  }, [])

  // Count per sport for tab badges
  const sportCounts = markets.reduce((acc, m) => {
    acc[m.sport] = (acc[m.sport] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const availableSports = SPORT_TABS.filter(s => sportCounts[s] > 0)
  const displayed = markets.filter(m => m.sport === activeSport)

  // Auto-select first available sport
  useEffect(() => {
    if (!loading && availableSports.length > 0 && !sportCounts[activeSport]) {
      setActiveSport(availableSports[0])
    }
  }, [loading, markets])

  return (
    <div className="max-w-md mx-auto bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="px-4 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Sports</h1>
        <span className="text-xs text-gray-500">
          {lastUpdated ? `${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      </div>

      {/* Sport tabs */}
      <div className="flex gap-1 px-4 pb-3 overflow-x-auto scrollbar-hide border-b border-gray-800">
        {SPORT_TABS.map(sport => {
          const count = sportCounts[sport] || 0
          const isActive = activeSport === sport
          return (
            <button
              key={sport}
              onClick={() => setActiveSport(sport)}
              disabled={count === 0}
              className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-lg transition-colors ${
                isActive ? 'bg-gray-800' : count === 0 ? 'opacity-30' : 'hover:bg-gray-900'
              }`}
            >
              <span className="text-lg">{SPORT_ICONS[sport]}</span>
              <span className={`text-xs mt-0.5 font-medium ${isActive ? 'text-white' : 'text-gray-500'}`}>{sport}</span>
              {count > 0 && (
                <span className="text-xs text-gray-500">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Games */}
      <div className="px-4">
        {/* Games tab selector */}
        <div className="flex gap-6 py-3 border-b border-gray-800 mb-1">
          <span className="text-white font-semibold text-sm border-b-2 border-white pb-2">Games</span>
        </div>

        {loading && (
          <div className="text-center py-20 text-gray-500 text-sm">Loading markets...</div>
        )}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-gray-500 text-sm">
            No {activeSport} games available right now
          </div>
        )}

        {displayed.map(market => (
          <GameCard key={market.id} market={market} />
        ))}
      </div>
    </div>
  )
}
