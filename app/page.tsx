'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { computeKelly, deriveGameEdge, getMarketReadiness, getMinutesToStart, lineGap as getLineGap, pct, totalGap as getTotalGap, type GameEdge } from './lib/sports-utils'

interface Team {
  name: string; abbr: string; record: string; score: string; logo: string; color: string
  rank?: number | null; alternateColor?: string
}
interface Game {
  id: string
  homeTeam: Team; awayTeam: Team
  gameTime: string; gameDate: string; status: 'pre' | 'in' | 'post'
  homeWinOdds: number; awayWinOdds: number; hasWinnerOdds: boolean
  spreadLine: number; spreadHomeOdds: number; spreadAwayOdds: number
  spreadFavoriteTeam: string; hasSpreadOdds: boolean
  totalLine: number; overOdds: number; underOdds: number; hasTotalOdds: boolean
  dkSpread: number | null; dkTotal: number | null; dkDetails: string; hasDkOdds: boolean
  polyWinnerUrl: string | null; polySpreadUrl: string | null; polyTotalUrl: string | null
  venue: { name: string; location: string } | null
  sport?: 'nba' | 'ncaab' | 'nfl' | 'ncaaf'
  leagueLabel?: string
  polyEventTitle?: string | null
  polyMatchScore?: number
}
interface OddsDrift {
  spreadDelta: number | null
  totalDelta: number | null
  winnerHomeDelta: number | null
}
interface BetLog {
  id: string; gameId: string; matchup: string; betType: string
  betLabel: string; odds: number; stake: number; result: 'pending' | 'win' | 'loss'
  createdAt: string
}
interface PlayerMinutesData {
  name: string; minutes: number; fatigueFlag: 'high' | 'moderate' | 'normal' | 'dnp'
  isStarter: boolean; restingStarter: boolean; criticalFatigue: boolean
}
interface FatigueReportData {
  teamAbbr: string; isBackToBack: boolean; lastGameDate: string
  players: PlayerMinutesData[]; hasFatigueRisk: boolean
  hasRestingStarter: boolean; restingStarters: string[]; summary: string
}
interface HomeAwaySplit {
  homeRecord: string; awayRecord: string
  homeWins: number; homeLosses: number; awayWins: number; awayLosses: number
}
interface StarterPlayer {
  name: string; position: string; jersey: string; starter: boolean
}
interface LineupsData {
  home: StarterPlayer[]; away: StarterPlayer[]
  homeTeam: string; awayTeam: string; available: boolean
}
interface PredictionData {
  homeWinPct: number; awayWinPct: number; confidence: number
  recommendation: 'home' | 'away' | 'pass'; recommendedTeam: string | null
  notes: string
}
interface InjuredPlayer {
  name: string; position: string; status: string; detail: string
}
interface BettingSplits {
  homePct: number | null; awayPct: number | null
  homeTeam: string; awayTeam: string; reverseLineMovement: boolean
}
interface TeamIntelData {
  home: { abbr: string; record?: string; streak: number; streakLabel: string; lastGames: ('W' | 'L')[]; restDays: number; fatigue: FatigueReportData | null }
  away: { abbr: string; record?: string; streak: number; streakLabel: string; lastGames: ('W' | 'L')[]; restDays: number; fatigue: FatigueReportData | null }
  h2h: string
  h2hLastMeeting?: string | null
  edgeRead: string
  injuryImpact: {
    home: 'none' | 'minor' | 'major'; away: 'none' | 'minor' | 'major'
    homeNotes: string; awayNotes: string
    homePlayers?: InjuredPlayer[]; awayPlayers?: InjuredPlayer[]
  }
  pace?: { home: number; away: number; edgeLabel: string; implication: string }
  homeAwaySplits?: { home: HomeAwaySplit; away: HomeAwaySplit }
  refs?: string[]
  bettingSplits?: BettingSplits | null
  altitudeNote?: string | null
}
interface StreakTeam {
  name: string; abbr: string; streak: number; streakLabel: string
  lastGames: ('W' | 'L')[]; analysis: string; keyFactors: string[]
}
interface BettingTrendData {
  team: string; lastTenSU: string; ouRecord: string; ouOverPct: number
  avgMargin: number; avgTotal: number; recentForm: string
  scoringTrend: 'over' | 'under' | 'neutral'; edgeFlags: string[]
  homeSURecord: string; awaySURecord: string; gamesAnalyzed: number
  totalLine: number; atsAvailable: boolean; notes: string
}

interface PropsMarketSummary {
  scanned: number
  gameMatched: number
  candidateProps?: number
  executableMatched?: number
  playableMatched: number
  priceRejected?: number
  status?: 'no_markets' | 'no_candidates' | 'priced_out' | 'playable'
  statusLabel?: string
  pages: number
  stale: boolean
}
interface PropsPanelData {
  home: any[]
  away: any[]
  available: boolean
  marketSummary?: PropsMarketSummary
}

interface FootballIntelData {
  prepScore: number
  readiness: { matchLabel: string; matchQuality: number; staleLabel: string; warnings: string[] }
  flags: { dome: boolean; divisional: boolean; daysOut: number; spreadGap: number; totalGap: number }
  checklist: { label: string; value: string; status: 'ready' | 'watch' | 'edge' }[]
  warnings: string[]
}

interface LastMinuteBoardEntry {
  game: Game
  minutesToTip: number
  recommendedSide: string
  marketProb: number
  ourProb: number
  winEdge: number
  lineGap: number
  totalGap: number
  score: number
  confidence: number
  quality: GameEdge<Game>['quality'] | 'signal'
  matchQuality: number
  warnings: string[]
  reasons: string[]
}

function buildLastMinuteBoard(games: Game[]): LastMinuteBoardEntry[] {
  return games
    .filter(game => game.status === 'pre')
    .map((game) => {
      const minutesToTip = getMinutesToStart(game.gameDate)
      if (minutesToTip < 0 || minutesToTip > 60) return null

      const winEdge = deriveGameEdge(game)
      const lineGap = getLineGap(game)
      const totalGap = getTotalGap(game)
      const readiness = getMarketReadiness(game)

      const reasons: string[] = []
      if (winEdge) reasons.push(`${winEdge.team} ML +${Math.round(winEdge.edgeScore * 100)}% edge`)
      if (lineGap >= 1.5) reasons.push(`Spread ${lineGap.toFixed(1)} pts off DK`)
      if (totalGap >= 2) reasons.push(`Total ${totalGap.toFixed(1)} pts off DK`)
      if (minutesToTip <= 20) reasons.push('Execution window open now')
      if (readiness.warnings.length) reasons.push(readiness.warnings[0])

      const confidence = winEdge?.confidence || Math.min(72, 52 + lineGap * 5 + totalGap * 2 + (readiness.matchQuality >= 55 ? 6 : 0))
      const score =
        (winEdge?.edgeScore || 0) * 100 +
        lineGap * 4 +
        totalGap * 2 +
        Math.max(0, (60 - minutesToTip) / 12)

      if (!reasons.length) return null

      return {
        game,
        minutesToTip,
        recommendedSide: winEdge?.team || (game.spreadFavoriteTeam || game.homeTeam.abbr),
        marketProb: winEdge?.marketProb || 0.5,
        ourProb: winEdge?.ourProb || 0.5,
        winEdge: winEdge?.edgeScore || 0,
        lineGap,
        totalGap,
        score,
        confidence,
        quality: winEdge?.quality || 'signal',
        matchQuality: readiness.matchQuality,
        warnings: readiness.warnings,
        reasons,
      }
    })
    .filter((entry): entry is LastMinuteBoardEntry => entry !== null)
    .sort((a, b) => b.score - a.score)
}

function LastSixtyBoard({ games }: { games: Game[] }) {
  const board = buildLastMinuteBoard(games)

  if (!board.length) return null

  return (
    <section className="mb-8">
      <div style={{
        borderRadius: 20,
        padding: '20px 24px',
        background: 'linear-gradient(135deg, rgba(255,68,102,0.08), rgba(0,240,255,0.05), rgba(168,85,247,0.06))',
        border: '1px solid rgba(255,68,102,0.22)',
        boxShadow: '0 0 30px rgba(255,68,102,0.08), 0 4px 40px rgba(0,0,0,0.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span style={{ color: C.red, fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Last 60 Minutes Before Tip</span>
          <span style={{ background: 'rgba(255,68,102,0.12)', border: '1px solid rgba(255,68,102,0.35)', borderRadius: 8, padding: '2px 8px', color: '#ff8aa0', fontSize: 9, fontWeight: 800 }}>
            {board.length} live setups
          </span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,68,102,0.3), transparent)' }} />
        </div>

        <p style={{ color: C.textSecondary, fontSize: 11, marginBottom: 14 }}>
          Small board, just the near-tip windows with real misprice signals. This is the playoff execution layer, not the whole slate.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {board.map((entry) => (
            <div
              key={entry.game.id}
              style={{
                borderRadius: 16,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,68,102,0.16)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div>
                  <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 800 }}>{entry.game.awayTeam.abbr} @ {entry.game.homeTeam.abbr}</p>
                  <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 2 }}>{entry.minutesToTip <= 0 ? 'Tipping now' : `${entry.minutesToTip}m to tip`}</p>
                </div>
                <div style={{
                  background: entry.minutesToTip <= 20 ? 'rgba(255,68,102,0.16)' : 'rgba(255,215,0,0.12)',
                  border: `1px solid ${entry.minutesToTip <= 20 ? 'rgba(255,68,102,0.45)' : 'rgba(255,215,0,0.35)'}`,
                  borderRadius: 10,
                  padding: '4px 8px',
                }}>
                  <span style={{ color: entry.minutesToTip <= 20 ? C.red : C.gold, fontSize: 10, fontWeight: 900 }}>
                    {entry.recommendedSide}
                  </span>
                  <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, marginLeft: 6 }}>C{entry.confidence}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 8px', color: entry.confidence >= 68 ? C.green : C.gold, fontSize: 10, fontWeight: 900 }}>
                  {entry.quality.toUpperCase()} · {entry.confidence}%
                </span>
                <span style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${entry.matchQuality >= 55 ? C.border : 'rgba(255,215,0,0.35)'}`, borderRadius: 8, padding: '3px 8px', color: entry.matchQuality >= 55 ? C.textSecondary : C.gold, fontSize: 10, fontWeight: 800 }}>
                  Match {entry.matchQuality}%
                </span>
                {entry.winEdge > 0.02 && (
                  <span style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 8, padding: '3px 8px', color: C.green, fontSize: 10, fontWeight: 800 }}>
                    ML +{Math.round(entry.winEdge * 100)}%
                  </span>
                )}
                {entry.lineGap >= 1.5 && (
                  <span style={{ background: 'rgba(0,240,255,0.08)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 8px', color: C.cyan, fontSize: 10, fontWeight: 800 }}>
                    Spread {entry.lineGap.toFixed(1)}
                  </span>
                )}
                {entry.totalGap >= 2 && (
                  <span style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, padding: '3px 8px', color: C.purple, fontSize: 10, fontWeight: 800 }}>
                    Total {entry.totalGap.toFixed(1)}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {entry.reasons.slice(0, 3).map((reason, idx) => (
                  <p key={idx} style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.45, opacity: 0.88 }}>
                    ◆ {reason}
                  </p>
                ))}
              </div>

              {entry.winEdge > 0.02 && (
                <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 10 }}>
                  Model {Math.round(entry.ourProb * 100)}% vs market {Math.round(entry.marketProb * 100)}%
                </p>
              )}
              {entry.warnings.length > 0 && (
                <p style={{ color: C.gold, fontSize: 10, marginTop: 8 }}>⚠ {entry.warnings.join(' · ')}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Daily Parlay Builder ─────────────────────────────────────────────────────
function DailyParlayCard({ games, bankroll }: { games: Game[]; bankroll: number }) {
  const edges = games
    .filter(g => g.status === 'pre' && g.hasWinnerOdds)
    .map(g => deriveGameEdge(g))
    .filter((e): e is GameEdge<Game> => e !== null)
    .sort((a, b) => b.edgeScore - a.edgeScore)
    .slice(0, 3)

  if (edges.length < 2) return null

  const legs = edges.slice(0, Math.min(3, edges.length))
  const combinedMarketProb = legs.reduce((p, e) => p * e.marketProb, 1)
  const combinedOurProb = legs.reduce((p, e) => p * e.ourProb, 1)
  const payoutMultiplier = combinedMarketProb > 0 ? 1 / combinedMarketProb : 0
  const kellyFrac = computeKelly(combinedOurProb, combinedMarketProb)
  const suggestedBet = Math.min(bankroll * kellyFrac * 0.5, bankroll * 0.1)
  const estimatedPayout = suggestedBet * payoutMultiplier

  return (
    <div style={{
      marginBottom: 24,
      borderRadius: 20,
      padding: '20px 24px',
      background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(0,240,255,0.06), rgba(255,215,0,0.05))',
      border: '1px solid rgba(168,85,247,0.35)',
      boxShadow: '0 0 40px rgba(168,85,247,0.12), 0 4px 40px rgba(0,0,0,0.5)',
      position: 'relative' as const,
      overflow: 'hidden',
    }}>
      {/* glow blob */}
      <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 16 }}>🎯</span>
        <span style={{ color: C.gold, fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Today's Best Plays</span>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,215,0,0.3), transparent)' }} />
        <span style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 8, padding: '2px 8px', color: C.purple, fontSize: 9, fontWeight: 900 }}>{legs.length}-LEG PARLAY</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {legs.map((edge, i) => (
          <div key={edge.game.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.border}`,
          }}>
            <span style={{ color: C.textSecondary, fontSize: 10, fontWeight: 800, width: 14 }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 800 }}>{edge.team}</span>
                <span style={{ color: C.textSecondary, fontSize: 10 }}>ML</span>
                <span style={{ color: C.textSecondary, fontSize: 10 }}>·</span>
                <span style={{ color: C.textSecondary, fontSize: 10 }}>{edge.game.awayTeam.abbr} @ {edge.game.homeTeam.abbr}</span>
                <span style={{ background: edge.confidence >= 68 ? 'rgba(0,255,136,0.10)' : 'rgba(255,215,0,0.10)', border: `1px solid ${edge.confidence >= 68 ? 'rgba(0,255,136,0.28)' : 'rgba(255,215,0,0.28)'}`, borderRadius: 6, padding: '1px 6px', color: edge.confidence >= 68 ? C.green : C.gold, fontSize: 8, fontWeight: 900 }}>{edge.quality.toUpperCase()} {edge.confidence}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{ color: C.cyan, fontSize: 9 }}>Model {Math.round(edge.ourProb * 100)}%</span>
                <span style={{ color: C.textSecondary, fontSize: 9 }}>vs</span>
                <span style={{ color: C.textSecondary, fontSize: 9 }}>Market {Math.round(edge.marketProb * 100)}%</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                background: edge.edgeScore >= 0.08 ? 'rgba(0,255,136,0.15)' : 'rgba(0,240,255,0.1)',
                border: `1px solid ${edge.edgeScore >= 0.08 ? 'rgba(0,255,136,0.4)' : 'rgba(0,240,255,0.3)'}`,
                borderRadius: 8, padding: '3px 8px',
              }}>
                <span style={{ color: edge.edgeScore >= 0.08 ? C.green : C.cyan, fontSize: 10, fontWeight: 900 }}>
                  +{Math.round(edge.edgeScore * 100)}% edge
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        {[
          ['Combined Prob', `${Math.round(combinedMarketProb * 100)}%`, C.textPrimary],
          ['Payout', `${payoutMultiplier.toFixed(1)}x`, C.gold],
          ['Suggested Bet', bankroll > 0 ? `$${suggestedBet.toFixed(2)}` : '—', C.cyan],
        ].map(([label, val, color]) => (
          <div key={String(label)} style={{ textAlign: 'center' }}>
            <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</p>
            <p style={{ color: String(color), fontSize: 16, fontWeight: 900 }}>{val}</p>
          </div>
        ))}
      </div>
      {bankroll > 0 && estimatedPayout > 0 && (
        <p style={{ color: C.purple, fontSize: 10, textAlign: 'center', marginTop: 10 }}>
          Est. return: <span style={{ fontWeight: 800 }}>${estimatedPayout.toFixed(2)}</span> on ${suggestedBet.toFixed(2)} stake (½ Kelly)
        </p>
      )}
    </div>
  )
}

// ─── Bankroll Input ───────────────────────────────────────────────────────────
function BankrollInput({ bankroll, onChange }: { bankroll: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState(String(bankroll))

  const commit = () => {
    const v = parseFloat(raw)
    if (!isNaN(v) && v >= 0) onChange(v)
    setEditing(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: C.textSecondary, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Bankroll</span>
      {editing ? (
        <input
          autoFocus
          type="number"
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit() }}
          style={{
            width: 100, padding: '4px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800,
            background: 'rgba(0,240,255,0.08)', border: `1px solid ${C.borderHot}`,
            color: C.cyan, outline: 'none', caretColor: C.cyan,
          }}
        />
      ) : (
        <button
          onClick={() => { setRaw(String(bankroll)); setEditing(true) }}
          style={{
            padding: '4px 12px', borderRadius: 8, fontSize: 13, fontWeight: 800,
            background: 'rgba(0,240,255,0.06)', border: `1px solid ${C.border}`,
            color: bankroll > 0 ? C.cyan : C.textSecondary, cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          {bankroll > 0 ? `$${bankroll.toLocaleString()}` : 'Set bankroll'}
        </button>
      )}
    </div>
  )
}

// ─── UFC accent ───────────────────────────────────────────────────────────────
const UFC_RED = '#e8002d'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  cyan:    '#00f0ff',
  purple:  '#a855f7',
  green:   '#00ff88',
  red:     '#ff4466',
  gold:    '#ffd700',
  bg:      '#02020f',
  card:    'rgba(8,8,28,0.85)',
  border:  'rgba(0,240,255,0.12)',
  borderHot: 'rgba(0,240,255,0.45)',
  textPrimary: '#a8f0ff',
  textSecondary: 'rgba(0,240,255,0.45)',
}

// ─── Global CSS keyframes ──────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes liveBorderPulse {
    0%, 100% {
      box-shadow: 0 0 24px rgba(0,240,255,0.25), 0 4px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04);
      border-color: rgba(0,240,255,0.35);
    }
    50% {
      box-shadow: 0 0 52px rgba(0,240,255,0.55), 0 8px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06);
      border-color: rgba(0,240,255,0.75);
    }
  }
  @keyframes liveDotPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.4); }
  }
  @keyframes driftFadeOut {
    0%   { opacity: 1; }
    60%  { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes flashGreen {
    0%   { background: rgba(0,255,136,0.35); }
    100% { background: transparent; }
  }
  @keyframes flashRed {
    0%   { background: rgba(255,68,102,0.35); }
    100% { background: transparent; }
  }
  @keyframes tipoffPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
  }
`

// ─── Countdown to tip-off ────────────────────────────────────────────────────
function CountdownBadge({ gameDate }: { gameDate: string }) {
  const [display, setDisplay] = useState<string | null>(null)
  const [urgency, setUrgency] = useState<'normal' | 'soon' | 'imminent'>('normal')

  const calc = useCallback(() => {
    const diffMs = new Date(gameDate).getTime() - Date.now()
    if (diffMs <= 0) { setDisplay(null); return }
    const totalMins = Math.floor(diffMs / 60000)
    const hours = Math.floor(totalMins / 60)
    const mins = totalMins % 60
    if (hours > 0) {
      setDisplay(`Tip-off in ${hours}h ${mins}m`)
    } else {
      setDisplay(`Tip-off in ${mins}m`)
    }
    if (totalMins < 5) setUrgency('imminent')
    else if (totalMins < 30) setUrgency('soon')
    else setUrgency('normal')
  }, [gameDate])

  useEffect(() => {
    calc()
    const iv = setInterval(calc, 60000)
    return () => clearInterval(iv)
  }, [calc])

  if (!display) return null

  const color = urgency === 'imminent' ? C.red : urgency === 'soon' ? C.gold : C.textSecondary
  const anim = urgency === 'imminent' ? 'tipoffPulse 1s ease-in-out infinite' : undefined

  return (
    <span style={{
      color,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      animation: anim,
      display: 'inline-block',
    }}>
      {display}
    </span>
  )
}

// ─── Glow Card ────────────────────────────────────────────────────────────────
function GlowCard({ children, className = '', hot = false, color = C.cyan }: {
  children: React.ReactNode; className?: string; hot?: boolean; color?: string
}) {
  const borderColor = hot ? color : C.border
  const shadow = hot
    ? `0 0 30px ${color}22, 0 4px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)`
    : `0 4px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)`
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${borderColor}`,
      boxShadow: shadow,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
    }} className={`rounded-3xl ${className}`}>
      {children}
    </div>
  )
}

// ─── Odds Chip ────────────────────────────────────────────────────────────────
function OddsChip({ top, bottom, hot, href, onClick, delta, flashDir }: {
  top: string; bottom: string; hot: boolean; href?: string | null; onClick?: () => void
  delta?: number | null
  flashDir?: 'up' | 'down' | null
}) {
  const bg = 'transparent'
  const border = hot ? C.borderHot : 'rgba(0,240,255,0.15)'
  const textColor = hot ? C.cyan : 'rgba(0,240,255,0.7)'
  const glow = hot ? `0 0 20px ${C.cyan}66, inset 0 0 20px rgba(0,240,255,0.05)` : 'none'

  const flashAnim = flashDir === 'up'
    ? 'flashGreen 2s ease-out forwards'
    : flashDir === 'down'
      ? 'flashRed 2s ease-out forwards'
      : undefined

  const cls = `flex flex-col items-center justify-center rounded-2xl px-2 py-2.5 min-w-[72px] transition-all cursor-pointer active:scale-95`
  const content = (
    <>
      <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{top}</span>
      <span style={{ color: textColor, fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', textShadow: hot ? `0 0 12px ${C.cyan}` : 'none' }}>{bottom}%</span>
      {delta !== null && delta !== undefined && (
        <span
          key={`${delta}`}
          style={{
            color: delta > 0 ? C.green : C.red,
            fontSize: 8, fontWeight: 900,
            animation: 'driftFadeOut 5s ease-out forwards',
            display: 'inline-block',
            letterSpacing: '0.02em',
          }}
        >
          {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{Math.abs(delta).toFixed(1)}
        </span>
      )}
      {href && <span style={{ color: C.textSecondary, fontSize: 8, marginTop: 2, letterSpacing: '0.1em' }}>TRADE ↗</span>}
    </>
  )
  const style: React.CSSProperties = {
    background: bg,
    border: `1px solid ${border}`,
    boxShadow: glow,
    animation: flashAnim,
  }
  if (href) return <a href={href} target="_blank" rel="noopener" className={cls} style={style}>{content}</a>
  return <div className={cls} style={style} onClick={onClick}>{content}</div>
}

// ─── Bet Modal ────────────────────────────────────────────────────────────────
function BetModal({ game, betType, betLabel, odds, onClose, onSave }: {
  game: Game; betType: string; betLabel: string; odds: number
  onClose: () => void; onSave: (bet: BetLog) => void
}) {
  const [stake, setStake] = useState('10')
  const payout = (parseFloat(stake) || 0) / odds
  const profit = payout - (parseFloat(stake) || 0)
  const save = () => {
    onSave({
      id: crypto.randomUUID(), gameId: game.id,
      matchup: `${game.awayTeam.abbr} @ ${game.homeTeam.abbr}`,
      betType, betLabel, odds, stake: parseFloat(stake) || 0,
      result: 'pending', createdAt: new Date().toISOString(),
    })
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(2,2,15,0.85)', backdropFilter: 'blur(12px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-6" style={{ background: 'rgba(8,8,32,0.98)', border: `1px solid ${C.border}`, borderBottom: 'none', boxShadow: `0 -20px 60px rgba(0,240,255,0.08)` }} onClick={e => e.stopPropagation()}>
        <div className="w-8 h-0.5 rounded-full mx-auto mb-5" style={{ background: C.border }} />
        <p style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{game.awayTeam.abbr} @ {game.homeTeam.abbr}</p>
        <h3 style={{ color: C.textPrimary, fontWeight: 800, fontSize: 18, marginTop: 4 }}>{betLabel}</h3>
        <p style={{ color: C.cyan, fontSize: 13, marginTop: 4 }}>{pct(odds)}% implied probability</p>
        <div className="mt-6 mb-3">
          <label style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Stake (USDC)</label>
          <input
            type="number" value={stake} onChange={e => setStake(e.target.value)}
            className="w-full mt-2 text-center text-2xl font-bold focus:outline-none"
            style={{ background: 'rgba(0,240,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px', color: C.cyan, caretColor: C.cyan }}
          />
        </div>
        <div className="flex justify-between mb-6" style={{ fontSize: 12, color: C.textSecondary }}>
          <span>Return: <span style={{ color: C.textPrimary }}>${payout.toFixed(2)}</span></span>
          <span>Net profit: <span style={{ color: C.green }}>+${profit.toFixed(2)}</span></span>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl font-semibold transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textSecondary }}>Cancel</button>
          <button onClick={save} className="flex-1 py-3 rounded-2xl font-bold transition-all" style={{ background: `linear-gradient(135deg, rgba(0,240,255,0.2), rgba(168,85,247,0.2))`, border: `1px solid ${C.borderHot}`, color: C.cyan, boxShadow: `0 0 20px ${C.cyan}22` }}>Log Bet</button>
        </div>
      </div>
    </div>
  )
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────
function parseAnalysis(text: string): { title: string; emoji: string; content: string }[] {
  const lines = text.split('\n')
  const sections: { title: string; emoji: string; content: string }[] = []
  let current: { title: string; emoji: string; lines: string[] } | null = null
  for (const line of lines) {
    const m = line.match(/^###(\S+)\s+(.+)$/)
    if (m) {
      if (current && current.lines.join('\n').trim().length > 3)
        sections.push({ emoji: current.emoji, title: current.title, content: current.lines.join('\n').trim() })
      current = { emoji: m[1], title: m[2].trim(), lines: [] }
    } else if (current) { current.lines.push(line) }
  }
  if (current && current.lines.join('\n').trim().length > 3)
    sections.push({ emoji: current.emoji, title: current.title, content: current.lines.join('\n').trim() })
  return sections.length ? sections : [{ title: 'Analysis', emoji: '◈', content: text }]
}

function AnalysisPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(0)

  useEffect(() => {
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamA: game.awayTeam.name, teamB: game.homeTeam.name,
        polyOddsA: pct(game.awayWinOdds), polyOddsB: pct(game.homeWinOdds),
        recordA: game.awayTeam.record, recordB: game.homeTeam.record,
      }),
    })
      .then(r => r.json())
      .then(d => { setAnalysis(d.analysis || d.error || 'No analysis available'); setLoading(false) })
      .catch(() => { setAnalysis('Failed.'); setLoading(false) })
  }, [])

  const sections = analysis ? parseAnalysis(analysis) : []

  return (
    <div style={{ width: '100%', background: 'rgba(2,2,15,0.98)', borderTop: `1px solid rgba(0,240,255,0.2)`, borderBottom: `1px solid rgba(0,240,255,0.2)`, padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, maxWidth: 900, margin: '0 auto 16px' }}>
        <div>
          <p style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>{game.awayTeam.abbr} @ {game.homeTeam.abbr}</p>
          <h3 style={{ color: C.cyan, fontWeight: 900, fontSize: 16, letterSpacing: '-0.02em', textShadow: `0 0 20px ${C.cyan}55` }}>◈ INTELLIGENCE BRIEF</h3>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,240,255,0.07)', border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 900, margin: '0 auto' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 48, borderRadius: 14, background: 'rgba(0,240,255,0.04)', border: `1px solid ${C.border}` }} />
          ))}
          <p style={{ color: C.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 8, letterSpacing: '0.1em' }}>PROCESSING INTELLIGENCE…</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, maxWidth: 1200, margin: '0 auto' }}>
          {sections.map((s, i) => {
            const isOpen = expanded === i
            const isPick = s.title === 'The Pick'
            return (
              <div key={i} style={{
                borderRadius: 14, overflow: 'hidden',
                background: isPick ? 'rgba(0,240,255,0.06)' : isOpen ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isPick ? C.borderHot : isOpen ? 'rgba(168,85,247,0.3)' : C.border}`,
                boxShadow: isPick ? `0 0 20px ${C.cyan}15` : 'none',
              }}>
                <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setExpanded(prev => prev === i ? null : i)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14 }}>{s.emoji}</span>
                    <span style={{ color: isPick ? C.cyan : C.textPrimary, fontSize: 13, fontWeight: 700 }}>{s.title}</span>
                  </div>
                  <span style={{ color: C.textSecondary, fontSize: 10, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                      {s.content.split('\n').filter((l: string) => l.trim()).map((line: string, j: number) => {
                        const t = line.trim()
                        if (t.startsWith('•') || t.startsWith('-') || t.startsWith('*')) {
                          return (
                            <div key={j} style={{ display: 'flex', gap: 8 }}>
                              <span style={{ color: C.cyan, opacity: 0.5, flexShrink: 0, marginTop: 2 }}>◆</span>
                              <p style={{ color: C.textPrimary, fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>{t.replace(/^[•\-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}</p>
                            </div>
                          )
                        }
                        return <p key={j} style={{ color: C.textPrimary, fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>{t.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Bet Tracker ──────────────────────────────────────────────────────────────
function BetTracker({ bets, onUpdate, onClose }: {
  bets: BetLog[]; onUpdate: (bets: BetLog[]) => void; onClose: () => void
}) {
  const setResult = (id: string, result: 'win' | 'loss') =>
    onUpdate(bets.map(b => b.id === id ? { ...b, result } : b))
  const remove = (id: string) => onUpdate(bets.filter(b => b.id !== id))

  const pending = bets.filter(b => b.result === 'pending')
  const settled = bets.filter(b => b.result !== 'pending')
  const totalStaked = settled.reduce((s, b) => s + b.stake, 0)
  const totalPnl = settled.reduce((s, b) => b.result === 'win' ? s + (b.stake / b.odds - b.stake) : s - b.stake, 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(2,2,15,0.96)', backdropFilter: 'blur(24px)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.015) 2px, rgba(0,240,255,0.015) 4px)' }} />
      <div className="flex-1 overflow-y-auto max-w-lg w-full mx-auto px-5 py-8" style={{ position: 'relative', zIndex: 1 }}>
        <button onClick={onClose} style={{ color: C.textSecondary, fontSize: 12, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>← CLOSE</button>
        <h3 style={{ color: C.cyan, fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', textShadow: `0 0 20px ${C.cyan}55` }}>◈ BET TRACKER</h3>

        {settled.length > 0 && (
          <div className="mt-4 mb-6 rounded-2xl p-4 grid grid-cols-3 text-center" style={{ background: 'rgba(0,240,255,0.04)', border: `1px solid ${C.border}` }}>
            {[['BETS', settled.length, C.textPrimary], ['STAKED', `$${totalStaked.toFixed(0)}`, C.textPrimary], ['P&L', `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, totalPnl >= 0 ? C.green : C.red]].map(([label, val, color]) => (
              <div key={String(label)}>
                <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</p>
                <p style={{ color: String(color), fontWeight: 800, fontSize: 20, marginTop: 2 }}>{val}</p>
              </div>
            ))}
          </div>
        )}

        {pending.length > 0 && (
          <>
            <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>Pending</p>
            {pending.map(b => (
              <div key={b.id} className="rounded-2xl p-4 mb-2" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p style={{ color: C.textPrimary, fontWeight: 700, fontSize: 13 }}>{b.betLabel}</p>
                    <p style={{ color: C.textSecondary, fontSize: 11 }}>{b.matchup} · ${b.stake}</p>
                  </div>
                  <button onClick={() => remove(b.id)} style={{ color: C.textSecondary, fontSize: 12 }}>✕</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setResult(b.id, 'win')} className="flex-1 py-2 rounded-xl font-bold transition-all" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: C.green, fontSize: 12 }}>WIN</button>
                  <button onClick={() => setResult(b.id, 'loss')} className="flex-1 py-2 rounded-xl font-bold transition-all" style={{ background: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.3)', color: C.red, fontSize: 12 }}>LOSS</button>
                </div>
              </div>
            ))}
          </>
        )}

        {settled.length > 0 && (
          <>
            <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10, marginTop: 20 }}>Settled</p>
            {settled.map(b => (
              <div key={b.id} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 600 }}>{b.betLabel}</p>
                  <p style={{ color: C.textSecondary, fontSize: 10 }}>{b.matchup} · ${b.stake}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 12, fontWeight: 700, color: b.result === 'win' ? C.green : C.red }}>
                    {b.result === 'win' ? `+$${(b.stake / b.odds - b.stake).toFixed(2)}` : `-$${b.stake}`}
                  </span>
                  <button onClick={() => remove(b.id)} style={{ color: C.textSecondary, fontSize: 10 }}>✕</button>
                </div>
              </div>
            ))}
          </>
        )}

        {bets.length === 0 && (
          <div className="text-center py-16">
            <p style={{ color: C.textSecondary, fontSize: 14 }}>No bets logged</p>
            <p style={{ color: C.textSecondary, opacity: 0.5, fontSize: 11, marginTop: 6, letterSpacing: '0.05em' }}>Tap any odds chip to log a position</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Polymarket Edge Section ──────────────────────────────────────────────────
interface EdgeMarket {
  matchup: string
  marketTitle: string
  marketType: 'winner' | 'spread' | 'total'
  side: string
  tokenId: string
  currentPrice: number
  impliedProbability: number
  modelEdge: number
  divergence: number
  suggestedAction: 'buy' | 'sell'
  polyUrl: string | null
  eventSlug: string | null
}

function PolymarketEdgeSection() {
  const [markets, setMarkets] = useState<EdgeMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [amount, setAmount] = useState('50')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    fetch('/api/polymarket-edge')
      .then(r => r.json())
      .then(d => { setMarkets(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const buildCmd = (m: EdgeMarket) =>
    `polymarket clob market-order --side ${m.suggestedAction} --amount ${amount} --token-id ${m.tokenId}`

  const copyCmd = (m: EdgeMarket) => {
    const cmd = buildCmd(m)
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(m.tokenId)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const divPct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`
  const probPct = (v: number) => `${Math.round(v * 100)}%`

  const hasMispriced = markets.length > 0

  return (
    <section className="mb-8">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 16, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span style={{ fontSize: 14 }}>⚡</span>
        <span style={{ color: C.gold, fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>Polymarket Edge</span>
        {hasMispriced && (
          <span style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)', borderRadius: 8, padding: '1px 7px', color: C.gold, fontSize: 9, fontWeight: 900 }}>
            {markets.length} mispriced
          </span>
        )}
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, rgba(255,215,0,0.3), transparent)` }} />
        <span style={{ color: C.textSecondary, fontSize: 10, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
      </button>

      {!collapsed && (
        <>
          {/* Amount input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ color: C.textSecondary, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Order size (USDC)</span>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{
                width: 80, padding: '4px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                background: 'rgba(0,240,255,0.06)', border: `1px solid ${C.border}`,
                color: C.cyan, outline: 'none', caretColor: C.cyan,
              }}
            />
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ height: 88, borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, animation: 'pulse 2s infinite' }} />
              ))}
            </div>
          ) : markets.length === 0 ? (
            <div style={{
              borderRadius: 16, padding: '20px 24px', textAlign: 'center',
              background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
            }}>
              <p style={{ color: C.textSecondary, fontSize: 12 }}>No mispriced NBA markets detected right now</p>
              <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 4, opacity: 0.6 }}>Markets refresh when Polymarket has active NBA events</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {markets.map((m, i) => {
                const isBuy = m.suggestedAction === 'buy'
                const actionColor = isBuy ? C.green : C.red
                const divColor = m.divergence > 0 ? C.green : C.red
                const absDivPct = Math.abs(Math.round(m.divergence * 100))
                return (
                  <div
                    key={`${m.tokenId}-${i}`}
                    style={{
                      borderRadius: 16,
                      padding: '16px 18px',
                      background: isBuy
                        ? 'linear-gradient(135deg, rgba(0,255,136,0.06), rgba(0,240,255,0.03))'
                        : 'linear-gradient(135deg, rgba(255,68,102,0.06), rgba(168,85,247,0.03))',
                      border: `1px solid ${isBuy ? 'rgba(0,255,136,0.25)' : 'rgba(255,68,102,0.25)'}`,
                      boxShadow: isBuy
                        ? '0 0 20px rgba(0,255,136,0.06)'
                        : '0 0 20px rgba(255,68,102,0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      {/* Left: matchup + description */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ color: C.textSecondary, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>{m.matchup}</span>
                          <span style={{
                            background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
                            borderRadius: 6, padding: '1px 6px', color: C.textSecondary, fontSize: 9, fontWeight: 700,
                          }}>{m.marketType.toUpperCase()}</span>
                        </div>
                        <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 }}>
                          {m.marketTitle}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ color: C.textSecondary, fontSize: 10 }}>Side: <span style={{ color: C.textPrimary, fontWeight: 700 }}>{m.side}</span></span>
                          <span style={{ color: C.textSecondary, fontSize: 10 }}>·</span>
                          <span style={{ color: C.textSecondary, fontSize: 10 }}>Market: <span style={{ color: C.textPrimary, fontWeight: 700 }}>{probPct(m.impliedProbability)}</span></span>
                          <span style={{ color: C.textSecondary, fontSize: 10 }}>·</span>
                          <span style={{ color: C.textSecondary, fontSize: 10 }}>Model: <span style={{ color: C.cyan, fontWeight: 700 }}>{probPct(m.modelEdge)}</span></span>
                        </div>
                      </div>

                      {/* Right: divergence badge + action */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <div style={{
                          background: isBuy ? 'rgba(0,255,136,0.12)' : 'rgba(255,68,102,0.12)',
                          border: `1px solid ${isBuy ? 'rgba(0,255,136,0.4)' : 'rgba(255,68,102,0.4)'}`,
                          borderRadius: 10, padding: '4px 10px', textAlign: 'center',
                        }}>
                          <p style={{ color: divColor, fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{divPct(m.divergence)}</p>
                          <p style={{ color: divColor, fontSize: 8, fontWeight: 700, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Edge</p>
                        </div>
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: isBuy ? 'rgba(0,255,136,0.15)' : 'rgba(255,68,102,0.15)',
                          border: `1px solid ${actionColor}`,
                          borderRadius: 8, padding: '3px 10px',
                        }}>
                          <span style={{ fontSize: 10 }}>{isBuy ? '▲' : '▼'}</span>
                          <span style={{ color: actionColor, fontSize: 10, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
                            {m.suggestedAction}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Command row */}
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <code style={{
                        flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 10,
                        background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
                        color: C.textSecondary, fontFamily: 'monospace',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        display: 'block', minWidth: 0,
                      }}>
                        {buildCmd(m)}
                      </code>
                      <button
                        onClick={() => copyCmd(m)}
                        style={{
                          flexShrink: 0,
                          padding: '6px 14px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                          letterSpacing: '0.06em', cursor: 'pointer', transition: 'all 0.15s',
                          background: copied === m.tokenId
                            ? 'rgba(0,255,136,0.2)'
                            : 'rgba(0,240,255,0.08)',
                          border: `1px solid ${copied === m.tokenId ? 'rgba(0,255,136,0.5)' : C.borderHot}`,
                          color: copied === m.tokenId ? C.green : C.cyan,
                          boxShadow: `0 0 10px ${C.cyan}15`,
                        }}
                      >
                        {copied === m.tokenId ? '✓ Copied' : '⎘ Copy Trade Command'}
                      </button>
                      {m.polyUrl && (
                        <a
                          href={m.polyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            flexShrink: 0,
                            padding: '6px 12px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                            background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)',
                            color: C.purple, textDecoration: 'none',
                          }}
                        >
                          View ↗
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ─── Streak Panel ─────────────────────────────────────────────────────────────
function StreakPanel() {
  const [data, setData] = useState<{ teams: StreakTeam[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/streaks')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const hot = (data?.teams || []).filter(t => t.streak >= 3)
  const cold = (data?.teams || []).filter(t => t.streak <= -3)

  if (!loading && !hot.length && !cold.length) return null

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: C.gold, fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>◈ Streak Intelligence</span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.border}, transparent)` }} />
      </div>
      {loading ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ flexShrink: 0, width: 140, height: 80, borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, animation: 'pulse 2s infinite' }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {hot.length > 0 && (
            <div>
              <p style={{ color: C.green, fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>🔥 Hot Streaks ({hot.length})</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {hot.map(team => (
                  <div key={team.abbr} style={{ flexShrink: 0, width: expanded === team.abbr ? 280 : 140, transition: 'width 0.3s ease', borderRadius: 16, background: 'rgba(0,255,136,0.06)', border: `1px solid rgba(0,255,136,0.25)`, padding: '12px', cursor: 'pointer' }}
                    onClick={() => setExpanded(prev => prev === team.abbr ? null : team.abbr)}>
                    <div className="flex items-center justify-between">
                      <span style={{ color: C.textPrimary, fontWeight: 800, fontSize: 13 }}>{team.abbr}</span>
                      <span style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)', borderRadius: 8, padding: '2px 6px', color: C.green, fontSize: 11, fontWeight: 800 }}>{team.streakLabel}</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {[...team.lastGames].reverse().map((r, i) => (
                        <div key={i} style={{ width: 14, height: 14, borderRadius: 4, background: r === 'W' ? C.green : C.red, opacity: 0.8 }} />
                      ))}
                    </div>
                    <p style={{ color: C.textSecondary, fontSize: 8, marginTop: 2 }}>oldest → newest</p>
                    {expanded === team.abbr && team.keyFactors.length > 0 && (
                      <div className="mt-2">
                        {team.keyFactors.map((f, i) => (
                          <p key={i} style={{ color: C.textSecondary, fontSize: 10, lineHeight: 1.5 }}>◆ {f}</p>
                        ))}
                        {team.analysis && <p style={{ color: C.textPrimary, fontSize: 11, marginTop: 6, lineHeight: 1.5, opacity: 0.8 }}>{team.analysis}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {cold.length > 0 && (
            <div>
              <p style={{ color: C.red, fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>❄️ Cold Streaks ({cold.length})</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {cold.map(team => (
                  <div key={team.abbr} style={{ flexShrink: 0, width: expanded === team.abbr ? 280 : 140, transition: 'width 0.3s ease', borderRadius: 16, background: 'rgba(255,68,102,0.06)', border: `1px solid rgba(255,68,102,0.25)`, padding: '12px', cursor: 'pointer' }}
                    onClick={() => setExpanded(prev => prev === team.abbr ? null : team.abbr)}>
                    <div className="flex items-center justify-between">
                      <span style={{ color: C.textPrimary, fontWeight: 800, fontSize: 13 }}>{team.abbr}</span>
                      <span style={{ background: 'rgba(255,68,102,0.15)', border: '1px solid rgba(255,68,102,0.4)', borderRadius: 8, padding: '2px 6px', color: C.red, fontSize: 11, fontWeight: 800 }}>{team.streakLabel}</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {[...team.lastGames].reverse().map((r, i) => (
                        <div key={i} style={{ width: 14, height: 14, borderRadius: 4, background: r === 'W' ? C.green : C.red, opacity: 0.8 }} />
                      ))}
                    </div>
                    <p style={{ color: C.textSecondary, fontSize: 8, marginTop: 2 }}>oldest → newest</p>
                    {expanded === team.abbr && team.keyFactors.length > 0 && (
                      <div className="mt-2">
                        {team.keyFactors.map((f, i) => (
                          <p key={i} style={{ color: C.textSecondary, fontSize: 10, lineHeight: 1.5 }}>◆ {f}</p>
                        ))}
                        {team.analysis && <p style={{ color: C.textPrimary, fontSize: 11, marginTop: 6, lineHeight: 1.5, opacity: 0.8 }}>{team.analysis}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}


// ─── Betting Trends Panel ────────────────────────────────────────────────────
function BettingTrendsPanel() {
  const [data, setData] = useState<{ teams: BettingTrendData[]; totalLine: number; source: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/trends?limit=10')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const teams = (data?.teams || []).filter(t => t.gamesAnalyzed >= 5 && t.edgeFlags.length > 0).slice(0, 6)
  if (!loading && !teams.length) return null

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: C.cyan, fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>◇ Recent Trend Board</span>
        <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 700 }}>ESPN last-10 · totals baseline {data?.totalLine || 226.5}</span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.border}, transparent)` }} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <div key={i} style={{ height: 112, borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, animation: 'pulse 2s infinite' }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {teams.map(team => {
            const trendColor = team.scoringTrend === 'over' ? C.green : team.scoringTrend === 'under' ? C.red : C.gold
            return (
              <div key={team.team} style={{ borderRadius: 16, padding: 14, background: 'rgba(0,240,255,0.035)', border: '1px solid rgba(0,240,255,0.16)' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 900 }}>{team.team}</p>
                    <p style={{ color: C.textSecondary, fontSize: 9 }}>Last {team.gamesAnalyzed}: {team.lastTenSU} · {team.recentForm}</p>
                  </div>
                  <span style={{ color: trendColor, border: `1px solid ${trendColor}55`, background: `${trendColor}18`, borderRadius: 10, padding: '3px 7px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>
                    {team.scoringTrend}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div><p style={{ color: C.textSecondary, fontSize: 8 }}>O/U</p><p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 800 }}>{team.ouRecord}</p></div>
                  <div><p style={{ color: C.textSecondary, fontSize: 8 }}>Margin</p><p style={{ color: team.avgMargin >= 0 ? C.green : C.red, fontSize: 12, fontWeight: 800 }}>{team.avgMargin > 0 ? '+' : ''}{team.avgMargin.toFixed(1)}</p></div>
                  <div><p style={{ color: C.textSecondary, fontSize: 8 }}>Avg Total</p><p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 800 }}>{team.avgTotal.toFixed(1)}</p></div>
                </div>
                {team.edgeFlags.slice(0, 2).map((flag, i) => (
                  <p key={i} style={{ color: C.textSecondary, fontSize: 10, lineHeight: 1.45 }}>◆ {flag}</p>
                ))}
                {!team.atsAvailable && <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 8, marginTop: 8 }}>ATS waits for reliable closing spread feed.</p>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── Game Intel Panel ─────────────────────────────────────────────────────────
function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ color: 'rgba(0,240,255,0.5)', fontSize: 10, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' as const, fontVariant: 'small-caps' }}>{label}</span>
    </div>
  )
}

function IntelCard({ children, fullWidth = false, style = {} }: { children: React.ReactNode; fullWidth?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(8,8,28,0.9)',
      border: '1px solid rgba(0,240,255,0.15)',
      borderRadius: 16,
      padding: 20,
      gridColumn: fullWidth ? '1 / -1' : undefined,
      ...style,
    }}>
      {children}
    </div>
  )
}

function GameIntelPanel({ home, away, gameId, venue, sport = 'nba', onClose }: { home: string; away: string; gameId?: string; venue?: { name: string; location: string } | null; sport?: 'nba' | 'nfl'; onClose: () => void }) {
  const [intel, setIntel] = useState<TeamIntelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lineups, setLineups] = useState<LineupsData | null>(null)
  const [lineupsLoading, setLineupsLoading] = useState(false)
  const [props, setProps] = useState<PropsPanelData | null>(null)
  const [propsLoading, setPropsLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/team-intel?home=${home}&away=${away}`)
      .then(r => r.json())
      .then(d => { setIntel(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [home, away])

  useEffect(() => {
    if (!gameId) return
    setLineupsLoading(true)
    fetch(`/api/lineups?eventId=${gameId}`)
      .then(r => r.json())
      .then(d => { setLineups(d); setLineupsLoading(false) })
      .catch(() => setLineupsLoading(false))
  }, [gameId])

  useEffect(() => {
    setPropsLoading(true)
    fetch(`/api/props?home=${home}&away=${away}&sport=${sport}`)
      .then(r => r.json())
      .then(d => { setProps(d); setPropsLoading(false) })
      .catch(() => setPropsLoading(false))
  }, [home, away, sport])

  const formDots = (games: ('W' | 'L')[]) => {
    const ordered = [...games].reverse()
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ordered.map((r, i) => (
          <div key={i} style={{ width: 20, height: 20, borderRadius: 5, background: r === 'W' ? C.green : C.red, opacity: 0.85, fontSize: 8, color: '#000', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r}</div>
        ))}
      </div>
    )
  }

  return (
    <div style={{
      width: '100%',
      background: 'rgba(2,2,15,0.97)',
      borderTop: '1px solid rgba(0,240,255,0.2)',
      padding: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C.purple, fontSize: 14 }}>📊</span>
          <span style={{ color: C.purple, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>INTEL PANEL</span>
          <span style={{ color: C.textSecondary, fontSize: 10 }}>— {away} @ {home}</span>
        </div>
        <button onClick={onClose} style={{ color: C.textSecondary, fontSize: 16, lineHeight: 1, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, cursor: 'pointer' }}>×</button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[...Array(6)].map((_, i) => <div key={i} style={{ height: 120, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, animation: 'pulse 2s infinite' }} />)}
        </div>
      ) : intel ? (
        <>
          {[intel.away, intel.home].map(team =>
            team.fatigue?.hasRestingStarter ? (
              <div key={`rest-${team.abbr}`} style={{ borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.4)' }}>
                <span>⚠️</span>
                <p style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>
                  {team.abbr}: <strong>{team.fatigue.restingStarters.join(', ')}</strong> likely resting (load management)
                </p>
              </div>
            ) : team.fatigue?.hasFatigueRisk ? (
              <div key={`fatigue-${team.abbr}`} style={{ borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.35)' }}>
                <span>🔥</span>
                <p style={{ color: C.gold, fontSize: 11, fontWeight: 700 }}>
                  {team.abbr}: Fatigue Risk — B2B + 35+ min players last game
                </p>
              </div>
            ) : null
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, width: '100%' }}>

            <IntelCard fullWidth>
              <SectionHeader icon="🏀" label="Matchup Overview" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
                {[
                  { abbr: away, teamData: intel.away, label: '✈️ Away', isHome: false },
                  { abbr: home, teamData: intel.home, label: '🏠 Home', isHome: true },
                ].map((side, idx) => idx === 1 ? null : (
                  <div key={side.abbr} style={{ textAlign: 'center' }}>
                    <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 6 }}>{side.label} · {side.abbr}</p>
                    <p style={{ color: side.teamData.streak >= 0 ? C.green : C.red, fontWeight: 900, fontSize: 28, lineHeight: 1 }}>{side.teamData.streakLabel}</p>
                    <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 4 }}>{side.teamData.streak >= 0 ? `Won last ${Math.abs(side.teamData.streak)}` : `Lost last ${Math.abs(side.teamData.streak)}`}</p>
                    <p style={{ color: side.teamData.restDays === 0 ? C.red : C.textSecondary, fontSize: 10, fontWeight: side.teamData.restDays === 0 ? 800 : 400, marginTop: 6 }}>{side.teamData.restDays === 0 ? '⚡ Back-to-Back' : side.teamData.restDays === 1 ? '1 day rest' : `${side.teamData.restDays} days rest`}</p>
                    {side.teamData.record && <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 4 }}>{side.teamData.record}</p>}
                    {side.teamData.fatigue?.isBackToBack && <span style={{ display: 'inline-block', marginTop: 6, background: 'rgba(255,68,102,0.15)', border: '1px solid rgba(255,68,102,0.4)', borderRadius: 5, padding: '2px 8px', color: C.red, fontSize: 8, fontWeight: 800 }}>FATIGUE RISK</span>}
                  </div>
                ))}
                <div style={{ textAlign: 'center', paddingTop: 8 }}>
                  <p style={{ color: C.textSecondary, fontSize: 20, fontWeight: 900 }}>VS</p>
                  {intel.h2h && <p style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginTop: 8 }}>{typeof intel.h2h === 'string' ? intel.h2h : (intel.h2h as Record<string, string>).summary}</p>}
                  {venue && <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 6 }}>📍 {venue.name}</p>}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 6 }}>🏠 Home · {home}</p>
                  <p style={{ color: intel.home.streak >= 0 ? C.green : C.red, fontWeight: 900, fontSize: 28, lineHeight: 1 }}>{intel.home.streakLabel}</p>
                  <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 4 }}>{intel.home.streak >= 0 ? `Won last ${Math.abs(intel.home.streak)}` : `Lost last ${Math.abs(intel.home.streak)}`}</p>
                  <p style={{ color: intel.home.restDays === 0 ? C.red : C.textSecondary, fontSize: 10, fontWeight: intel.home.restDays === 0 ? 800 : 400, marginTop: 6 }}>{intel.home.restDays === 0 ? '⚡ Back-to-Back' : intel.home.restDays === 1 ? '1 day rest' : `${intel.home.restDays} days rest`}</p>
                  {intel.home.record && <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 4 }}>{intel.home.record}</p>}
                  {intel.home.fatigue?.isBackToBack && <span style={{ display: 'inline-block', marginTop: 6, background: 'rgba(255,68,102,0.15)', border: '1px solid rgba(255,68,102,0.4)', borderRadius: 5, padding: '2px 8px', color: C.red, fontSize: 8, fontWeight: 800 }}>FATIGUE RISK</span>}
                </div>
              </div>
            </IntelCard>

            <IntelCard>
              <SectionHeader icon="📈" label="Recent Form" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[intel.away, intel.home].map((team, idx) => (
                  <div key={team.abbr}>
                    <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 700, marginBottom: 8 }}>{idx === 0 ? '✈️' : '🏠'} {team.abbr}</p>
                    {formDots(team.lastGames)}
                    <p style={{ color: C.textSecondary, fontSize: 8, marginTop: 4 }}>oldest → newest</p>
                    {team.fatigue && (
                      <p style={{ color: team.fatigue.hasFatigueRisk ? C.red : C.textSecondary, fontSize: 9, fontWeight: team.fatigue.hasFatigueRisk ? 700 : 400, marginTop: 6 }}>
                        {team.fatigue.hasFatigueRisk ? '🔥 High fatigue' : team.fatigue.isBackToBack ? '⚡ B2B' : '✅ Fresh'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </IntelCard>

            <IntelCard>
              <SectionHeader icon="📋" label="Starting Lineups" />
              {lineupsLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{[...Array(5)].map((_, i) => <div key={i} style={{ height: 18, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />)}</div>
              ) : lineups && lineups.available ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: lineups.awayTeam || intel.away.abbr, sub: 'Away', players: lineups.away, injured: intel.injuryImpact.awayPlayers || [] },
                    { label: lineups.homeTeam || intel.home.abbr, sub: 'Home', players: lineups.home, injured: intel.injuryImpact.homePlayers || [] },
                  ].map(({ label, sub, players, injured }) => (
                    <div key={label}>
                      <p style={{ color: C.textSecondary, fontSize: 9, marginBottom: 8 }}><span style={{ color: C.textPrimary, fontWeight: 700 }}>{label}</span> ({sub})</p>
                      {players.map((p, i) => {
                        const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
                        const inj = injured.find(ip => {
                          const a = normName(ip.name), b = normName(p.name)
                          return a === b || a.includes(b) || b.includes(a)
                        })
                        const isOut = inj && (inj.status === 'Out' || inj.status === 'Doubtful')
                        const isQ = inj && (inj.status === 'Questionable' || inj.status === 'Day-To-Day' || inj.status === 'GTD')
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                            <span style={{ color: C.textSecondary, fontSize: 8, fontFamily: 'monospace', width: 16, textAlign: 'right', flexShrink: 0 }}>#{p.jersey}</span>
                            <span style={{ color: isOut ? 'rgba(255,68,102,0.55)' : C.textPrimary, fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isOut ? 'line-through' : 'none' }}>{p.name}</span>
                            <span style={{ background: 'rgba(0,240,255,0.08)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px', color: C.cyan, fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{p.position}</span>
                            {isOut && <span style={{ background: '#ff4466', borderRadius: 4, padding: '1px 5px', color: '#fff', fontSize: 8, fontWeight: 900, flexShrink: 0, minWidth: 14, textAlign: 'center' }}>O</span>}
                            {isQ && <span style={{ background: '#c8960c', borderRadius: 4, padding: '1px 5px', color: '#fff', fontSize: 8, fontWeight: 900, flexShrink: 0, minWidth: 14, textAlign: 'center' }}>Q</span>}
                          </div>
                        )
                      })}
                      {injured.filter(ip => !players.some(p => { const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, ''); const a = normName(ip.name), b = normName(p.name); return a === b || a.includes(b) || b.includes(a) })).map((p, i) => {
                        const isOut = p.status === 'Out' || p.status === 'Doubtful'
                        const isQ = p.status === 'Questionable' || p.status === 'Day-To-Day' || p.status === 'GTD'
                        return (
                          <div key={`inj-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, opacity: 0.65 }}>
                            <span style={{ color: C.textSecondary, fontSize: 8, fontFamily: 'monospace', width: 16, textAlign: 'right', flexShrink: 0 }}>—</span>
                            <span style={{ color: C.textSecondary, fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            <span style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px', color: C.textSecondary, fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{p.position}</span>
                            {isOut && <span style={{ background: '#ff4466', borderRadius: 4, padding: '1px 5px', color: '#fff', fontSize: 8, fontWeight: 900, flexShrink: 0, minWidth: 14, textAlign: 'center' }}>O</span>}
                            {isQ && <span style={{ background: '#c8960c', borderRadius: 4, padding: '1px 5px', color: '#fff', fontSize: 8, fontWeight: 900, flexShrink: 0, minWidth: 14, textAlign: 'center' }}>Q</span>}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {([
                    { abbr: intel.away.abbr, players: intel.injuryImpact.awayPlayers || [] },
                    { abbr: intel.home.abbr, players: intel.injuryImpact.homePlayers || [] },
                  ]).map(({ abbr, players }) => (
                    <div key={abbr}>
                      <p style={{ color: C.textSecondary, fontSize: 9, marginBottom: 8 }}><span style={{ color: C.textPrimary, fontWeight: 700 }}>{abbr}</span></p>
                      {players.length === 0 ? (
                        <p style={{ color: C.green, fontSize: 10 }}>✅ Healthy</p>
                      ) : players.map((p, i) => {
                        const isOut = p.status === 'Out' || p.status === 'Doubtful'
                        const isQ = !isOut
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                            <span style={{ color: C.textSecondary, fontSize: 10, flex: 1 }}>{p.name} <span style={{ fontSize: 9 }}>({p.position})</span></span>
                            {isOut && <span style={{ background: '#ff4466', borderRadius: 4, padding: '1px 5px', color: '#fff', fontSize: 8, fontWeight: 900, minWidth: 14, textAlign: 'center' }}>O</span>}
                            {isQ && <span style={{ background: '#c8960c', borderRadius: 4, padding: '1px 5px', color: '#fff', fontSize: 8, fontWeight: 900, minWidth: 14, textAlign: 'center' }}>Q</span>}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
              <p style={{ color: C.textSecondary, fontSize: 8, marginTop: 10, fontStyle: 'italic' }}>Lineups release ~30 min before tip-off</p>
            </IntelCard>

            {[intel.away, intel.home].some(t => t.fatigue && t.fatigue.players.length > 0) && (
              <IntelCard>
                <SectionHeader icon="⏱️" label="Last Game — Minutes Played" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[intel.away, intel.home].map(team => team.fatigue && team.fatigue.players.length > 0 ? (
                    <div key={`min-${team.abbr}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 700 }}>{team.abbr}</p>
                        {team.fatigue.hasFatigueRisk && <span style={{ background: 'rgba(255,68,102,0.15)', border: '1px solid rgba(255,68,102,0.4)', borderRadius: 5, padding: '1px 5px', color: C.red, fontSize: 7, fontWeight: 800 }}>🔥 RISK</span>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {team.fatigue.players.map((p, i) => {
                          const isDnp = p.fatigueFlag === 'dnp'
                          const barColor = p.fatigueFlag === 'high' ? C.red : p.fatigueFlag === 'moderate' ? C.gold : C.green
                          const barWidth = isDnp ? 0 : Math.min(100, (p.minutes / 42) * 100)
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: p.restingStarter ? C.red : p.criticalFatigue ? C.gold : p.isStarter ? C.textPrimary : C.textSecondary, fontSize: 9, fontWeight: p.isStarter ? 700 : 400, width: 64, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                              {isDnp ? (
                                <span style={{ color: p.restingStarter ? C.red : C.textSecondary, fontSize: 8, fontWeight: p.restingStarter ? 800 : 400 }}>{p.restingStarter ? '⚠️ REST' : '💤 DNP'}</span>
                              ) : (
                                <>
                                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                                    <div style={{ height: '100%', width: `${barWidth}%`, borderRadius: 3, background: barColor, boxShadow: p.fatigueFlag === 'high' ? `0 0 6px ${barColor}88` : 'none' }} />
                                  </div>
                                  <span style={{ color: barColor, fontSize: 8, fontWeight: 700, width: 18, textAlign: 'right', flexShrink: 0 }}>{p.minutes}</span>
                                  {p.criticalFatigue && <span style={{ fontSize: 8 }}>🔥</span>}
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : <div key={`min-empty-${team.abbr}`} />)}
                </div>
              </IntelCard>
            )}

            <IntelCard>
              <SectionHeader icon="🔄" label="Season Series + Arena" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p style={{ color: 'rgba(0,240,255,0.5)', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>H2H Record</p>
                  <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700 }}>{intel.h2h}</p>
                  {intel.h2hLastMeeting && (
                    <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 4 }}>Last: {intel.h2hLastMeeting}</p>
                  )}
                  {intel.refs && intel.refs.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ color: 'rgba(0,240,255,0.5)', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>🦺 Refs</p>
                      <p style={{ color: C.textPrimary, fontSize: 10 }}>{intel.refs.join(', ')}</p>
                      <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 2 }}>High-foul crew → O/U leans over</p>
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ color: 'rgba(0,240,255,0.5)', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>🏟️ Arena</p>
                  <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                    {venue ? (
                      <>
                        <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 700 }}>{venue.name}</p>
                        <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 2 }}>{venue.location}</p>
                      </>
                    ) : (
                      <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 700 }}>{home} Home Arena</p>
                    )}
                    {intel.altitudeNote && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <span style={{ fontSize: 11 }}>🏔️</span>
                        <p style={{ color: C.gold, fontSize: 10, fontWeight: 600 }}>{intel.altitudeNote}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </IntelCard>

            {intel.bettingSplits && (() => {
              const bs = intel.bettingSplits!
              const homePct = bs.homePct ?? 50
              const awayPct = bs.awayPct ?? (100 - homePct)
              const publicFavsHome = homePct > awayPct
              const publicFavsTeam = publicFavsHome ? bs.homeTeam : bs.awayTeam
              const publicPct = publicFavsHome ? homePct : awayPct
              return (
                <IntelCard>
                  <SectionHeader icon="💰" label="Public Betting + Sharp Money" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ color: C.textSecondary, fontSize: 10, flexShrink: 0 }}>{bs.awayTeam} {Math.round(awayPct)}%</span>
                    <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${awayPct}%`, background: C.red, borderRadius: '5px 0 0 5px' }} />
                      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: `${homePct}%`, background: C.green, borderRadius: '0 5px 5px 0' }} />
                    </div>
                    <span style={{ color: C.textSecondary, fontSize: 10, flexShrink: 0 }}>{Math.round(homePct)}% {bs.homeTeam}</span>
                  </div>
                  <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                    {Math.round(publicPct)}% PUBLIC → {publicFavsTeam}
                  </p>
                  {bs.reverseLineMovement && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'center' }}>
                      <span>⚠️</span>
                      <p style={{ color: C.red, fontSize: 10, fontWeight: 800 }}>Reverse Line Movement — sharp money opposing public</p>
                    </div>
                  )}
                </IntelCard>
              )
            })()}

            {intel.edgeRead && (
              <IntelCard fullWidth style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(255,215,0,0.05))', border: '1px solid rgba(168,85,247,0.3)' }}>
                <SectionHeader icon="🎯" label="AI Edge Read" />
                <p style={{ color: C.textPrimary, fontSize: 13, lineHeight: 1.7, fontStyle: 'italic' }}>{intel.edgeRead}</p>
              </IntelCard>
            )}

            {/* Player Props */}
            <IntelCard fullWidth>
              <SectionHeader icon="🎲" label="Player Props" />
              {props?.marketSummary && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[
                    ['Kalshi scanned', props.marketSummary.scanned],
                    ['Game markets', props.marketSummary.gameMatched],
                    ['Executable asks', props.marketSummary.executableMatched ?? props.marketSummary.gameMatched],
                    ['Playable', props.marketSummary.playableMatched],
                  ].map(([label, value]) => (
                    <span key={label} style={{ background: 'rgba(0,240,255,0.055)', border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 8px', color: label === 'Playable' && Number(value) > 0 ? C.green : C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {label}: <span style={{ color: C.textPrimary }}>{value}</span>
                    </span>
                  ))}
                  {Boolean(props.marketSummary.priceRejected) && <span style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.24)', borderRadius: 999, padding: '4px 8px', color: C.gold, fontSize: 8, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Priced out: {props.marketSummary.priceRejected}</span>}
                  {props.marketSummary.status && props.marketSummary.status !== 'playable' && <span style={{ background: props.marketSummary.status === 'priced_out' ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.055)', border: `1px solid ${props.marketSummary.status === 'priced_out' ? 'rgba(255,215,0,0.28)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 999, padding: '4px 8px', color: props.marketSummary.status === 'priced_out' ? C.gold : C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{props.marketSummary.statusLabel || 'No executable edge yet'}</span>}
                </div>
              )}
              {propsLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...Array(4)].map((_, i) => <div key={i} style={{ height: 48, borderRadius: 10, background: 'rgba(255,255,255,0.03)', animation: 'pulse 2s infinite' }} />)}
                </div>
              ) : props && props.available ? (
                <div>
                  {[
                    { label: `✈️ ${away}`, players: props.away },
                    { label: `🏠 ${home}`, players: props.home },
                  ].map(({ label, players }) => players.length === 0 ? null : (
                    <div key={label} style={{ marginBottom: 16 }}>
                      <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {players.map((p: any, i: number) => {
                          const best = p.bestBet
                          const logs = p.last12 || []
                          return (
                            <div key={i} style={{ background: best?.quality === 'bet' ? 'rgba(0,255,136,0.055)' : 'rgba(255,255,255,0.02)', border: `1px solid ${best?.quality === 'bet' ? 'rgba(0,255,136,0.28)' : C.border}`, borderRadius: 12, padding: '11px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                  {p.headshot && <img src={p.headshot} alt={p.player} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${C.border}` }} />}
                                  <div>
                                    <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 800, lineHeight: 1 }}>{p.player}</p>
                                    <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 2 }}>{p.position} · last {p.gamesPlayed || logs.length} games</p>
                                  </div>
                                </div>
                                {best && (
                                  <div style={{ borderRadius: 10, padding: '5px 8px', background: best.quality === 'bet' ? 'rgba(0,255,136,0.12)' : 'rgba(255,215,0,0.10)', border: `1px solid ${best.quality === 'bet' ? 'rgba(0,255,136,0.38)' : 'rgba(255,215,0,0.28)'}`, textAlign: 'right' }}>
                                    <div style={{ color: best.quality === 'bet' ? C.green : C.gold, fontSize: 11, fontWeight: 950 }}>{best.label}</div>
                                    <div style={{ color: C.textSecondary, fontSize: 8 }}>{best.hits}/{best.games} hit · C{best.confidence}</div>
                                    <div style={{ color: C.cyan, fontSize: 8, fontWeight: 900 }}>Kalshi ask {best.kalshi?.yesAsk ?? '—'}¢ · max {best.maxYesPrice}¢</div>
                                    {best.xaiBacked && <div style={{ color: C.purple, fontSize: 8, fontWeight: 900 }}>XAI checked</div>}
                                  </div>
                                )}
                              </div>
                              {best && <p style={{ color: 'rgba(230,245,255,0.78)', fontSize: 10, lineHeight: 1.45, marginBottom: 9 }}>{best.explanation}</p>}
                              {best?.kalshi && <a href={best.kalshi.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', marginBottom: 9, color: C.cyan, fontSize: 9, fontWeight: 900, textDecoration: 'none' }}>Trade Kalshi market · {best.kalshi.isCombo ? 'combo' : 'single'} · {best.kalshi.yesAskSize} ask size ↗</a>}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 6, marginBottom: logs.length ? 9 : 0 }}>
                                {(p.recommendations || []).slice(0, 4).map((r: any) => (
                                  <div key={`${p.player}-${r.label}`} style={{ background: 'rgba(0,0,0,0.22)', borderRadius: 8, padding: '6px 7px', textAlign: 'center', border: `1px solid ${r.quality === 'bet' ? 'rgba(0,255,136,0.22)' : 'rgba(255,255,255,0.06)'}` }}>
                                    <p style={{ color: C.textSecondary, fontSize: 7, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{r.metric}</p>
                                    <p style={{ color: r.quality === 'bet' ? C.green : C.textPrimary, fontWeight: 900, fontSize: 13, lineHeight: 1 }}>{r.line}+</p>
                                    <p style={{ color: C.textSecondary, fontSize: 8, marginTop: 3 }}>{r.hitRate}% · avg {r.avg}</p>
                                    <p style={{ color: C.cyan, fontSize: 7, marginTop: 2, fontWeight: 900 }}>Ask {r.kalshi?.yesAsk ?? '—'}¢ · ≤ {r.maxYesPrice}¢</p>
                                  </div>
                                ))}
                              </div>
                              {logs.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4 }}>
                                  {logs.slice(0, 12).map((g: any, idx: number) => {
                                    const val = best ? (best.metric === 'points' ? g.stats.points : best.metric === 'rebounds' ? g.stats.rebounds : best.metric === 'assists' ? g.stats.assists : best.metric === 'PTS+REB+AST' ? g.stats.points + g.stats.rebounds + g.stats.assists : best.metric === 'passing yards' ? g.stats.passingYards : best.metric === 'passing TDs' ? g.stats.passingTouchdowns : best.metric === 'rushing yards' ? g.stats.rushingYards : best.metric === 'receptions' ? g.stats.receptions : g.stats.receivingYards) : 0
                                    const hit = best ? val >= best.line : false
                                    return <div key={`${g.eventId}-${idx}`} title={`${g.opponent || ''} ${val}`} style={{ borderRadius: 6, padding: '4px 2px', textAlign: 'center', background: hit ? 'rgba(0,255,136,0.13)' : 'rgba(255,255,255,0.04)', border: `1px solid ${hit ? 'rgba(0,255,136,0.28)' : 'rgba(255,255,255,0.06)'}`, color: hit ? C.green : C.textSecondary, fontSize: 9, fontWeight: 800 }}>{val}</div>
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: C.textSecondary, fontSize: 11 }}>No playable Kalshi props at value right now. The card only shows markets with live ask/liquidity under our max price.</p>
              )}
            </IntelCard>

          </div>
        </>
      ) : (
        <p style={{ color: C.textSecondary, fontSize: 11 }}>Intel unavailable</p>
      )}
    </div>
  )
}


// ─── Prediction Badge ─────────────────────────────────────────────────────────
function PredictionBadge({ winPct, team, confidence }: { winPct: number; team: string; confidence: number }) {
  const color = confidence >= 65 ? '#00ff88' : confidence >= 55 ? '#ffd700' : 'rgba(0,240,255,0.4)'
  const bg = confidence >= 65 ? 'rgba(0,255,136,0.08)' : confidence >= 55 ? 'rgba(255,215,0,0.08)' : 'rgba(0,240,255,0.04)'
  const border = confidence >= 65 ? 'rgba(0,255,136,0.35)' : confidence >= 55 ? 'rgba(255,215,0,0.35)' : 'rgba(0,240,255,0.15)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
      <span style={{ fontSize: 8 }}>🎯</span>
      <span style={{ color, fontSize: 9, fontWeight: 800 }}>Edge: {team} {winPct}%</span>
    </div>
  )
}

// ─── Live Score Display ───────────────────────────────────────────────────────
function LiveScoreDisplay({ game }: { game: Game }) {
  // Parse period + clock from gameTime e.g. "Q3 - 4:22" or "Halftime" or "End of Q2"
  const rawTime = game.gameTime
  const periodMatch = rawTime.match(/Q(\d)/i)
  const clockMatch = rawTime.match(/(\d+:\d+)/)
  const isHalf = /half/i.test(rawTime)
  const period = periodMatch ? `Q${periodMatch[1]}` : isHalf ? 'Half' : rawTime.split(' ')[0]
  const clock = clockMatch ? clockMatch[1] : null

  const awayScore = parseInt(game.awayTeam.score) || 0
  const homeScore = parseInt(game.homeTeam.score) || 0
  const awayLeading = awayScore > homeScore
  const homeLeading = homeScore > awayScore

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Period + clock */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginBottom: 12,
      }}>
        <span style={{
          background: 'rgba(255,68,102,0.15)',
          border: '1px solid rgba(255,68,102,0.5)',
          borderRadius: 8, padding: '3px 10px',
          color: C.red, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em',
        }}>
          {period}{clock ? ` · ${clock}` : ''}
        </span>
      </div>

      {/* Scores — big and prominent */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
        {/* Away */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {game.awayTeam.logo
              ? <img src={game.awayTeam.logo} style={{ width: 40, height: 40, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.3))' }} />
              : <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 11, fontWeight: 800 }}>{game.awayTeam.abbr.slice(0, 2)}</div>
            }
            <div>
              <p style={{ color: C.textSecondary, fontSize: 10, fontWeight: 700 }}>{game.awayTeam.abbr}</p>
              <p style={{ color: awayLeading ? '#ffffff' : C.textSecondary, fontSize: 10 }}>{game.awayTeam.record}</p>
            </div>
          </div>
          <span style={{
            color: awayLeading ? '#ffffff' : C.textSecondary,
            fontSize: 52, fontWeight: 900, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: awayLeading ? `0 0 30px rgba(255,255,255,0.4)` : 'none',
          }}>
            {game.awayTeam.score || '0'}
          </span>
        </div>

        {/* VS divider */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ color: 'rgba(255,68,102,0.6)', fontSize: 18, fontWeight: 900 }}>—</span>
        </div>

        {/* Home */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: 'row-reverse' }}>
            {game.homeTeam.logo
              ? <img src={game.homeTeam.logo} style={{ width: 40, height: 40, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.3))' }} />
              : <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 11, fontWeight: 800 }}>{game.homeTeam.abbr.slice(0, 2)}</div>
            }
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: C.textSecondary, fontSize: 10, fontWeight: 700 }}>{game.homeTeam.abbr}</p>
              <p style={{ color: homeLeading ? '#ffffff' : C.textSecondary, fontSize: 10 }}>{game.homeTeam.record}</p>
            </div>
          </div>
          <span style={{
            color: homeLeading ? '#ffffff' : C.textSecondary,
            fontSize: 52, fontWeight: 900, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: homeLeading ? `0 0 30px rgba(255,255,255,0.4)` : 'none',
          }}>
            {game.homeTeam.score || '0'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── useColCount / chunkArray / RowGroup ─────────────────────────────────────
function useColCount() {
  const [cols, setCols] = useState(1)
  useEffect(() => {
    const update = () => setCols(window.innerWidth >= 1280 ? 3 : window.innerWidth >= 640 ? 2 : 1)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return cols
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return isMobile
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

function RowGroup({ games, cols, activeGame, panel, onLogBet, drift, onOpenIntel, onOpenAnalysis, bankroll }: {
  games: Game[]
  cols: number
  activeGame: Game | null
  panel: 'intel' | 'analysis' | null
  onLogBet: (bet: Omit<BetLog, 'id' | 'createdAt' | 'stake' | 'result'>) => void
  drift: Record<string, OddsDrift>
  onOpenIntel: (g: Game) => void
  onOpenAnalysis: (g: Game) => void
  bankroll?: number
}) {
  const hasActivePanel = activeGame != null && games.some(g => g.id === activeGame.id)
  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
        {games.map(g => (
          <GameCard key={g.id} game={g} onLogBet={onLogBet} drift={drift[g.id]}
            isActive={activeGame?.id === g.id}
            onOpenIntel={() => onOpenIntel(g)}
            onOpenAnalysis={() => onOpenAnalysis(g)}
            bankroll={bankroll} />
        ))}
      </div>
      {hasActivePanel && panel === 'intel' && activeGame && (
        <div id="active-panel" style={{ width: '100%', marginTop: 8 }}>
          {activeGame.sport === 'nfl' || activeGame.sport === 'ncaaf' ? (
            <FootballPrepPanel game={activeGame} onClose={() => onOpenIntel(activeGame)} />
          ) : (
            <GameIntelPanel home={activeGame.homeTeam.abbr} away={activeGame.awayTeam.abbr} gameId={activeGame.id} venue={activeGame.venue} sport="nba" onClose={() => onOpenIntel(activeGame)} />
          )}
        </div>
      )}
      {hasActivePanel && panel === 'analysis' && activeGame && (
        <div id="active-panel" style={{ width: '100%', marginTop: 8 }}>
          <AnalysisPanel game={activeGame} onClose={() => onOpenAnalysis(activeGame)} />
        </div>
      )}
    </div>
  )
}


function FootballPrepPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [intel, setIntel] = useState<FootballIntelData | null>(null)
  const [props, setProps] = useState<PropsPanelData | null>(null)
  const matched = game.hasWinnerOdds || game.hasSpreadOdds || game.hasTotalOdds
  const readiness = getMarketReadiness(game)
  const spreadGap = game.hasDkOdds && game.hasSpreadOdds && game.dkSpread != null
    ? Math.abs(game.spreadLine - game.dkSpread)
    : null
  const totalGap = game.hasDkOdds && game.hasTotalOdds && game.dkTotal != null
    ? Math.abs(game.totalLine - game.dkTotal)
    : null

  useEffect(() => {
    const params = new URLSearchParams({
      away: game.awayTeam.abbr,
      home: game.homeTeam.abbr,
      date: game.gameDate,
      sport: game.sport === 'ncaaf' ? 'ncaaf' : 'nfl',
      venue: game.venue?.name || '',
      location: game.venue?.location || '',
      hasWinnerOdds: String(game.hasWinnerOdds),
      homeWinOdds: String(game.homeWinOdds),
      awayWinOdds: String(game.awayWinOdds),
      hasSpreadOdds: String(game.hasSpreadOdds),
      spreadLine: String(game.spreadLine),
      hasTotalOdds: String(game.hasTotalOdds),
      totalLine: String(game.totalLine),
      hasDkOdds: String(game.hasDkOdds),
      dkSpread: game.dkSpread == null ? '' : String(game.dkSpread),
      dkTotal: game.dkTotal == null ? '' : String(game.dkTotal),
      polyMatchScore: game.polyMatchScore == null ? '' : String(game.polyMatchScore),
    })
    fetch(`/api/nfl-intel?${params.toString()}`)
      .then(r => r.json())
      .then(d => setIntel(d))
      .catch(() => setIntel(null))
  }, [game])

  useEffect(() => {
    if (game.sport !== 'nfl') return
    fetch(`/api/props?home=${game.homeTeam.abbr}&away=${game.awayTeam.abbr}&sport=nfl`)
      .then(r => r.json())
      .then(d => setProps(d))
      .catch(() => setProps(null))
  }, [game])

  const items = [
    { label: 'Market match', value: matched ? `${readiness.matchLabel} · ${readiness.matchQuality}%` : 'No Polymarket match yet', color: matched && readiness.matchQuality >= 55 ? C.green : C.gold },
    { label: 'Winner market', value: game.hasWinnerOdds ? `${game.awayTeam.abbr} ${(game.awayWinOdds * 100).toFixed(1)}¢ / ${game.homeTeam.abbr} ${(game.homeWinOdds * 100).toFixed(1)}¢` : 'Waiting', color: game.hasWinnerOdds ? C.cyan : C.textSecondary },
    { label: 'Spread gap', value: spreadGap != null ? `${spreadGap.toFixed(1)} pts` : 'Need DK + Poly spread', color: spreadGap != null && spreadGap >= 1 ? C.green : C.textSecondary },
    { label: 'Total gap', value: totalGap != null ? `${totalGap.toFixed(1)} pts` : 'Need DK + Poly total', color: totalGap != null && totalGap >= 1.5 ? C.green : C.textSecondary },
  ]

  return (
    <GlowCard hot color={C.green}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.18em', textTransform: 'uppercase' }}>NFL Prep Intel</div>
            <h3 style={{ color: C.textPrimary, fontSize: 20, fontWeight: 950, margin: '4px 0 0', letterSpacing: '-0.03em' }}>
              {game.awayTeam.abbr} @ {game.homeTeam.abbr}
            </h3>
            <p style={{ color: C.textSecondary, margin: '6px 0 0', fontSize: 12 }}>
              {game.venue ? `${game.venue.name}${game.venue.location ? ` · ${game.venue.location}` : ''}` : 'Venue pending'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 10, width: 32, height: 32, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
          {items.map(item => (
            <div key={item.label} style={{ borderRadius: 14, padding: 12, background: 'rgba(0,255,136,0.045)', border: '1px solid rgba(0,255,136,0.14)' }}>
              <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ color: item.color, fontSize: 14, fontWeight: 900, marginTop: 5 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {intel && (
          <div style={{ borderRadius: 16, padding: 14, background: 'rgba(0,255,136,0.035)', border: '1px solid rgba(0,255,136,0.16)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase' }}>NFL Prep Score</div>
              <div style={{ color: intel.prepScore >= 70 ? C.green : C.gold, fontSize: 20, fontWeight: 950 }}>{intel.prepScore}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
              {intel.checklist.map(item => (
                <div key={item.label} style={{ borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${item.status === 'edge' ? 'rgba(0,255,136,0.35)' : C.border}` }}>
                  <div style={{ color: item.status === 'edge' ? C.green : item.status === 'ready' ? C.cyan : C.gold, fontSize: 8, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ color: 'rgba(230,245,255,0.84)', fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>{item.value}</div>
                </div>
              ))}
            </div>
            {intel.warnings.length > 0 && (
              <div style={{ color: C.gold, fontSize: 11, marginTop: 10 }}>⚠ {intel.warnings.slice(0, 3).join(' · ')}</div>
            )}
          </div>
        )}

        {props?.marketSummary && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[['Kalshi scanned', props.marketSummary.scanned], ['Game markets', props.marketSummary.gameMatched], ['Executable asks', props.marketSummary.executableMatched ?? props.marketSummary.gameMatched], ['Playable', props.marketSummary.playableMatched]].map(([label, value]) => (
              <span key={label} style={{ background: 'rgba(0,255,136,0.055)', border: '1px solid rgba(0,255,136,0.16)', borderRadius: 999, padding: '4px 9px', color: label === 'Playable' && Number(value) > 0 ? C.green : C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}: <span style={{ color: C.textPrimary }}>{value}</span></span>
            ))}
          </div>
        )}

        {props?.available && (
          <div style={{ borderRadius: 16, padding: 14, background: 'rgba(0,255,136,0.035)', border: '1px solid rgba(0,255,136,0.16)', marginBottom: 12 }}>
            <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>NFL Player Prop Reads</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {[...(props.away || []), ...(props.home || [])].filter((p: any) => p.bestBet).slice(0, 8).map((p: any) => (
                <div key={`${p.team}-${p.player}`} style={{ borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${p.bestBet?.quality === 'bet' ? 'rgba(0,255,136,0.32)' : C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 900 }}>{p.player}</div>
                      <div style={{ color: C.textSecondary, fontSize: 9, marginTop: 2 }}>{p.team} · {p.position}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: p.bestBet?.quality === 'bet' ? C.green : C.gold, fontSize: 11, fontWeight: 950 }}>{p.bestBet?.label}</div>
                      <div style={{ color: C.cyan, fontSize: 8, fontWeight: 900, marginTop: 2 }}>Kalshi ask {p.bestBet?.kalshi?.yesAsk ?? '—'}¢ · max {p.bestBet?.maxYesPrice}¢</div>
                    </div>
                  </div>
                  <div style={{ color: 'rgba(230,245,255,0.74)', fontSize: 10, lineHeight: 1.45, marginTop: 7 }}>{p.bestBet?.hits}/{p.bestBet?.games} hit · avg {p.bestBet?.avg}. {p.bestBet?.explanation}</div>
                {p.bestBet?.kalshi && <a href={p.bestBet.kalshi.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', marginTop: 7, color: C.cyan, fontSize: 9, fontWeight: 900, textDecoration: 'none' }}>Trade Kalshi market · {p.bestBet.kalshi.isCombo ? 'combo' : 'single'} ↗</a>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4, marginTop: 8 }}>
                    {(p.last12 || []).slice(0, 12).map((g: any, idx: number) => {
                      const metric = p.bestBet?.metric
                      const val = metric === 'passing yards' ? g.stats.passingYards : metric === 'passing TDs' ? g.stats.passingTouchdowns : metric === 'rushing yards' ? g.stats.rushingYards : metric === 'receptions' ? g.stats.receptions : g.stats.receivingYards
                      const hit = val >= p.bestBet?.line
                      return <div key={`${g.eventId}-${idx}`} style={{ borderRadius: 6, padding: '4px 2px', textAlign: 'center', background: hit ? 'rgba(0,255,136,0.13)' : 'rgba(255,255,255,0.04)', color: hit ? C.green : C.textSecondary, fontSize: 9, fontWeight: 800 }}>{val}</div>
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.025)', border: `1px solid ${C.border}` }}>
          <div style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>Next NFL utility layer</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {['QB status adjustment', 'Weather/wind scoring impact', 'Short-week travel penalty', 'Divisional rematch flag', 'CLOB freshness + liquidity'].map(x => (
              <div key={x} style={{ color: 'rgba(230,245,255,0.78)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, boxShadow: `0 0 8px ${C.gold}` }} />{x}
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlowCard>
  )
}

// ─── Game Card ────────────────────────────────────────────────────────────────
function GameCard({ game, onLogBet, drift, isActive, onOpenIntel, onOpenAnalysis, bankroll }: {
  game: Game
  onLogBet: (bet: Omit<BetLog, 'id' | 'createdAt' | 'stake' | 'result'>) => void
  drift?: OddsDrift
  isActive?: boolean
  onOpenIntel?: () => void
  onOpenAnalysis?: () => void
  bankroll?: number
}) {
  const isMobile = useIsMobile()
  const [betDraft, setBetDraft] = useState<{ betType: string; betLabel: string; odds: number } | null>(null)
  const [showEdgeInfo, setShowEdgeInfo] = useState(false)
  const [lineMovement, setLineMovement] = useState<{ spread: string | null; total: string | null }>({ spread: null, total: null })
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const isLive = game.status === 'in'
  const isFinal = game.status === 'post'
  const isPre = game.status === 'pre'

  // Line movement tracking via localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `lines-${game.id}`
    const stored = localStorage.getItem(key)
    const current = { spread: game.spreadLine, total: game.totalLine }

    if (!stored) {
      if (game.hasSpreadOdds || game.hasTotalOdds) {
        localStorage.setItem(key, JSON.stringify({ spread: game.spreadLine, total: game.totalLine, ts: Date.now() }))
      }
      return
    }

    const opening = JSON.parse(stored)
    const movements: { spread: string | null; total: string | null } = { spread: null, total: null }

    if (game.hasSpreadOdds && opening.spread != null && Math.abs(current.spread - opening.spread) >= 1) {
      const favWas = opening.spread < 0 ? game.homeTeam.abbr : game.awayTeam.abbr
      movements.spread = `${favWas} ${opening.spread > 0 ? '+' : ''}${opening.spread} → ${current.spread > 0 ? '+' : ''}${current.spread}`
    }
    if (game.hasTotalOdds && opening.total != null && Math.abs(current.total - opening.total) >= 1) {
      movements.total = `O/U ${opening.total} → ${current.total}`
    }
    setLineMovement(movements)
  }, [game.id, game.spreadLine, game.totalLine])

  // Prediction badge
  useEffect(() => {
    if (game.status === 'post') return
    const parseRec = (rec: string) => {
      const parts = rec.split('-').map(Number)
      if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0.5
      const tot = parts[0] + parts[1]
      return tot === 0 ? 0.5 : parts[0] / tot
    }
    const homeRecPct = parseRec(game.homeTeam.record)
    const awayRecPct = parseRec(game.awayTeam.record)

    let homeEdge = (homeRecPct + (1 - awayRecPct)) / 2
    if (game.hasWinnerOdds) {
      homeEdge = homeEdge * 0.4 + game.homeWinOdds * 0.6
    }
    homeEdge += 0.03

    homeEdge = Math.min(0.88, Math.max(0.12, homeEdge))
    const awayEdge = 1 - homeEdge
    const confidence = Math.round(50 + Math.abs(homeEdge - 0.5) * 100)

    let recommendedTeam: string | null = null
    let winPct = 50
    if (homeEdge >= 0.54) { recommendedTeam = game.homeTeam.abbr; winPct = Math.round(homeEdge * 100) }
    else if (awayEdge >= 0.54) { recommendedTeam = game.awayTeam.abbr; winPct = Math.round(awayEdge * 100) }

    if (recommendedTeam) {
      setPrediction({ homeWinPct: Math.round(homeEdge * 100), awayWinPct: Math.round(awayEdge * 100), confidence, recommendation: homeEdge >= 0.54 ? 'home' : 'away', recommendedTeam, notes: '' })
    }
  }, [game])

  const homeSpreadLabel = game.spreadLine < 0 ? `${game.spreadLine}` : `+${game.spreadLine}`
  const awaySpreadLabel = game.spreadLine < 0 ? `+${-game.spreadLine}` : `${-game.spreadLine}`
  const awaySpreadOdds = game.spreadLine < 0 ? game.spreadAwayOdds : game.spreadHomeOdds
  const homeSpreadOdds = game.spreadLine < 0 ? game.spreadHomeOdds : game.spreadAwayOdds

  const dkSpreadDiff = game.hasDkOdds && game.hasSpreadOdds && game.dkSpread != null ? Math.abs(game.spreadLine - game.dkSpread) : 0
  const dkTotalDiff = game.hasDkOdds && game.hasTotalOdds && game.dkTotal != null ? Math.abs(game.totalLine - game.dkTotal) : 0
  const hasEdge = dkSpreadDiff >= 1.5 || dkTotalDiff >= 2

  // Drift helpers
  const awayWinDelta = drift?.winnerHomeDelta != null ? -(drift.winnerHomeDelta) : null
  const homeWinDelta = drift?.winnerHomeDelta ?? null
  const awaySpreadDelta = drift?.spreadDelta != null ? -(drift.spreadDelta) : null
  const homeSpreadDeltaVal = drift?.spreadDelta ?? null
  const overDelta = drift?.totalDelta ?? null
  const underDelta = drift?.totalDelta != null ? -(drift.totalDelta) : null

  // Card style — elevated for live
  const cardStyle: React.CSSProperties = isLive ? {
    position: 'relative' as const,
    zIndex: 1,
    background: 'rgba(10,4,20,0.92)',
    border: '1px solid rgba(255,68,102,0.45)',
    borderRadius: 24,
    animation: 'liveBorderPulse 2s ease-in-out infinite',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
  } : isActive ? {
    position: 'relative' as const,
    zIndex: 1,
    background: 'transparent',
    border: `1px solid ${C.borderHot}`,
    borderRadius: 24,
    boxShadow: `0 0 20px rgba(0,240,255,0.12)`,
    outline: 'none',
  } : {
    position: 'relative' as const,
    zIndex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    boxShadow: 'none',
  }

  return (
    <>
      <div className="mb-4" style={{ position: 'relative' }}>
        <div className={isLive ? '' : 'holo-projection holo-scanlines rounded-3xl'} style={cardStyle}>
          <div className="p-5">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                {isLive && (
                  <div className="flex items-center gap-1.5">
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: C.red,
                      boxShadow: `0 0 12px ${C.red}`,
                      display: 'inline-block',
                      animation: 'liveDotPulse 1.2s ease-in-out infinite',
                    }} />
                    <span style={{ color: C.red, fontSize: 11, fontWeight: 900, letterSpacing: '0.15em' }}>LIVE</span>
                  </div>
                )}
                {!isLive && !isFinal && (
                  <div className="flex items-center gap-2">
                    <span style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.06em' }}>{game.gameTime}</span>
                    {isPre && <CountdownBadge gameDate={game.gameDate} />}
                  </div>
                )}
                {isFinal && <span style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Final</span>}

                {/* Line movement badges */}
                {(lineMovement.spread || lineMovement.total) && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {lineMovement.spread && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 8, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
                        <span style={{ fontSize: 8 }}>📈</span>
                        <span style={{ color: C.purple, fontSize: 8, fontWeight: 800 }}>Spread: {lineMovement.spread}</span>
                      </div>
                    )}
                    {lineMovement.total && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 8, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
                        <span style={{ fontSize: 8 }}>📈</span>
                        <span style={{ color: C.purple, fontSize: 8, fontWeight: 800 }}>Total: {lineMovement.total}</span>
                      </div>
                    )}
                  </div>
                )}
                {hasEdge && (
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowEdgeInfo(v => !v)} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                      padding: '3px 8px', borderRadius: 8,
                      background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.borderHot}`,
                      color: C.cyan, textTransform: 'uppercase',
                      boxShadow: `0 0 12px ${C.cyan}22`, cursor: 'pointer'
                    }}>⚡ LINE GAP</button>
                    {showEdgeInfo && (
                      <div style={{
                        position: 'absolute', left: 0, top: 30, zIndex: 30, width: 280,
                        background: 'rgba(8,8,32,0.98)', border: `1px solid ${C.borderHot}`,
                        borderRadius: 16, padding: 16,
                        boxShadow: `0 0 40px rgba(0,240,255,0.15), 0 16px 40px rgba(0,0,0,0.8)`,
                      }}>
                        <p style={{ color: C.cyan, fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ POLYMARKET LINE DISCREPANCY</p>
                        <p style={{ color: C.textPrimary, fontSize: 12, lineHeight: 1.6, opacity: 0.8, marginBottom: 10 }}>Polymarket's line differs significantly from DraftKings. This gap is a potential edge.</p>
                        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                          <p style={{ color: C.textSecondary, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>How to exploit it:</p>
                          {['Bet the DK-aligned side on Polymarket — sharp books set sharper lines.', 'Arbitrage: bet both sides across platforms to lock guaranteed profit.', 'Move fast — these gaps close within hours.'].map((t, i) => (
                            <div key={i} className="flex gap-2 mb-1.5">
                              <span style={{ color: C.cyan, opacity: 0.5, flexShrink: 0, fontSize: 10 }}>◆</span>
                              <p style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.5, opacity: 0.75 }}>{t}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {prediction && prediction.recommendedTeam && (
                  <PredictionBadge winPct={prediction.homeWinPct >= prediction.awayWinPct ? prediction.homeWinPct : prediction.awayWinPct} team={prediction.recommendedTeam} confidence={prediction.confidence} />
                )}
                <button onClick={() => onOpenIntel && onOpenIntel()} style={{
                  fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '4px 10px', borderRadius: 10, fontWeight: 700,
                  background: isActive ? 'rgba(0,240,255,0.12)' : 'rgba(0,240,255,0.06)',
                  border: `1px solid ${isActive ? C.borderHot : 'rgba(0,240,255,0.2)'}`,
                  color: isActive ? C.cyan : C.textSecondary, cursor: 'pointer', transition: 'all 0.2s',
                }}>📊 Intel</button>
                <button onClick={() => onOpenAnalysis && onOpenAnalysis()} style={{
                  fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '4px 12px', borderRadius: 10, fontWeight: 700,
                  background: 'rgba(168,85,247,0.1)',
                  border: '1px solid rgba(168,85,247,0.25)',
                  color: C.purple, cursor: 'pointer', transition: 'all 0.2s',
                }}>◈ Analyze</button>
              </div>
            </div>

            {/* Teams / Score */}
            {isLive ? (
              <LiveScoreDisplay game={game} />
            ) : isFinal ? (
              <div className="flex items-center justify-between px-1 mb-4">
                <div className="flex items-center gap-2.5">
                  {game.awayTeam.logo
                    ? <img src={game.awayTeam.logo} style={{ width: isMobile ? 30 : 36, height: isMobile ? 30 : 36, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.3))' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 10, fontWeight: 800 }}>{game.awayTeam.abbr.slice(0, 2)}</div>}
                  <span style={{ color: C.textPrimary, fontSize: 28, fontWeight: 900 }}>{game.awayTeam.score}</span>
                </div>
                <span style={{ color: C.textSecondary, fontSize: 12 }}>—</span>
                <div className="flex items-center gap-2.5">
                  <span style={{ color: C.textPrimary, fontSize: 28, fontWeight: 900 }}>{game.homeTeam.score}</span>
                  {game.homeTeam.logo
                    ? <img src={game.homeTeam.logo} style={{ width: 36, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.3))' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 10, fontWeight: 800 }}>{game.homeTeam.abbr.slice(0, 2)}</div>}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-1 mb-4">
                <div className="flex items-center gap-2.5">
                  {game.awayTeam.logo
                    ? <img src={game.awayTeam.logo} style={{ width: 32, height: 32, objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(0,240,255,0.25))' }} />
                    : <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,240,255,0.08)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 9, fontWeight: 800 }}>{game.awayTeam.abbr.slice(0, 2)}</div>}
                  <div>
                    <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>{game.awayTeam.abbr}</p>
                    <p style={{ color: C.textSecondary, fontSize: 10 }}>{game.awayTeam.record}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em' }}>@</span>
                  {game.venue && <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 2, lineHeight: 1.4 }}>{game.venue.name}</p>}
                </div>
                <div className="flex items-center gap-2.5 flex-row-reverse">
                  {game.homeTeam.logo
                    ? <img src={game.homeTeam.logo} style={{ width: 32, height: 32, objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(0,240,255,0.25))' }} />
                    : <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,240,255,0.08)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 9, fontWeight: 800 }}>{game.homeTeam.abbr.slice(0, 2)}</div>}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>{game.homeTeam.abbr}</p>
                    <p style={{ color: C.textSecondary, fontSize: 10 }}>{game.homeTeam.record}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Win prob bar */}
            {game.hasWinnerOdds && (
              <div className="mb-4">
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct(game.homeWinOdds)}%`,
                    background: `linear-gradient(90deg, ${C.cyan}, ${C.purple})`,
                    boxShadow: `0 0 8px ${C.cyan}55`,
                    borderRadius: 2,
                  }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span style={{ color: C.textSecondary, fontSize: 10 }}>{game.awayTeam.abbr} {pct(game.awayWinOdds)}%</span>
                  <span style={{ color: C.textSecondary, fontSize: 10 }}>{game.homeTeam.abbr} {pct(game.homeWinOdds)}%</span>
                </div>
                {/* Kelly Criterion */}
                {prediction && prediction.recommendedTeam && (() => {
                  const isHomeRec = prediction.recommendation === 'home'
                  const ourProb = (isHomeRec ? prediction.homeWinPct : prediction.awayWinPct) / 100
                  const marketProb = isHomeRec ? game.homeWinOdds : game.awayWinOdds
                  const kellyFrac = computeKelly(ourProb, marketProb)
                  const halfKelly = kellyFrac * 0.5
                  const edgeScore = ourProb - marketProb
                  if (edgeScore <= 0.02) return null
                  const betAmt = (bankroll || 0) * halfKelly
                  return (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 8,
                        background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.25)',
                      }}>
                        <span style={{ fontSize: 9 }}>📐</span>
                        <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 700 }}>Kelly:</span>
                        <span style={{ color: C.green, fontSize: 9, fontWeight: 900 }}>{(halfKelly * 100).toFixed(1)}% of bankroll</span>
                        {bankroll ? (
                          <span style={{ color: C.textSecondary, fontSize: 9 }}>→ <span style={{ color: C.green, fontWeight: 800 }}>${betAmt.toFixed(2)}</span></span>
                        ) : null}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 8,
                        background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)',
                      }}>
                        <span style={{ color: C.purple, fontSize: 9, fontWeight: 800 }}>+{Math.round(edgeScore * 100)}% edge</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Lines table */}
            {(game.hasWinnerOdds || game.hasSpreadOdds || game.hasTotalOdds) && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div style={{ width: 80, flexShrink: 0 }} />
                  {['WIN', 'SPREAD', 'TOTAL'].map(h => (
                    <div key={h} style={{ minWidth: 72, textAlign: 'center', fontSize: 8, color: C.textSecondary, fontWeight: 800, letterSpacing: '0.15em' }}>{h}</div>
                  ))}
                </div>

                {/* Away row */}
                <div className="flex items-center gap-2 mb-2">
                  <div style={{ width: 80, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {game.awayTeam.logo && <img src={game.awayTeam.logo} style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                    <span style={{ color: C.textSecondary, fontSize: 11, fontWeight: 700 }}>{game.awayTeam.abbr}</span>
                  </div>
                  {game.hasWinnerOdds
                    ? <OddsChip top="WIN" bottom={String(pct(game.awayWinOdds))} hot={pct(game.awayWinOdds) >= 55} href={game.polyWinnerUrl} delta={awayWinDelta} flashDir={awayWinDelta != null ? (awayWinDelta > 0 ? 'up' : 'down') : null} />
                    : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                  {game.hasSpreadOdds
                    ? <OddsChip top={awaySpreadLabel} bottom={String(pct(awaySpreadOdds))} hot={pct(awaySpreadOdds) >= 55} href={game.polySpreadUrl} delta={awaySpreadDelta} flashDir={awaySpreadDelta != null ? (awaySpreadDelta > 0 ? 'up' : 'down') : null} />
                    : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                  {game.hasTotalOdds
                    ? <OddsChip top={`O ${game.totalLine}`} bottom={String(pct(game.overOdds))} hot={pct(game.overOdds) >= 55} href={game.polyTotalUrl} delta={overDelta} flashDir={overDelta != null ? (overDelta > 0 ? 'up' : 'down') : null} />
                    : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                </div>

                {/* Home row */}
                <div className="flex items-center gap-2">
                  <div style={{ width: 80, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {game.homeTeam.logo && <img src={game.homeTeam.logo} style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                    <span style={{ color: C.textSecondary, fontSize: 11, fontWeight: 700 }}>{game.homeTeam.abbr}</span>
                  </div>
                  {game.hasWinnerOdds
                    ? <OddsChip top="WIN" bottom={String(pct(game.homeWinOdds))} hot={pct(game.homeWinOdds) >= 55} href={game.polyWinnerUrl} delta={homeWinDelta} flashDir={homeWinDelta != null ? (homeWinDelta > 0 ? 'up' : 'down') : null} />
                    : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                  {game.hasSpreadOdds
                    ? <OddsChip top={homeSpreadLabel} bottom={String(pct(homeSpreadOdds))} hot={pct(homeSpreadOdds) >= 55} href={game.polySpreadUrl} delta={homeSpreadDeltaVal} flashDir={homeSpreadDeltaVal != null ? (homeSpreadDeltaVal > 0 ? 'up' : 'down') : null} />
                    : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                  {game.hasTotalOdds
                    ? <OddsChip top={`U ${game.totalLine}`} bottom={String(pct(game.underOdds))} hot={pct(game.underOdds) >= 55} href={game.polyTotalUrl} delta={underDelta} flashDir={underDelta != null ? (underDelta > 0 ? 'up' : 'down') : null} />
                    : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                </div>
              </div>
            )}

            {/* DK comparison */}
            {game.hasDkOdds && (game.hasSpreadOdds || game.hasTotalOdds) && (
              <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
                <p style={{ color: C.textSecondary, fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 800, marginBottom: 8 }}>Line Comparison · Polymarket vs DraftKings</p>
                <div className="flex flex-col gap-1.5">
                  {game.hasSpreadOdds && game.dkSpread != null && (() => {
                    const edge = Math.abs(game.spreadLine - game.dkSpread!) >= 1.5
                    return (
                      <div className="grid grid-cols-3 items-center py-2 px-3 rounded-xl" style={{ background: edge ? 'rgba(0,240,255,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${edge ? C.borderHot : C.border}` }}>
                        <span style={{ color: C.textSecondary, fontSize: 11 }}>Spread</span>
                        <span style={{ textAlign: 'center', color: C.textSecondary, fontSize: 11, fontFamily: 'monospace' }}>{game.dkSpread! > 0 ? '+' : ''}{game.dkSpread}</span>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <span style={{ color: edge ? C.cyan : C.textSecondary, fontSize: 11, fontFamily: 'monospace', fontWeight: edge ? 800 : 400 }}>{game.spreadLine > 0 ? '+' : ''}{game.spreadLine}</span>
                          {edge && <span style={{ color: C.cyan, fontSize: 10 }}>⚡</span>}
                        </div>
                      </div>
                    )
                  })()}
                  {game.hasTotalOdds && game.dkTotal != null && (() => {
                    const edge = Math.abs(game.totalLine - game.dkTotal!) >= 2
                    return (
                      <div className="grid grid-cols-3 items-center py-2 px-3 rounded-xl" style={{ background: edge ? 'rgba(0,240,255,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${edge ? C.borderHot : C.border}` }}>
                        <span style={{ color: C.textSecondary, fontSize: 11 }}>Total</span>
                        <span style={{ textAlign: 'center', color: C.textSecondary, fontSize: 11, fontFamily: 'monospace' }}>{game.dkTotal}</span>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <span style={{ color: edge ? C.cyan : C.textSecondary, fontSize: 11, fontFamily: 'monospace', fontWeight: edge ? 800 : 400 }}>{game.totalLine}</span>
                          {edge && <span style={{ color: C.cyan, fontSize: 10 }}>⚡</span>}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {!game.hasWinnerOdds && !game.hasSpreadOdds && !game.hasTotalOdds && (
              <p style={{ textAlign: 'center', color: C.textSecondary, fontSize: 10, marginTop: 8, letterSpacing: '0.08em' }}>Lines open closer to tip-off</p>
            )}
          </div>{/* end card content */}

        </div>{/* end card */}

      </div>
      {betDraft && (
        <BetModal
          game={game} betType={betDraft.betType} betLabel={betDraft.betLabel} odds={betDraft.odds}
          onClose={() => setBetDraft(null)}
          onSave={(bet) => { onLogBet(bet); setBetDraft(null) }}
        />
      )}
    </>
  )
}

// ─── UFC Types ────────────────────────────────────────────────────────────────
interface UFCFighter {
  id: string; name: string; record: string; ranking: number | null
  country: string; age: number | null; height: string; reach: string
  strikingAccuracy: number | null; takedownAccuracy: number | null
  recentForm: string[]
}
interface UFCPolyOdds {
  fighterAWin: number | null; fighterBWin: number | null; hasWinner: boolean
  totalLine: number | null; overOdds: number | null; underOdds: number | null; hasTotal: boolean
  koTkoOdds: number | null; submissionOdds: number | null; goDistanceOdds: number | null
  polyWinnerUrl: string | null; polyTotalUrl: string | null
}
interface UFCFight {
  id: string; boutOrder: number; isMainEvent: boolean; weightClass: string
  isTitleFight: boolean; status: 'pre' | 'in' | 'post'; statusDetail: string
  fighterA: UFCFighter; fighterB: UFCFighter
  moneyLineA: number | null; moneyLineB: number | null
  polyOdds: UFCPolyOdds
  result?: { winner: string; method: string; round: number; time: string }
}
interface UFCEvent {
  id: string; name: string; date: string; venue: string; location: string
  status: 'pre' | 'in' | 'post'; fights: UFCFight[]
}

// ─── UFC Intel Panel ──────────────────────────────────────────────────────────
interface UFCIntel {
  verdict: string          // 1-sentence who wins and why
  edge: string             // who has the edge overall
  striking: string         // striking breakdown, 1-2 sentences
  grappling: string        // grappling/wrestling breakdown
  keyFactors: string[]     // 3 bullet points max
  prediction: string       // method of victory prediction
  watchFor: string         // key x-factor to watch
}

function buildFallbackUFCIntel(fight: UFCFight, reason = 'AI model unavailable'): UFCIntel {
  const { fighterA: a, fighterB: b } = fight
  const aWin = fight.polyOdds?.fighterAWin
  const bWin = fight.polyOdds?.fighterBWin
  const hasMarket = aWin != null && bWin != null
  const leader = hasMarket ? (aWin! >= bWin! ? a : b) : a
  const opponent = leader.id === a.id ? b : a
  const marketGap = hasMarket ? Math.abs(aWin! - bWin!) : null
  const marketText = hasMarket
    ? `${leader.name} is the market lean at ${Math.round(Math.max(aWin!, bWin!) * 100)}% with a ${Math.round((marketGap || 0) * 100)} point gap.`
    : 'No matched win market is available yet, so this is a conservative scouting shell.'
  const finishLean = fight.polyOdds?.goDistanceOdds != null && fight.polyOdds.goDistanceOdds >= 0.55
    ? 'Decision / goes distance'
    : fight.polyOdds?.submissionOdds != null && fight.polyOdds.submissionOdds >= 0.45
      ? 'Submission live, exact side unclear'
      : fight.polyOdds?.koTkoOdds != null && fight.polyOdds.koTkoOdds >= 0.45
        ? 'KO/TKO live, exact side unclear'
        : 'Decision or late finish'

  return {
    verdict: `${marketText} ${reason}; showing market-and-card based intel instead of pretending to have a full stylistic model.`,
    edge: leader.name,
    striking: `${leader.name} gets the provisional edge only from available market/card context. Confirm tape notes for range, volume, durability, and defensive reactions before betting.`,
    grappling: `Grappling edge is not safely inferable from the current feed. Check takedown offense/defense, get-up ability, submission threat, and cage control for ${leader.name} vs ${opponent.name}.`,
    keyFactors: [
      hasMarket ? `Market confidence: ${leader.name} over ${opponent.name}` : 'No reliable win-market match yet',
      `${fight.weightClass}${fight.isTitleFight ? ' title fight' : ''} · ${fight.statusDetail || fight.status}`,
      'Use this as a fallback read; verify style notes before sizing a position',
    ],
    prediction: finishLean,
    watchFor: `If ${opponent.name} can flip the expected phase — pressure striker into grappling, deny takedowns, or force pace — the market lean can become fragile.`,
  }
}

function parseUFCIntel(raw: string): UFCIntel | null {
  if (!raw) return null
  const cleaned = raw.replace(/```json|```/g, '').trim()
  try { return JSON.parse(cleaned) } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
  }
  return null
}

function UFCIntelPanel({ fight, onClose }: { fight: UFCFight; onClose: () => void }) {
  const [intel, setIntel] = useState<UFCIntel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { fighterA: a, fighterB: b, weightClass, isTitleFight } = fight
    const fmtForm = (f: UFCFighter) => f.recentForm.length > 0 ? f.recentForm.slice(0, 5).join('') : 'N/A'
    const fmtRank = (f: UFCFighter) => f.ranking !== null ? (f.ranking === 0 ? 'Champion' : `#${f.ranking}`) : 'NR'
    const prompt = `You are a sharp UFC analyst. Analyze this fight and respond ONLY with valid JSON (no markdown, no extra text).

Fight: ${a.name} vs ${b.name} | ${weightClass}${isTitleFight ? ' — TITLE FIGHT' : ''}
${a.name}: ${a.record} | Rank: ${fmtRank(a)} | Form: ${fmtForm(a)} | Striking Acc: ${a.strikingAccuracy ?? '?'}% | TD Acc: ${a.takedownAccuracy ?? '?'}% | Age: ${a.age ?? '?'} | Height: ${a.height} | Reach: ${a.reach}
${b.name}: ${b.record} | Rank: ${fmtRank(b)} | Form: ${fmtForm(b)} | Striking Acc: ${b.strikingAccuracy ?? '?'}% | TD Acc: ${b.takedownAccuracy ?? '?'}% | Age: ${b.age ?? '?'} | Height: ${b.height} | Reach: ${b.reach}
Polymarket win odds: ${a.name} ${fight.polyOdds?.fighterAWin ? Math.round(fight.polyOdds.fighterAWin * 100) : '?'}% | ${b.name} ${fight.polyOdds?.fighterBWin ? Math.round(fight.polyOdds.fighterBWin * 100) : '?'}%

IMPORTANT RULES:
- Do NOT base the verdict on win/loss record alone — records are misleading due to opponent quality
- Analyze: fighting style, range/reach advantages, striking accuracy, takedown offense/defense, submission threat, cardio, age/experience, recent competition level, how their styles match up
- Use Polymarket odds as a signal of market consensus but identify if there's an edge against it
- Be specific — name actual skills, tendencies, and stylistic matchup reasons

Return this exact JSON:
{"verdict":"<1 sentence who wins and why — based on skills/style, not just record>","edge":"<${a.name} or ${b.name}>","striking":"<striking matchup: range, accuracy, volume, power, who controls distance and why>","grappling":"<grappling matchup: who shoots more, takedown defense, submission threat, cage control>","keyFactors":["<specific stylistic or physical factor>","<specific factor>","<specific factor>"],"prediction":"<method of victory e.g. Decision, KO R2, Sub R1>","watchFor":"<key x-factor, upset scenario, or stylistic wrinkle that could flip the fight>"}`

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: prompt }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d?.error || `Analyze failed (${res.status})`)
        const parsed = parseUFCIntel(d.analysis || '')
        if (!parsed?.verdict) throw new Error('Analyze returned unusable UFC JSON')
        if (!cancelled) setIntel(parsed)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI model unavailable'
        const reason = msg.includes('XAI_API_KEY') ? 'AI key unavailable' : msg
        if (!cancelled) setIntel(buildFallbackUFCIntel(fight, reason))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [fight])

  const renderStatBar = (label: string, valA: number | null, valB: number | null, suffix = '%') => {
    if (valA === null && valB === null) return null
    const a = valA ?? 0; const b = valB ?? 0; const total = a + b || 1
    const pctA = Math.round((a / total) * 100)
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: C.textPrimary, fontSize: 11, fontWeight: 700 }}>{valA !== null ? `${valA}${suffix}` : '?'}</span>
          <span style={{ color: C.textSecondary, fontSize: 10 }}>{label}</span>
          <span style={{ color: C.textPrimary, fontSize: 11, fontWeight: 700 }}>{valB !== null ? `${valB}${suffix}` : '?'}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${pctA}%`, background: UFC_RED, transition: 'width 0.5s' }} />
          <div style={{ flex: 1, background: C.cyan }} />
        </div>
      </div>
    )
  }

  const { fighterA: a, fighterB: b } = fight

  return (
    <div style={{ width: '100%', background: 'rgba(2,2,15,0.97)', borderTop: `1px solid rgba(232,0,45,0.3)`, padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, maxWidth: 900, margin: '0 auto 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: UFC_RED, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>◈ FIGHT INTEL</span>
          <span style={{ color: C.textSecondary, fontSize: 10 }}>— {a.name} vs {b.name}</span>
        </div>
        <button onClick={onClose} style={{ color: C.textSecondary, fontSize: 16, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, maxWidth: 1200, margin: '0 auto' }}>

        {/* Fighter comparison */}
        <div style={{ background: 'rgba(8,8,28,0.9)', border: `1px solid rgba(232,0,45,0.2)`, borderRadius: 16, padding: 20, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
            <span style={{ fontSize: 12 }}>⚔️</span>
            <span style={{ color: 'rgba(0,240,255,0.5)', fontSize: 10, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' }}>Fighter Stats Comparison</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginBottom: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: UFC_RED, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Fighter A</p>
              <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 900 }}>{a.name}</p>
              <p style={{ color: C.textSecondary, fontSize: 11 }}>{a.record}</p>
              {a.ranking !== null && <p style={{ color: UFC_RED, fontSize: 10, fontWeight: 700, marginTop: 2 }}>{a.ranking === 0 ? '🏆 Champion' : `Rank #${a.ranking}`}</p>}
              {a.recentForm.length > 0 && (
                <div style={{ display: 'flex', gap: 3, marginTop: 6, justifyContent: 'center' }}>
                  {a.recentForm.slice(0, 5).map((r, i) => (
                    <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: r === 'W' ? C.green : r === 'L' ? C.red : C.gold, fontSize: 8, color: '#000', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r}</div>
                  ))}
                </div>
              )}
              <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 6 }}>{a.country} · {a.age ? `${a.age}y` : ''} · {a.height}</p>
              {a.reach && <p style={{ color: C.textSecondary, fontSize: 10 }}>Reach: {a.reach}</p>}
            </div>
            <span style={{ color: C.textSecondary, fontSize: 16, fontWeight: 900 }}>VS</span>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: C.cyan, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Fighter B</p>
              <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 900 }}>{b.name}</p>
              <p style={{ color: C.textSecondary, fontSize: 11 }}>{b.record}</p>
              {b.ranking !== null && <p style={{ color: C.cyan, fontSize: 10, fontWeight: 700, marginTop: 2 }}>{b.ranking === 0 ? '🏆 Champion' : `Rank #${b.ranking}`}</p>}
              {b.recentForm.length > 0 && (
                <div style={{ display: 'flex', gap: 3, marginTop: 6, justifyContent: 'center' }}>
                  {b.recentForm.slice(0, 5).map((r, i) => (
                    <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: r === 'W' ? C.green : r === 'L' ? C.red : C.gold, fontSize: 8, color: '#000', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r}</div>
                  ))}
                </div>
              )}
              <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 6 }}>{b.country} · {b.age ? `${b.age}y` : ''} · {b.height}</p>
              {b.reach && <p style={{ color: C.textSecondary, fontSize: 10 }}>Reach: {b.reach}</p>}
            </div>
          </div>
          {renderStatBar('Striking Acc', a.strikingAccuracy, b.strikingAccuracy)}
          {renderStatBar('Takedown Acc', a.takedownAccuracy, b.takedownAccuracy)}
        </div>

        {/* AI Intel — structured */}
        {loading ? (
          <div style={{ background: 'rgba(8,8,28,0.9)', border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, gridColumn: '1 / -1' }}>
            {[...Array(4)].map((_, i) => <div key={i} style={{ height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginBottom: 10, width: i % 2 === 0 ? '100%' : '75%' }} />)}
            <p style={{ color: C.textSecondary, fontSize: 10, textAlign: 'center', letterSpacing: '0.15em' }}>ANALYZING…</p>
          </div>
        ) : intel ? (
          <>
            {/* Top row: Verdict + Method */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ flex: 3, minWidth: 220, background: 'linear-gradient(135deg, rgba(232,0,45,0.1), rgba(168,85,247,0.05))', border: '1px solid rgba(232,0,45,0.3)', borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>🎯 VERDICT</p>
                <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700, lineHeight: 1.55 }}>{intel.verdict}</p>
              </div>
              {intel.prediction && (
                <div style={{ flex: 1, minWidth: 120, background: 'rgba(232,0,45,0.08)', border: '1px solid rgba(232,0,45,0.25)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>METHOD</p>
                  <p style={{ color: UFC_RED, fontSize: 14, fontWeight: 900 }}>{intel.prediction}</p>
                </div>
              )}
            </div>

            {/* Bottom row: Striking | Grappling | Key Factors | Watch For */}
            {intel.striking && (
              <div style={{ background: 'rgba(8,8,28,0.9)', border: `1px solid rgba(0,240,255,0.15)`, borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>👊 STRIKING</p>
                <p style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.6, opacity: 0.9 }}>{intel.striking}</p>
              </div>
            )}
            {intel.grappling && (
              <div style={{ background: 'rgba(8,8,28,0.9)', border: `1px solid rgba(0,240,255,0.15)`, borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>🤼 GRAPPLING</p>
                <p style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.6, opacity: 0.9 }}>{intel.grappling}</p>
              </div>
            )}
            {intel.keyFactors?.length > 0 && (
              <div style={{ background: 'rgba(8,8,28,0.9)', border: `1px solid rgba(168,85,247,0.2)`, borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ KEY FACTORS</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {intel.keyFactors.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: C.purple, fontSize: 9, fontWeight: 900, flexShrink: 0, marginTop: 2 }}>◆</span>
                      <p style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.55, opacity: 0.9 }}>{f}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {intel.watchFor && (
              <div style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.18)', borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>👁 WATCH FOR</p>
                <p style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.6, opacity: 0.9 }}>{intel.watchFor}</p>
              </div>
            )}
          </>
        ) : (
          <div style={{ background: 'rgba(8,8,28,0.9)', border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, gridColumn: '1 / -1' }}>
            <p style={{ color: C.textSecondary, fontSize: 12, textAlign: 'center' }}>Analysis unavailable</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── UFC Fight Card ───────────────────────────────────────────────────────────
function getBoutLabel(fight: UFCFight, totalFights: number): string {
  if (fight.isMainEvent) return 'MAIN EVENT'
  if (fight.boutOrder === 2) return 'CO-MAIN'
  if (fight.boutOrder <= Math.ceil(totalFights / 2)) return 'MAIN CARD'
  return 'PRELIM'
}

function pctLabel(v: number | null | undefined) {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

function marketLean(fight: UFCFight) {
  const a = fight.polyOdds?.fighterAWin
  const b = fight.polyOdds?.fighterBWin
  if (a == null || b == null) return null
  const leader = a >= b ? fight.fighterA.name : fight.fighterB.name
  const edge = Math.abs(a - b)
  return { leader, edge, label: edge >= 0.3 ? 'Strong market lean' : edge >= 0.14 ? 'Clear market lean' : 'Tight market' }
}

function FightCard({ fight, totalFights, onOpenIntel, isActive }: {
  fight: UFCFight; totalFights: number; onOpenIntel: () => void; isActive: boolean
}) {
  const isMobile = useIsMobile()
  const boutLabel = getBoutLabel(fight, totalFights)
  const boutColor = fight.isMainEvent ? UFC_RED : fight.boutOrder === 2 ? C.gold : fight.boutOrder <= Math.ceil(totalFights / 2) ? C.purple : C.textSecondary
  const statusColor = fight.status === 'in' ? C.green : fight.status === 'post' ? C.textSecondary : C.gold
  const statusBg = fight.status === 'in' ? 'rgba(0,255,136,0.10)' : fight.status === 'post' ? 'rgba(255,255,255,0.05)' : 'rgba(255,215,0,0.10)'
  const statusBorder = fight.status === 'in' ? 'rgba(0,255,136,0.35)' : fight.status === 'post' ? 'rgba(255,255,255,0.12)' : 'rgba(255,215,0,0.35)'
  const statusLabel = fight.status === 'in' ? (fight.statusDetail || 'LIVE / PRE-FIGHT') : fight.status === 'post' ? 'FINAL' : (fight.statusDetail || 'SCHEDULED')
  const { fighterA: a, fighterB: b, result } = fight

  const RankBadge = ({ r }: { r: number | null }) => r !== null ? (
    <span style={{ background: 'rgba(232,0,45,0.15)', border: `1px solid rgba(232,0,45,0.4)`, borderRadius: 6, padding: '1px 6px', color: UFC_RED, fontSize: 9, fontWeight: 900 }}>
      {r === 0 ? 'C' : `#${r}`}
    </span>
  ) : null

  const Fighter = ({ f, side }: { f: UFCFighter; side: 'left' | 'right' }) => {
    const isWinner = result?.winner === f.name
    const isLoser = result && result.winner !== f.name
    return (
      <div style={{ flex: 1, textAlign: side === 'left' ? 'left' : 'right', opacity: isLoser ? 0.55 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: side === 'right' ? 'flex-end' : 'flex-start' }}>
          {side === 'right' && <RankBadge r={f.ranking} />}
          <span style={{ color: isWinner ? '#fff' : C.textPrimary, fontSize: isMobile ? 12 : 13, fontWeight: 900, textShadow: isWinner ? `0 0 16px ${UFC_RED}88` : 'none' }}>{f.name}</span>
          <span style={{ fontSize: 12 }}>{f.country}</span>
          {side === 'left' && <RankBadge r={f.ranking} />}
        </div>
        <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 1 }}>{f.record}</p>
      </div>
    )
  }

  return (
    <div style={{
      borderRadius: isMobile ? 16 : 20, padding: isMobile ? '14px' : '20px',
      background: isActive ? 'rgba(232,0,45,0.06)' : 'rgba(8,8,28,0.85)',
      border: `1px solid ${isActive ? 'rgba(232,0,45,0.5)' : fight.isMainEvent ? 'rgba(232,0,45,0.3)' : C.border}`,
      boxShadow: fight.isMainEvent ? `0 0 30px rgba(232,0,45,0.1)` : 'none',
      backdropFilter: 'blur(24px)',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }} onClick={onOpenIntel}>
      {/* Bout header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: fight.isMainEvent ? `rgba(232,0,45,0.15)` : 'rgba(255,255,255,0.06)',
          border: `1px solid ${boutColor}`,
          borderRadius: 8, padding: '2px 10px',
          color: boutColor, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
        }}>{boutLabel}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 6, padding: '1px 7px', color: statusColor, fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{statusLabel}</span>
          {fight.isTitleFight && <span style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)', borderRadius: 6, padding: '1px 7px', color: C.gold, fontSize: 8, fontWeight: 900 }}>🏆 TITLE</span>}
          <span style={{ color: C.textSecondary, fontSize: 10 }}>{fight.weightClass}</span>
        </div>
        <button onClick={e => { e.stopPropagation(); onOpenIntel() }} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 8, background: 'rgba(232,0,45,0.1)', border: `1px solid rgba(232,0,45,0.3)`, color: UFC_RED, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.08em' }}>📊 INTEL</button>
      </div>

      {/* Fighters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
        <Fighter f={a} side="left" />
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <span style={{ color: C.textSecondary, fontSize: 13, fontWeight: 900 }}>VS</span>
          {result && (
            <div style={{ marginTop: 6 }}>
              <p style={{ color: UFC_RED, fontSize: 9, fontWeight: 900 }}>{result.method}</p>
              <p style={{ color: C.textSecondary, fontSize: 8 }}>R{result.round} · {result.time}</p>
            </div>
          )}
        </div>
        <Fighter f={b} side="right" />
      </div>

      {/* Polymarket odds + market read */}
      {(() => {
        const p = fight.polyOdds
        const hasAny = p?.hasWinner || p?.hasTotal || p?.koTkoOdds !== null || p?.submissionOdds !== null || p?.goDistanceOdds !== null
        if (!hasAny) return (
          <p style={{ color: C.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 12, opacity: 0.5 }}>No Polymarket markets matched yet</p>
        )
        const lean = marketLean(fight)
        const chips: Array<{ label: string; value: string; hot?: boolean; href?: string | null }> = []
        if (p.hasWinner) {
          chips.push({ label: `${fight.fighterA.name.split(' ').slice(-1)[0]} win`, value: pctLabel(p.fighterAWin), hot: (p.fighterAWin || 0) >= 0.55, href: p.polyWinnerUrl })
          chips.push({ label: `${fight.fighterB.name.split(' ').slice(-1)[0]} win`, value: pctLabel(p.fighterBWin), hot: (p.fighterBWin || 0) >= 0.55, href: p.polyWinnerUrl })
        }
        if (p.hasTotal) {
          chips.push({ label: `Over ${p.totalLine}`, value: pctLabel(p.overOdds), hot: (p.overOdds || 0) >= 0.55, href: p.polyTotalUrl })
          chips.push({ label: `Under ${p.totalLine}`, value: pctLabel(p.underOdds), hot: (p.underOdds || 0) >= 0.55, href: p.polyTotalUrl })
        }
        if (p.koTkoOdds !== null) chips.push({ label: 'Fight ends KO/TKO', value: pctLabel(p.koTkoOdds), hot: p.koTkoOdds >= 0.55 })
        if (p.submissionOdds !== null) chips.push({ label: 'Fight ends submission', value: pctLabel(p.submissionOdds), hot: p.submissionOdds >= 0.55 })
        if (p.goDistanceOdds !== null) chips.push({ label: 'Goes distance', value: pctLabel(p.goDistanceOdds), hot: p.goDistanceOdds >= 0.55 })

        return (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            {lean && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{lean.label}</span>
                <span style={{ color: lean.edge >= 0.14 ? UFC_RED : C.cyan, fontSize: 11, fontWeight: 900, textAlign: 'right' }}>{lean.leader} · {Math.round(lean.edge * 100)}pt gap</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
              {chips.map(chip => (
                <a key={`${chip.label}-${chip.value}`} href={chip.href || undefined} target={chip.href ? '_blank' : undefined} rel={chip.href ? 'noreferrer' : undefined} onClick={e => chip.href ? e.stopPropagation() : e.preventDefault()} style={{ textDecoration: 'none', borderRadius: 12, padding: '8px 9px', background: chip.hot ? 'rgba(232,0,45,0.10)' : 'rgba(255,255,255,0.035)', border: `1px solid ${chip.hot ? 'rgba(232,0,45,0.35)' : 'rgba(255,255,255,0.08)'}` }}>
                  <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</div>
                  <div style={{ color: chip.hot ? UFC_RED : C.textPrimary, fontSize: 15, fontWeight: 950, marginTop: 2 }}>{chip.value}</div>
                </a>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── UFC Section ──────────────────────────────────────────────────────────────
function UFCSection() {
  const cols = useColCount()
  const isMobile = useIsMobile()
  const [events, setEvents] = useState<UFCEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [activeFight, setActiveFight] = useState<UFCFight | null>(null)
  const [fightFilter, setFightFilter] = useState<'all' | 'actionable' | 'markets'>('all')
  useEffect(() => {
    if (activeFight) {
      setTimeout(() => {
        document.getElementById('ufc-intel-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }, [activeFight])

  useEffect(() => {
    fetch('/api/ufc')
      .then(r => r.json())
      .then((data: UFCEvent[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setEvents(data)
          // Prefer live > event with most Polymarket odds > upcoming > first
          const live = data.find(e => e.status === 'in')
          const withOdds = [...data].sort((a, b) => {
            const aOdds = a.fights?.filter(f => f.polyOdds?.hasWinner).length || 0
            const bOdds = b.fights?.filter(f => f.polyOdds?.hasWinner).length || 0
            return bOdds - aOdds
          })[0]
          const best = live || (withOdds && (withOdds.fights?.filter(f => f.polyOdds?.hasWinner).length || 0) > 0 ? withOdds : null) || data.find(e => e.status === 'pre') || data[0]
          setSelectedEventId(best.id)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const selectedEvent = events.find(e => e.id === selectedEventId) || events[0]

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[...Array(5)].map((_, i) => <div key={i} style={{ height: 90, borderRadius: 20, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, animation: 'pulse 2s infinite' }} />)}
    </div>
  )

  if (!selectedEvent) return (
    <div style={{ textAlign: 'center', padding: '80px 0' }}>
      <p style={{ color: C.textSecondary, fontSize: 16 }}>No UFC events found</p>
      <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 8, opacity: 0.6 }}>ESPN data may be unavailable</p>
    </div>
  )

  const sortedFights = [...(selectedEvent.fights || [])].sort((a, b) => a.boutOrder - b.boutOrder)
  const visibleFights = sortedFights.filter(f => {
    if (fightFilter === 'actionable') return f.status !== 'post'
    if (fightFilter === 'markets') return Boolean(f.polyOdds?.hasWinner || f.polyOdds?.hasTotal || f.polyOdds?.koTkoOdds !== null || f.polyOdds?.submissionOdds !== null || f.polyOdds?.goDistanceOdds !== null)
    return true
  })

  const formatEventDate = (iso: string) => {
    if (!iso) return ''
    try { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) }
    catch { return iso }
  }

  return (
    <div>
      {/* Event selector */}
      <div style={{ marginBottom: isMobile ? 14 : 24, borderRadius: isMobile ? 16 : 20, padding: isMobile ? '16px 14px' : '20px 24px', background: 'rgba(8,8,28,0.85)', border: `1px solid rgba(232,0,45,0.3)`, boxShadow: `0 0 40px rgba(232,0,45,0.08)` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ background: `rgba(232,0,45,0.15)`, border: `1px solid rgba(232,0,45,0.5)`, borderRadius: 8, padding: '2px 10px', color: UFC_RED, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em' }}>
                {selectedEvent.status === 'in' ? '🔴 LIVE' : selectedEvent.status === 'post' ? 'FINAL' : 'UPCOMING'}
              </span>
              {selectedEvent.fights.some(f => f.isTitleFight) && (
                <span style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.35)', borderRadius: 6, padding: '2px 8px', color: C.gold, fontSize: 9, fontWeight: 900 }}>🏆 TITLE CARD</span>
              )}
            </div>
            <h2 style={{ color: C.textPrimary, fontSize: isMobile ? 17 : 20, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>{selectedEvent.name}</h2>
            <p style={{ color: C.textSecondary, fontSize: 12 }}>{formatEventDate(selectedEvent.date)}</p>
            {(selectedEvent.venue || selectedEvent.location) && (
              <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 2 }}>
                📍 {[selectedEvent.venue, selectedEvent.location].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {events.length > 1 && (
            <select
              value={selectedEventId}
              onChange={e => { setSelectedEventId(e.target.value); setActiveFight(null); setFightFilter('all') }}
              style={{
                padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`,
                color: C.textPrimary, cursor: 'pointer', outline: 'none',
              }}
            >
              {events.map(ev => (
                <option key={ev.id} value={ev.id} style={{ background: '#02020f' }}>
                  {ev.name} ({ev.status === 'post' ? 'Final' : ev.status === 'in' ? 'Live' : 'Upcoming'})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* UFC card command summary */}
      {(() => {
        const live = sortedFights.filter(f => f.status === 'in').length
        const upcoming = sortedFights.filter(f => f.status === 'pre').length
        const final = sortedFights.filter(f => f.status === 'post').length
        const matched = sortedFights.filter(f => f.polyOdds?.hasWinner || f.polyOdds?.hasTotal).length
        const nextFight = sortedFights.find(f => f.status === 'in') || sortedFights.find(f => f.status === 'pre')
        return (
          <div style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr repeat(4, minmax(0, 0.55fr))', gap: 10 }}>
            <div style={{ borderRadius: 16, padding: '12px 14px', background: 'rgba(232,0,45,0.06)', border: '1px solid rgba(232,0,45,0.22)' }}>
              <div style={{ color: C.textSecondary, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Next actionable bout</div>
              <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 900, marginTop: 4 }}>{nextFight ? `${nextFight.fighterA.name} vs ${nextFight.fighterB.name}` : 'Card complete'}</div>
              <div style={{ color: C.textSecondary, fontSize: 10, marginTop: 2 }}>{nextFight ? `${getBoutLabel(nextFight, sortedFights.length)} · ${nextFight.statusDetail || nextFight.status}` : `${final} fights final`}</div>
            </div>
            {[['LIVE', live, C.green], ['UPCOMING', upcoming, C.gold], ['FINAL', final, C.textSecondary], ['MARKETS', `${matched}/${sortedFights.length}`, UFC_RED]].map(([label, value, color]) => (
              <div key={String(label)} style={{ borderRadius: 16, padding: '12px 10px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                <div style={{ color: color as string, fontSize: 18, fontWeight: 950 }}>{value}</div>
                <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.12em' }}>{label}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* UFC fight filters */}
      <div style={{ marginBottom: 14, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {[
          ['all', `Full card (${sortedFights.length})`],
          ['actionable', `Actionable (${sortedFights.filter(f => f.status !== 'post').length})`],
          ['markets', `Markets (${sortedFights.filter(f => f.polyOdds?.hasWinner || f.polyOdds?.hasTotal || f.polyOdds?.koTkoOdds !== null || f.polyOdds?.submissionOdds !== null || f.polyOdds?.goDistanceOdds !== null).length})`],
        ].map(([key, label]) => {
          const active = fightFilter === key
          return (
            <button key={key} onClick={() => { setFightFilter(key as 'all' | 'actionable' | 'markets'); setActiveFight(null) }} style={{ flexShrink: 0, minHeight: 38, borderRadius: 999, padding: '8px 13px', background: active ? 'rgba(232,0,45,0.16)' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? 'rgba(232,0,45,0.45)' : 'rgba(255,255,255,0.10)'}`, color: active ? UFC_RED : C.textSecondary, fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* Fight card */}
      {visibleFights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ color: C.textSecondary, fontSize: 13 }}>No fights match this filter</p>
        </div>
      ) : (
        <div>
          {chunkArray(visibleFights, cols).map((row, rowIdx) => {
            const rowHasActive = activeFight != null && row.some(f => f.id === activeFight.id)
            return (
              <div key={rowIdx} style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
                  {row.map(fight => (
                    <FightCard
                      key={fight.id}
                      fight={fight}
                      totalFights={sortedFights.length}
                      isActive={activeFight?.id === fight.id}
                      onOpenIntel={() => setActiveFight(prev => prev?.id === fight.id ? null : fight)}
                    />
                  ))}
                </div>
                {rowHasActive && activeFight && (
                  <div id="ufc-intel-panel" style={{ marginTop: 8 }}>
                    <UFCIntelPanel fight={activeFight} onClose={() => setActiveFight(null)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


function MarketCommandDeck({ sport, games, loading, lastUpdatedLabel, feedAgeSec, isMobile }: {
  sport: 'nba' | 'ncaab' | 'nfl' | 'ncaaf' | 'ufc'
  games: Game[]
  loading: boolean
  lastUpdatedLabel: string | null
  feedAgeSec: number
  isMobile: boolean
}) {
  if (sport === 'ufc') return null
  const matched = games.filter(g => g.hasWinnerOdds || g.hasSpreadOdds || g.hasTotalOdds).length
  const live = games.filter(g => g.status === 'in').length
  const pre = games.filter(g => g.status === 'pre').length
  const matchRate = games.length ? Math.round((matched / games.length) * 100) : 0
  const avgMatchQuality = matched ? Math.round(games.reduce((sum, g) => sum + getMarketReadiness(g).matchQuality, 0) / games.length) : 0
  const staleFeed = feedAgeSec >= 180
  const thinMatches = games.filter(g => (g.hasWinnerOdds || g.hasSpreadOdds || g.hasTotalOdds) && getMarketReadiness(g).matchQuality < 55).length
  const isFootball = sport === 'nfl' || sport === 'ncaaf'
  const phase = isFootball && games.length === 0 ? 'OFFSEASON BUILD MODE' : live ? 'LIVE TRADING WINDOW' : pre ? 'PRE-GAME SCAN' : 'MARKET WATCH'
  const accent = isFootball ? C.green : C.cyan
  const prepItems = isFootball
    ? ['QB status + injury delta', 'Weather / wind / dome flag', 'Short-week + travel spot', 'Spread-implied win prob', 'CLOB price freshness']
    : ['Moneyline mismatch', 'Spread gap', 'Total gap', 'Last-60 window', 'Fatigue / lineup context']

  return (
    <section style={{
      marginBottom: isMobile ? 14 : 22,
      borderRadius: isMobile ? 20 : 28,
      padding: 1,
      background: `linear-gradient(135deg, ${accent}66, rgba(168,85,247,0.35), rgba(255,255,255,0.06))`,
      boxShadow: `0 0 44px ${accent}18, 0 12px 70px rgba(0,0,0,0.55)`,
    }}>
      <div style={{
        borderRadius: isMobile ? 19 : 27,
        padding: isMobile ? '15px 14px' : '20px 22px',
        background: 'linear-gradient(135deg, rgba(3,7,18,0.96), rgba(8,8,32,0.92) 48%, rgba(2,2,15,0.98))',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35, background: `radial-gradient(circle at 15% 0%, ${accent}30, transparent 35%), radial-gradient(circle at 85% 20%, rgba(168,85,247,0.24), transparent 38%)` }} />
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: isMobile ? 12 : 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ color: accent, fontSize: 10, fontWeight: 950, letterSpacing: '0.22em', textTransform: 'uppercase' }}>{phase}</span>
              <span style={{ color: C.textSecondary, fontSize: 10 }}>Feed {loading ? 'syncing…' : lastUpdatedLabel ? `updated ${lastUpdatedLabel}` : 'standing by'}</span>
            </div>
            <h2 style={{ margin: 0, color: C.textPrimary, fontSize: isMobile ? 22 : 30, lineHeight: 1, letterSpacing: '-0.045em', fontWeight: 950 }}>
              {isFootball ? 'Gridiron Market Command' : 'Market Command Center'}
            </h2>
            <p style={{ margin: '8px 0 0', color: 'rgba(168,240,255,0.58)', fontSize: isMobile ? 12 : 13, lineHeight: 1.5, maxWidth: 620 }}>
              {isFootball
                ? 'NFL prep layer is active: schedules, Polymarket matching, and the UI are ready for football slates. Next layer is QB/weather/injury intelligence.'
                : 'Live slate view with market coverage, edge readiness, and execution timing in one command strip.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isMobile ? 8 : 10, marginTop: isMobile ? 12 : 18 }}>
              {[
                ['Games', games.length], ['Live', live], ['Matched', `${matchRate}%`], ['Quality', `${avgMatchQuality}%`],
              ].map(([label, value]) => (
                <div key={label} style={{
                  borderRadius: isMobile ? 12 : 16, padding: isMobile ? '9px 10px' : '12px 10px',
                  background: 'rgba(255,255,255,0.035)', border: `1px solid ${C.border}`,
                }}>
                  <div style={{ color: accent, fontSize: isMobile ? 18 : 22, fontWeight: 950, letterSpacing: '-0.03em' }}>{value}</div>
                  <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
            </div>
            {(staleFeed || thinMatches > 0) && (
              <div style={{ marginTop: 14, borderRadius: 14, padding: '10px 12px', background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.25)', color: C.gold, fontSize: 11, fontWeight: 800 }}>
                ⚠ {staleFeed ? `Feed stale (${lastUpdatedLabel})` : `${thinMatches} thin market match${thinMatches === 1 ? '' : 'es'}`} — confirm prices before firing commands.
              </div>
            )}
          </div>
          <div style={{
            borderRadius: isMobile ? 14 : 20, padding: isMobile ? 12 : 16,
            background: isFootball ? 'rgba(0,255,136,0.055)' : 'rgba(0,240,255,0.045)',
            border: `1px solid ${isFootball ? 'rgba(0,255,136,0.22)' : C.border}`,
          }}>
            <div style={{ color: accent, fontSize: 11, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>
              {isFootball ? 'NFL utility checklist' : 'Scanner utility'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {prepItems.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(230,245,255,0.82)', fontSize: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 10px ${accent}` }} />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).replace(/-/g, '')
  const [date, setDate] = useState(today)
  const [sport, setSport] = useState<'nba' | 'ncaab' | 'nfl' | 'ncaaf' | 'ufc'>('nba')
  const [mainTab, setMainTab] = useState<'games' | 'edge'>('games')
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showTracker, setShowTracker] = useState(false)
  const [bets, setBets] = useState<BetLog[]>([])
  const [bankroll, setBankroll] = useState(0)
  const [oddsDrift, setOddsDrift] = useState<Record<string, OddsDrift>>({})
  const [secsSinceUpdate, setSecsSinceUpdate] = useState(0)
  const prevGamesRef = useRef<Map<string, Game>>(new Map())
  const [activeIntelGame, setActiveIntelGame] = useState<Game | null>(null)
  const [activeAnalysisGame, setActiveAnalysisGame] = useState<Game | null>(null)
  const cols = useColCount()
  const isMobile = useIsMobile()

  useEffect(() => {
    const stored = localStorage.getItem('poly-bets')
    if (stored) setBets(JSON.parse(stored))
    const storedBankroll = localStorage.getItem('poly-bankroll')
    if (storedBankroll) setBankroll(parseFloat(storedBankroll) || 0)
  }, [])

  const saveBankroll = (v: number) => {
    setBankroll(v)
    localStorage.setItem('poly-bankroll', String(v))
  }

  const saveBets = (updated: BetLog[]) => {
    setBets(updated)
    localStorage.setItem('poly-bets', JSON.stringify(updated))
  }

  // Seconds-since-update counter
  useEffect(() => {
    if (!lastUpdated) return
    setSecsSinceUpdate(0)
    const iv = setInterval(() => setSecsSinceUpdate(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [lastUpdated])

  // Clear drift after 5 seconds
  useEffect(() => {
    if (Object.keys(oddsDrift).length === 0) return
    const t = setTimeout(() => setOddsDrift({}), 5000)
    return () => clearTimeout(t)
  }, [oddsDrift])



  // Scroll active panel into view
  useEffect(() => {
    if (activeIntelGame || activeAnalysisGame) {
      setTimeout(() => document.getElementById('active-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }, [activeIntelGame, activeAnalysisGame])

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch(`/api/markets?date=${date}&sport=${sport}`)
      const json = await res.json()
      const newGames: Game[] = Array.isArray(json) ? json : []

      // Compute odds drift vs previous
      const newDrift: Record<string, OddsDrift> = {}
      for (const game of newGames) {
        const prev = prevGamesRef.current.get(game.id)
        if (!prev) continue
        const spreadDelta = game.hasSpreadOdds && prev.hasSpreadOdds && Math.abs(game.spreadLine - prev.spreadLine) >= 0.5
          ? game.spreadLine - prev.spreadLine : null
        const totalDelta = game.hasTotalOdds && prev.hasTotalOdds && Math.abs(game.totalLine - prev.totalLine) >= 0.5
          ? game.totalLine - prev.totalLine : null
        const winnerHomeDelta = game.hasWinnerOdds && prev.hasWinnerOdds && Math.abs(game.homeWinOdds - prev.homeWinOdds) >= 0.005
          ? game.homeWinOdds - prev.homeWinOdds : null
        if (spreadDelta !== null || totalDelta !== null || winnerHomeDelta !== null) {
          newDrift[game.id] = { spreadDelta, totalDelta, winnerHomeDelta }
        }
      }

      // Update previous games ref
      const newMap = new Map<string, Game>()
      for (const g of newGames) newMap.set(g.id, g)
      prevGamesRef.current = newMap

      setGames(newGames)
      if (Object.keys(newDrift).length > 0) setOddsDrift(newDrift)
      setLastUpdated(new Date())
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [date, sport])

  useEffect(() => {
    setLoading(true)
    fetchGames()
    const iv = setInterval(fetchGames, 60000)
    return () => clearInterval(iv)
  }, [fetchGames])

  const days = Array.from({ length: 5 }, (_, i) => {
    const nowCST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
    const d = new Date(nowCST); d.setDate(d.getDate() + i - 2)
    return {
      label: i === 2 ? 'Today' : i === 1 ? 'Yest' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: d.toISOString().slice(0, 10).replace(/-/g, ''),
    }
  })

  const live = games.filter(g => g.status === 'in')
  const upcoming = games.filter(g => g.status === 'pre')
  const final = games.filter(g => g.status === 'post')
  const pendingBets = bets.filter(b => b.result === 'pending').length
  const logBet = (b: Omit<BetLog, 'id' | 'createdAt' | 'stake' | 'result'>) =>
    saveBets([...bets, { ...b, id: crypto.randomUUID(), stake: 0, result: 'pending', createdAt: new Date().toISOString() }])

  const lastUpdatedLabel = lastUpdated
    ? secsSinceUpdate < 60
      ? `${secsSinceUpdate}s ago`
      : `${Math.floor(secsSinceUpdate / 60)}m ago`
    : null

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.textPrimary, position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{GLOBAL_STYLES}</style>
      {/* Grid background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,240,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,240,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,240,255,0.06) 0%, transparent 70%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: isMobile ? '18px 10px 64px' : '32px 16px 80px' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1" style={{ flexWrap: 'wrap' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(135deg, rgba(0,240,255,0.2), rgba(168,85,247,0.2))`,
                border: `1px solid ${C.borderHot}`,
                boxShadow: `0 0 20px rgba(0,240,255,0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18
              }}>◈</div>
              <h1 style={{ fontSize: isMobile ? 21 : 26, fontWeight: 900, letterSpacing: '-0.03em', color: C.textPrimary }}>
                {sport === 'nba' ? 'NBA' : sport === 'ncaab' ? 'NCAAB' : sport === 'nfl' ? 'NFL' : sport === 'ncaaf' ? 'NCAAF' : 'UFC'}
                <span style={{ color: sport === 'ufc' ? UFC_RED : sport === 'nfl' || sport === 'ncaaf' ? C.green : C.cyan, textShadow: `0 0 20px ${sport === 'ufc' ? UFC_RED : sport === 'nfl' || sport === 'ncaaf' ? C.green : C.cyan}55` }}>{sport === 'ufc' ? ' FIGHTS' : sport === 'nfl' || sport === 'ncaaf' ? ' GRIDIRON' : ' LINES'}</span>
              </h1>
              <div style={{ display: 'flex', borderRadius: 10, overflowX: 'auto', maxWidth: '100%', border: `1px solid ${C.border}` }}>
                {(['nba', 'nfl', 'ncaaf', 'ufc', 'ncaab'] as const).map((s, idx) => (
                  <button key={s} onClick={() => { setSport(s); setLoading(true) }} style={{
                    padding: isMobile ? '7px 9px' : '5px 12px', fontSize: isMobile ? 10 : 11, fontWeight: 800, letterSpacing: '0.08em',
                    textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s',
                    background: sport === s
                      ? s === 'ufc'
                        ? 'linear-gradient(135deg, rgba(232,0,45,0.25), rgba(168,0,20,0.15))'
                        : s === 'nfl' || s === 'ncaaf'
                          ? 'linear-gradient(135deg, rgba(0,255,136,0.18), rgba(255,215,0,0.10))'
                          : `linear-gradient(135deg, rgba(0,240,255,0.2), rgba(168,85,247,0.15))`
                      : 'rgba(255,255,255,0.03)',
                    color: sport === s ? (s === 'ufc' ? UFC_RED : s === 'nfl' || s === 'ncaaf' ? C.green : C.cyan) : C.textSecondary,
                    borderRight: idx < 4 ? `1px solid ${C.border}` : 'none',
                  }}>{s.toUpperCase()}</button>
                ))}
              </div>
              <a href="/bot" style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: isMobile ? '7px 10px' : '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800,
                letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none',
                background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)',
                color: C.green, boxShadow: '0 0 12px rgba(0,255,136,0.1)',
                transition: 'all 0.2s',
              }}>⬡ Edge Bot</a>
            </div>
            <p style={{ color: C.textSecondary, fontSize: isMobile ? 11 : 12, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Polymarket · DraftKings · NFL-ready misprice board</span>
              {lastUpdatedLabel && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 6,
                  background: 'rgba(0,240,255,0.06)', border: `1px solid ${C.border}`,
                  color: C.textSecondary, fontSize: 10, fontWeight: 600,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                  Updated {lastUpdatedLabel}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <BankrollInput bankroll={bankroll} onChange={saveBankroll} />
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
              {days.map(day => (
                <button key={day.value} onClick={() => setDate(day.value)} style={{
                  flexShrink: 0, padding: '5px 12px', borderRadius: 20,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  background: date === day.value ? 'rgba(0,240,255,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${date === day.value ? C.borderHot : C.border}`,
                  color: date === day.value ? C.cyan : C.textSecondary,
                  boxShadow: date === day.value ? `0 0 12px ${C.cyan}22` : 'none',
                }}>{day.label}</button>
              ))}
            </div>
            <button onClick={() => setShowTracker(true)} style={{
              position: 'relative', width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              color: C.textSecondary, fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              ◫
              {pendingBets > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: C.cyan, color: C.bg, fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingBets}</span>}
            </button>
            <button onClick={() => { setLoading(true); fetchGames() }} style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              color: C.textSecondary, fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>↻</button>
          </div>
        </div>

        <MarketCommandDeck sport={sport} games={games} loading={loading} lastUpdatedLabel={lastUpdatedLabel} feedAgeSec={lastUpdated ? secsSinceUpdate : 0} isMobile={isMobile} />

        {/* ── Main tab bar (NBA only) ── */}
        {sport === 'nba' && (
          <div style={{ display: 'flex', gap: 0, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, alignSelf: 'flex-start', marginBottom: 4 }}>
            {([['games', '🏀 Games'], ['edge', '📊 Polymarket Edge']] as const).map(([id, label], idx) => (
              <button key={id} onClick={() => setMainTab(id)} style={{
                padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: mainTab === id ? `linear-gradient(135deg, rgba(0,240,255,0.15), rgba(168,85,247,0.1))` : 'rgba(255,255,255,0.03)',
                color: mainTab === id ? C.cyan : C.textSecondary,
                borderRight: idx === 0 ? `1px solid ${C.border}` : 'none',
                letterSpacing: '0.04em', transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>
        )}

        {/* ── Polymarket Edge tab ── */}
        {sport === 'nba' && mainTab === 'edge' && (
          <div style={{ minHeight: '70vh' }}>
            <PolymarketEdgeSection />
          </div>
        )}

        {sport === 'nba' && mainTab === 'games' && <LastSixtyBoard games={upcoming} />}

        {sport === 'nba' && mainTab === 'games' && <StreakPanel />}

        {sport === 'nba' && mainTab === 'games' && <BettingTrendsPanel />}

        {!loading && games.length > 0 && sport === 'nba' && mainTab === 'games' && (
          <DailyParlayCard games={games} bankroll={bankroll} />
        )}

        {sport === 'ufc' && <UFCSection />}

        {sport !== 'ufc' && mainTab === 'games' && (loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ borderRadius: 24, height: 220, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ color: C.textSecondary, fontSize: 16 }}>No games scheduled</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {live.length > 0 && (
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, display: 'inline-block', animation: 'liveDotPulse 1.2s ease-in-out infinite' }} />
                  <span style={{ color: C.cyan, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Live Now</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {chunkArray(live, cols).map((row, i) => (
                    <RowGroup key={i} games={row} cols={cols}
                      activeGame={activeIntelGame || activeAnalysisGame}
                      panel={activeIntelGame ? 'intel' : activeAnalysisGame ? 'analysis' : null}
                      onLogBet={logBet} drift={oddsDrift} bankroll={bankroll}
                      onOpenIntel={(g) => { setActiveIntelGame(prev => prev?.id === g.id ? null : g); setActiveAnalysisGame(null) }}
                      onOpenAnalysis={(g) => { setActiveAnalysisGame(prev => prev?.id === g.id ? null : g); setActiveIntelGame(null) }} />
                  ))}
                </div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Upcoming</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {chunkArray(upcoming, cols).map((row, i) => (
                    <RowGroup key={i} games={row} cols={cols}
                      activeGame={activeIntelGame || activeAnalysisGame}
                      panel={activeIntelGame ? 'intel' : activeAnalysisGame ? 'analysis' : null}
                      onLogBet={logBet} drift={oddsDrift} bankroll={bankroll}
                      onOpenIntel={(g) => { setActiveIntelGame(prev => prev?.id === g.id ? null : g); setActiveAnalysisGame(null) }}
                      onOpenAnalysis={(g) => { setActiveAnalysisGame(prev => prev?.id === g.id ? null : g); setActiveIntelGame(null) }} />
                  ))}
                </div>
              </section>
            )}
            {final.length > 0 && (
              <section>
                <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Final</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {chunkArray(final, cols).map((row, i) => (
                    <RowGroup key={i} games={row} cols={cols}
                      activeGame={activeIntelGame || activeAnalysisGame}
                      panel={activeIntelGame ? 'intel' : activeAnalysisGame ? 'analysis' : null}
                      onLogBet={logBet} drift={oddsDrift} bankroll={bankroll}
                      onOpenIntel={(g) => { setActiveIntelGame(prev => prev?.id === g.id ? null : g); setActiveAnalysisGame(null) }}
                      onOpenAnalysis={(g) => { setActiveAnalysisGame(prev => prev?.id === g.id ? null : g); setActiveIntelGame(null) }} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ))}
      </div>

      {showTracker && <BetTracker bets={bets} onUpdate={saveBets} onClose={() => setShowTracker(false)} />}
    </main>
  )
}
