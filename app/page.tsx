'use client'

import { useEffect, useState } from 'react'

interface Team { name: string; abbr: string; record: string; score?: string }
interface Game {
  id: string
  homeTeam: Team
  awayTeam: Team
  gameTime: string
  gameDate: string
  status: string
  homeOdds: number
  awayOdds: number
  hasRealOdds: boolean
}

function btnColor(pct: number): string {
  if (pct >= 70) return 'bg-blue-600'
  if (pct >= 55) return 'bg-indigo-500'
  if (pct >= 40) return 'bg-purple-600'
  return 'bg-gray-700'
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
}

function GameCard({ game }: { game: Game }) {
  const homePct = Math.round(game.homeOdds * 100)
  const awayPct = Math.round(game.awayOdds * 100)
  const isLive = game.status === 'in'
  const isFinal = game.status === 'post'

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
      {/* Game time */}
      <div className="flex items-center gap-2 mb-3">
        {isLive && <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">LIVE</span>}
        {isFinal && <span className="text-gray-500 text-xs font-semibold">FINAL</span>}
        <span className={`text-sm ${isLive ? 'text-red-400' : 'text-gray-400'}`}>{game.gameTime}</span>
        {!game.hasRealOdds && (
          <span className="text-xs text-yellow-600 ml-auto">odds TBD</span>
        )}
      </div>

      {/* Teams */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-white font-semibold text-base">{game.awayTeam.name}</span>
            {game.awayTeam.record && <span className="text-gray-500 text-sm">{game.awayTeam.record}</span>}
          </div>
          {(isLive || isFinal) && <span className="text-white font-bold text-xl">{game.awayTeam.score}</span>}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-white font-semibold text-base">{game.homeTeam.name}</span>
            {game.homeTeam.record && <span className="text-gray-500 text-sm">{game.homeTeam.record}</span>}
          </div>
          {(isLive || isFinal) && <span className="text-white font-bold text-xl">{game.homeTeam.score}</span>}
        </div>
      </div>

      {/* Odds buttons */}
      <div className="flex gap-2 mb-3">
        <div className={`flex-1 py-3.5 rounded-2xl font-bold text-white text-base text-center ${btnColor(awayPct)}`}>
          {game.awayTeam.abbr} {awayPct}%
        </div>
        <div className={`flex-1 py-3.5 rounded-2xl font-bold text-white text-base text-center ${btnColor(homePct)}`}>
          {game.homeTeam.abbr} {homePct}%
        </div>
      </div>

      {/* Analysis button */}
      {!isFinal && (
        <button
          onClick={getAnalysis}
          className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold transition-colors"
        >
          {loadingAnalysis ? '⏳ Analyzing...' : open && analysis ? '▲ Hide Analysis' : '🎯 Analysis'}
        </button>
      )}

      {/* Analysis panel */}
      {open && (
        <div className="bg-gray-900 rounded-2xl p-4 mt-3">
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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  const load = async (date: Date) => {
    setLoading(true)
    try {
      const dateStr = formatDate(date)
      const res = await fetch(`/api/markets?date=${dateStr}`)
      if (!res.ok) throw new Error()
      setGames(await res.json())
      setUpdated(new Date())
    } catch { }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load(selectedDate)
    const t = setInterval(() => load(selectedDate), 60_000)
    return () => clearInterval(t)
  }, [selectedDate])

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const isToday = formatDate(selectedDate) === formatDate(today)
  const isTomorrow = formatDate(selectedDate) === formatDate(tomorrow)

  const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="max-w-md mx-auto bg-black min-h-screen pb-10">
      {/* Header */}
      <div className="px-4 pt-8 pb-3 flex items-center justify-between sticky top-0 bg-black z-10 border-b border-gray-800">
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

      {/* Date switcher */}
      <div className="px-4 pt-3 pb-3 flex gap-2 border-b border-gray-800">
        <button
          onClick={() => setSelectedDate(today)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${isToday ? 'bg-white text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          Today
        </button>
        <button
          onClick={() => setSelectedDate(tomorrow)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${isTomorrow ? 'bg-white text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          Tomorrow
        </button>
      </div>

      <div className="px-4">
        {loading && <p className="text-center text-gray-500 text-sm py-20">Loading {dateLabel.toLowerCase()}'s games...</p>}
        {!loading && games.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-20">No NBA games {dateLabel.toLowerCase()}</p>
        )}
        {games.map(g => <GameCard key={g.id} game={g} />)}
      </div>
    </div>
  )
}
