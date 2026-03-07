'use client'

import { useEffect, useState } from 'react'

interface Outcome {
  name: string
  abbr: string
  record: string
  price: number
}

interface Market {
  id: string
  question: string
  volume: number
  outcomes: Outcome[]
  sport: string
  gameTime?: string
}

function btnColor(pct: number, idx: number): string {
  if (pct >= 80) return idx === 0 ? 'bg-blue-600' : 'bg-blue-600'
  if (pct >= 60) return 'bg-pink-600'
  if (pct <= 20) return 'bg-gray-700 text-gray-400'
  return 'bg-blue-500'
}

function GameCard({ market }: { market: Market }) {
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
          sport: 'NBA',
          teamA: a?.name,
          teamB: b?.name,
          recordA: a?.record,
          recordB: b?.record,
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

  const renderAnalysis = (text: string) =>
    text.split('\n').filter(l => l.trim()).map((line, i) => {
      const html = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
      return <p key={i} className="text-sm text-gray-300 leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: html }} />
    })

  return (
    <div className="py-5 border-b border-gray-800">
      {/* Game time */}
      {market.gameTime && (
        <p className="text-gray-500 text-xs mb-2">{market.gameTime}</p>
      )}

      {/* Teams */}
      <div className="mb-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👟</span>
          <div>
            <span className="text-white font-semibold text-base">{a?.name}</span>
            {a?.record && <span className="text-gray-500 text-sm ml-2">{a.record}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">👟</span>
          <div>
            <span className="text-white font-semibold text-base">{b?.name}</span>
            {b?.record && <span className="text-gray-500 text-sm ml-2">{b.record}</span>}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={getAnalysis}
          className={`flex-1 py-3.5 rounded-2xl font-bold text-white text-base ${btnColor(pctA, 0)}`}
        >
          {a?.abbr} {pctA}%
        </button>
        <button
          onClick={getAnalysis}
          className={`flex-1 py-3.5 rounded-2xl font-bold text-white text-base ${btnColor(pctB, 1)}`}
        >
          {b?.abbr} {pctB}%
        </button>
      </div>

      {/* Analysis panel */}
      {open && (
        <div className="bg-gray-900 rounded-2xl p-4">
          {loading
            ? <p className="text-gray-400 text-sm text-center py-2">Analyzing matchup...</p>
            : <div>{analysis && renderAnalysis(analysis)}</div>
          }
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
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

  return (
    <div className="max-w-md mx-auto bg-black min-h-screen pb-10">
      {/* Header */}
      <div className="px-4 pt-8 pb-2 flex items-center justify-between sticky top-0 bg-black z-10 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏀</span>
          <h1 className="text-xl font-bold text-white">NBA Intel</h1>
        </div>
        {updated && (
          <span className="text-xs text-gray-500">
            {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Games tab */}
      <div className="px-4 pt-2 pb-0 border-b border-gray-800">
        <span className="text-white font-semibold text-sm pb-2 border-b-2 border-white inline-block">Games</span>
      </div>

      <div className="px-4">
        {loading && <p className="text-center text-gray-500 text-sm py-20">Loading games...</p>}
        {!loading && markets.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-20">No NBA games right now</p>
        )}
        {markets.map(m => <GameCard key={m.id} market={m} />)}
      </div>
    </div>
  )
}
