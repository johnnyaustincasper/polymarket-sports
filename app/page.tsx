'use client'

import { useState, useEffect, useCallback } from 'react'

interface Team {
  name: string
  abbr: string
  record: string
  score: string
  logo: string
  color: string
  alternateColor: string
}

interface Game {
  id: string
  homeTeam: Team
  awayTeam: Team
  gameTime: string
  gameDate: string
  status: 'pre' | 'in' | 'post'
  homeWinOdds: number
  awayWinOdds: number
  hasWinnerOdds: boolean
  spreadLine: number
  spreadHomeOdds: number
  spreadAwayOdds: number
  spreadFavoriteTeam: string
  hasSpreadOdds: boolean
  totalLine: number
  overOdds: number
  underOdds: number
  hasTotalOdds: boolean
}

function pct(val: number) {
  return Math.round(val * 100)
}

function OddsButton({ label, sublabel, value, highlight }: {
  label: string
  sublabel?: string
  value: number
  highlight?: boolean
}) {
  const p = pct(value)
  const isHot = p >= 55
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[80px] ${
      isHot
        ? 'bg-amber-500 text-black'
        : 'bg-zinc-800 text-zinc-200'
    }`}>
      {sublabel && <span className="text-[11px] font-medium opacity-80 mb-0.5">{sublabel}</span>}
      <span className="text-base font-bold">{p}%</span>
      {label && <span className="text-[10px] opacity-70 mt-0.5">{label}</span>}
    </div>
  )
}

function TeamBadge({ team, winOdds, align }: { team: Team; winOdds: number; align: 'left' | 'right' }) {
  return (
    <div className={`flex flex-col items-center gap-1 w-20 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-sm shadow-lg"
        style={{ backgroundColor: `#${team.color}` }}
      >
        {team.abbr}
      </div>
      <span className="text-white text-xs font-bold">{team.abbr}</span>
      <span className="text-zinc-400 text-[10px]">{team.record}</span>
    </div>
  )
}

function WinProbBar({ homeOdds, awayOdds, homeAbbr, awayAbbr }: {
  homeOdds: number; awayOdds: number; homeAbbr: string; awayAbbr: string
}) {
  const hp = pct(homeOdds)
  const ap = pct(awayOdds)
  return (
    <div className="w-full px-2 my-3">
      <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
        <span>{awayAbbr} {ap}%</span>
        <span>{homeAbbr} {hp}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
          style={{ width: `${hp}%` }}
        />
      </div>
    </div>
  )
}

function GameCard({ game }: { game: Game }) {
  const isLive = game.status === 'in'
  const isFinal = game.status === 'post'
  const spreadFromHome = game.spreadLine
  const homeIsFav = spreadFromHome < 0
  const homeSpreadLabel = spreadFromHome > 0 ? `+${spreadFromHome}` : `${spreadFromHome}`
  const awaySpreadLabel = spreadFromHome > 0 ? `${-spreadFromHome}` : `+${-spreadFromHome}`

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-3">
      {/* Header: status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          <span className={`text-xs font-semibold ${isLive ? 'text-red-400' : isFinal ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {isLive ? `LIVE · ${game.gameTime}` : isFinal ? 'Final' : game.gameTime}
          </span>
        </div>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">NBA</span>
      </div>

      {/* Teams + Score */}
      <div className="flex items-center justify-between mb-2">
        <TeamBadge team={game.awayTeam} winOdds={game.awayWinOdds} align="left" />

        <div className="flex flex-col items-center gap-1">
          {(isLive || isFinal) ? (
            <div className="flex items-center gap-3">
              <span className="text-white text-2xl font-black">{game.awayTeam.score}</span>
              <span className="text-zinc-600 text-sm">–</span>
              <span className="text-white text-2xl font-black">{game.homeTeam.score}</span>
            </div>
          ) : (
            <span className="text-zinc-400 text-sm">vs</span>
          )}
        </div>

        <TeamBadge team={game.homeTeam} winOdds={game.homeWinOdds} align="right" />
      </div>

      {/* Win probability bar */}
      {game.hasWinnerOdds && (
        <WinProbBar
          homeOdds={game.homeWinOdds}
          awayOdds={game.awayWinOdds}
          homeAbbr={game.homeTeam.abbr}
          awayAbbr={game.awayTeam.abbr}
        />
      )}

      {/* Game Lines */}
      {(game.hasWinnerOdds || game.hasSpreadOdds || game.hasTotalOdds) && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest mb-2">Game Lines</p>

          {/* Header row */}
          <div className="grid grid-cols-4 text-[11px] text-zinc-500 text-center mb-1 px-1">
            <span className="text-left">Team</span>
            <span>Winner</span>
            <span>Spread</span>
            <span>Totals</span>
          </div>

          {/* Away row */}
          <div className="grid grid-cols-4 items-center gap-1 mb-2">
            <span className="text-white text-xs font-bold">{game.awayTeam.abbr}</span>
            {game.hasWinnerOdds
              ? <OddsButton label="" value={game.awayWinOdds} />
              : <div className="text-zinc-600 text-xs text-center">—</div>}
            {game.hasSpreadOdds
              ? <OddsButton label="" sublabel={homeIsFav ? awaySpreadLabel : homeSpreadLabel} value={homeIsFav ? game.spreadAwayOdds : game.spreadHomeOdds} />
              : <div className="text-zinc-600 text-xs text-center">—</div>}
            {game.hasTotalOdds
              ? <OddsButton label="" sublabel={`O ${game.totalLine}`} value={game.overOdds} />
              : <div className="text-zinc-600 text-xs text-center">—</div>}
          </div>

          {/* Home row */}
          <div className="grid grid-cols-4 items-center gap-1">
            <span className="text-white text-xs font-bold">{game.homeTeam.abbr}</span>
            {game.hasWinnerOdds
              ? <OddsButton label="" value={game.homeWinOdds} />
              : <div className="text-zinc-600 text-xs text-center">—</div>}
            {game.hasSpreadOdds
              ? <OddsButton label="" sublabel={homeIsFav ? homeSpreadLabel : awaySpreadLabel} value={homeIsFav ? game.spreadHomeOdds : game.spreadAwayOdds} />
              : <div className="text-zinc-600 text-xs text-center">—</div>}
            {game.hasTotalOdds
              ? <OddsButton label="" sublabel={`U ${game.totalLine}`} value={game.underOdds} />
              : <div className="text-zinc-600 text-xs text-center">—</div>}
          </div>
        </div>
      )}

      {/* No odds available */}
      {!game.hasWinnerOdds && !game.hasSpreadOdds && !game.hasTotalOdds && (
        <div className="mt-3 pt-3 border-t border-zinc-800 text-center text-zinc-600 text-xs">
          Polymarket lines open closer to tip-off
        </div>
      )}
    </div>
  )
}

function DateNav({ selected, onChange }: { selected: string; onChange: (d: string) => void }) {
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i - 1)
    return {
      label: i === 1 ? 'Today' : i === 0 ? 'Yest' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      value: d.toISOString().slice(0, 10).replace(/-/g, ''),
    }
  })

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
      {days.map(day => (
        <button
          key={day.value}
          onClick={() => onChange(day.value)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            selected === day.value
              ? 'bg-amber-500 text-black'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          {day.label}
        </button>
      ))}
    </div>
  )
}

export default function Home() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const [date, setDate] = useState(today)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch(`/api/markets?date=${date}`)
      const data = await res.json()
      setGames(data)
      setLastUpdated(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    setLoading(true)
    fetchGames()
    const interval = setInterval(fetchGames, 60000) // refresh every minute
    return () => clearInterval(interval)
  }, [fetchGames])

  const liveGames = games.filter(g => g.status === 'in')
  const upcomingGames = games.filter(g => g.status === 'pre')
  const finalGames = games.filter(g => g.status === 'post')

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">NBA Lines</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              Powered by <span className="text-amber-400">Polymarket</span>
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); fetchGames() }}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:bg-zinc-700 transition-all"
          >
            ↻
          </button>
        </div>

        {/* Date Nav */}
        <DateNav selected={date} onChange={setDate} />

        {/* Last updated */}
        {lastUpdated && (
          <p className="text-[10px] text-zinc-600 mb-3 text-right">
            Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        )}

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-48 animate-pulse" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500 text-lg">No games scheduled</p>
            <p className="text-zinc-600 text-sm mt-1">Try a different date</p>
          </div>
        ) : (
          <>
            {liveGames.length > 0 && (
              <section className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <h2 className="text-xs font-semibold text-red-400 uppercase tracking-widest">Live</h2>
                </div>
                {liveGames.map(g => <GameCard key={g.id} game={g} />)}
              </section>
            )}
            {upcomingGames.length > 0 && (
              <section className="mb-4">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Upcoming</h2>
                {upcomingGames.map(g => <GameCard key={g.id} game={g} />)}
              </section>
            )}
            {finalGames.length > 0 && (
              <section className="mb-4">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Final</h2>
                {finalGames.map(g => <GameCard key={g.id} game={g} />)}
              </section>
            )}
          </>
        )}

        <p className="text-center text-zinc-700 text-[10px] mt-6">
          Odds from Polymarket prediction markets · Not financial advice
        </p>
      </div>
    </main>
  )
}
