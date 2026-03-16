'use client'

import { useState, useEffect, useCallback } from 'react'

interface Team {
  name: string
  abbr: string
  record: string
  score: string
  logo: string
  color: string
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

const pct = (v: number) => Math.round(v * 100)

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`
      rounded-3xl border border-white/10
      bg-white/5 backdrop-blur-2xl
      shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
      ${className}
    `}>
      {children}
    </div>
  )
}

function OddsChip({ top, bottom, hot }: { top: string; bottom: string; hot: boolean }) {
  return (
    <div className={`
      flex flex-col items-center justify-center rounded-2xl px-2 py-2 min-w-[72px]
      border transition-all
      ${hot
        ? 'bg-amber-400/20 border-amber-400/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
        : 'bg-white/5 border-white/10 text-white/60'
      }
    `}>
      <span className="text-[10px] font-medium opacity-70 leading-tight">{top}</span>
      <span className="text-sm font-bold leading-tight">{bottom}%</span>
    </div>
  )
}

function TeamRow({ team, winOdds, spreadOdds, spreadLabel, totalOdds, totalLabel, isOver }: {
  team: Team
  winOdds: number
  spreadOdds: number
  spreadLabel: string
  totalOdds: number
  totalLabel: string
  isOver: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Team */}
      <div className="flex items-center gap-2 w-24 flex-shrink-0">
        {team.logo
          ? <img src={team.logo} className="w-7 h-7 object-contain" alt={team.abbr} />
          : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black"
              style={{ backgroundColor: `#${team.color || '334155'}` }}
            >
              {team.abbr.slice(0, 2)}
            </div>
          )
        }
        <div>
          <p className="text-white text-xs font-bold leading-tight">{team.abbr}</p>
          <p className="text-white/40 text-[10px] leading-tight">{team.record}</p>
        </div>
      </div>

      {/* Winner */}
      <OddsChip top="WIN" bottom={String(pct(winOdds))} hot={pct(winOdds) >= 55} />

      {/* Spread */}
      <OddsChip top={spreadLabel} bottom={String(pct(spreadOdds))} hot={pct(spreadOdds) >= 55} />

      {/* Total */}
      <OddsChip top={totalLabel} bottom={String(pct(totalOdds))} hot={pct(totalOdds) >= 55} />
    </div>
  )
}

function GameCard({ game }: { game: Game }) {
  const isLive = game.status === 'in'
  const isFinal = game.status === 'post'

  // Spread labels from each team's perspective
  const homeSpreadLabel = game.spreadLine < 0
    ? `${game.spreadLine}`
    : `+${game.spreadLine}`
  const awaySpreadLabel = game.spreadLine < 0
    ? `+${-game.spreadLine}`
    : `${-game.spreadLine}`

  const awaySpreadOdds = game.spreadLine < 0 ? game.spreadAwayOdds : game.spreadHomeOdds
  const homeSpreadOdds = game.spreadLine < 0 ? game.spreadHomeOdds : game.spreadAwayOdds

  return (
    <GlassCard className="p-4 mb-3">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-red-400 text-[11px] font-semibold tracking-wide">LIVE</span>
            </span>
          )}
          <span className={`text-[11px] font-medium ${isLive ? 'text-white/70' : isFinal ? 'text-white/40' : 'text-white/50'}`}>
            {isLive ? game.gameTime : isFinal ? 'Final' : game.gameTime}
          </span>
        </div>
        <span className="text-[10px] text-white/20 font-medium uppercase tracking-widest">NBA</span>
      </div>

      {/* Score (live/final) */}
      {(isLive || isFinal) && (
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            {game.awayTeam.logo
              ? <img src={game.awayTeam.logo} className="w-8 h-8 object-contain" alt={game.awayTeam.abbr} />
              : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] font-black">{game.awayTeam.abbr.slice(0,2)}</div>
            }
            <span className="text-white font-black text-2xl">{game.awayTeam.score}</span>
          </div>
          <span className="text-white/20 text-sm">—</span>
          <div className="flex items-center gap-2">
            <span className="text-white font-black text-2xl">{game.homeTeam.score}</span>
            {game.homeTeam.logo
              ? <img src={game.homeTeam.logo} className="w-8 h-8 object-contain" alt={game.homeTeam.abbr} />
              : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] font-black">{game.homeTeam.abbr.slice(0,2)}</div>
            }
          </div>
        </div>
      )}

      {/* Win prob bar (when odds available) */}
      {game.hasWinnerOdds && (
        <div className="mb-3">
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
              style={{ width: `${pct(game.homeWinOdds)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-white/40 text-[10px]">{game.awayTeam.abbr} {pct(game.awayWinOdds)}%</span>
            <span className="text-white/40 text-[10px]">{game.homeTeam.abbr} {pct(game.homeWinOdds)}%</span>
          </div>
        </div>
      )}

      {/* Lines table */}
      {(game.hasWinnerOdds || game.hasSpreadOdds || game.hasTotalOdds) ? (
        <div className="mt-1">
          {/* Column headers */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-24 flex-shrink-0" />
            <div className="min-w-[72px] text-center text-[10px] text-white/30 font-semibold uppercase tracking-wider">Winner</div>
            <div className="min-w-[72px] text-center text-[10px] text-white/30 font-semibold uppercase tracking-wider">Spread</div>
            <div className="min-w-[72px] text-center text-[10px] text-white/30 font-semibold uppercase tracking-wider">Total</div>
          </div>

          <div className="flex flex-col gap-2">
            <TeamRow
              team={game.awayTeam}
              winOdds={game.hasWinnerOdds ? game.awayWinOdds : 0.5}
              spreadOdds={game.hasSpreadOdds ? awaySpreadOdds : 0.5}
              spreadLabel={game.hasSpreadOdds ? awaySpreadLabel : '—'}
              totalOdds={game.hasTotalOdds ? game.overOdds : 0.5}
              totalLabel={game.hasTotalOdds ? `O ${game.totalLine}` : '—'}
              isOver
            />
            <TeamRow
              team={game.homeTeam}
              winOdds={game.hasWinnerOdds ? game.homeWinOdds : 0.5}
              spreadOdds={game.hasSpreadOdds ? homeSpreadOdds : 0.5}
              spreadLabel={game.hasSpreadOdds ? homeSpreadLabel : '—'}
              totalOdds={game.hasTotalOdds ? game.underOdds : 0.5}
              totalLabel={game.hasTotalOdds ? `U ${game.totalLine}` : '—'}
              isOver={false}
            />
          </div>
        </div>
      ) : (
        /* No odds yet — show matchup */
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {game.awayTeam.logo
              ? <img src={game.awayTeam.logo} className="w-8 h-8 object-contain" />
              : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] font-black">{game.awayTeam.abbr.slice(0,2)}</div>
            }
            <div>
              <p className="text-white text-sm font-bold">{game.awayTeam.abbr}</p>
              <p className="text-white/40 text-[10px]">{game.awayTeam.record}</p>
            </div>
          </div>
          <span className="text-white/20 text-xs">vs</span>
          <div className="flex items-center gap-2 flex-row-reverse">
            {game.homeTeam.logo
              ? <img src={game.homeTeam.logo} className="w-8 h-8 object-contain" />
              : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] font-black">{game.homeTeam.abbr.slice(0,2)}</div>
            }
            <div className="text-right">
              <p className="text-white text-sm font-bold">{game.homeTeam.abbr}</p>
              <p className="text-white/40 text-[10px]">{game.homeTeam.record}</p>
            </div>
          </div>
        </div>
      )}

      {!game.hasWinnerOdds && !game.hasSpreadOdds && !game.hasTotalOdds && (
        <p className="text-center text-white/20 text-[10px] mt-3">Lines open closer to tip-off</p>
      )}
    </GlassCard>
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
      setGames(Array.isArray(data) ? data : [])
      setLastUpdated(new Date())
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    setLoading(true)
    fetchGames()
    const iv = setInterval(fetchGames, 60000)
    return () => clearInterval(iv)
  }, [fetchGames])

  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i - 2)
    return {
      label: i === 2 ? 'Today' : i === 1 ? 'Yest' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: d.toISOString().slice(0, 10).replace(/-/g, ''),
    }
  })

  const live = games.filter(g => g.status === 'in')
  const upcoming = games.filter(g => g.status === 'pre')
  const final = games.filter(g => g.status === 'post')

  return (
    <main
      className="min-h-screen text-white relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1520 40%, #0a1208 100%)',
      }}
    >
      {/* Ambient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-amber-500/8 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 rounded-full bg-emerald-600/8 blur-3xl" />
      </div>

      <div className="relative max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              NBA <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">Lines</span>
            </h1>
            <p className="text-white/30 text-xs mt-0.5">Polymarket Odds</p>
          </div>
          <button
            onClick={() => { setLoading(true); fetchGames() }}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 backdrop-blur flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all text-lg"
          >
            ↻
          </button>
        </div>

        {/* Date picker */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 no-scrollbar">
          {days.map(day => (
            <button
              key={day.value}
              onClick={() => setDate(day.value)}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                ${date === day.value
                  ? 'bg-amber-400/20 border-amber-400/40 text-amber-300'
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60'}
              `}
            >
              {day.label}
            </button>
          ))}
        </div>

        {lastUpdated && (
          <p className="text-[10px] text-white/20 text-right mb-2">
            {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        )}

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-3xl h-44 bg-white/5 border border-white/10 animate-pulse" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/40 text-lg">No games scheduled</p>
            <p className="text-white/20 text-sm mt-1">Try another date</p>
          </GlassCard>
        ) : (
          <>
            {live.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-[11px] font-semibold text-red-400 uppercase tracking-widest">Live Now</span>
                </div>
                {live.map(g => <GameCard key={g.id} game={g} />)}
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="mb-5">
                <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2">Upcoming</p>
                {upcoming.map(g => <GameCard key={g.id} game={g} />)}
              </div>
            )}
            {final.length > 0 && (
              <div className="mb-5">
                <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2">Final</p>
                {final.map(g => <GameCard key={g.id} game={g} />)}
              </div>
            )}
          </>
        )}

        <p className="text-center text-white/15 text-[10px] mt-4">
          Prediction market odds · Not financial advice
        </p>
      </div>
    </main>
  )
}
