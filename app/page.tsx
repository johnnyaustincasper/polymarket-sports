'use client'

import { useEffect, useState } from 'react'

interface Market {
  id: string
  question: string
  volume: number
  outcomes: { name: string; price: number }[]
  sport: string
  status: string
  startDate?: string
}

const SPORT_TAGS: Record<string, string> = {
  NBA: '🏀',
  NHL: '🏒',
  NCAAB: '🏀',
  NFL: '🏈',
  MLB: '⚾',
  MLS: '⚽',
  UFC: '🥊',
}

const SPORT_ORDER = ['NBA', 'NHL', 'NCAAB', 'NFL', 'MLB', 'MLS', 'UFC', 'OTHER']

function ValueBadge({ price }: { price: number }) {
  // Flag markets where underdog is priced higher than typical — potential value
  const pct = Math.round(price * 100)
  if (pct <= 35) return <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">VALUE {pct}%</span>
  if (pct >= 65) return <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">FAV {pct}%</span>
  return <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">TOSS {pct}%</span>
}

function MarketCard({ market }: { market: Market }) {
  const vol = market.volume >= 1000000
    ? `$${(market.volume / 1000000).toFixed(1)}M`
    : `$${(market.volume / 1000).toFixed(0)}K`

  const outcomes = market.outcomes || []
  const sorted = [...outcomes].sort((a, b) => b.price - a.price)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-medium text-gray-100 leading-snug">{market.question}</p>
        <span className="text-xs text-gray-500 whitespace-nowrap">{vol} vol</span>
      </div>

      <div className="space-y-2">
        {sorted.map((outcome, i) => {
          const pct = Math.round(outcome.price * 100)
          const barWidth = `${pct}%`
          return (
            <div key={i}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-300 truncate max-w-[200px]">{outcome.name}</span>
                <ValueBadge price={outcome.price} />
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${i === 0 ? 'bg-blue-500' : 'bg-gray-600'}`}
                  style={{ width: barWidth }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSport, setActiveSport] = useState('NBA')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchMarkets = async () => {
    try {
      const res = await fetch('/api/markets')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setMarkets(data)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError('Failed to load markets. Retrying...')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMarkets()
    const interval = setInterval(fetchMarkets, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const sportGroups = SPORT_ORDER.reduce((acc, sport) => {
    const group = markets.filter(m => m.sport === sport)
    if (group.length > 0) acc[sport] = group
    return acc
  }, {} as Record<string, Market[]>)

  const availableSports = Object.keys(sportGroups)
  const displayed = sportGroups[activeSport] || []

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Poly Sports Intel</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={fetchMarkets}
          className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Sport tabs */}
      {!loading && availableSports.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {availableSports.map(sport => (
            <button
              key={sport}
              onClick={() => setActiveSport(sport)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeSport === sport
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {SPORT_TAGS[sport] || '🏅'} {sport}
              <span className="ml-1.5 text-xs opacity-70">{sportGroups[sport].length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div className="text-center py-20 text-gray-500">
          <div className="text-4xl mb-3">⏳</div>
          <p>Loading live markets...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <div className="text-4xl mb-3">😴</div>
          <p>No live {activeSport} markets right now</p>
        </div>
      )}

      <div className="space-y-3">
        {displayed.map(market => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>

      {/* Value legend */}
      {!loading && displayed.length > 0 && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium mb-2">READING THE ODDS</p>
          <div className="space-y-1 text-xs text-gray-400">
            <p><span className="text-green-400">■ VALUE</span> — Underdog at 35% or less. Worth a look.</p>
            <p><span className="text-yellow-400">■ TOSS</span> — Close to 50/50. Coin flip territory.</p>
            <p><span className="text-blue-400">■ FAV</span> — Heavy favorite at 65%+.</p>
          </div>
        </div>
      )}
    </div>
  )
}
