'use client'

import { useEffect, useState } from 'react'

interface Team { name: string; abbr: string; record: string; score?: string }
interface Game {
  id: string
  homeTeam: Team
  awayTeam: Team
  gameTime: string
  status: string
  homeOdds: number
  awayOdds: number
}

function btnColor(pct: number): string {
  if (pct >= 70) return 'bg-blue-600'
  if (pct >= 50) return 'bg-indigo-500'
  if (pct >= 35) return 'bg-purple-600'
  return 'bg-gray-700'
}

function GameCard({ game }: { game: Game }) {
  const homePct = Math.round(game.homeOdds * 100)
  const awayPct = Math.round(game.awayOdds * 100)
  const isLive = game.status === 'in'

  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [open, setOpen] = useState(false)

  const getAnalysis = async () => {
    if (analysis) { setOpen(!open); return }
    setLoadingAnalysis(true)
    setOpen(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `NBA: ${game.awayTeam.name} vs ${game.homeTeam.name}`,
          sport: 'NBA',
          teamA: game.awayTeam.name,
          teamB: game.homeTeam.name,
          recordA: game.awayTeam.record,
          recordB: game.homeTeam.record,
          polyOddsA: awayPct,
          polyOddsB: homePct,
        }),
      })
      const data = await res.json()
      setAnalysis(data.analysis || 'Analysis unavailable.')
    } catch {
      setAnalysis('Could not load analysis. Try again.')
    } finally {
      setLoadingAnalysis(false)
    }
  }

  const renderAnalysis = (text: string) =>
    text.split('\n').filter(l => l.trim()).map((line, i) => {
      const html = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
      return <p key={i} className="text-sm text-gray-300 leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: html }} />
    })

  return (
    <div className="py-5 border-b border-gray-800">
      {/* Game time / status */}
      <div className="flex items-center gap-2 mb-3">
        {isLive && <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">LIVE</span>}
        <span className="text-gray-400 text-sm">{game.gameTime}</span>
      </div>

      {/* Teams */}
      <div className="space-y-2 mb-4">
        {/* Away team */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-white font-semibold text-base">{game.awayTeam.name}</span>
            {game.awayTeam.record && (
              <span className="text-gray-500 text-sm ml-2">{game.awayTeam.record}</span>
            )}
          </div>
          {isLive && game.awayTeam.score && (
            <span className="text-white font-bold text-xl">{game.awayTeam.score}</span>
          )}
        </div>
        {/* Home team */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-white font-semibold text-base">{game.homeTeam.name}</span>
            {game.homeTeam.record && (
              <span className="text-gray-500 text-sm ml-2">{game.homeTeam.record}</span>
            )}
          </div>
          {isLive && game.homeTeam.score && (
            <span className="text-white font-bold text-xl">{game.homeTeam.score}</span>
          )}
        </div>
      </div>

      {/* Odds buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={getAnalysis}
          className={`flex-1 py-3.5 rounded-2xl font-bold text-white text-base transition-opacity hover:opacity-90 ${btnColor(awayPct)}`}
        >
          {game.awayTeam.abbr} {awayPct}%
        </button>
        <button
          onClick={getAnalysis}
          className={`flex-1 py-3.5 rounded-2xl font-bold text-white text-base transition-opacity hover:opacity-90 ${btnColor(homePct)}`}
        >
          {game.homeTeam.abbr} {homePct}%
        </button>
      </div>

      {/* Analysis */}
      {open && (
        <div className="bg-gray-900 rounded-2xl p-4 mt-1">
          {loadingAnalysis
            ? <p className="text-gray-400 text-sm text-center py-2">Analyzing matchup...</p>
            : <div>{analysis && renderAnalysis(analysis)}</div>
          }
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState<Date | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/markets')
      if (!res.ok) throw new Error()
      setGames(await res.json())
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
      <div className="px-4 pt-8 pb-3 flex items-center justify-between sticky top-0 bg-black z-10 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏀</span>
          <h1 className="text-xl font-bold text-white">NBA Intel</h1>
        </div>
        <div className="flex items-center gap-3">
          {updated && (
            <span className="text-xs text-gray-500">
              {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={load} className="text-gray-400 text-lg">↻</button>
        </div>
      </div>

      {/* Tab */}
      <div className="px-4 pt-3 pb-0 border-b border-gray-800">
        <span className="text-white font-semibold text-sm pb-2 border-b-2 border-white inline-block">Games</span>
      </div>

      <div className="px-4">
        {loading && <p className="text-center text-gray-500 text-sm py-20">Loading today's games...</p>}
        {!loading && games.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-sm">No NBA games today</p>
          </div>
        )}
        {games.map(g => <GameCard key={g.id} game={g} />)}
      </div>
    </div>
  )
}
