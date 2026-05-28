'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback, useRef } from 'react'
import AccountMenu from './components/AccountMenu'
import LoadingMarketCards from './components/LoadingMarketCards'
import UpdatedAgeLabel from './components/UpdatedAgeLabel'
import PropDetailDrawer from './components/signal-terminal/PropDetailDrawer'
import SignalTerminalCard from './components/signal-terminal/SignalTerminalCard'
import type { LineupInjuryFlagItem, SignalTerminalSignal, SportsbookConsensus } from './components/signal-terminal/types'
import { computeKelly, getMarketReadiness, lineGap as getLineGap, pct, totalGap as getTotalGap, type SupportedSport } from './lib/sports-utils'
import { cacheKey, fetchJsonCached } from './lib/client-cache'
import { resolveStartupSport } from './lib/startup-sport'
import { buildMobileDockTabs, getMobileDockActiveTab, mobileDockDateOptions, mobileDockSportOptions, premiumMobileDockLayout, slateMainFeatureAnimation, type MobileDockIcon, type MobileDockTab } from './lib/mobile-dock'
import { getLoadInAnimationStyle } from './lib/load-animation'
import { resetInitialSlateScroll } from './lib/startup-scroll'
import { expandTeamStatLabel } from './lib/team-stat-labels'
import { getTeamBadgeText, getTeamBadgeTone, getTeamLeagueCardLabel, type TeamBadgeSport } from './lib/team-badge'
import { appPalette } from './lib/app-palette'
import { detectCorrelationWarnings, type CorrelationInputItem, type CorrelationWarning } from './lib/parlays/correlation'
import { getLivePropProgress as getLivePropProgressPure } from './lib/live/prop-progress'
import { buildPropLadder, buildStatDistribution, getMetricStatValue, type StatDistribution } from './lib/props/distributions'
import { computeSignalDeltas, type SignalDelta, type SignalDeltaSnapshot } from './lib/signals/delta-feed'
import type { LiquidityGrade } from './lib/signals/liquidity'
import { buildAlertRulesForWatchItem, buildWatchKey, evaluateAlerts, watchlistReducer, type AlertEvent, type AlertRule, type WatchItem, type WatchSnapshot } from './lib/watchlist/alerts'
import { getFighterPhotoUrl, isWeightClassOpenByDefault } from './lib/ufc/fighters-directory'

const BetTracker = dynamic(() => import('./components/BetTracker'), { ssr: false })

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
  sport?: SupportedSport
  leagueLabel?: string
  polyEventTitle?: string | null
  polyMatchScore?: number
  oddsUpdatedAt?: string | null
  polyFetchOk?: boolean
  usedGammaFallback?: boolean
  polyError?: string | null
  sourceStatus?: 'matched' | 'unmatched' | 'no_events' | 'poly_error'
  mlbMatchup?: MlbGameMatchup
}
interface OddsDrift {
  spreadDelta: number | null
  totalDelta: number | null
  winnerHomeDelta: number | null
}
type MarketProvider = 'kalshi' | 'polymarket'

interface BetLog {
  id: string; gameId: string; matchup: string; betType: string
  betLabel: string; odds: number; stake: number; result: 'pending' | 'win' | 'loss'
  createdAt: string
}
interface PlayerMinutesData {
  name: string; position?: string; jersey?: string; minutes: number; fatigueFlag: 'high' | 'moderate' | 'normal' | 'dnp'
  isStarter: boolean; rotationRole?: 'starter' | 'sixth' | 'second_unit' | 'deep_bench' | 'dnp'
  projectedStarter?: boolean; projectedMinutes?: string; rotationNote?: string; warning?: string
  restingStarter: boolean; criticalFatigue: boolean
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
  id?: string
  name: string; position: string; jersey: string; starter: boolean
  hitRatio?: string; rbi?: string; avg?: string; era?: string; whip?: string; strikeouts?: string
  form7?: string; form20?: string
}
interface LineupsData {
  home: StarterPlayer[]; away: StarterPlayer[]
  homeTeam: string; awayTeam: string; available: boolean
  homePitcher?: StarterPlayer | null; awayPitcher?: StarterPlayer | null
  homeSource?: string; awaySource?: string; homeSourceGame?: string; awaySourceGame?: string
}
interface LiveGameData {
  available?: boolean
  status?: string
  statusLabel?: string
  inning?: string | number
  inningHalf?: string
  period?: string | number
  clock?: string
  awayScore?: string | number
  homeScore?: string | number
  score?: { away?: string | number; home?: string | number }
  updatedAt?: string
  generatedAt?: string
  plays?: any[]
  feed?: any[]
  liveFeed?: any[]
  events?: any[]
  boxScore?: any
  boxscore?: any
  players?: any[]
  stats?: any
  lineups?: { home?: any[]; away?: any[] }
  teams?: { away?: any; home?: any }
  situation?: any
  playerStatsByName?: Record<string, any>
  playerStatsById?: Record<string, any>
}
interface PredictionData {
  homeWinPct: number; awayWinPct: number; confidence: number
  recommendation: 'home' | 'away' | 'pass'; recommendedTeam: string | null
  notes: string
}
interface InjuredPlayer {
  name: string; position: string; status: string; detail: string
  injury?: string; fantasyStatus?: string; source?: string; updatedAt?: string
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
  status?: 'no_markets' | 'no_candidates' | 'no_executable' | 'priced_out' | 'playable'
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
interface ModelSignal {
  id: string
  sport: SupportedSport
  gameId: string
  matchup: string
  gameTime: string
  player: string
  team: string
  opponent?: string
  metric: string
  label: string
  side?: string | null
  tier: 'A' | 'B' | 'WATCH' | 'KILL'
  projectedHitPct: number
  hitRate?: number | null
  fairPrice: number
  ask: number
  bid?: number | null
  maxBuy: number
  edge: number
  confidence: number
  hits: number
  games: number
  avg: number
  line?: number | null
  bookLine?: number | null
  risk: string
  liquidity: number
  liquidityGrade?: LiquidityGrade | null
  liquidityLabel?: string | null
  askSize?: number | null
  bidSize?: number | null
  ticker: string
  url: string
  marketTitle?: string | null
  reasons: string[]
  flags: string[]
  createdAt: string
  generatedAt?: string | null
  movement?: SignalTerminalSignal['movement']
  consensus?: SportsbookConsensus | null
  sportsbookConsensus?: SportsbookConsensus | null
  lineupFlags?: LineupInjuryFlagItem[]
  correlationWarnings?: CorrelationWarning[]
  correlationItems?: CorrelationInputItem[]
  execution?: {
    ask?: number | null
    bid?: number | null
    askSize?: number | null
    bidSize?: number | null
    spread?: number | null
    liquidityGrade?: LiquidityGrade | null
    liquidityLabel?: string | null
  } | null
  whyCare?: string[]
  changeSinceRefresh?: SignalDelta[]
  metadata?: Record<string, unknown>
}
interface SignalsPanelData {
  sport: SupportedSport
  generatedAt: string
  gamesScanned: number
  contractsScored: number
  signals: ModelSignal[]
  summary: { a: number; b: number; watch: number; avgEdge: number; bestEdge: number }
}

interface TeamsDirectoryTeam {
  id: string
  abbr: string
  name: string
  shortName: string
  color?: string
  logo?: string | null
  record?: string | null
}
interface TeamsDirectoryPlayer {
  id: string
  name: string
  position: string
  jersey?: string | null
  age?: number | null
  height?: string | null
  weight?: string | null
  headshot?: string | null
  status?: string | null
}
interface TeamsDirectoryDetail {
  team: TeamsDirectoryTeam
  roster: TeamsDirectoryPlayer[]
  stats: { label: string; value: string }[]
  injuries: { player: string; position?: string; status: string; detail?: string }[]
  generatedAt: string
}
interface FighterDirectoryFighter {
  id: string
  name: string
  shortName?: string
  nickname?: string | null
  record?: string | null
  rank?: number | null
  champion?: boolean
  country?: string | null
  headshot?: string | null
  color?: string | null
  url?: string | null
}
interface FighterWeightClassGroup {
  id: string
  name: string
  shortName: string
  limit?: string | null
  fighters: FighterDirectoryFighter[]
}
interface SignalPerformanceData {
  generatedAt: string
  total: number
  pending: number
  graded: number
  wins: number
  losses: number
  winRate: number | null
  avgEdge: number
  aSignals: number
  bSignals: number
  watchSignals: number
  ledger: Array<ModelSignal & { ledgerId: string; status: 'pending' | 'graded'; result: 'hit' | 'miss' | null; wouldBuy: boolean; recordedAt: string }>
}

type KalshiBetLike = {
  label?: string
  metric?: string
  line?: number
  hitRate?: number
  games?: number
  avg?: number
  explanation?: string
  maxYesPrice?: number
  kalshi?: {
    title?: string
    ticker?: string
    legTicker?: string
    eventTicker?: string
    url?: string
    yesAsk?: number
    yesAskSize?: number
  } | null
}
type MlbPitcherMatchup = { name: string; throws?: string; era?: number; whip?: number; hitsPerInning?: number; homeRunsPerInning?: number; difficulty: number; label: string }
type MlbGameMatchup = { awayPitcher?: MlbPitcherMatchup | null; homePitcher?: MlbPitcherMatchup | null }
type MlbBatterMatchup = { score: number; grade: 'green' | 'neutral' | 'avoid'; pitcher?: MlbPitcherMatchup | null; note: string }
type ParlayItem = { game?: Game; player: any; bet: any; matchup?: MlbBatterMatchup }
type ParlayTicket = { size: number; items: ParlayItem[] }

interface FootballIntelData {
  prepScore: number
  readiness: { matchLabel: string; matchQuality: number; staleLabel: string; warnings: string[] }
  flags: { dome: boolean; divisional: boolean; daysOut: number; spreadGap: number; totalGap: number }
  checklist: { label: string; value: string; status: 'ready' | 'watch' | 'edge' }[]
  warnings: string[]
}

// ─── UFC accent ───────────────────────────────────────────────────────────────
const UFC_RED = appPalette.primary
const MLB_ORANGE = appPalette.primary

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  cyan:    appPalette.primary,
  purple:  appPalette.textPrimary,
  green:   appPalette.primary,
  lime:    appPalette.power,
  red:     appPalette.danger,
  gold:    appPalette.warning,
  bg:      appPalette.background,
  card:    appPalette.card,
  border:  appPalette.primarySoft,
  borderHot: appPalette.primaryBorderStrong,
  textPrimary: appPalette.textPrimary,
  textSecondary: appPalette.textSecondary,
}

const SURFACE = {
  panel: 'linear-gradient(145deg, rgba(4,14,17,0.96), rgba(3,7,10,0.94) 58%, rgba(6,24,28,0.9))',
  panelSoft: 'linear-gradient(145deg, rgba(255,255,255,0.045), rgba(125,246,255,0.035))',
  tactical: 'linear-gradient(135deg, rgba(125,246,255,0.18), rgba(255,255,255,0.08), rgba(3,7,10,0.2))',
  border: appPalette.primarySoft,
  borderStrong: appPalette.primaryBorder,
  shadow: '0 18px 60px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.05)',
}

function TeamBadge({ abbr, name, sport, size = 40, selected = false, compact = false }: { abbr?: string | null; name?: string | null; sport?: TeamBadgeSport | null; size?: number; selected?: boolean; compact?: boolean }) {
  const tone = getTeamBadgeTone(sport)
  const text = getTeamBadgeText(abbr)
  const fontSize = Math.max(8, Math.round(size * (text.length > 3 ? 0.24 : text.length > 2 ? 0.27 : 0.31)))
  return (
    <span
      role="img"
      aria-label={`Team abbreviation badge for ${name || text}`}
      data-team-badge="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: compact ? Math.round(size * 0.28) : 999,
        display: 'inline-grid',
        placeItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: tone.background,
        border: `1px solid ${selected ? tone.accent : tone.border}`,
        boxShadow: selected ? `${tone.glow}, 0 0 0 1px ${tone.border}` : tone.glow,
        color: tone.accent,
        fontSize,
        fontWeight: 950,
        letterSpacing: text.length > 2 ? '0.02em' : '0.06em',
        lineHeight: 1,
        textTransform: 'uppercase',
        textShadow: `0 0 ${Math.max(6, Math.round(size * 0.28))}px ${tone.border}`,
      }}
    >
      <span style={{ position: 'absolute', inset: 0, opacity: 0.32, background: 'linear-gradient(135deg, rgba(255,255,255,0.16), transparent 34%, rgba(255,255,255,0.05) 64%, transparent)', pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', width: '140%', height: 1, background: tone.border, transform: 'rotate(-28deg)', opacity: 0.48, pointerEvents: 'none' }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{text}</span>
    </span>
  )
}

function TeamLeagueCard({ abbr, name, sport, selected = false, compact = false }: { abbr?: string | null; name?: string | null; sport?: TeamBadgeSport | null; selected?: boolean; compact?: boolean }) {
  const tone = getTeamBadgeTone(sport)
  const text = getTeamBadgeText(abbr)
  const league = getTeamLeagueCardLabel(sport)
  return (
    <span
      role="img"
      aria-label={`Team league-card badge for ${name || text}`}
      data-team-league-card="true"
      data-team-badge="true"
      style={{
        width: '100%',
        minHeight: compact ? 38 : 50,
        maxWidth: compact ? 82 : 96,
        justifySelf: 'center',
        flexShrink: 0,
        borderRadius: compact ? 12 : 15,
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: compact ? 1 : 2,
        padding: compact ? '5px 7px' : '7px 8px',
        position: 'relative',
        overflow: 'hidden',
        background: tone.background,
        border: `1px solid ${selected ? tone.accent : tone.border}`,
        boxShadow: selected ? `${tone.glow}, 0 0 0 1px ${tone.border}` : tone.glow,
        color: tone.accent,
        textTransform: 'uppercase',
      }}
    >
      <span style={{ position: 'absolute', inset: 0, opacity: 0.34, background: 'linear-gradient(135deg, rgba(255,255,255,0.16), transparent 34%, rgba(255,255,255,0.05) 64%, transparent)', pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', left: -8, right: -8, height: 1, background: tone.border, transform: 'rotate(-23deg)', opacity: 0.42, pointerEvents: 'none' }} />
      <span style={{ position: 'relative', zIndex: 1, color: tone.accent, fontSize: compact ? 7 : 8, fontWeight: 950, letterSpacing: '0.15em', lineHeight: 1 }}>{league}</span>
      <span style={{ position: 'relative', zIndex: 1, color: C.textPrimary, fontSize: compact ? 17 : 20, fontWeight: 950, letterSpacing: text.length > 3 ? '0.01em' : '0.045em', lineHeight: 0.95, textShadow: `0 0 12px ${tone.border}` }}>{text}</span>
    </span>
  )
}

// ─── Global CSS keyframes ──────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  @property --load-board-angle {
    syntax: '<angle>';
    inherits: false;
    initial-value: 0deg;
  }
  @keyframes liveBorderPulse {
    0%, 100% {
      box-shadow: 0 0 24px rgba(125,246,255,0.25), 0 4px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04);
      border-color: rgba(125,246,255,0.35);
    }
    50% {
      box-shadow: 0 0 52px rgba(125,246,255,0.55), 0 8px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06);
      border-color: rgba(125,246,255,0.75);
    }
  }
  @keyframes liveDotPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.4); }
  }
  @keyframes fatigueWarnPulse {
    0%, 100% { color: #ff4466; opacity: 1; transform: scale(1); text-shadow: 0 0 5px rgba(255,68,102,0.75); }
    50% { color: #ff123f; opacity: 0.55; transform: scale(1.22); text-shadow: 0 0 12px rgba(255,68,102,1); }
  }
  @keyframes safePropThrob {
    0%, 100% { transform: scale(1); border-color: rgba(125,246,255,0.58); box-shadow: 0 0 0 rgba(125,246,255,0), inset 0 1px 0 rgba(255,255,255,0.10); }
    50% { transform: scale(1.045); border-color: rgba(125,246,255,0.98); box-shadow: 0 0 18px rgba(125,246,255,0.42), 0 0 34px rgba(125,246,255,0.16), inset 0 1px 0 rgba(255,255,255,0.16); }
  }
  @keyframes dominoFadeIn {
    0% { opacity: 0; transform: translateY(-34px) scale(0.965); filter: blur(12px); box-shadow: 0 0 0 rgba(125,246,255,0); }
    45% { opacity: 1; transform: translateY(7px) scale(1.012); filter: blur(2px); box-shadow: 0 0 34px rgba(125,246,255,0.20); }
    72% { transform: translateY(-2px) scale(1.003); filter: blur(0); }
    100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); box-shadow: 0 0 0 rgba(125,246,255,0); }
  }
  @keyframes driftFadeOut {
    0%   { opacity: 1; }
    60%  { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes flashGreen {
    0%   { background: rgba(125,246,255,0.35); }
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
  @keyframes aiAnalyzeOrbit {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes aiAnalyzePulse {
    0%, 100% { opacity: 0.45; transform: scale(0.96); }
    50% { opacity: 1; transform: scale(1.04); }
  }
  @keyframes aiAnalyzeSweep {
    0% { transform: translateX(-120%); }
    100% { transform: translateX(120%); }
  }
  @keyframes scanCardGlow {
    0%, 100% { opacity: 0.55; transform: scale(0.985); }
    50% { opacity: 1; transform: scale(1); }
  }
  @keyframes scanCardSweep {
    0% { transform: translateX(-140%); }
    100% { transform: translateX(140%); }
  }
  @keyframes loadBoardPulse {
    0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 14px 38px rgba(0,0,0,0.42), 0 0 12px rgba(125,246,255,0.16); filter: brightness(1); }
    50% { transform: translateY(-2px) scale(1.006); box-shadow: 0 20px 54px rgba(0,0,0,0.52), 0 0 24px rgba(125,246,255,0.26); filter: brightness(1.04); }
  }
  @keyframes loadBoardSweep {
    0% { --load-board-angle: 0deg; }
    100% { --load-board-angle: 360deg; }
  }
  .load-board-card {
    --load-board-angle: 0deg;
    position: relative;
    transform: translateZ(0);
    background: conic-gradient(from var(--load-board-angle), rgba(125,246,255,0.18) 0deg, rgba(125,246,255,0.95) 24deg, rgba(168,240,255,0.52) 40deg, rgba(125,246,255,0.22) 66deg, rgba(125,246,255,0.10) 124deg, rgba(125,246,255,0.18) 360deg) !important;
    animation: loadBoardPulse 2.2s ease-in-out infinite, loadBoardSweep 2.45s linear infinite;
    transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
  }
  .load-board-card:hover {
    transform: translateY(-5px) scale(1.018);
    filter: brightness(1.08) saturate(1.08);
  }
  .load-board-card:active {
    transform: translateY(0) scale(0.988);
    filter: brightness(0.98);
  }
  @keyframes analysisCardBlink {
    0%, 8%, 100% { opacity: 1; transform: translate(0, 0) scale(1); filter: brightness(1.05) contrast(1.12) saturate(1.1); }
    10% { opacity: 0.12; transform: translate(-2px, 1px) scale(0.992); filter: brightness(2.4) contrast(1.9) saturate(0.35); }
    12% { opacity: 0.96; transform: translate(3px, -1px) scale(1.006); filter: brightness(0.75) contrast(2.2) hue-rotate(10deg); }
    15% { opacity: 0.04; transform: translate(0, 0) scale(0.986); filter: brightness(0.15) contrast(3); }
    18% { opacity: 1; transform: translate(-4px, 0) scale(1.01); filter: brightness(2.1) contrast(1.7); }
    23% { opacity: 0.62; transform: translate(2px, 2px) scale(0.997); filter: brightness(1.45) contrast(2.4); }
    29% { opacity: 1; transform: translate(0, -1px) scale(1); filter: brightness(1) contrast(1.2); }
    38% { opacity: 0.2; transform: translate(5px, 0) skewX(-1deg) scale(0.99); filter: brightness(2.7) contrast(2.6) saturate(0.45); }
    41% { opacity: 0.98; transform: translate(-3px, 1px) skewX(1deg) scale(1.004); filter: brightness(0.85) contrast(1.85); }
    57% { opacity: 1; transform: translate(0, 0) scale(1); filter: brightness(1.18) contrast(1.25); }
    61% { opacity: 0.06; transform: translate(0, 0) scale(0.982); filter: brightness(0.05) contrast(4); }
    64% { opacity: 1; transform: translate(4px, -2px) scale(1.008); filter: brightness(2.25) contrast(2); }
    72% { opacity: 0.48; transform: translate(-2px, 2px) scale(0.992); filter: brightness(1.8) contrast(2.4); }
    76% { opacity: 1; transform: translate(0, 0) scale(1); filter: brightness(1.1) contrast(1.2); }
  }
  @keyframes tvStaticSweep {
    0% { transform: translateY(-120%); opacity: 0.12; }
    12% { opacity: 0.58; }
    28% { opacity: 0.22; }
    100% { transform: translateY(120%); opacity: 0.12; }
  }
  @keyframes tvGlitchSlice {
    0%, 100% { transform: translateX(0); opacity: 0; }
    8% { transform: translateX(-18px); opacity: 0.55; }
    10% { transform: translateX(20px); opacity: 0.25; }
    15% { opacity: 0; }
    39% { transform: translateX(16px); opacity: 0.42; }
    42% { transform: translateX(-22px); opacity: 0.18; }
    47% { opacity: 0; }
    63% { transform: translateX(-14px); opacity: 0.50; }
    66% { transform: translateX(18px); opacity: 0.18; }
    70% { opacity: 0; }
  }
  .no-scrollbar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .no-scrollbar::-webkit-scrollbar { display: none; }
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
  const borderColor = hot ? color : SURFACE.border
  const shadow = hot
    ? `0 0 34px ${color}26, ${SURFACE.shadow}`
    : SURFACE.shadow
  return (
    <div style={{
      background: SURFACE.panel,
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
  const bg = hot ? 'linear-gradient(180deg, rgba(125,246,255,0.13), rgba(125,246,255,0.035))' : 'rgba(255,255,255,0.025)'
  const border = hot ? C.borderHot : SURFACE.border
  const textColor = hot ? C.cyan : 'rgba(247,255,240,0.82)'
  const glow = hot ? `0 0 22px ${C.cyan}35, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.035)'

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
      <div className="w-full max-w-md rounded-t-3xl p-6" style={{ background: 'rgba(8,12,5,0.98)', border: `1px solid ${C.border}`, borderBottom: 'none', boxShadow: `0 -20px 60px rgba(125,246,255,0.08)` }} onClick={e => e.stopPropagation()}>
        <div className="w-8 h-0.5 rounded-full mx-auto mb-5" style={{ background: C.border }} />
        <p style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{game.awayTeam.abbr} @ {game.homeTeam.abbr}</p>
        <h3 style={{ color: C.textPrimary, fontWeight: 800, fontSize: 18, marginTop: 4 }}>{betLabel}</h3>
        <p style={{ color: C.cyan, fontSize: 13, marginTop: 4 }}>{pct(odds)}% implied probability</p>
        <div className="mt-6 mb-3">
          <label style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Stake (USDC)</label>
          <input
            type="number" value={stake} onChange={e => setStake(e.target.value)}
            className="w-full mt-2 text-center text-2xl font-bold focus:outline-none"
            style={{ background: 'rgba(125,246,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px', color: C.cyan, caretColor: C.cyan }}
          />
        </div>
        <div className="flex justify-between mb-6" style={{ fontSize: 12, color: C.textSecondary }}>
          <span>Return: <span style={{ color: C.textPrimary }}>${payout.toFixed(2)}</span></span>
          <span>Net profit: <span style={{ color: C.green }}>+${profit.toFixed(2)}</span></span>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl font-semibold transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textSecondary }}>Cancel</button>
          <button onClick={save} className="flex-1 py-3 rounded-2xl font-bold transition-all" style={{ background: `linear-gradient(135deg, rgba(125,246,255,0.2), rgba(231,238,226,0.2))`, border: `1px solid ${C.borderHot}`, color: C.cyan, boxShadow: `0 0 20px ${C.cyan}22` }}>Log Bet</button>
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

function AnalyzingLoader({ title = 'Analyzing matchup', subtitle = 'XAI is scanning markets, records, price movement, and matchup context.' }: { title?: string; subtitle?: string }) {
  return (
    <div style={{
      maxWidth: 900, margin: '0 auto', borderRadius: 22, padding: '26px 22px',
      background: 'linear-gradient(145deg, rgba(125,246,255,0.075), rgba(3,5,0,0.96))',
      border: `1px solid ${C.borderHot}`,
      boxShadow: '0 0 46px rgba(125,246,255,0.16), 0 18px 60px rgba(0,0,0,0.52)',
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.42, background: 'radial-gradient(circle at 50% 0%, rgba(125,246,255,0.22), transparent 46%)' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(125,246,255,0.95), transparent)',
        animation: 'aiAnalyzeSweep 1.15s linear infinite',
      }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 74, height: 74, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid rgba(125,246,255,0.18)', borderTopColor: C.green, borderRightColor: 'rgba(125,246,255,0.65)',
            animation: 'aiAnalyzeOrbit 0.82s linear infinite',
            boxShadow: '0 0 24px rgba(125,246,255,0.22)',
          }} />
          <div style={{
            width: 42, height: 42, borderRadius: 14,
            background: 'rgba(125,246,255,0.12)', border: '1px solid rgba(125,246,255,0.38)',
            color: C.green, fontSize: 20, fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'aiAnalyzePulse 1.05s ease-in-out infinite',
          }}>◈</div>
        </div>
        <div>
          <div style={{ color: C.green, fontSize: 12, fontWeight: 950, letterSpacing: '0.22em', textTransform: 'uppercase' }}>{title}</div>
          <div style={{ color: C.textPrimary, fontSize: 18, fontWeight: 950, marginTop: 6 }}>Building intelligence brief…</div>
          <p style={{ color: C.textSecondary, fontSize: 12, lineHeight: 1.55, margin: '8px auto 0', maxWidth: 520 }}>{subtitle}</p>
        </div>
        <div style={{ width: 'min(460px, 100%)', display: 'grid', gap: 7, marginTop: 4 }}>
          {['Market signal', 'Team context', 'Edge verdict'].map((label, i) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 10 }}>
              <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', textAlign: 'right' }}>{label}</span>
              <span style={{ height: 8, borderRadius: 999, background: 'rgba(125,246,255,0.08)', overflow: 'hidden', border: '1px solid rgba(125,246,255,0.12)' }}>
                <span style={{ display: 'block', width: `${55 + i * 14}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(125,246,255,0.18), rgba(125,246,255,0.86))', animation: `aiAnalyzePulse ${0.9 + i * 0.18}s ease-in-out infinite` }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AnalysisPanel({ game, onClose, onDone }: { game: Game; onClose: () => void; onDone?: () => void }) {
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
      .then(d => { setAnalysis(d.analysis || d.error || 'No analysis available'); setLoading(false); onDone?.() })
      .catch(() => { setAnalysis('Failed.'); setLoading(false); onDone?.() })
  }, [onDone])

  const sections = analysis ? parseAnalysis(analysis) : []

  return (
    <div style={{ width: '100%', background: 'rgba(2,2,15,0.98)', borderTop: `1px solid rgba(125,246,255,0.2)`, borderBottom: `1px solid rgba(125,246,255,0.2)`, padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, maxWidth: 900, margin: '0 auto 16px' }}>
        <div>
          <p style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>{game.awayTeam.abbr} @ {game.homeTeam.abbr}</p>
          <h3 style={{ color: C.cyan, fontWeight: 900, fontSize: 16, letterSpacing: '-0.02em', textShadow: `0 0 20px ${C.cyan}55` }}>◈ INTELLIGENCE BRIEF</h3>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(125,246,255,0.07)', border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</button>
      </div>

      {loading ? (
        <AnalyzingLoader />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, maxWidth: 1200, margin: '0 auto' }}>
          {sections.map((s, i) => {
            const isOpen = expanded === i
            const isPick = s.title === 'The Pick'
            return (
              <div key={i} style={{
                borderRadius: 14, overflow: 'hidden',
                background: isPick ? 'rgba(125,246,255,0.06)' : isOpen ? 'rgba(231,238,226,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isPick ? C.borderHot : isOpen ? 'rgba(231,238,226,0.3)' : C.border}`,
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
                  <div key={team.abbr} style={{ flexShrink: 0, width: expanded === team.abbr ? 280 : 140, transition: 'width 0.3s ease', borderRadius: 16, background: 'rgba(125,246,255,0.06)', border: `1px solid rgba(125,246,255,0.25)`, padding: '12px', cursor: 'pointer' }}
                    onClick={() => setExpanded(prev => prev === team.abbr ? null : team.abbr)}>
                    <div className="flex items-center justify-between">
                      <span style={{ color: C.textPrimary, fontWeight: 800, fontSize: 13 }}>{team.abbr}</span>
                      <span style={{ background: 'rgba(125,246,255,0.15)', border: '1px solid rgba(125,246,255,0.4)', borderRadius: 8, padding: '2px 6px', color: C.green, fontSize: 11, fontWeight: 800 }}>{team.streakLabel}</span>
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
              <div key={team.team} style={{ borderRadius: 16, padding: 14, background: 'rgba(125,246,255,0.035)', border: '1px solid rgba(125,246,255,0.16)' }}>
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
      <span style={{ color: 'rgba(125,246,255,0.5)', fontSize: 10, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' as const, fontVariant: 'small-caps' }}>{label}</span>
    </div>
  )
}

function IntelCard({ children, fullWidth = false, style = {} }: { children: React.ReactNode; fullWidth?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: SURFACE.panelSoft,
      border: `1px solid ${SURFACE.border}`,
      borderRadius: 16,
      padding: 20,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
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
    let cancelled = false
    fetchJsonCached<TeamIntelData>(cacheKey('/api/team-intel', { home, away }), 60_000)
      .then(d => { if (!cancelled) setIntel(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
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
    let cancelled = false
    setPropsLoading(true)
    fetchJsonCached<PropsPanelData>(cacheKey('/api/props', { home, away, sport }), 30_000)
      .then(d => { if (!cancelled) setProps(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPropsLoading(false) })
    return () => { cancelled = true }
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
      borderTop: '1px solid rgba(125,246,255,0.2)',
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
          {[
            { abbr: intel.away.abbr, players: intel.injuryImpact.awayPlayers || [] },
            { abbr: intel.home.abbr, players: intel.injuryImpact.homePlayers || [] },
          ].map(team => team.players.filter(p => /out|doubtful|questionable|gtd|day-to-day/i.test(p.status)).slice(0, 3).map(player => (
            <div key={`inj-alert-${team.abbr}-${player.name}`} style={{ borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, background: /out|doubtful/i.test(player.status) ? 'rgba(255,68,102,0.12)' : 'rgba(255,165,0,0.10)', border: /out|doubtful/i.test(player.status) ? '1px solid rgba(255,68,102,0.45)' : '1px solid rgba(255,165,0,0.38)' }}>
              <span>{/out|doubtful/i.test(player.status) ? '🚨' : '⚠️'}</span>
              <p style={{ color: /out|doubtful/i.test(player.status) ? C.red : C.gold, fontSize: 11, fontWeight: 800, lineHeight: 1.45 }}>
                {team.abbr}: <strong>{player.name}</strong> {player.status}{player.injury ? ` — ${player.injury}` : ''}{player.detail ? ` · ${player.detail}` : ''}
              </p>
            </div>
          )))}

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
                            <span style={{ background: 'rgba(125,246,255,0.08)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px', color: C.cyan, fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{p.position}</span>
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
                    { abbr: intel.away.abbr, fatigue: intel.away.fatigue, players: intel.injuryImpact.awayPlayers || [] },
                    { abbr: intel.home.abbr, fatigue: intel.home.fatigue, players: intel.injuryImpact.homePlayers || [] },
                  ]).map(({ abbr, fatigue, players }) => {
                    const projected = (fatigue?.players || []).filter(p => p.projectedStarter || p.isStarter).slice(0, 5)
                    return (
                      <div key={abbr}>
                        <p style={{ color: C.textSecondary, fontSize: 9, marginBottom: 8 }}><span style={{ color: C.textPrimary, fontWeight: 700 }}>{abbr}</span> <span style={{ color: C.gold }}>projected</span></p>
                        {projected.length > 0 ? projected.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                            <span style={{ color: C.textSecondary, fontSize: 8, fontFamily: 'monospace', width: 16, textAlign: 'right', flexShrink: 0 }}>{p.jersey && p.jersey !== '?' ? `#${p.jersey}` : '—'}</span>
                            <span style={{ color: p.warning ? C.gold : C.textPrimary, fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{p.name}</span>
                            <span style={{ background: 'rgba(125,246,255,0.08)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px', color: C.cyan, fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{p.position || '?'}</span>
                            <span style={{ color: p.fatigueFlag === 'high' ? C.red : p.fatigueFlag === 'moderate' ? C.gold : C.textSecondary, fontSize: 8, fontWeight: 900, flexShrink: 0 }}>{p.minutes < 0 ? 'DNP' : `${p.minutes}m`}</span>
                          </div>
                        )) : players.length === 0 ? (
                          <p style={{ color: C.green, fontSize: 10 }}>✅ Healthy · projected lineup unavailable</p>
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
                    )
                  })}
                </div>
              )}
              <p style={{ color: C.textSecondary, fontSize: 8, marginTop: 10, fontStyle: 'italic' }}>Official lineups release ~30 min before tip. Before that, projected starters use last-game starters/heavy-minute players.</p>
            </IntelCard>

            {[intel.away, intel.home].some(t => t.fatigue && t.fatigue.players.length > 0) && (
              <IntelCard>
                <SectionHeader icon="🔁" label="Rotation + Fatigue" />
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
                          const role = p.rotationRole === 'starter' || p.isStarter ? 'START' : p.rotationRole === 'sixth' ? '6TH' : p.rotationRole === 'second_unit' ? 'BENCH' : p.rotationRole === 'deep_bench' ? 'DEEP' : 'DNP'
                          return (
                            <div key={i} style={{ borderRadius: 8, padding: '6px 7px', background: p.warning ? 'rgba(255,215,0,0.055)' : 'rgba(255,255,255,0.025)', border: `1px solid ${p.warning ? 'rgba(255,215,0,0.22)' : 'rgba(255,255,255,0.06)'}` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: p.restingStarter ? C.red : p.criticalFatigue ? C.gold : p.isStarter ? C.textPrimary : C.textSecondary, fontSize: 9, fontWeight: p.isStarter ? 800 : 500, width: 66, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                <span style={{ background: p.isStarter ? 'rgba(125,246,255,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 4px', color: p.isStarter ? C.green : C.textSecondary, fontSize: 7, fontWeight: 900, flexShrink: 0 }}>{role}</span>
                                {isDnp ? (
                                  <span style={{ color: p.restingStarter ? C.red : C.textSecondary, fontSize: 8, fontWeight: p.restingStarter ? 800 : 400 }}>{p.restingStarter ? '⚠️ REST' : '💤 DNP'}</span>
                                ) : (
                                  <>
                                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                                      <div style={{ height: '100%', width: `${barWidth}%`, borderRadius: 3, background: barColor, boxShadow: p.fatigueFlag === 'high' ? `0 0 6px ${barColor}88` : 'none' }} />
                                    </div>
                                    <span style={{ color: barColor, fontSize: 8, fontWeight: 800, width: 22, textAlign: 'right', flexShrink: 0 }}>{p.minutes}m</span>
                                    {p.criticalFatigue && <span style={{ fontSize: 8 }}>🔥</span>}
                                  </>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 }}>
                                <span style={{ color: C.textSecondary, fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.rotationNote || `${p.projectedMinutes || '—'} expected`}</span>
                                {p.warning && <span style={{ color: p.criticalFatigue ? C.red : C.gold, fontSize: 7, fontWeight: 900, whiteSpace: 'nowrap' }}>⚠ {p.warning}</span>}
                              </div>
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
                  <p style={{ color: 'rgba(125,246,255,0.5)', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>H2H Record</p>
                  <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700 }}>{intel.h2h}</p>
                  {intel.h2hLastMeeting && (
                    <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 4 }}>Last: {intel.h2hLastMeeting}</p>
                  )}
                  {intel.refs && intel.refs.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ color: 'rgba(125,246,255,0.5)', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>🦺 Refs</p>
                      <p style={{ color: C.textPrimary, fontSize: 10 }}>{intel.refs.join(', ')}</p>
                      <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 2 }}>High-foul crew → O/U leans over</p>
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ color: 'rgba(125,246,255,0.5)', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>🏟️ Arena</p>
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
              <IntelCard fullWidth style={{ background: 'linear-gradient(135deg, rgba(231,238,226,0.1), rgba(255,215,0,0.05))', border: '1px solid rgba(231,238,226,0.3)' }}>
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
                    ['Value-priced', props.marketSummary.playableMatched],
                  ].map(([label, value]) => (
                    <span key={label} style={{ background: 'rgba(125,246,255,0.055)', border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 8px', color: label === 'Value-priced' && Number(value) > 0 ? C.green : C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
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
                          const lastGameMinutes = formatLastGameMinutes(p)
                          return (
                            <div key={i} style={{ background: best?.quality === 'bet' ? 'rgba(125,246,255,0.055)' : 'rgba(255,255,255,0.02)', border: `1px solid ${best?.quality === 'bet' ? 'rgba(125,246,255,0.28)' : C.border}`, borderRadius: 12, padding: '11px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                  {p.headshot && <img src={p.headshot} alt={p.player} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${C.border}` }} />}
                                  <div>
                                    <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 800, lineHeight: 1 }}>{p.player}</p>
                                    <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 2 }}>{p.position} · last {p.gamesPlayed || logs.length} games</p>
                                    {lastGameMinutes && <p style={{ color: C.green, fontSize: 8, fontWeight: 950, marginTop: 3, letterSpacing: '0.04em' }}>⏱ {lastGameMinutes}</p>}
                                  </div>
                                </div>
                                {best && (
                                  <div style={{ borderRadius: 10, padding: '5px 8px', background: best.quality === 'bet' ? 'rgba(125,246,255,0.12)' : 'rgba(255,215,0,0.10)', border: `1px solid ${best.quality === 'bet' ? 'rgba(125,246,255,0.38)' : 'rgba(255,215,0,0.28)'}`, textAlign: 'right' }}>
                                    <div style={{ color: best.quality === 'bet' ? C.green : C.gold, fontSize: 11, fontWeight: 950 }}>{best.label}</div>
                                    <div style={{ color: C.textSecondary, fontSize: 8 }}>{best.hits}/{best.games} hit · C{best.confidence}</div>
                                    <div style={{ color: C.cyan, fontSize: 8, fontWeight: 900 }}>Kalshi ask {best.kalshi?.yesAsk ?? '—'}¢ · max {best.maxYesPrice}¢</div>
                                    {best.xaiBacked && <div style={{ color: C.purple, fontSize: 8, fontWeight: 900 }}>XAI checked</div>}
                                  </div>
                                )}
                              </div>
                              {best && <p style={{ color: 'rgba(247,255,240,0.78)', fontSize: 10, lineHeight: 1.45, marginBottom: 9 }}>{best.explanation}</p>}
                              {best?.kalshi && <ExactKalshiBetButton player={p.player} bet={best} />}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 6, marginBottom: logs.length ? 9 : 0 }}>
                                {(p.recommendations || []).slice(0, 4).map((r: any) => (
                                  <div key={`${p.player}-${r.label}`} style={{ background: 'rgba(0,0,0,0.22)', borderRadius: 8, padding: '6px 7px', textAlign: 'center', border: `1px solid ${r.quality === 'bet' ? 'rgba(125,246,255,0.22)' : 'rgba(255,255,255,0.06)'}` }}>
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
                                    const gameMinutes = Number(g?.stats?.minutes)
                                    const minuteText = Number.isFinite(gameMinutes) && gameMinutes > 0 ? ` · ${Math.round(gameMinutes)} min` : ''
                                    return <div key={`${g.eventId}-${idx}`} title={`${g.opponent || ''} ${val}${minuteText}`} style={{ borderRadius: 6, padding: '4px 2px', textAlign: 'center', background: hit ? 'rgba(125,246,255,0.13)' : 'rgba(255,255,255,0.04)', border: `1px solid ${hit ? 'rgba(125,246,255,0.28)' : 'rgba(255,255,255,0.06)'}`, color: hit ? C.green : C.textSecondary, fontSize: 9, fontWeight: 800 }}><div>{val}</div>{Number.isFinite(gameMinutes) && gameMinutes > 0 && <div style={{ color: C.textSecondary, fontSize: 7, fontWeight: 900, marginTop: 1 }}>{Math.round(gameMinutes)}m</div>}</div>
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
  const color = confidence >= 65 ? '#7df6ff' : confidence >= 55 ? '#ffd700' : 'rgba(125,246,255,0.4)'
  const bg = confidence >= 65 ? 'rgba(125,246,255,0.08)' : confidence >= 55 ? 'rgba(255,215,0,0.08)' : 'rgba(125,246,255,0.04)'
  const border = confidence >= 65 ? 'rgba(125,246,255,0.35)' : confidence >= 55 ? 'rgba(255,215,0,0.35)' : 'rgba(125,246,255,0.15)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
      <span style={{ fontSize: 8 }}>🎯</span>
      <span style={{ color, fontSize: 9, fontWeight: 800 }}>Model lean / watch: {team} {winPct}%</span>
    </div>
  )
}

// ─── Live Score Display ───────────────────────────────────────────────────────
function hasActualGameScore(game: Game) {
  return game.status !== 'pre' && (game.awayTeam.score !== '' || game.homeTeam.score !== '')
}

function InlineGameScore({ game, compact = false }: { game: Game; compact?: boolean }) {
  if (!hasActualGameScore(game)) return null
  const isLive = game.status === 'in'
  const awayScore = game.awayTeam.score || '0'
  const homeScore = game.homeTeam.score || '0'
  return (
    <div style={{
      marginTop: compact ? 5 : 7,
      display: 'inline-flex',
      alignItems: 'center',
      gap: compact ? 5 : 7,
      maxWidth: '100%',
      borderRadius: 999,
      padding: compact ? '4px 7px' : '5px 9px',
      background: isLive ? 'rgba(255,63,95,0.16)' : 'rgba(125,246,255,0.13)',
      border: isLive ? '1px solid rgba(255,63,95,0.42)' : '1px solid rgba(125,246,255,0.36)',
      boxShadow: isLive ? '0 0 18px rgba(255,63,95,0.12)' : '0 0 18px rgba(125,246,255,0.10)',
      color: C.textPrimary,
      fontSize: compact ? 10 : 12,
      fontWeight: 950,
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: isLive ? C.red : C.green, fontSize: compact ? 7 : 8, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{isLive ? 'Live' : 'Score'}</span>
      <span>{game.awayTeam.abbr} {awayScore}</span>
      <span style={{ color: 'rgba(255,255,255,0.34)' }}>-</span>
      <span>{game.homeTeam.abbr} {homeScore}</span>
    </div>
  )
}

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
            <TeamBadge abbr={game.awayTeam.abbr} name={game.awayTeam.name} sport={game.sport} size={40} />
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
            <TeamBadge abbr={game.homeTeam.abbr} name={game.homeTeam.name} sport={game.sport} size={40} />
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

function LiveScoreStrip({ game, compact = false }: { game: Game; compact?: boolean }) {
  if (!hasActualGameScore(game)) return null
  const isLive = game.status === 'in'
  const awayScore = game.awayTeam.score || '0'
  const homeScore = game.homeTeam.score || '0'
  const awayLeading = Number(awayScore) > Number(homeScore)
  const homeLeading = Number(homeScore) > Number(awayScore)
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: compact ? 5 : 8,
      borderRadius: compact ? 9 : 12,
      padding: compact ? '5px 6px' : '8px 10px',
      background: isLive ? 'rgba(255,63,95,0.10)' : 'rgba(125,246,255,0.10)',
      border: isLive ? '1px solid rgba(255,63,95,0.34)' : '1px solid rgba(125,246,255,0.32)',
      boxShadow: isLive ? '0 0 18px rgba(255,63,95,0.08)' : '0 0 18px rgba(125,246,255,0.08)',
      minWidth: 0,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: isLive ? C.red : C.green, fontSize: compact ? 7 : 9, fontWeight: 950, letterSpacing: compact ? '0.08em' : '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>
        <span style={{ width: compact ? 5 : 6, height: compact ? 5 : 6, borderRadius: 999, background: isLive ? C.red : C.green, boxShadow: `0 0 10px ${isLive ? C.red : C.green}`, animation: isLive ? 'liveDotPulse 1.2s ease-in-out infinite' : 'none' }} />
        {isLive ? 'Live' : 'Score'}
      </span>
      <span style={{ color: C.textSecondary, fontSize: compact ? 7 : 9, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.gameTime}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 4 : 7, color: C.textPrimary, fontSize: compact ? 9 : 12, fontWeight: 950, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        <span style={{ color: awayLeading ? '#fff' : C.textSecondary }}>{game.awayTeam.abbr} {awayScore}</span>
        <span style={{ color: 'rgba(255,255,255,0.28)' }}>-</span>
        <span style={{ color: homeLeading ? '#fff' : C.textSecondary }}>{game.homeTeam.abbr} {homeScore}</span>
      </span>
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

function useNearViewport<T extends HTMLElement>(rootMargin = '700px') {
  const ref = useRef<T | null>(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    if (nearViewport) return
    const node = ref.current
    if (!node) return
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setNearViewport(true)
      return
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0)) {
        setNearViewport(true)
        observer.disconnect()
      }
    }, { rootMargin, threshold: 0.01 })

    observer.observe(node)
    return () => observer.disconnect()
  }, [nearViewport, rootMargin])

  return [ref, nearViewport] as const
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}


function formatPropMetricShort(metric: string): string {
  const key = String(metric || '')
  const map: Record<string, string> = {
    all: 'ALL',
    points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PT', steals: 'STL', blocks: 'BLK', minutes: 'MIN', turnovers: 'TO',
    'PTS+REB+AST': 'PRA', 'passing yards': 'PYD', 'passing TDs': 'PTD', 'rushing yards': 'RYD', 'receiving yards': 'REC YD', receptions: 'REC',
    hits: 'HIT', rbi: 'RBI', RBIs: 'RBI', homeRuns: 'HR', homeRunsAllowed: 'HR', 'home runs': 'HR', totalBases: 'TB', 'total bases': 'TB', strikeouts: 'K',
  }
  return map[key] || key.toUpperCase()
}

function formatPropMetricLabel(metric: string): string {
  const key = String(metric || '')
  const map: Record<string, string> = {
    all: 'all executable props',
    threes: '3-pointers', 'passing TDs': 'passing touchdowns', 'PTS+REB+AST': 'points + rebounds + assists',
  }
  return map[key] || key
}

function getPropStatValue(player: any, game: any, metric: string): number | null {
  const stats = game?.stats || game || {}
  const key = String(metric || '').toLowerCase()
  if (key.includes('three') || key.includes('3pt') || key.includes('3-pointer') || key.includes('3 pointer')) return stats.threes ?? stats.threePointFieldGoalsMade ?? stats.threePointersMade ?? null
  if (key.includes('point')) return stats.points ?? stats.pts ?? null
  if (key.includes('rebound')) return stats.rebounds ?? stats.totalRebounds ?? stats.reb ?? null
  if (key.includes('assist')) return stats.assists ?? stats.ast ?? null
  if (key.includes('steal')) return stats.steals ?? stats.stl ?? null
  if (key.includes('block')) return stats.blocks ?? stats.blk ?? null
  if (key.includes('hit') && !key.includes('rate')) return stats.hits ?? stats.hit ?? null
  if (key.includes('home run') || key === 'hr' || key.includes('homer')) return stats.homeRuns ?? stats.hr ?? null
  if (key.includes('total base')) return stats.totalBases ?? stats.tb ?? null
  if (key.includes('strikeout') || key.includes('ks')) return stats.strikeouts ?? stats.pitcherStrikeouts ?? stats.so ?? null
  if (key.includes('passing yards')) return stats.passingYards ?? null
  if (key.includes('passing td')) return stats.passingTouchdowns ?? null
  if (key.includes('rushing yards')) return stats.rushingYards ?? null
  if (key.includes('receiving yards')) return stats.receivingYards ?? null
  if (key.includes('reception')) return stats.receptions ?? null
  return null
}

function normalizePlayerName(name: string) {
  return String(name || '').toLowerCase().replace(/jr\.?|sr\.?|ii|iii|iv/g, '').replace(/[^a-z]/g, '')
}

function compactText(value: any): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') return String(value.description || value.text || value.displayValue || value.shortDisplayName || value.name || '')
  return ''
}

function arrayFromUnknown(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return Object.values(value).flatMap(v => Array.isArray(v) ? v : [v])
  return []
}

function getLiveFeedItems(live: LiveGameData | null): any[] {
  return arrayFromUnknown(live?.plays || live?.feed || live?.liveFeed || live?.events).slice(0, 12)
}

function getLiveBoxRows(live: LiveGameData | null, side?: 'away' | 'home'): any[] {
  const box = live?.boxScore || live?.boxscore || live?.stats
  const keyedPlayers = live?.playerStatsByName ? Object.values(live.playerStatsByName) : []
  if (!box) return [...arrayFromUnknown(live?.players), ...keyedPlayers]
  const sideRows = side ? box?.[side] || box?.teams?.[side] || box?.[side + 'Team']?.players : null
  if (sideRows) return arrayFromUnknown(sideRows)
  return [...arrayFromUnknown(box?.players || box?.athletes || box), ...keyedPlayers]
}

function findLivePlayerRow(live: LiveGameData | null, playerName: string): any | null {
  const target = normalizePlayerName(playerName)
  if (!target) return null
  const rows = [...getLiveBoxRows(live, 'away'), ...getLiveBoxRows(live, 'home'), ...arrayFromUnknown(live?.players)]
  return rows.find(row => {
    const name = row?.name || row?.player || row?.displayName || row?.athlete?.displayName || row?.athlete?.name || row?.person?.fullName
    const normalized = normalizePlayerName(name)
    return normalized && (normalized === target || normalized.includes(target) || target.includes(normalized))
  }) || null
}

function readStatNumber(source: any, keys: string[]): number | null {
  const pools = [source?.stats, source?.statistics, source?.totals, source]
  for (const pool of pools) {
    if (!pool) continue
    for (const key of keys) {
      const raw = pool[key] ?? pool[key.toUpperCase()] ?? pool[key.toLowerCase()]
      const value = typeof raw === 'object' ? raw?.value ?? raw?.displayValue : raw
      const num = Number(value)
      if (Number.isFinite(num)) return num
    }
  }
  return null
}

function getLiveMlbPropProgress(live: LiveGameData | null, player: any, bet: any): { value: number; line: number; hit: boolean; label: string } | null {
  const row = findLivePlayerRow(live, player?.player || player?.name)
  if (!row) return null
  const key = String(bet?.metric || '').toLowerCase()
  const value = key.includes('hits + runs') || key.includes('hrr')
    ? (readStatNumber(row, ['hits', 'hit', 'h', 'H']) || 0) + (readStatNumber(row, ['runs', 'r', 'R']) || 0) + (readStatNumber(row, ['RBIs', 'rbi', 'RBI']) || 0)
    : key.includes('home run') || key === 'hr' || key.includes('homer')
    ? readStatNumber(row, ['homeRuns', 'hr', 'HR'])
    : key.includes('total base')
      ? readStatNumber(row, ['totalBases', 'tb', 'TB'])
      : key.includes('strikeout') || key.includes('ks')
        ? readStatNumber(row, ['strikeouts', 'pitcherStrikeouts', 'so', 'SO', 'k'])
        : key.includes('hit') && !key.includes('rate')
          ? readStatNumber(row, ['hits', 'hit', 'h', 'H'])
          : null
  const line = Number(bet?.line)
  if (value == null || !Number.isFinite(line)) return null
  return { value, line, hit: value >= line, label: `${value}/${line}+ ${formatPropMetricShort(bet.metric)}` }
}

function buildPropEdgeRead(player: any, bet: any, intel?: TeamIntelData | null) {
  const logs = (player?.last12 || []).slice(0, 12)
  const values = logs.map((g: any) => getPropStatValue(player, g, bet.metric)).filter((v: any) => v != null) as number[]
  const line = Number(bet.line || 0)
  const hit = (v: number) => v >= line
  const recent = values.slice(0, 4)
  const recentHits = recent.filter(hit).length
  const bestIdx = values.reduce((best, v, i) => v > (values[best] ?? -Infinity) ? i : best, 0)
  const bestLog = logs[bestIdx]
  const bestVal = values[bestIdx]
  const lastVal = values[0]
  const twoBackVal = values[1]
  const minutes = logs.map((g: any) => Number(g?.stats?.minutes || 0)).filter(Boolean)
  const minAvg = minutes.length ? minutes.reduce((s: number, n: number) => s + n, 0) / minutes.length : 0
  const teamIntel = player?.team && intel ? ([intel.away, intel.home].find(t => t.abbr === player.team) || null) : null
  const flaggedMates = (teamIntel?.fatigue?.players || [])
    .filter((x: any) => x.name !== player.player && (x.warning || x.fatigueFlag === 'high' || x.fatigueFlag === 'dnp'))
    .slice(0, 2)
  const injuryNotes = teamIntel?.abbr === intel?.home?.abbr ? intel?.injuryImpact?.homeNotes : teamIntel?.abbr === intel?.away?.abbr ? intel?.injuryImpact?.awayNotes : ''
  const metric = formatPropMetricLabel(bet.metric)
  const metricKey = String(bet.metric || '').toLowerCase()
  const contextImpact = metricKey.includes('assist') ? 'ball-handling/creation chances' : metricKey.includes('rebound') ? 'frontcourt minutes/rebounding chances' : metricKey.includes('three') ? 'perimeter shot volume' : 'shot volume/usage'
  const parts: string[] = []
  if (values.length) {
    parts.push(`${player.player} has cleared ${bet.label} in ${bet.hits}/${bet.games} tracked games, including ${recentHits}/${recent.length || 0} of the most recent games.`)
    if (twoBackVal != null) parts.push(`Two games ago he posted ${twoBackVal} ${metric}; his best recent mark was ${bestVal} vs ${bestLog?.opponent || 'opponent'}.`)
    else if (lastVal != null) parts.push(`Last game he posted ${lastVal} ${metric}; best recent mark was ${bestVal}.`)
  }
  if (minAvg >= 28) parts.push(`Role check: he is averaging about ${minAvg.toFixed(0)} minutes in this sample, so the opportunity is stable enough for this prop to matter.`)
  if (flaggedMates.length) {
    const detail = flaggedMates.map((x: any) => `${x.name}${x.minutes >= 0 ? ` (${x.minutes}m last game)` : ''}${x.warning ? ` — ${x.warning}` : x.fatigueFlag === 'dnp' ? ' — DNP flag' : ' — high fatigue flag'}`).join('; ')
    parts.push(`Context flag: ${detail}. If that player is limited, it can shift ${contextImpact} toward the remaining rotation. Treat this as a support note, not the main reason to bet it.`)
  } else if (injuryNotes && !/none/i.test(injuryNotes)) parts.push(`Team context: ${injuryNotes}`)
  if (Array.isArray(bet.signalTags) && bet.signalTags.length) parts.push(`Matchup signal: ${bet.signalTags.join(', ')}. ${bet.explanation || ''}`.trim())
  parts.push(`Price discipline: Kalshi is asking ${bet.kalshi?.yesAsk ?? '—'}¢; model max is ${bet.maxYesPrice ?? '—'}¢.`)
  return parts
}

const SIGNAL_WATCHLIST_STORAGE_KEY = 'signal-terminal-watchlist'
const SIGNAL_ALERTS_STORAGE_KEY = 'signal-terminal-alerts'
const SIGNAL_ALERT_COOLDOWN_MS = 10 * 60 * 1000

function finiteSignalNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function signalToTerminalSignal(signal: ModelSignal): SignalTerminalSignal {
  const execution = signal.execution || null
  const ask = finiteSignalNumber(signal.ask) ?? finiteSignalNumber(execution?.ask)
  const bid = finiteSignalNumber(signal.bid) ?? finiteSignalNumber(execution?.bid)
  const askSize = finiteSignalNumber(signal.askSize) ?? finiteSignalNumber(execution?.askSize)
  const bidSize = finiteSignalNumber(signal.bidSize) ?? finiteSignalNumber(execution?.bidSize)
  const liquidityGrade = signal.liquidityGrade ?? execution?.liquidityGrade ?? null
  const correlationItems = signal.correlationItems ?? [{
    player: signal.player,
    team: signal.team,
    gameId: signal.gameId,
    metric: signal.metric,
    label: signal.label,
    ticker: signal.ticker,
    askSize,
  }]
  const correlationWarnings = signal.correlationWarnings ?? detectCorrelationWarnings(correlationItems)

  return {
    ...signal,
    ask,
    bid,
    askSize,
    bidSize,
    liquidityGrade,
    liquidityLabel: signal.liquidityLabel ?? execution?.liquidityLabel ?? null,
    reasons: signal.whyCare?.length ? signal.whyCare : signal.reasons,
    generatedAt: signal.generatedAt ?? signal.createdAt,
    correlationItems,
    correlationWarnings,
  }
}

function signalDeltaSnapshot(signal: SignalTerminalSignal): SignalDeltaSnapshot {
  return {
    id: signal.id,
    label: signal.label || signal.player || signal.ticker || signal.id,
    player: signal.player,
    tier: signal.tier,
    edge: finiteSignalNumber(signal.edge),
    ask: finiteSignalNumber(signal.ask),
    fairPrice: finiteSignalNumber(signal.fairPrice),
    liquidityGrade: signal.liquidityGrade ?? null,
  }
}

function watchKeyForSignal(signal: SignalTerminalSignal): string {
  return buildWatchKey({ id: signal.id, gameId: signal.gameId, player: signal.player, label: signal.label, ticker: signal.ticker ?? undefined })
}

function watchSnapshotForSignal(signal: SignalTerminalSignal, lastAlerts?: Record<string, string | number | Date>): WatchSnapshot {
  return {
    key: watchKeyForSignal(signal),
    label: [signal.player, signal.label].filter(Boolean).join(' · ') || signal.ticker || signal.id,
    ask: finiteSignalNumber(signal.ask),
    edge: finiteSignalNumber(signal.edge),
    tier: signal.tier ?? null,
    liquidity: finiteSignalNumber(signal.askSize ?? signal.liquidity),
    lastAlerts,
  }
}

function alertThreshold(rule: AlertRule): number | string {
  return rule.target ?? rule.min ?? ''
}

function alertSignatureForRule(rule: AlertRule) {
  return `${rule.type}:${alertThreshold(rule)}`
}

function isTrustedMarketUrl(value?: string | null): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'kalshi.com'
      || host.endsWith('.kalshi.com')
      || host === 'polymarket.com'
      || host.endsWith('.polymarket.com')
  } catch {
    return false
  }
}

function signalToExactKalshiBet(signal: SignalTerminalSignal): KalshiBetLike {
  return {
    label: signal.label,
    metric: signal.metric,
    line: finiteSignalNumber(signal.line ?? signal.bookLine) ?? undefined,
    hitRate: finiteSignalNumber(signal.hitRate ?? signal.projectedHitPct) ?? undefined,
    games: finiteSignalNumber(signal.games) ?? undefined,
    avg: finiteSignalNumber(signal.avg) ?? undefined,
    explanation: signal.reasons?.[0] || signal.risk || undefined,
    maxYesPrice: finiteSignalNumber(signal.maxBuy) ?? undefined,
    kalshi: {
      title: signal.marketTitle || signal.label,
      ticker: signal.ticker || undefined,
      legTicker: signal.ticker || undefined,
      url: signal.url || undefined,
      yesAsk: finiteSignalNumber(signal.ask) ?? undefined,
      yesAskSize: finiteSignalNumber(signal.askSize) ?? undefined,
    },
  }
}

function propCorrelationItem(game: Game, player: any, bet: any): CorrelationInputItem {
  return {
    player: player?.player || player?.name,
    team: player?.team,
    gameId: game.id,
    metric: bet?.metric,
    label: bet?.label,
    ticker: bet?.kalshi?.legTicker || bet?.kalshi?.ticker,
    askSize: finiteSignalNumber(bet?.kalshi?.yesAskSize),
  }
}

function propDistributionValues(player: any, bet: any): number[] {
  return (player?.last12 || [])
    .map((log: any) => {
      const merged = { ...(log || {}), ...((log && log.stats) || {}) }
      return getMetricStatValue(merged, bet?.metric || '') ?? getPropStatValue(player, log, bet?.metric)
    })
    .filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value))
}

function propDistributionReason(distribution: StatDistribution, line?: number | null): string {
  if (!distribution.count) return 'Distribution: recent game-log sample is not available for this market yet.'
  const hitText = distribution.hitRate == null ? 'hit rate pending' : `${Math.round(distribution.hitRate * 100)}% hit rate`
  return `Distribution: ${distribution.count}-game sample averages ${Math.round((distribution.mean ?? 0) * 10) / 10}, median ${Math.round((distribution.median ?? 0) * 10) / 10}, ${hitText}${line != null ? ` at ${line}+` : ''}; volatility ${distribution.volatility}.`
}

function buildPropLineupFlags(player: any, bet: any, intel: TeamIntelData | null, lineups: LineupsData | null): LineupInjuryFlagItem[] {
  const flags: LineupInjuryFlagItem[] = []
  const playerName = player?.player || player?.name
  const playerTeam = player?.team
  if (player?.injury || player?.status || player?.injuryStatus) {
    flags.push({ player: playerName, team: playerTeam, status: String(player.status || player.injuryStatus || 'listed'), injury: String(player.injury || ''), severity: 'watch', detail: 'Player has an injury/status field on the prop feed.' })
  }
  const teamIntel = playerTeam && intel ? ([intel.home, intel.away].find(t => t.abbr === playerTeam) || null) : null
  const injuryNotes = teamIntel?.abbr === intel?.home?.abbr ? intel?.injuryImpact?.homeNotes : teamIntel?.abbr === intel?.away?.abbr ? intel?.injuryImpact?.awayNotes : ''
  if (injuryNotes && !/none/i.test(injuryNotes)) {
    flags.push({ player: playerName, team: playerTeam, status: 'team context', severity: 'info', detail: injuryNotes })
  }
  if (lineups?.available && playerName) {
    const rows = [...(lineups.home || []), ...(lineups.away || [])]
    const row = rows.find((entry: any) => normalizePlayerName(entry?.name) === normalizePlayerName(playerName))
    if (!row && playerTeam) flags.push({ player: playerName, team: playerTeam, status: 'lineup check', severity: 'watch', detail: 'Player was not found in the latest lineup payload.' })
    else if (row?.starter === false) flags.push({ player: playerName, team: playerTeam, status: 'bench', severity: 'info', detail: 'Listed off the bench in the latest lineup payload.' })
  }
  if (Array.isArray(bet?.flags)) {
    bet.flags.slice(0, 4).forEach((flag: any) => flags.push({ player: playerName, team: playerTeam, status: String(flag), severity: 'info', detail: String(flag) }))
  }
  return flags
}

function buildPropDetailSignal(input: { game: Game; sport: SupportedSport; player: any; bet: any; selectedItems: Array<{ player: any; bet: any }>; liveGame: LiveGameData | null; intel: TeamIntelData | null; lineups: LineupsData | null }): SignalTerminalSignal {
  const { game, sport, player, bet, selectedItems, liveGame, intel, lineups } = input
  const line = finiteSignalNumber(bet?.line)
  const values = propDistributionValues(player, bet)
  const distribution = buildStatDistribution(values, line)
  const ladderLines = Array.from(new Set([line == null ? null : line - 2, line == null ? null : line - 1, line, line == null ? null : line + 1, line == null ? null : line + 2].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0))).sort((a, b) => a - b)
  const ladder = buildPropLadder(values, ladderLines)
  const liveProgress = getLivePropProgressPure(liveGame, player?.player || player?.name || '', bet?.metric || '', line) ?? (sport === 'mlb' ? getLiveMlbPropProgress(liveGame, player, bet) : null)
  const currentItem = propCorrelationItem(game, player, bet)
  const selectedCorrelationItems = selectedItems.map(item => propCorrelationItem(game, item.player, item.bet))
  const correlationItems = [...selectedCorrelationItems.filter(item => (item.ticker || item.player || item.label) !== (currentItem.ticker || currentItem.player || currentItem.label)), currentItem]
  const correlationWarnings = detectCorrelationWarnings(correlationItems)
  const ask = finiteSignalNumber(bet?.kalshi?.yesAsk)
  const fairPrice = finiteSignalNumber(bet?.fairPrice ?? bet?.modelPrice ?? bet?.maxYesPrice)
  const maxBuy = finiteSignalNumber(bet?.maxYesPrice)
  const edge = ask != null && fairPrice != null ? fairPrice - ask : undefined
  const ladderReason = ladder.length ? `Ladder: ${ladder.map(row => `${row.line}+ ${row.hits}/${row.games}`).join(' · ')}.` : 'Ladder: alternate-line sample pending.'
  const liveReason = liveProgress ? `Live progress: ${liveProgress.label}${liveProgress.hit ? ' — currently clearing.' : ' — still needs more.'}` : 'Live progress: no live stat row matched this prop yet.'
  const reasons = [
    propDistributionReason(distribution, line),
    ladderReason,
    liveReason,
    ...buildPropEdgeRead(player, bet, intel).slice(0, 3),
  ]

  return {
    id: contractKeyForDrawer(game, player, bet),
    sport,
    gameId: game.id,
    matchup: `${game.awayTeam.abbr}@${game.homeTeam.abbr}`,
    gameTime: game.gameTime,
    player: player?.player || player?.name,
    team: player?.team,
    metric: bet?.metric,
    label: bet?.label,
    side: 'yes',
    tier: bet?.quality === 'bet' ? 'A' : bet?.quality === 'lean' ? 'B' : 'WATCH',
    projectedHitPct: finiteSignalNumber(bet?.hitRate),
    hitRate: finiteSignalNumber(bet?.hitRate),
    fairPrice,
    ask,
    maxBuy,
    edge,
    confidence: finiteSignalNumber(bet?.confidence ?? distribution.hitRate),
    hits: finiteSignalNumber(bet?.hits),
    games: finiteSignalNumber(bet?.games),
    avg: finiteSignalNumber(bet?.avg ?? distribution.mean),
    line,
    bookLine: line,
    risk: bet?.risk || bet?.explanation || null,
    liquidity: finiteSignalNumber(bet?.kalshi?.yesAskSize),
    askSize: finiteSignalNumber(bet?.kalshi?.yesAskSize),
    ticker: bet?.kalshi?.legTicker || bet?.kalshi?.ticker || null,
    url: bet?.kalshi?.url || null,
    marketTitle: bet?.kalshi?.title || bet?.label,
    reasons,
    flags: [distribution.volatility !== 'unknown' ? `volatility:${distribution.volatility}` : '', ...(liveProgress ? [liveProgress.hit ? 'live-clearing' : 'live-tracking'] : [])].filter(Boolean),
    createdAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    lineupFlags: buildPropLineupFlags(player, bet, intel, lineups),
    correlationItems,
    correlationWarnings,
    consensus: bet?.consensus ?? bet?.sportsbookConsensus ?? null,
    sportsbookConsensus: bet?.sportsbookConsensus ?? null,
    movement: bet?.movement,
    metadata: { distribution, ladder, liveProgress },
  }
}

function contractKeyForDrawer(game: Game, player: any, bet: any) {
  return `${game.id}|${player?.team || ''}|${player?.player || player?.name || ''}|${bet?.metric || ''}|${bet?.line ?? ''}|${bet?.kalshi?.legTicker || bet?.kalshi?.ticker || ''}`
}

function parlayContractKey(item: ParlayItem) {
  const gameKey = item.game ? `${item.game.awayTeam.abbr}@${item.game.homeTeam.abbr}` : ''
  return `${gameKey}|${item.player.team}|${item.player.player}|${item.bet.metric}|${item.bet.line}|${item.bet.kalshi?.legTicker || item.bet.kalshi?.ticker || ''}`
}

function pitcherStat(probable: any, names: string[]) {
  const cats = probable?.statistics?.splits?.categories || probable?.statistics || []
  for (const name of names) {
    const found = cats.find((x: any) => String(x.name || '').toLowerCase() === name.toLowerCase() || String(x.abbreviation || '').toLowerCase() === name.toLowerCase())
    const n = Number(found?.value ?? found?.displayValue)
    if (Number.isFinite(n)) return n
  }
  return null
}

function normalizePitcher(probable: any): MlbPitcherMatchup | null {
  const athlete = probable?.athlete
  if (!athlete?.displayName) return null
  const innings = Number(pitcherStat(probable, ['fullInnings', 'IP']) || 0) + Number(pitcherStat(probable, ['partInnings']) || 0) / 3
  const hits = pitcherStat(probable, ['hits', 'H']) ?? 0
  const homeRuns = pitcherStat(probable, ['homeRuns', 'HR']) ?? 0
  const era = pitcherStat(probable, ['ERA'])
  const whip = pitcherStat(probable, ['WHIP'])
  const hitsPerInning = innings > 0 ? hits / innings : null
  const homeRunsPerInning = innings > 0 ? homeRuns / innings : null
  const difficultyRaw =
    (era == null ? 50 : Math.max(0, Math.min(100, (era / 6) * 45))) +
    (whip == null ? 25 : Math.max(0, Math.min(45, (whip / 1.7) * 35))) +
    (hitsPerInning == null ? 10 : Math.max(0, Math.min(20, hitsPerInning * 16)))
  const difficulty = Math.max(0, Math.min(100, Math.round(difficultyRaw)))
  const label = difficulty >= 72 ? 'pitcher target' : difficulty >= 52 ? 'playable pitcher' : 'tough starter'
  return {
    name: athlete.displayName,
    throws: athlete.throws?.abbreviation || athlete.throws?.type,
    era: era == null ? undefined : Number(era.toFixed ? era.toFixed(2) : era),
    whip: whip == null ? undefined : Number(whip.toFixed ? whip.toFixed(2) : whip),
    hitsPerInning: hitsPerInning == null ? undefined : Number(hitsPerInning.toFixed(2)),
    homeRunsPerInning: homeRunsPerInning == null ? undefined : Number(homeRunsPerInning.toFixed(2)),
    difficulty,
    label,
  }
}

async function fetchMlbGameMatchup(game: Game): Promise<MlbGameMatchup> {
  if (game.mlbMatchup) return game.mlbMatchup
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=' + game.id, { cache: 'no-store' })
  if (!res.ok) return {}
  const data = await res.json().catch(() => null)
  const competitors = data?.header?.competitions?.[0]?.competitors || []
  const away = competitors.find((c: any) => c.homeAway === 'away')
  const home = competitors.find((c: any) => c.homeAway === 'home')
  return {
    awayPitcher: normalizePitcher(away?.probables?.[0]),
    homePitcher: normalizePitcher(home?.probables?.[0]),
  }
}

function scoreMlbBatterMatchup(item: ParlayItem, matchup?: MlbGameMatchup): MlbBatterMatchup | undefined {
  const game = item.game
  if (!game || !matchup) return undefined
  const playerTeam = String(item.player?.team || '').toUpperCase()
  const away = String(game.awayTeam.abbr || '').toUpperCase()
  const home = String(game.homeTeam.abbr || '').toUpperCase()
  const opposingPitcher = playerTeam === away ? matchup.homePitcher : playerTeam === home ? matchup.awayPitcher : undefined
  if (!opposingPitcher) return undefined
  const hits = Number(item.bet?.hits || 0)
  const games = Number(item.bet?.games || 0)
  const hitRate = games > 0 ? hits / games : 0
  const avg = Number(item.bet?.avg ?? item.bet?.last12Avg ?? 0)
  const score = Math.max(0, Math.min(100, Math.round(hitRate * 52 + Math.min(20, avg * 8) + opposingPitcher.difficulty * 0.32)))
  const grade = score >= 76 ? 'green' : score >= 63 ? 'neutral' : 'avoid'
  const note = opposingPitcher.label + ': ' + opposingPitcher.name + (opposingPitcher.throws ? ' (' + opposingPitcher.throws + ')' : '') + (opposingPitcher.era != null ? ' · ' + opposingPitcher.era + ' ERA' : '') + (opposingPitcher.whip != null ? ' · ' + opposingPitcher.whip + ' WHIP' : '')
  return { score, grade, pitcher: opposingPitcher, note }
}

function buildSafeParlayPool(items: ParlayItem[]) {
  return items
    .filter(item => {
      const ask = Number(item.bet.kalshi?.yesAsk || 0)
      const max = Number(item.bet.maxYesPrice || 0)
      const broadAltLine = item.bet.metric === 'hits + runs + RBIs' && Number(item.bet.line || 0) <= 1
      const quality = String(item.bet.quality || '')
      return Number(item.bet.games || 0) >= 12
        && Number(item.bet.hits || 0) >= 9
        && !broadAltLine
        && ['bet', 'lean'].includes(quality)
        && ask > 0
        && max > 0
        && ask <= max
        && (item.bet.kalshi?.legTicker || item.bet.kalshi?.ticker)
        && Number(item.bet.kalshi?.yesAskSize || 0) > 0
    })
    .sort((a, b) => {
      const matchupDiff = Number(b.matchup?.score || 0) - Number(a.matchup?.score || 0)
      if (matchupDiff) return matchupDiff
      const hitDiff = Number(b.bet.hits || 0) - Number(a.bet.hits || 0)
      if (hitDiff) return hitDiff
      const gameDiff = String(a.game?.id || '').localeCompare(String(b.game?.id || ''))
      if (gameDiff) return gameDiff
      return Number(a.bet.kalshi?.yesAsk || 99) - Number(b.bet.kalshi?.yesAsk || 99)
    })
}

function buildParlayFromPool(safeParlayPool: ParlayItem[], targetSize: number, offset: number) {
  const picked: ParlayItem[] = []
  const usedPlayers = new Set<string>()
  for (let i = 0; i < safeParlayPool.length && picked.length < targetSize; i++) {
    const item = safeParlayPool[(i + offset) % safeParlayPool.length]
    const key = String(item.player.player || '').toLowerCase()
    if (!key || usedPlayers.has(key)) continue
    usedPlayers.add(key)
    picked.push(item)
  }
  return picked.length >= Math.min(targetSize, safeParlayPool.length) ? picked : []
}

function buildParlaySuggestions(safeParlayPool: ParlayItem[]) {
  return [2, 3, 4, 6, 8]
    .filter(size => safeParlayPool.length >= size)
    .map((size, i) => ({ size, items: buildParlayFromPool(safeParlayPool, size, i * 2) }))
    .filter(ticket => ticket.items.length >= 2)
    .slice(0, 5)
}

function ExactKalshiBetButton({ player, bet, compact = false }: { player: string; bet: KalshiBetLike; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const kalshi = bet.kalshi
  if (!kalshi?.url) return null
  const ticker = kalshi.legTicker || kalshi.ticker || ''
  const title = kalshi.title || bet.label || 'Kalshi market'
  const copyTicker = async () => {
    try { await navigator.clipboard?.writeText(ticker) } catch {}
  }
  const openKalshi = () => window.open(kalshi.url, '_blank', 'noopener,noreferrer')

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ display: 'inline-flex', marginTop: compact ? 7 : 8, marginBottom: compact ? 0 : 9, color: C.cyan, fontSize: compact ? 9 : 9, fontWeight: 950, textDecoration: 'none', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
        Open exact Kalshi bet ↗
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(440px, 100%)', borderRadius: 22, padding: 18, background: 'linear-gradient(145deg, rgba(8,13,5,0.98), rgba(3,5,0,0.98))', border: `1px solid ${C.borderHot}`, boxShadow: '0 24px 80px rgba(0,0,0,0.65)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Exact Kalshi contract</p>
                <h3 style={{ color: C.textPrimary, fontSize: 18, fontWeight: 950, marginTop: 5 }}>{player}</h3>
                <p style={{ color: C.cyan, fontSize: 14, fontWeight: 950, marginTop: 4 }}>{title}</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textSecondary, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
              {[
                ['Ask', `${kalshi.yesAsk ?? '—'}¢`],
                ['Max buy', `${bet.maxYesPrice ?? '—'}¢`],
                ['Hit rate', bet.hitRate != null ? `${bet.hitRate}%` : '—'],
                ['Avg', bet.avg != null ? String(bet.avg) : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ borderRadius: 12, padding: '9px 10px', background: 'rgba(255,255,255,0.035)', border: `1px solid ${C.border}` }}>
                  <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</p>
                  <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 950, marginTop: 2 }}>{value}</p>
                </div>
              ))}
            </div>

            {bet.explanation && <p style={{ color: 'rgba(247,255,240,0.78)', fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>{bet.explanation}</p>}
            <div style={{ borderRadius: 12, padding: 10, background: 'rgba(125,246,255,0.055)', border: `1px solid ${C.border}`, marginBottom: 12 }}>
              <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Ticker to verify in Kalshi</p>
              <p style={{ color: C.green, fontSize: 10, lineHeight: 1.35, fontWeight: 900, wordBreak: 'break-all' }}>{ticker}</p>
              <p style={{ color: C.textSecondary, fontSize: 10, lineHeight: 1.4, marginTop: 7 }}>On iOS, Kalshi may open the game page instead of this exact card. Use this ticker/title to confirm the contract.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={copyTicker} style={{ borderRadius: 12, padding: '12px 10px', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: 11, fontWeight: 950, cursor: 'pointer' }}>Copy ticker</button>
              <button onClick={openKalshi} style={{ borderRadius: 12, padding: '12px 10px', border: `1px solid ${C.borderHot}`, background: 'rgba(125,246,255,0.14)', color: C.green, fontSize: 11, fontWeight: 950, cursor: 'pointer' }}>Open Kalshi</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function KalshiGameCard({ game, sport, autoLoad = false, onBoardLoadRequested, onBoardCollapse }: { game: Game; sport: SupportedSport; autoLoad?: boolean; onBoardLoadRequested?: (gameId: string) => void; onBoardCollapse?: (gameId: string) => void }) {
  const [props, setProps] = useState<PropsPanelData | null>(null)
  const [intel, setIntel] = useState<TeamIntelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activePropTab, setActivePropTab] = useState<string>('all')
  const [selectedContracts, setSelectedContracts] = useState<Record<string, boolean>>({})
  const [expandedContractKey, setExpandedContractKey] = useState<string>('')
  const [activePropDetail, setActivePropDetail] = useState<SignalTerminalSignal | null>(null)
  const [loadRequested, setLoadRequested] = useState(false)
  const [lineups, setLineups] = useState<LineupsData | null>(null)
  const [lineupsLoading, setLineupsLoading] = useState(false)
  const [liveGame, setLiveGame] = useState<LiveGameData | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Date | null>(null)
  const [activeLiveTab, setActiveLiveTab] = useState<'props' | 'feed' | 'box' | 'lineups'>('props')
  const isMobile = useIsMobile()
  const supportedKalshiSport = sport === 'nba' || sport === 'mlb' || sport === 'nfl'
  const shouldLoadIntelAndProps = loadRequested
  const requestCardLoad = useCallback(() => {
    setLoadRequested(true)
    onBoardLoadRequested?.(game.id)
  }, [game.id, onBoardLoadRequested])
  const collapseCard = useCallback(() => {
    setLoadRequested(false)
    setLoading(false)
    setProps(null)
    setIntel(null)
    setError(null)
    setActivePropTab('all')
    setSelectedContracts({})
    setExpandedContractKey('')
    setActivePropDetail(null)
    setLineups(null)
    setLiveGame(null)
    setLiveError(null)
    setLiveUpdatedAt(null)
    setActiveLiveTab('props')
    onBoardCollapse?.(game.id)
  }, [game.id, onBoardCollapse])

  useEffect(() => {
    if (autoLoad) {
      setLoadRequested(true)
      onBoardLoadRequested?.(game.id)
    }
  }, [autoLoad, game.id, onBoardLoadRequested])

  useEffect(() => {
    if (sport !== 'nba') {
      setIntel(null)
      return
    }
    if (!shouldLoadIntelAndProps) return
    let cancelled = false
    fetchJsonCached<TeamIntelData>(cacheKey('/api/team-intel', { home: game.homeTeam.abbr, away: game.awayTeam.abbr }), 60_000)
      .then(d => { if (!cancelled) setIntel(d) })
      .catch(() => { if (!cancelled) setIntel(null) })
    return () => { cancelled = true }
  }, [game.homeTeam.abbr, game.awayTeam.abbr, sport, shouldLoadIntelAndProps])

  useEffect(() => {
    if (sport !== 'mlb' || !shouldLoadIntelAndProps) {
      setLineups(null)
      setLineupsLoading(false)
      return
    }
    let cancelled = false
    setLineupsLoading(true)
    fetch(`/api/lineups?eventId=${game.id}&sport=mlb&t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled) setLineups(d) })
      .catch(() => { if (!cancelled) setLineups(null) })
      .finally(() => { if (!cancelled) setLineupsLoading(false) })
    return () => { cancelled = true }
  }, [game.id, sport, shouldLoadIntelAndProps])

  useEffect(() => {
    if (!supportedKalshiSport) {
      setLoading(false)
      setProps(null)
      setError(null)
      return
    }
    if (!shouldLoadIntelAndProps) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setProps(null)
    fetchJsonCached<PropsPanelData>(cacheKey('/api/props', { home: game.homeTeam.abbr, away: game.awayTeam.abbr, sport, eventId: game.id }), 30_000, 45_000)
      .then(d => { if (!cancelled) setProps(d) })
      .catch(e => { if (!cancelled) setError(e?.name === 'AbortError' ? 'scan timed out — retry in a few seconds' : e?.message || 'props unavailable') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [game.homeTeam.abbr, game.awayTeam.abbr, game.id, sport, supportedKalshiSport, shouldLoadIntelAndProps])

  useEffect(() => {
    if (!shouldLoadIntelAndProps) {
      setLiveGame(null)
      setLiveLoading(false)
      setLiveError(null)
      setLiveUpdatedAt(null)
      return
    }
    let cancelled = false
    const fetchLive = async (showSpinner = false) => {
      if (showSpinner) setLiveLoading(true)
      const params = new URLSearchParams({
        eventId: game.id,
        sport,
        away: game.awayTeam.abbr,
        home: game.homeTeam.abbr,
        date: game.gameDate || '',
      })
      try {
        const res = await fetch('/api/game-live?' + params.toString(), { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'live feed unavailable')
        if (!cancelled) {
          setLiveGame(data)
          setLiveError(null)
          setLiveUpdatedAt(new Date(data?.updatedAt || data?.generatedAt || Date.now()))
        }
      } catch (e: any) {
        if (!cancelled) setLiveError(e?.message || 'live feed unavailable')
      } finally {
        if (!cancelled) setLiveLoading(false)
      }
    }
    fetchLive(true)
    const intervalMs = game.status === 'in' ? 9_000 : 60_000
    const iv = setInterval(() => fetchLive(false), intervalMs)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [game.awayTeam.abbr, game.homeTeam.abbr, game.gameDate, game.id, game.status, sport, shouldLoadIntelAndProps])

  const fullBoardSport = sport === 'nba' || sport === 'mlb'
  const players = props ? [...(props.away || []), ...(props.home || [])].filter((p: any) => (fullBoardSport || (p.last12 || []).length >= 4) && (p.recommendations || []).length) : []
  const allContracts = players.flatMap((p: any) => (p.recommendations || []).map((bet: any) => ({ player: p, bet })))
  const categoryOrder = sport === 'nba'
    ? ['points', 'assists', 'rebounds', 'threes', 'steals', 'blocks', 'PTS+REB+AST']
    : sport === 'nfl'
      ? ['passing yards', 'passing TDs', 'rushing yards', 'receiving yards', 'receptions']
      : sport === 'mlb'
        ? ['hits', 'home runs', 'hits + runs + RBIs', 'total bases', 'strikeouts']
        : ['points', 'rebounds', 'assists']
  const metricGroups = categoryOrder
    .map(metric => ({ metric, items: allContracts.filter((x: any) => x.bet.metric === metric).sort((a: any, b: any) => (b.bet.hitRate - a.bet.hitRate) || ((a.bet.kalshi?.yesAsk || 99) - (b.bet.kalshi?.yesAsk || 99))) }))
    .filter(g => g.items.length)
  const categoryGroups = fullBoardSport && allContracts.length
    ? [{ metric: 'all', items: [...allContracts].sort((a: any, b: any) => String(a.player.team).localeCompare(String(b.player.team)) || String(a.player.player).localeCompare(String(b.player.player)) || categoryOrder.indexOf(a.bet.metric) - categoryOrder.indexOf(b.bet.metric) || a.bet.line - b.bet.line) }, ...metricGroups]
    : metricGroups
  const availableTabs = categoryGroups.map(g => g.metric)
  const currentTab = availableTabs.includes(activePropTab) ? activePropTab : (availableTabs[0] || 'points')
  const activeGroup = categoryGroups.find(g => g.metric === currentTab)
  const activePlayerGroups = activeGroup ? Array.from(activeGroup.items.reduce((map: Map<string, any>, item: any) => {
    const playerName = item.player.player
    const existing = map.get(playerName) || { player: item.player, bets: [] }
    existing.bets.push(item.bet)
    existing.bets.sort((a: any, b: any) => categoryOrder.indexOf(a.metric) - categoryOrder.indexOf(b.metric) || a.line - b.line)
    map.set(playerName, existing)
    return map
  }, new Map()).values()) : []
  const contractKey = (p: any, bet: any) => `${p.team}|${p.player}|${bet.metric}|${bet.line}|${bet.kalshi?.legTicker || bet.kalshi?.ticker || ''}`
  const selectedItems = allContracts.filter((x: any) => selectedContracts[contractKey(x.player, x.bet)])
  const copySelected = async () => {
    const text = selectedItems.map((x: any, i: number) => `${i + 1}. ${x.player.player} — ${x.bet.label} — ${x.bet.kalshi?.yesAsk ?? '—'}¢ ask — ${x.bet.kalshi?.legTicker || x.bet.kalshi?.ticker || ''}`).join('\n')
    try { await navigator.clipboard?.writeText(text) } catch {}
  }
  const openSelectedInKalshi = () => {
    if (!selectedItems.length) return
    const first = selectedItems[0]?.bet?.kalshi?.url
    if (first) window.open(first, '_blank', 'noopener,noreferrer')
  }
  const hasVisibleContracts = allContracts.length > 0
  const scanActive = loading || (loadRequested && !props && !error)
  const hasEspnScore = game.status !== 'pre' && (game.awayTeam.score !== '' || game.homeTeam.score !== '')
  const hasScore = game.status === 'in' || game.status === 'post' || hasEspnScore
  const awayScore = game.awayTeam.score || (hasScore ? '0' : '')
  const homeScore = game.homeTeam.score || (hasScore ? '0' : '')
  const awayLeading = Number(awayScore) > Number(homeScore)
  const homeLeading = Number(homeScore) > Number(awayScore)
  const feedLive = game.status === 'in'
  const statusTone = feedLive ? C.red : hasScore ? C.green : C.gold
  const statusLabel = feedLive ? 'Live feed' : hasScore ? 'ESPN score' : 'Starts'
  const liveSituation = liveGame?.situation || {}
  const livePitcherLine = liveSituation.pitcherLine || {}
  const livePitcherLineText = [
    livePitcherLine.innings ? `IP ${livePitcherLine.innings}` : '',
    livePitcherLine.strikeouts != null ? `K ${livePitcherLine.strikeouts}` : '',
    livePitcherLine.earnedRuns != null ? `ER ${livePitcherLine.earnedRuns}` : '',
    livePitcherLine.pitchCount ? `PC ${livePitcherLine.pitchCount}` : '',
  ].filter(Boolean).join(' · ')
  const liveCountText = [liveSituation.balls, liveSituation.strikes].every(v => v != null) ? `${liveSituation.balls}-${liveSituation.strikes}` : '-'
  const liveBaseSlots = [
    { label: '1B', runner: liveSituation.bases?.first, occupied: liveSituation.onFirst },
    { label: '2B', runner: liveSituation.bases?.second, occupied: liveSituation.onSecond },
    { label: '3B', runner: liveSituation.bases?.third, occupied: liveSituation.onThird },
  ]
  const liveNextText = arrayFromUnknown(liveSituation.nextBatters).map((p: any) => compactText(p?.name || p)).filter(Boolean).join(' · ')
  const lineupSides = [
    { key: 'away' as const, side: 'left' as const, team: game.awayTeam, pitcher: lineups?.awayPitcher || null, fallbackPitcher: game.mlbMatchup?.awayPitcher, players: lineups?.away || [], source: lineups?.awaySource, sourceGame: lineups?.awaySourceGame },
    { key: 'home' as const, side: 'right' as const, team: game.homeTeam, pitcher: lineups?.homePitcher || null, fallbackPitcher: game.mlbMatchup?.homePitcher, players: lineups?.home || [], source: lineups?.homeSource, sourceGame: lineups?.homeSourceGame },
  ]

  if (!loadRequested) {
    if (hasScore) {
      return (
        <button className="load-board-card" onClick={requestCardLoad} style={{
          width: '100%',
          textAlign: 'left',
          borderRadius: isMobile ? 16 : 22,
          padding: 1,
          border: 'none',
          background: feedLive ? 'linear-gradient(135deg, rgba(255,63,95,0.70), rgba(255,255,255,0.12), rgba(255,63,95,0.26))' : 'linear-gradient(135deg, rgba(125,246,255,0.62), rgba(255,255,255,0.12), rgba(125,246,255,0.24))',
          cursor: 'pointer',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'relative',
            zIndex: 2,
            borderRadius: isMobile ? 15 : 21,
            padding: isMobile ? '11px 10px' : '16px 14px',
            minHeight: isMobile ? 118 : 140,
            background: feedLive ? 'linear-gradient(145deg, rgba(20,5,9,0.98), rgba(4,4,2,0.97))' : 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            alignItems: 'center',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: feedLive ? 'radial-gradient(circle at 18% 50%, rgba(255,63,95,0.13), transparent 34%), radial-gradient(circle at 82% 50%, rgba(255,255,255,0.06), transparent 36%)' : 'radial-gradient(circle at 18% 50%, rgba(125,246,255,0.10), transparent 34%), radial-gradient(circle at 82% 50%, rgba(255,255,255,0.05), transparent 36%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'grid', gap: isMobile ? 7 : 9, minWidth: 0 }}>
              {[
                { team: game.awayTeam, score: awayScore, leading: awayLeading },
                { team: game.homeTeam, score: homeScore, leading: homeLeading },
              ].map(({ team, score, leading }) => {
                const winner = game.status === 'post' && leading
                const scoreColor = winner ? C.green : game.status === 'post' ? C.textSecondary : leading ? C.textPrimary : C.textSecondary
                return (
                <div key={'score-button-' + team.abbr} style={{ display: 'grid', gridTemplateColumns: `${isMobile ? 30 : 38}px minmax(0,1fr) auto`, alignItems: 'center', gap: isMobile ? 7 : 10, minWidth: 0 }}>
                  <TeamBadge abbr={team.abbr} name={team.name} sport={sport} size={isMobile ? 30 : 38} selected={winner} />
                  <span style={{ color: winner ? C.green : leading ? C.textPrimary : C.textSecondary, fontSize: isMobile ? 17 : 22, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.abbr}</span>
                  <span style={{ color: scoreColor, fontSize: isMobile ? 32 : 44, fontWeight: 950, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums', textShadow: winner ? '0 0 22px rgba(125,246,255,0.25)' : leading ? '0 0 20px rgba(255,255,255,0.16)' : 'none' }}>{score}</span>
                </div>
              )})}
            </div>
          </div>
        </button>
      )
    }

    return (
      <button className="load-board-card" onClick={requestCardLoad} style={{
        width: '100%',
        textAlign: 'left',
        borderRadius: isMobile ? 16 : 22,
        padding: 1,
        border: 'none',
        background: 'linear-gradient(135deg, rgba(125,246,255,0.56), rgba(255,255,255,0.10), rgba(168,240,255,0.18), rgba(125,246,255,0.22))',
        cursor: 'pointer',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', zIndex: 2, borderRadius: isMobile ? 15 : 21, padding: isMobile ? 10 : 16, minHeight: isMobile ? 132 : 158, background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', alignContent: 'space-between', gap: isMobile ? 8 : 12, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(125,246,255,0.055), transparent 34%, rgba(168,240,255,0.035) 68%, transparent)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: hasScore ? '1fr auto' : '1fr', gap: 10, alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.green, fontSize: isMobile ? 7 : 9, fontWeight: 950, letterSpacing: isMobile ? '0.12em' : '0.16em', textTransform: 'uppercase' }}>Kalshi</div>
              <div style={{ color: C.textPrimary, fontSize: isMobile ? 15 : 19, fontWeight: 950, marginTop: 4, lineHeight: 1.05 }}>{game.awayTeam.abbr}<br />@ {game.homeTeam.abbr}</div>
              <div style={{ marginTop: 7, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  {feedLive && <span style={{ width: 5, height: 5, borderRadius: 999, background: C.red, boxShadow: '0 0 10px ' + C.red, animation: 'liveDotPulse 1.2s ease-in-out infinite' }} />}
                  <span style={{ color: statusTone, fontSize: isMobile ? 7 : 9, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{statusLabel}</span>
                  <span style={{ color: C.textSecondary, fontSize: isMobile ? 7 : 9, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.gameTime || game.gameDate || 'Game slate'}</span>
                </div>
              </div>
            </div>
            {hasScore && (
              <div style={{ minWidth: isMobile ? 66 : 78, borderRadius: 13, padding: isMobile ? '8px 9px' : '10px 11px', background: feedLive ? 'rgba(255,63,95,0.14)' : 'rgba(125,246,255,0.12)', border: '1px solid ' + (feedLive ? 'rgba(255,63,95,0.38)' : 'rgba(125,246,255,0.34)'), boxShadow: feedLive ? '0 0 18px rgba(255,63,95,0.10)' : '0 0 18px rgba(125,246,255,0.10)' }}>
                {[
                  { team: game.awayTeam, score: awayScore, leading: awayLeading },
                  { team: game.homeTeam, score: homeScore, leading: homeLeading },
                ].map(({ team, score, leading }) => (
                  <div key={'score-' + team.abbr} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'baseline', marginTop: team.abbr === game.homeTeam.abbr ? 4 : 0 }}>
                    <span style={{ color: leading ? C.textPrimary : C.textSecondary, fontSize: isMobile ? 9 : 10, fontWeight: 950 }}>{team.abbr}</span>
                    <span style={{ color: leading ? C.textPrimary : C.green, fontSize: isMobile ? 24 : 28, fontWeight: 950, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: isMobile ? 7 : 8, alignItems: 'center', minWidth: 0 }}>
              {[game.awayTeam, game.homeTeam].map(team => (
                <div key={team.abbr} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 3 : 6, minWidth: 0 }}>
                  <TeamBadge abbr={team.abbr} name={team.name} sport={sport} size={isMobile ? 18 : 22} />
                  <span style={{ color: C.textPrimary, fontSize: isMobile ? 8 : 11, fontWeight: 950 }}>{team.abbr}{hasScore && team.score ? ` ${team.score}` : ''}</span>
                </div>
              ))}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div style={{
      borderRadius: 22,
      padding: 1,
      background: hasVisibleContracts ? 'linear-gradient(135deg, rgba(125,246,255,0.64), rgba(255,255,255,0.14), rgba(125,246,255,0.12))' : 'linear-gradient(135deg, rgba(125,246,255,0.18), rgba(255,255,255,0.06))',
      boxShadow: scanActive ? '0 0 34px rgba(125,246,255,0.18), 0 18px 58px rgba(0,0,0,0.58)' : hasVisibleContracts ? '0 0 30px rgba(125,246,255,0.16), 0 18px 50px rgba(0,0,0,0.45)' : '0 14px 40px rgba(0,0,0,0.38)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ borderRadius: 21, padding: isMobile ? '48px 16px 16px' : 16, background: SURFACE.panel, minHeight: 220, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
        <button
          onClick={collapseCard}
          aria-label="Minimize game board"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 5,
            borderRadius: 999,
            padding: '8px 11px',
            border: `1px solid ${C.border}`,
            background: 'rgba(5,8,4,0.88)',
            color: C.textPrimary,
            fontSize: 10,
            fontWeight: 950,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: '0 10px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
            backdropFilter: 'blur(10px)',
          }}
        >
          Minimize
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, alignItems: 'stretch', marginBottom: 12 }}>
          <div style={{ borderRadius: 18, padding: isMobile ? 12 : 13, background: feedLive ? 'linear-gradient(145deg, rgba(20,5,9,0.98), rgba(4,4,2,0.97))' : 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: '1px solid ' + (feedLive ? 'rgba(255,63,95,0.34)' : 'rgba(125,246,255,0.30)'), display: 'grid', gap: isMobile ? 10 : 12, alignContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 24px rgba(125,246,255,0.08)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 8 : 12 }}>
              {[
              { team: game.awayTeam, score: awayScore, leading: awayLeading },
              { team: game.homeTeam, score: homeScore, leading: homeLeading },
            ].map(({ team, score, leading }) => {
              const winner = game.status === 'post' && leading
              const scoreColor = winner ? C.green : game.status === 'post' ? C.textSecondary : leading ? C.textPrimary : C.textSecondary
              return (
                <div key={'expanded-score-' + team.abbr} style={{ display: 'grid', gridTemplateColumns: `${isMobile ? 40 : 32}px minmax(0,1fr) auto`, gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <TeamBadge abbr={team.abbr} name={team.name} sport={sport} size={isMobile ? 40 : 32} />
                  <span style={{ color: winner ? C.green : leading ? C.textPrimary : C.textSecondary, fontSize: isMobile ? 21 : 17, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.abbr}</span>
                  <span style={{ color: scoreColor, fontSize: isMobile ? 44 : 34, fontWeight: 950, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums', textShadow: winner ? '0 0 20px rgba(125,246,255,0.24)' : 'none' }}>{hasScore ? score : '-'}</span>
                </div>
              )
            })}
            </div>
            {supportedKalshiSport && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
                {[
                  { key: 'props' as const, label: 'Props' },
                  { key: 'lineups' as const, label: sport === 'nba' ? 'Rotation' : 'Lineups' },
                  { key: 'box' as const, label: 'Live Stats' },
                  { key: 'feed' as const, label: 'Live Feed' },
                ].map(tab => {
                  const active = activeLiveTab === tab.key
                  return (
                    <button key={tab.key} onClick={() => setActiveLiveTab(tab.key)} style={{ borderRadius: 12, minHeight: 36, padding: '8px 6px', border: '1px solid ' + (active ? C.borderHot : C.border), background: active ? 'rgba(125,246,255,0.16)' : 'rgba(255,255,255,0.04)', color: active ? C.green : C.textPrimary, fontSize: isMobile ? 8 : 10, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {sport === 'mlb' && activeLiveTab === 'lineups' && (
            <div style={{ borderRadius: 18, padding: isMobile ? 10 : 12, background: 'linear-gradient(145deg, rgba(125,246,255,0.070), rgba(255,255,255,0.026))', border: `1px solid ${C.borderHot}`, minWidth: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Game Intel</span>
                <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 850 }}>{lineupsLoading ? 'loading' : lineups?.available ? 'ESPN' : 'pending'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: isMobile ? 6 : 8 }}>
                {lineupSides.map(side => (
                  <div key={'team-intel-' + side.team.abbr} style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                    <div style={{ minWidth: 0, borderRadius: 14, padding: 9, background: 'rgba(0,0,0,0.26)', border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: side.side === 'right' ? 'flex-end' : 'flex-start', gap: 6, marginBottom: 5, minWidth: 0 }}>
                        {side.side === 'left' && <TeamBadge abbr={side.team.abbr} name={side.team.name} sport={sport} size={20} />}
                        <span style={{ color: C.textPrimary, fontSize: 10, fontWeight: 950 }}>{side.team.abbr}</span>
                        <span style={{ color: C.gold, fontSize: 8, fontWeight: 950 }}>SP</span>
                        {side.side === 'right' && <TeamBadge abbr={side.team.abbr} name={side.team.name} sport={sport} size={20} />}
                      </div>
                      <div style={{ color: C.gold, fontSize: isMobile ? 11 : 12, fontWeight: 950, overflowWrap: 'anywhere', lineHeight: 1.2, textAlign: side.side }}>{side.pitcher?.name || side.fallbackPitcher?.name || 'Starter TBA'}</div>
                      {side.source === 'previous' && <div style={{ color: C.gold, fontSize: 7, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4, textAlign: side.side }}>Previous game lineup</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: side.side === 'right' ? '1fr auto' : 'auto 1fr', gap: '3px 7px', marginTop: 7, alignItems: 'baseline' }}>
                        {side.side === 'left' && <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>ERA</span>}
                        <span style={{ color: C.textPrimary, fontSize: 10, fontWeight: 950, textAlign: side.side }}>{side.pitcher?.era || side.fallbackPitcher?.era || '--'}</span>
                        {side.side === 'right' && <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>ERA</span>}
                        {side.side === 'left' && <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>Last 7</span>}
                        <span style={{ color: C.green, fontSize: 8, fontWeight: 950, overflowWrap: 'anywhere', textAlign: side.side }}>{side.pitcher?.form7 || '--'}</span>
                        {side.side === 'right' && <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>Last 7</span>}
                      </div>
                    </div>
                    <div style={{ borderRadius: 14, padding: 9, background: 'rgba(0,0,0,0.24)', border: `1px solid ${C.border}` }}>
                      <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 2, textAlign: side.side }}>{side.team.abbr} Lineup</div>
                      <div style={{ color: C.green, fontSize: 7, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, textAlign: side.side }}>Last 7 games</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {(side.players.length ? side.players.slice(0, 9) : [{ name: 'Lineup pending', position: '' } as StarterPlayer]).map((p, i) => (
                          <div key={side.team.abbr + '-' + p.name + '-' + i} style={{ display: 'grid', gridTemplateColumns: side.side === 'right' ? 'minmax(0,1fr) 18px' : '18px minmax(0,1fr)', gap: 5, alignItems: 'start', minHeight: 30, borderTop: i ? '1px solid rgba(255,255,255,0.045)' : 'none', paddingTop: i ? 4 : 0 }}>
                            {side.side === 'left' && <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 900, textAlign: 'right' }}>{side.players.length ? i + 1 : '-'}</span>}
                            <div style={{ minWidth: 0, textAlign: side.side }}>
                              <div style={{ color: side.players.length ? C.textPrimary : C.textSecondary, fontSize: isMobile ? 10 : 11, fontWeight: 900, overflowWrap: 'anywhere', lineHeight: 1.18 }}>{p.name}</div>
                              <div style={{ color: p.form7 ? C.green : C.textSecondary, fontSize: 8, fontWeight: 900, overflowWrap: 'anywhere', lineHeight: 1.25 }}>{p.position || '--'}{p.form7 ? ` · Last 7: ${p.form7}` : ''}</div>
                            </div>
                            {side.side === 'right' && <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 900, textAlign: 'left' }}>{side.players.length ? i + 1 : '-'}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {activeLiveTab !== 'props' && activeLiveTab !== 'lineups' && (game.status === 'in' || liveGame || liveError) && (
          <LiveGameDrawer
            game={game}
            sport={sport}
            live={liveGame}
            loading={liveLoading}
            error={liveError}
            updatedAt={liveUpdatedAt}
            activeTab={activeLiveTab}
            onTabChange={setActiveLiveTab}
            lineups={lineups}
          />
        )}

        {sport === 'mlb' && activeLiveTab === 'props' && (game.status === 'in' || liveGame || liveError) && (
          <div style={{ borderRadius: 15, padding: 10, background: 'linear-gradient(145deg, rgba(255,63,95,0.070), rgba(125,246,255,0.030))', border: '1px solid rgba(255,255,255,0.12)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ color: feedLive ? C.red : C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Live game state</div>
              <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 850 }}><UpdatedAgeLabel updatedAt={liveUpdatedAt} prefix="refreshed" empty={liveLoading ? 'refreshing' : 'waiting'} /></div>
            </div>
            {liveError ? (
              <div style={{ color: C.gold, fontSize: 10 }}>Live feed waiting on ESPN: {liveError}</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 7 }}>
                  {[
                    { label: 'Inning', value: [liveSituation.inningHalf || liveGame?.inningHalf, liveSituation.inning || liveGame?.inning].filter(Boolean).join(' ') || '-' },
                    { label: 'Count', value: liveCountText },
                    { label: 'Outs', value: liveSituation.outs != null ? String(liveSituation.outs) : '-' },
                    { label: 'Pitcher', value: liveSituation.pitcher || '-' },
                  ].map(item => (
                    <div key={item.label} style={{ minWidth: 0, borderRadius: 10, padding: '7px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border }}>
                      <div style={{ color: C.textSecondary, fontSize: 7, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{item.label}</div>
                      <div style={{ color: item.label === 'Pitcher' && item.value !== '-' ? C.green : C.textPrimary, fontSize: 11, fontWeight: 950, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                  <div style={{ minWidth: 0, borderRadius: 10, padding: 8, background: 'rgba(0,0,0,0.20)', border: '1px solid ' + C.border }}>
                    <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>At bat</div>
                    <div style={{ color: liveSituation.batter ? C.green : C.textSecondary, fontSize: 11, fontWeight: 900, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{liveSituation.batter || '-'}</div>
                    <div style={{ color: C.textSecondary, fontSize: 8, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Next: {liveNextText || '-'}</div>
                  </div>
                  <div style={{ minWidth: 0, borderRadius: 10, padding: 8, background: 'rgba(0,0,0,0.20)', border: '1px solid ' + C.border }}>
                    <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Pitcher line</div>
                    <div style={{ color: liveSituation.pitcher ? C.green : C.textSecondary, fontSize: 11, fontWeight: 900, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[liveSituation.pitcherRecord, livePitcherLineText].filter(Boolean).join(' · ') || '-'}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                  {liveBaseSlots.map(base => {
                    const runner = compactText(base.runner?.name || base.runner)
                    return (
                      <div key={'props-live-' + base.label} style={{ minWidth: 0, borderRadius: 9, padding: '6px 7px', background: base.occupied ? 'rgba(125,246,255,0.10)' : 'rgba(255,255,255,0.035)', border: '1px solid ' + (base.occupied ? C.borderHot : C.border) }}>
                        <div style={{ color: base.occupied ? C.green : C.textSecondary, fontSize: 8, fontWeight: 950 }}>{base.label}</div>
                        <div style={{ color: base.occupied ? C.textPrimary : C.textSecondary, fontSize: 9, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{base.occupied ? (runner || 'Occupied') : 'Empty'}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeLiveTab === 'lineups' && sport === 'nba' && intel && (
          <div style={{ borderRadius: 15, padding: 10, background: 'rgba(255,255,255,0.026)', border: `1px solid ${C.border}`, marginBottom: 12, opacity: 0, animation: 'dominoFadeIn 920ms cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>NBA Rotation · Last Game Minutes</div>
              <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 850 }}>starters + minutes + alerts</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 9 : 10 }}>
              {[
                { side: 'Away', team: intel.away, injuries: intel.injuryImpact.awayPlayers || [], notes: intel.injuryImpact.awayNotes },
                { side: 'Home', team: intel.home, injuries: intel.injuryImpact.homePlayers || [], notes: intel.injuryImpact.homeNotes },
              ].map(({ side, team, injuries, notes }) => {
                const pool = team.fatigue?.players || []
                const starters = pool.filter(p => p.projectedStarter || p.isStarter).slice(0, 5)
                const projected = (starters.length >= 5 ? starters : pool.filter(p => p.rotationRole === 'starter' || p.minutes >= 24).slice(0, 5))
                const minuteLeaders = pool.filter(p => p.minutes >= 0 || p.fatigueFlag === 'dnp').slice(0, 8)
                const seen = new Set<string>()
                const rotationPlayers = [...projected, ...minuteLeaders].filter(p => {
                  const key = p.name.toLowerCase().replace(/[^a-z]/g, '')
                  if (seen.has(key)) return false
                  seen.add(key)
                  return true
                }).slice(0, 8)
                const shownInjuries = injuries.slice(0, 4)
                const cleanName = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '')
                return (
                  <div key={`kalshi-rotation-${team.abbr}`} style={{ minWidth: 0, borderRadius: 12, padding: 8, background: 'rgba(255,255,255,0.026)', border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 7 }}>
                      <span style={{ color: C.textPrimary, fontSize: 10, fontWeight: 950 }}>{team.abbr} <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800 }}>({side})</span></span>
                      <span style={{ color: team.fatigue?.hasFatigueRisk ? C.red : team.fatigue?.isBackToBack ? C.gold : C.textSecondary, fontSize: 8, fontWeight: 900 }}>{team.fatigue?.summary || `${team.restDays}d rest`}</span>
                    </div>
                    {rotationPlayers.length ? (
                      <div style={{ display: 'grid', gap: 5 }}>
                        {rotationPlayers.map((player, i) => {
                          const injured = shownInjuries.find(ip => {
                            const a = cleanName(ip.name), b = cleanName(player.name)
                            return a === b || a.includes(b) || b.includes(a)
                          })
                          const out = injured && /out|doubtful/i.test(injured.status)
                          const q = injured && !out
                          const isDnp = player.minutes < 0 || player.fatigueFlag === 'dnp'
                          const barColor = isDnp ? C.textSecondary : player.minutes >= 36 ? C.red : player.minutes >= 28 ? C.gold : C.green
                          const barWidth = isDnp ? 0 : Math.min(100, (player.minutes / 42) * 100)
                          const role = player.rotationRole === 'starter' || player.isStarter ? 'START' : player.rotationRole === 'sixth' ? '6TH' : player.rotationRole === 'second_unit' ? 'BENCH' : player.rotationRole === 'deep_bench' ? 'DEEP' : 'ROT'
                          return (
                            <div key={`${team.abbr}-rot-${player.name}-${i}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(118px,1fr) 22px 36px 56px 32px auto' : 'minmax(0,1fr) 24px 34px 46px 28px auto', alignItems: 'center', gap: isMobile ? 4 : 5, minWidth: 0 }}>
                              <span style={{ color: out ? 'rgba(255,68,102,0.62)' : player.warning ? C.gold : player.isStarter ? C.textPrimary : C.textSecondary, fontSize: 8, fontWeight: player.isStarter ? 900 : 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: out ? 'line-through' : 'none' }}>{player.name}</span>
                              <span style={{ color: C.textSecondary, fontSize: 7, fontWeight: 900, textAlign: 'center' }}>{player.position || '?'}</span>
                              <span style={{ color: player.isStarter ? C.green : C.textSecondary, fontSize: 6, fontWeight: 950, textAlign: 'center' }}>{role}</span>
                              <span style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                <span style={{ display: 'block', width: `${barWidth}%`, height: '100%', borderRadius: 999, background: barColor }} />
                              </span>
                              <span style={{ color: barColor, fontSize: 8, fontWeight: 950, textAlign: 'right' }}>{isDnp ? 'DNP' : `${player.minutes}m`}</span>
                              {out ? <span style={{ background: C.red, color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: 7, fontWeight: 950 }}>OUT</span> : q ? <span style={{ background: '#c8960c', color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: 7, fontWeight: 950 }}>Q</span> : <span />}
                            </div>
                          )
                        })}
                      </div>
                    ) : <div style={{ color: C.textSecondary, fontSize: 8 }}>Rotation/minutes unavailable.</div>}
                    {(shownInjuries.length > 0 || (notes && !/none/i.test(notes))) && (
                      <div style={{ marginTop: 7, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                        {shownInjuries.length > 0 && <div style={{ color: C.red, fontSize: 7, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>Alerts: {shownInjuries.map(p => `${p.name} ${p.status}`).join(' · ')}</div>}
                        {notes && !/none/i.test(notes) && <div style={{ color: C.textSecondary, fontSize: 8, lineHeight: 1.35 }}>{notes}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ color: C.textSecondary, fontSize: 8, lineHeight: 1.35, marginTop: 8 }}>START is projected until official lineups lock near tip. Minutes are from each player’s last game.</div>
          </div>
        )}

        {activeLiveTab === 'lineups' && sport === 'nba' && !intel && (
          <div style={{ borderRadius: 15, padding: 11, background: 'rgba(255,255,255,0.026)', border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 10, lineHeight: 1.45, marginBottom: 12 }}>
            {loadRequested ? 'Loading NBA rotation, last-game minutes, rest, and injury alerts…' : 'Tap Props first to load this game board.'}
          </div>
        )}

        {activeLiveTab === 'props' && !loading && categoryGroups.length > 0 && (
          <div style={{ display: 'grid', gap: 9, paddingBottom: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', overflow: 'visible' }}>
              {categoryGroups.map(group => {
                const active = group.metric === currentTab
                const label = formatPropMetricShort(group.metric)
                return <button key={group.metric} title={formatPropMetricLabel(group.metric)} onClick={() => setActivePropTab(group.metric)} style={{ flex: '0 0 auto', borderRadius: 999, padding: '7px 10px', border: `1px solid ${active ? C.borderHot : C.border}`, background: active ? 'rgba(125,246,255,0.14)' : 'rgba(255,255,255,0.035)', color: active ? C.green : C.textSecondary, fontSize: 9, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {label} · {group.items.length}
                </button>
              })}
            </div>
          </div>
        )}

        {activeLiveTab !== 'props' ? null : !supportedKalshiSport ? (
          <p style={{ color: C.textSecondary, fontSize: 11, lineHeight: 1.45 }}>Kalshi player prop cards are not wired for {sport.toUpperCase()} yet. Use Polymarket for this sport while we add that feed.</p>
        ) : scanActive ? (
          <div style={{ display: 'grid', gap: 9 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ borderRadius: 15, padding: 1, background: 'linear-gradient(135deg, rgba(125,246,255,0.58), rgba(255,255,255,0.10), rgba(125,246,255,0.14))', boxShadow: '0 0 24px rgba(125,246,255,0.13)', animation: `scanCardGlow ${1.02 + i * 0.14}s ease-in-out infinite`, overflow: 'hidden' }}>
                <div style={{ borderRadius: 14, padding: 11, background: 'linear-gradient(145deg, rgba(10,16,7,0.96), rgba(3,5,0,0.96))', position: 'relative', overflow: 'hidden', minHeight: 58 }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(125,246,255,0.95), transparent)', animation: `scanCardSweep ${1 + (i % 2) * 0.2}s linear infinite` }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ width: i === 0 ? '48%' : i === 1 ? '38%' : '44%', height: 11, borderRadius: 999, background: 'rgba(247,255,240,0.12)', marginBottom: 8 }} />
                      <div style={{ width: i === 0 ? '62%' : i === 1 ? '52%' : '58%', height: 8, borderRadius: 999, background: 'rgba(125,246,255,0.12)' }} />
                    </div>
                    <div style={{ width: 62, height: 24, borderRadius: 999, background: 'rgba(125,246,255,0.10)', border: '1px solid rgba(125,246,255,0.16)' }} />
                  </div>
                </div>
              </div>
            ))}
            <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center', marginTop: 2 }}>Scanning card slate…</div>
          </div>
        ) : error ? (
          <p style={{ color: C.gold, fontSize: 11 }}>Kalshi scan unavailable: {error}</p>
        ) : activeGroup ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 5 }}>
              <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{formatPropMetricLabel(activeGroup.metric)}</div>
              <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>{activeGroup.items.length} contracts · {activePlayerGroups.length} players</div>
            </div>
            {activePlayerGroups.map(({ player: p, bets }: any, playerIdx: number) => {
              const expandedBet = bets.find((bet: any) => contractKey(p, bet) === expandedContractKey) || null
              const lastGameMinutes = formatLastGameMinutes(p)
              const playerSignalTags = Array.from(new Set(bets.flatMap((bet: any) => bet.signalTags || [])))
              return (
                <div key={`${game.id}-${p.team}-${p.player}-${activeGroup.metric}`} style={{ borderRadius: 14, padding: 11, background: 'rgba(125,246,255,0.045)', border: '1px solid rgba(255,255,255,0.10)', opacity: 0, animation: 'dominoFadeIn 860ms cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: `${Math.min(playerIdx * 150, 1350)}ms` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
                    <div>
                      <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 950 }}>{p.player}</div>
                      <div style={{ color: C.textSecondary, fontSize: 9, marginTop: 2 }}>{p.team} · {p.position || (activeGroup.metric === 'all' ? 'props' : activeGroup.metric)}</div>
                      {lastGameMinutes && <div style={{ color: C.green, fontSize: 8, fontWeight: 950, marginTop: 3, letterSpacing: '0.04em' }}>⏱ {lastGameMinutes}</div>}
                      {playerSignalTags.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>{playerSignalTags.map((tag: any) => <span key={String(tag)} style={{ borderRadius: 999, padding: '3px 6px', background: 'rgba(125,246,255,0.14)', border: '1px solid ' + C.borderHot, color: C.green, fontSize: 7, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{String(tag)}</span>)}</div>}
                    </div>
                    <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>{bets.length} lines</div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {bets.map((bet: any) => {
                      const key = contractKey(p, bet)
                      const open = key === expandedContractKey
                      const selected = !!selectedContracts[key]
                      const safeHit = Number(bet.games || 0) >= 12 && Number(bet.hits || 0) >= 9
                      const liveProgress = sport === 'mlb' ? getLiveMlbPropProgress(liveGame, p, bet) : null
                      const signalLabel = Array.isArray(bet.signalTags) && bet.signalTags.length ? ' · ' + bet.signalTags.join(' + ') : ''
                      return (
                        <button key={key} onClick={() => setExpandedContractKey(open ? '' : key)} style={{ borderRadius: 999, padding: '7px 9px', border: '1px solid ' + (open || safeHit || signalLabel ? C.borderHot : selected ? 'rgba(125,246,255,0.45)' : C.border), background: open ? 'rgba(125,246,255,0.18)' : safeHit || signalLabel ? 'rgba(125,246,255,0.13)' : selected ? 'rgba(125,246,255,0.10)' : 'rgba(255,255,255,0.035)', color: open || selected || safeHit || signalLabel ? C.green : C.textPrimary, fontSize: 10, fontWeight: 950, cursor: 'pointer', animation: safeHit ? 'safePropThrob 1.25s ease-in-out infinite' : undefined, willChange: safeHit ? 'transform, box-shadow' : undefined }}>
                          {bet.line}+ {formatPropMetricShort(activeGroup.metric === 'all' ? bet.metric : activeGroup.metric)} · {bet.kalshi?.yesAsk ?? '—'}¢{safeHit ? ` · ${bet.hits}/${bet.games}` : ''}{signalLabel}{liveProgress ? ' · LIVE ' + liveProgress.label : ''}
                        </button>
                      )
                    })}
                  </div>
                  {expandedBet && (() => {
                    const key = contractKey(p, expandedBet)
                    const selected = !!selectedContracts[key]
                    const liveProgress = sport === 'mlb' ? getLiveMlbPropProgress(liveGame, p, expandedBet) : null
                    return (
                      <div style={{ marginTop: 10, borderRadius: 13, padding: 10, background: 'rgba(0,0,0,0.24)', border: `1px solid ${selected ? C.borderHot : C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div>
                            <div style={{ color: expandedBet.quality === 'bet' ? C.green : expandedBet.quality === 'lean' ? C.gold : C.textPrimary, fontSize: 12, fontWeight: 950 }}>{expandedBet.label}</div>
                            <div style={{ color: C.cyan, fontSize: 9, fontWeight: 900, marginTop: 2 }}>{expandedBet.kalshi?.yesAsk ?? '—'}¢ ask · max {expandedBet.maxYesPrice ?? '—'}¢ · {expandedBet.kalshi?.yesAskSize ?? 0} size</div>
                          </div>
                          <div style={{ color: C.textSecondary, fontSize: 9, fontWeight: 900, textAlign: 'right' }}>{expandedBet.hits}/{expandedBet.games}<br />hit</div>
                        </div>
                        {liveProgress && (
                          <div style={{ marginTop: 8, borderRadius: 11, padding: '8px 9px', background: liveProgress.hit ? 'rgba(125,246,255,0.13)' : 'rgba(255,215,0,0.075)', border: '1px solid ' + (liveProgress.hit ? C.borderHot : 'rgba(255,215,0,0.24)'), color: liveProgress.hit ? C.green : C.gold, fontSize: 9, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            Live progress: {liveProgress.label}{liveProgress.hit ? ' · clearing' : ' · tracking'}
                          </div>
                        )}
                        {(() => {
                          const safeHit = Number(expandedBet.games || 0) >= 12 && Number(expandedBet.hits || 0) >= 9
                          const reads = buildPropEdgeRead(p, expandedBet, intel)
                          return (
                            <div style={{ marginTop: 9, borderRadius: 12, padding: 10, background: safeHit ? 'linear-gradient(135deg, rgba(125,246,255,0.13), rgba(255,255,255,0.035))' : 'rgba(255,255,255,0.035)', border: `1px solid ${safeHit ? C.borderHot : C.border}` }}>
                              <div style={{ color: safeHit ? C.green : C.textPrimary, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Edge read</div>
                              <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
                                {reads.map((line: string, i: number) => (
                                  <div key={i} style={{ color: i === 0 ? 'rgba(247,255,240,0.88)' : C.textSecondary, fontSize: i === 0 ? 10 : 9, lineHeight: 1.42 }}>
                                    {line}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 3, marginTop: 8 }}>
                          {(p.last12 || []).slice(0, 12).map((g: any, idx: number) => {
                            const val = getPropStatValue(p, g, expandedBet.metric)
                            const hit = val != null && val >= expandedBet.line
                            const gameMinutes = Number(g?.stats?.minutes)
                            const minuteText = Number.isFinite(gameMinutes) && gameMinutes > 0 ? ` · ${Math.round(gameMinutes)} min` : ''
                            return <div key={`${g.eventId || idx}-${idx}`} title={`${g.date || ''} ${g.opponent || ''}${minuteText}`} style={{ borderRadius: 5, padding: '3px 1px', textAlign: 'center', background: hit ? 'rgba(125,246,255,0.15)' : 'rgba(255,255,255,0.05)', color: hit ? C.green : C.textSecondary, fontSize: 8, fontWeight: 900 }}><div>{val ?? '—'}</div>{Number.isFinite(gameMinutes) && gameMinutes > 0 && <div style={{ color: C.textSecondary, fontSize: 7, fontWeight: 900, marginTop: 1 }}>{Math.round(gameMinutes)}m</div>}</div>
                          })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
                          <button onClick={() => setSelectedContracts(prev => ({ ...prev, [key]: !prev[key] }))} style={{ borderRadius: 999, padding: '7px 10px', border: `1px solid ${selected ? C.borderHot : C.border}`, background: selected ? 'rgba(125,246,255,0.16)' : 'rgba(255,255,255,0.035)', color: selected ? C.green : C.textPrimary, fontSize: 9, fontWeight: 950, cursor: 'pointer' }}>{selected ? 'Selected ✓' : 'Select contract +'}</button>
                          <button onClick={() => setActivePropDetail(buildPropDetailSignal({ game, sport, player: p, bet: expandedBet, selectedItems, liveGame, intel, lineups }))} style={{ borderRadius: 999, padding: '7px 10px', border: `1px solid ${C.borderHot}`, background: 'rgba(141,247,255,0.10)', color: C.cyan, fontSize: 9, fontWeight: 950, cursor: 'pointer' }}>Details</button>
                          {expandedBet.kalshi?.url && <ExactKalshiBetButton player={p.player} bet={expandedBet} compact />}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
            {selectedItems.length > 0 && (
              <div style={{ position: 'sticky', bottom: 10, zIndex: 7, borderRadius: 16, padding: 12, background: 'rgba(3,5,0,0.96)', border: `1px solid ${C.borderHot}`, boxShadow: '0 18px 50px rgba(0,0,0,0.58)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{selectedItems.length} selected</div>
                    <div style={{ color: C.textSecondary, fontSize: 9, marginTop: 2 }}>Kalshi combo deep-link is not public; this slip preserves exact contracts/tickers.</div>
                  </div>
                  <button onClick={() => setSelectedContracts({})} style={{ border: 'none', background: 'transparent', color: C.textSecondary, fontSize: 10, fontWeight: 900, cursor: 'pointer' }}>Clear</button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={copySelected} style={{ flex: 1, borderRadius: 12, padding: '10px 9px', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.textPrimary, fontSize: 10, fontWeight: 950, cursor: 'pointer' }}>Copy selected</button>
                  <button onClick={openSelectedInKalshi} style={{ flex: 1, borderRadius: 12, padding: '10px 9px', border: `1px solid ${C.borderHot}`, background: 'rgba(125,246,255,0.14)', color: C.green, fontSize: 10, fontWeight: 950, cursor: 'pointer' }}>Open Kalshi</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <GameMarketFallback game={game} />
        )}
        {activePropDetail && (
          <div style={{ marginTop: 12 }}>
            <PropDetailDrawer
              signal={activePropDetail}
              open
              title="Prop terminal detail"
              onClose={() => setActivePropDetail(null)}
              onOpenMarket={(signal) => {
                if (isTrustedMarketUrl(signal?.url)) window.open(signal.url, '_blank', 'noopener,noreferrer')
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SportSlateParlayBuilder({ sport, games, isMobile, autoRun = false }: { sport: SupportedSport; games: Game[]; isMobile: boolean; autoRun?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tickets, setTickets] = useState<ParlayTicket[]>([])
  const [scannedCount, setScannedCount] = useState(0)
  const autoRunKeyRef = useRef<string | null>(null)
  const slateGames = games.filter(g => g.status !== 'post')
  const slateKey = slateGames.map(g => g.id).join('|')

  useEffect(() => {
    setLoading(false)
    setError(null)
    setTickets([])
    setScannedCount(0)
  }, [slateKey])

  const copyTicket = async (items: ParlayItem[]) => {
    const text = items.map((x, i) => {
      const matchup = x.game ? `${x.game.awayTeam.abbr}@${x.game.homeTeam.abbr}` : ''
      const pitcher = x.matchup ? ` — matchup ${x.matchup.score}/100 vs ${x.matchup.pitcher?.name || 'starter'}` : ''
      return `${i + 1}. ${matchup} — ${x.player.player} — ${x.bet.label} — hit ${x.bet.hits}/${x.bet.games}${pitcher} — ${x.bet.kalshi?.yesAsk ?? '—'}¢ ask — ${x.bet.kalshi?.legTicker || x.bet.kalshi?.ticker || ''}`
    }).join('\n')
    try { await navigator.clipboard?.writeText(text) } catch {}
  }

  const scanSlate = async () => {
    if (!slateGames.length || loading) return
    setLoading(true)
    setError(null)
    setTickets([])
    setScannedCount(0)
    try {
      const found: ParlayItem[] = []
      for (let i = 0; i < slateGames.length; i += 4) {
        const batch = slateGames.slice(i, i + 4)
        const results = await Promise.all(batch.map(async game => {
          const data = await fetchJsonCached<PropsPanelData>(cacheKey('/api/props', { home: game.homeTeam.abbr, away: game.awayTeam.abbr, sport }), 30_000, 45_000)
          const players = [...(data.away || []), ...(data.home || [])].filter((p: any) => (p.recommendations || []).length)
          return players.flatMap((player: any) => (player.recommendations || []).map((bet: any) => ({ game, player, bet })))
        }))
        found.push(...results.flat())
        setScannedCount(prev => prev + batch.length)
      }
      const matchupByGame = sport === 'mlb'
        ? new Map(await Promise.all(slateGames.map(async game => [game.id, await fetchMlbGameMatchup(game)] as const)))
        : new Map<string, MlbGameMatchup | undefined>()
      const enriched = found.map(item => ({ ...item, matchup: sport === 'mlb' ? scoreMlbBatterMatchup(item, item.game ? matchupByGame.get(item.game.id) : undefined) : undefined }))
      const safePool = buildSafeParlayPool(enriched)
      setTickets(buildParlaySuggestions(safePool))
    } catch (err) {
      setError(err instanceof Error ? err.message : `${sport.toUpperCase()} slate scan failed`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!autoRun || !slateGames.length || autoRunKeyRef.current === slateKey) return
    autoRunKeyRef.current = slateKey
    scanSlate()
  }, [autoRun, slateKey, slateGames.length])

  if (!slateGames.length) return null

  return (
    <>
      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Scanning {scannedCount}/{slateGames.length} games...</div>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ borderRadius: 13, padding: 10, background: 'rgba(0,0,0,0.22)', border: `1px solid ${C.border}`, opacity: 0, animation: 'dominoFadeIn 780ms cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: `${i * 140}ms` }}>
              <div style={{ height: 11, width: i === 0 ? '62%' : i === 1 ? '48%' : '56%', borderRadius: 999, background: 'rgba(247,255,240,0.12)', marginBottom: 8 }} />
              <div style={{ height: 9, width: i === 0 ? '84%' : i === 1 ? '70%' : '78%', borderRadius: 999, background: 'rgba(125,246,255,0.12)' }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div style={{ color: C.gold, fontSize: 11 }}>Slate scan unavailable: {error}</div>
      ) : tickets.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 9 }}>
                  {tickets.map((ticket, idx) => {
                    const avgAsk = Math.round(ticket.items.reduce((sum, x) => sum + Number(x.bet.kalshi?.yesAsk || 0), 0) / ticket.items.length)
                    return (
                      <div key={`mlb-slate-ticket-${ticket.size}-${idx}`} style={{ borderRadius: 13, padding: 10, background: 'rgba(0,0,0,0.24)', border: `1px solid ${C.border}`, opacity: 0, animation: 'dominoFadeIn 860ms cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: `${Math.min(idx * 150, 900)}ms` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 7 }}>
                          <div>
                            <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 950 }}>{ticket.size}-leg slate ticket</div>
                            <div style={{ color: C.cyan, fontSize: 8, fontWeight: 900, marginTop: 2 }}>avg ask {avgAsk}c · screened value legs</div>
                          </div>
                          <button onClick={() => copyTicket(ticket.items)} style={{ borderRadius: 999, padding: '6px 9px', border: `1px solid ${C.borderHot}`, background: 'rgba(125,246,255,0.14)', color: C.green, fontSize: 8, fontWeight: 950, cursor: 'pointer' }}>Copy</button>
                        </div>
                        <div style={{ display: 'grid', gap: 5 }}>
                          {ticket.items.map(item => (
                            <div key={parlayContractKey(item)} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: C.textPrimary, fontSize: 9, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.game?.awayTeam.abbr}@{item.game?.homeTeam.abbr} · {item.player.player}</div>
                                <div style={{ color: C.textSecondary, fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.bet.label}{item.matchup ? ` · matchup ${item.matchup.score}/100` : ''}</div>
                                {item.matchup && <div style={{ marginTop: 4, borderRadius: 8, padding: '5px 6px', background: item.matchup.grade === 'green' ? 'rgba(125,246,255,0.10)' : item.matchup.grade === 'neutral' ? 'rgba(255,215,0,0.09)' : 'rgba(255,68,102,0.08)', border: `1px solid ${item.matchup.grade === 'green' ? 'rgba(125,246,255,0.26)' : item.matchup.grade === 'neutral' ? 'rgba(255,215,0,0.22)' : 'rgba(255,68,102,0.20)'}`, color: item.matchup.grade === 'green' ? C.green : item.matchup.grade === 'neutral' ? C.gold : C.red, fontSize: 9, fontWeight: 900, lineHeight: 1.25 }}>
                                  Matchup {item.matchup.score}/100
                                  <span style={{ color: C.textSecondary, fontWeight: 800 }}> · {item.matchup.note}</span>
                                </div>}
                              </div>
                              <div style={{ color: C.green, fontSize: 8, fontWeight: 950, textAlign: 'right' }}>{item.bet.hits}/{item.bet.games}<br />{item.bet.kalshi?.yesAsk ?? '—'}c</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
        </div>
      ) : (
        <div style={{ color: C.textSecondary, fontSize: 11 }}>No screened Kalshi {sport.toUpperCase()} legs found across this slate yet.</div>
      )}
    </>
  )
}

function SignalsModelPanel({ sport, games, loading, isMobile, autoRun = false }: { sport: SupportedSport | 'ufc'; games: Game[]; loading: boolean; isMobile: boolean; autoRun?: boolean }) {
  const [data, setData] = useState<SignalsPanelData | null>(null)
  const [performance, setPerformance] = useState<SignalPerformanceData | null>(null)
  const [scanning, setScanning] = useState(false)
  const [settling, setSettling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSignal, setSelectedSignal] = useState<SignalTerminalSignal | null>(null)
  const [watchlist, setWatchlist] = useState<WatchItem[]>([])
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([])
  const [signalDeltaFeed, setSignalDeltaFeed] = useState<SignalDelta[]>([])
  const [latestSignalDeltas, setLatestSignalDeltas] = useState<SignalDelta[]>([])
  const [storageHydrated, setStorageHydrated] = useState(false)
  const previousSignalSnapshotsRef = useRef<SignalDeltaSnapshot[]>([])
  const previousWatchSnapshotsRef = useRef<Record<string, WatchSnapshot>>({})
  const autoRunKeyRef = useRef<string | null>(null)
  const supported = sport === 'nba' || sport === 'mlb' || sport === 'nfl'
  const activeGames = games.filter(g => g.status !== 'post')
  const slateKey = [sport, ...activeGames.map(g => g.id)].join('|')

  useEffect(() => {
    setData(null)
    setError(null)
    setScanning(false)
    setSelectedSignal(null)
    setLatestSignalDeltas([])
  }, [slateKey])

  useEffect(() => {
    try {
      const storedWatchlist = localStorage.getItem(SIGNAL_WATCHLIST_STORAGE_KEY)
      if (storedWatchlist) setWatchlist(JSON.parse(storedWatchlist))
      const storedAlerts = localStorage.getItem(SIGNAL_ALERTS_STORAGE_KEY)
      if (storedAlerts) setAlertEvents(JSON.parse(storedAlerts))
    } catch {}
    setStorageHydrated(true)
  }, [])

  useEffect(() => {
    if (!storageHydrated) return
    try { localStorage.setItem(SIGNAL_WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist)) } catch {}
  }, [storageHydrated, watchlist])

  useEffect(() => {
    if (!storageHydrated) return
    try { localStorage.setItem(SIGNAL_ALERTS_STORAGE_KEY, JSON.stringify(alertEvents.slice(0, 30))) } catch {}
  }, [storageHydrated, alertEvents])

  const loadPerformance = async () => {
    if (!supported) return
    try {
      const res = await fetch('/api/signals?sport=' + sport + '&limit=200', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (res.ok) setPerformance(json)
    } catch {}
  }

  useEffect(() => {
    setPerformance(null)
    loadPerformance()
  }, [sport])

  const runSignals = async (force = false) => {
    if (!supported || !activeGames.length || scanning) return
    setScanning(true)
    setError(null)
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport, games: activeGames, force, daily: true }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'signal scan failed')
      const nextSignals: SignalTerminalSignal[] = Array.isArray(json?.signals) ? json.signals.map((signal: ModelSignal) => signalToTerminalSignal(signal)) : []
      const nextSnapshots = nextSignals.map(signalDeltaSnapshot)
      const deltas = computeSignalDeltas(previousSignalSnapshotsRef.current, nextSnapshots, { thresholds: { edge: 1, ask: 1, fairPrice: 1 } })
      previousSignalSnapshotsRef.current = nextSnapshots
      setSelectedSignal(prev => prev ? (nextSignals.find(signal => signal.id === prev.id) ?? prev) : prev)
      setLatestSignalDeltas(deltas)
      if (deltas.length) setSignalDeltaFeed(prev => [...deltas, ...prev].slice(0, 30))
      const watchedActive = watchlist.filter(item => item.active)
      if (watchedActive.length && nextSignals.length) {
        const events: AlertEvent[] = []
        const nextWatchSnapshots: Record<string, WatchSnapshot> = { ...previousWatchSnapshotsRef.current }
        for (const signal of nextSignals) {
          const key = watchKeyForSignal(signal)
          const watchedItem = watchedActive.find(item => item.key === key)
          if (!watchedItem) continue
          const previous = previousWatchSnapshotsRef.current[key] ?? null
          const rules = buildAlertRulesForWatchItem(watchedItem, signal, SIGNAL_ALERT_COOLDOWN_MS)
          const current = watchSnapshotForSignal(signal, previous?.lastAlerts)
          const fired = evaluateAlerts({ previous, current, rules })
          const lastAlerts = { ...(previous?.lastAlerts || {}) }
          for (const event of fired) {
            const rule = rules.find(candidate => candidate.type === event.type)
            if (rule) lastAlerts[alertSignatureForRule(rule)] = event.at
          }
          nextWatchSnapshots[key] = watchSnapshotForSignal(signal, lastAlerts)
          events.push(...fired)
        }
        previousWatchSnapshotsRef.current = nextWatchSnapshots
        if (events.length) setAlertEvents(prev => [...events, ...prev].slice(0, 30))
      }
      setData({ ...json, signals: nextSignals } as SignalsPanelData)
      loadPerformance()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'signal scan unavailable')
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    if (!autoRun || loading || !supported || !activeGames.length || autoRunKeyRef.current === slateKey) return
    autoRunKeyRef.current = slateKey
    runSignals(false)
  }, [autoRun, loading, supported, activeGames.length, slateKey])

  const settleSignals = async () => {
    if (!supported) return
    setSettling(true)
    setError(null)
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport, action: 'settle', limit: 50 }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'settlement failed')
      await loadPerformance()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'settlement unavailable')
    } finally {
      setSettling(false)
    }
  }

  if (!supported || loading || !activeGames.length) {
    const title = !supported ? 'Player Signals are not available for this sport yet.' : loading ? 'Loading slate before Player Signals…' : 'No active games available for Player Signals.'
    const detail = !supported ? 'Switch to NBA, MLB, or NFL from the Sport dock to run player signals.' : loading ? 'The model will appear as soon as the slate finishes loading.' : 'Pick another date or sport with upcoming/live games to run the model.'
    return (
      <section style={{ marginBottom: 0, borderRadius: isMobile ? 18 : 22, padding: 1, background: 'linear-gradient(135deg, rgba(125,246,255,0.34), rgba(168,240,255,0.12), rgba(255,255,255,0.06))', boxShadow: '0 18px 54px rgba(0,0,0,0.30)' }}>
        <div style={{ borderRadius: isMobile ? 17 : 21, padding: isMobile ? 14 : 18, background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 7 }}>Today’s Signals</div>
          <div style={{ color: C.textPrimary, fontSize: isMobile ? 15 : 17, fontWeight: 950, letterSpacing: '-0.03em' }}>{title}</div>
          <div style={{ color: C.textSecondary, fontSize: 11, lineHeight: 1.45, marginTop: 6 }}>{detail}</div>
        </div>
      </section>
    )
  }

  const topSignals = (data?.signals || []).map(signal => signalToTerminalSignal(signal))
  const watchedKeys = new Set(watchlist.filter(item => item.active).map(item => item.key))
  const openMarket = (signal: SignalTerminalSignal) => {
    if (isTrustedMarketUrl(signal.url)) window.open(signal.url, '_blank', 'noopener,noreferrer')
  }
  const toggleWatch = (signal: SignalTerminalSignal) => {
    const key = watchKeyForSignal(signal)
    setWatchlist(prev => {
      const existing = prev.find(item => item.key === key)
      if (existing) return watchlistReducer(prev, { type: 'toggle', key, active: !existing.active })
      return watchlistReducer(prev, { type: 'add', item: { key, id: signal.id, gameId: signal.gameId, player: signal.player, label: signal.label, ticker: signal.ticker ?? undefined, addedAt: new Date().toISOString(), askTarget: finiteSignalNumber(signal.maxBuy) ?? finiteSignalNumber(signal.ask) ?? undefined, edgeTarget: finiteSignalNumber(signal.edge) ?? undefined, minLiquidity: Math.max(5, finiteSignalNumber(signal.askSize ?? signal.liquidity) ?? 5) } })
    })
    previousWatchSnapshotsRef.current[key] = watchSnapshotForSignal(signal, previousWatchSnapshotsRef.current[key]?.lastAlerts)
  }

  return (
    <section style={{ marginBottom: 0, borderRadius: isMobile ? 18 : 22, padding: 1, background: 'linear-gradient(135deg, rgba(125,246,255,0.46), rgba(168,240,255,0.16), rgba(255,255,255,0.08))', boxShadow: '0 18px 54px rgba(0,0,0,0.36)' }}>
      <div style={{ borderRadius: isMobile ? 17 : 21, padding: isMobile ? 12 : 15, background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => runSignals(false)} disabled={scanning} style={{ width: '100%', borderRadius: 999, padding: isMobile ? '12px 14px' : '10px 16px', border: '1px solid ' + C.borderHot, background: scanning ? 'rgba(255,255,255,0.05)' : 'rgba(125,246,255,0.14)', color: scanning ? C.textSecondary : C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', cursor: scanning ? 'default' : 'pointer' }}>
          {scanning ? 'Building board' : data ? 'Refresh Board' : 'Load Today’s Signals'}
        </button>

        {data?.generatedAt && <div style={{ marginTop: 8, color: C.textSecondary, fontSize: 9, textAlign: 'center', fontWeight: 800 }}>Generated {new Date(data.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {data.gamesScanned} games scanned · {data.contractsScored} props checked</div>}

        {error && <div style={{ marginTop: 10, color: C.gold, fontSize: 11 }}>Signals unavailable: {error}</div>}

        {scanning && (
          <div style={{ marginTop: 13, display: 'grid', gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ borderRadius: 13, padding: 10, background: 'rgba(0,0,0,0.22)', border: `1px solid ${C.border}`, opacity: 0, animation: 'dominoFadeIn 780ms cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: `${i * 140}ms` }}>
                <div style={{ height: 11, width: i === 0 ? '58%' : i === 1 ? '46%' : '66%', borderRadius: 999, background: 'rgba(247,255,240,0.12)', marginBottom: 8 }} />
                <div style={{ height: 9, width: i === 0 ? '82%' : i === 1 ? '74%' : '64%', borderRadius: 999, background: 'rgba(125,246,255,0.12)' }} />
              </div>
            ))}
          </div>
        )}

        {data && (
          <div style={{ marginTop: 13, display: 'grid', gap: isMobile ? 8 : 9 }}>
            {topSignals.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: isMobile ? 8 : 9 }}>
                {topSignals.slice(0, 8).map((signal, signalIdx) => (
                  <div key={signal.id} style={{ opacity: 0, animation: 'dominoFadeIn 860ms cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: `${Math.min(signalIdx * 90, 540)}ms` }}>
                    <SignalTerminalCard signal={signal} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: C.textSecondary, fontSize: 11 }}>No clean signals passed the current model gate on this slate.</div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function GameMarketFallback({ game }: { game: Game }) {
  const markets = [
    game.hasWinnerOdds && {
      label: 'Moneyline',
      url: game.polyWinnerUrl,
      rows: [
        { team: game.awayTeam.abbr, bet: 'WIN', price: pct(game.awayWinOdds), hot: game.awayWinOdds >= 0.55 },
        { team: game.homeTeam.abbr, bet: 'WIN', price: pct(game.homeWinOdds), hot: game.homeWinOdds >= 0.55 },
      ],
    },
    game.hasSpreadOdds && {
      label: 'Spread',
      url: game.polySpreadUrl,
      rows: [
        { team: game.awayTeam.abbr, bet: game.spreadLine < 0 ? `+${-game.spreadLine}` : `${-game.spreadLine}`, price: pct(game.spreadLine < 0 ? game.spreadAwayOdds : game.spreadHomeOdds), hot: (game.spreadLine < 0 ? game.spreadAwayOdds : game.spreadHomeOdds) >= 0.55 },
        { team: game.homeTeam.abbr, bet: game.spreadLine < 0 ? `${game.spreadLine}` : `+${game.spreadLine}`, price: pct(game.spreadLine < 0 ? game.spreadHomeOdds : game.spreadAwayOdds), hot: (game.spreadLine < 0 ? game.spreadHomeOdds : game.spreadAwayOdds) >= 0.55 },
      ],
    },
    game.hasTotalOdds && {
      label: 'Total',
      url: game.polyTotalUrl,
      rows: [
        { team: 'OVER', bet: String(game.totalLine), price: pct(game.overOdds), hot: game.overOdds >= 0.55 },
        { team: 'UNDER', bet: String(game.totalLine), price: pct(game.underOdds), hot: game.underOdds >= 0.55 },
      ],
    },
  ].filter(Boolean) as Array<{ label: string; url: string | null; rows: Array<{ team: string; bet: string; price: number; hot: boolean }> }>

  if (!markets.length) {
    return <p style={{ color: C.textSecondary, fontSize: 11, lineHeight: 1.45 }}>Kalshi has not listed player props or game markets for this game yet.</p>
  }

  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Game markets live</div>
        <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>player props not listed yet</div>
      </div>
      {markets.map(market => (
        <a key={market.label} href={market.url || undefined} target="_blank" rel="noopener noreferrer" onClick={e => { if (!market.url) e.preventDefault() }} style={{ display: 'block', textDecoration: 'none', borderRadius: 14, padding: 11, background: 'rgba(125,246,255,0.045)', border: `1px solid ${market.url ? C.borderHot : C.border}`, cursor: market.url ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 950 }}>{market.label}</div>
            <div style={{ color: market.url ? C.green : C.textSecondary, fontSize: 8, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{market.url ? 'Open market' : 'No link'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {market.rows.map(row => (
              <div key={`${market.label}-${row.team}-${row.bet}`} style={{ borderRadius: 11, padding: '8px 9px', background: row.hot ? 'rgba(125,246,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${row.hot ? C.borderHot : C.border}` }}>
                <div style={{ color: row.hot ? C.green : C.textPrimary, fontSize: 11, fontWeight: 950 }}>{row.team} {row.bet}</div>
                <div style={{ color: C.textSecondary, fontSize: 9, fontWeight: 900, marginTop: 2 }}>{row.price}%</div>
              </div>
            ))}
          </div>
        </a>
      ))}
    </div>
  )
}

function formatLastGameMinutes(player: any): string | null {
  const minutes = Number(player?.lastGameMinutes ?? player?.last12?.[0]?.stats?.minutes)
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return `${Math.round(minutes)} min last game`
}

function LiveGameDrawer({ game, sport, live, loading, error, updatedAt, activeTab, onTabChange, lineups }: {
  game: Game
  sport: SupportedSport
  live: LiveGameData | null
  loading: boolean
  error: string | null
  updatedAt: Date | null
  activeTab: 'feed' | 'box' | 'lineups'
  onTabChange: (tab: 'feed' | 'box' | 'lineups') => void
  lineups: LineupsData | null
}) {
  const feed = getLiveFeedItems(live)
  const awayRows = getLiveBoxRows(live, 'away')
  const homeRows = getLiveBoxRows(live, 'home')
  const awayScore = live?.score?.away ?? live?.awayScore ?? game.awayTeam.score
  const homeScore = live?.score?.home ?? live?.homeScore ?? game.homeTeam.score
  const periodLabel = sport === 'nba' ? 'Quarter' : sport === 'mlb' ? 'Inning' : 'Period'
  const progress = [
    sport === 'mlb' ? live?.inningHalf : '',
    live?.inning ? periodLabel + ' ' + live.inning : '',
    live?.period && !live?.inning ? periodLabel + ' ' + live.period : '',
    live?.clock,
  ].filter(Boolean).join(' · ')
  const tabs: Array<{ key: 'feed' | 'box' | 'lineups'; label: string }> = [{ key: 'feed', label: 'Live feed' }, { key: 'box', label: 'Live stats' }, { key: 'lineups', label: 'Lineups' }]
  const situation = live?.situation || {}
  const countText = [situation.balls, situation.strikes].every(v => v != null) ? `${situation.balls}-${situation.strikes}` : '-'
  const outsText = situation.outs != null ? String(situation.outs) : '-'
  const inningText = [
    sport === 'mlb' ? (situation.inningHalf || live?.inningHalf) : '',
    situation.inning || live?.inning ? periodLabel + ' ' + (situation.inning || live?.inning) : '',
    !situation.inning && !live?.inning && live?.period ? periodLabel + ' ' + live.period : '',
  ].filter(Boolean).join(' ')
  const pitcherLine = situation.pitcherLine || {}
  const pitcherLineText = [
    pitcherLine.innings ? `IP ${pitcherLine.innings}` : '',
    pitcherLine.strikeouts != null ? `K ${pitcherLine.strikeouts}` : '',
    pitcherLine.earnedRuns != null ? `ER ${pitcherLine.earnedRuns}` : '',
    pitcherLine.pitchCount ? `PC ${pitcherLine.pitchCount}` : '',
  ].filter(Boolean).join(' · ')
  const baseSlots = [
    { label: '1B', runner: situation.bases?.first, occupied: situation.onFirst },
    { label: '2B', runner: situation.bases?.second, occupied: situation.onSecond },
    { label: '3B', runner: situation.bases?.third, occupied: situation.onThird },
  ]
  const nextText = arrayFromUnknown(situation.nextBatters).map((p: any) => compactText(p?.name || p)).filter(Boolean).join(' · ')
  const statColumns = sport === 'nba'
    ? [
      { key: 'points', label: 'PTS' },
      { key: 'rebounds', label: 'REB' },
      { key: 'assists', label: 'AST' },
      { key: 'threes', label: '3PT' },
      { key: 'fieldGoals', label: 'FG' },
      { key: 'freeThrows', label: 'FT' },
      { key: 'steals', label: 'STL' },
      { key: 'blocks', label: 'BLK' },
      { key: 'turnovers', label: 'TO' },
      { key: 'minutes', label: 'MIN' },
    ]
    : [
      { key: 'position', label: 'POS' },
      { key: 'hits', label: 'H' },
      { key: 'runs', label: 'R' },
      { key: 'RBIs', label: 'RBI' },
      { key: 'homeRuns', label: 'HR' },
      { key: 'walks', label: 'BB' },
      { key: 'strikeouts', label: 'K' },
      { key: 'totalBases', label: 'TB' },
      { key: 'atBats', label: 'AB' },
      { key: 'innings', label: 'IP' },
      { key: 'earnedRuns', label: 'ER' },
      { key: 'pitchCount', label: 'PC' },
      { key: 'era', label: 'ERA' },
    ]
  const readLiveStat = (row: any, key: string) => {
    if (key === 'position') return row?.position || row?.pos || (row?.kind === 'pitching' ? 'P' : '-')
    const stats = row?.stats || row?.statistics || row?.totals || row || {}
    const raw = stats[key] ?? stats[key.toUpperCase()] ?? stats[key.toLowerCase()]
    const value = typeof raw === 'object' ? raw?.displayValue ?? raw?.value : raw
    return value == null || value === '' ? '-' : String(value)
  }
  const renderLiveStatsTable = (section: { label: string; rows: any[] }) => {
    const rows = section.rows.length ? section.rows : [{ name: loading ? 'Loading live stats' : 'Live stats pending' }]
    const gridTemplateColumns = `minmax(96px, 1.25fr) repeat(${statColumns.length}, minmax(38px, 0.5fr))`
    return (
      <div key={section.label} style={{ minWidth: 0, borderRadius: 12, padding: 10, background: 'rgba(0,0,0,0.18)', border: '1px solid ' + C.border }}>
        <div style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 7 }}>{section.label}</div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: sport === 'nba' ? 520 : 660 }}>
            <div style={{ display: 'grid', gridTemplateColumns, gap: 0, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: C.textSecondary, fontSize: 7, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Player</div>
              {statColumns.map(col => (
                <div key={col.key} style={{ color: C.textSecondary, fontSize: 7, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>{col.label}</div>
              ))}
            </div>
            {rows.map((row, idx) => {
              const name = compactText(row?.name || row?.player || row?.displayName || row?.athlete)
              return (
                <div key={(name || 'row') + '-' + idx} style={{ display: 'grid', gridTemplateColumns, gap: 0, padding: '6px 0', borderTop: idx ? '1px solid rgba(255,255,255,0.055)' : 'none', alignItems: 'center' }}>
                  <div style={{ color: name ? C.textPrimary : C.textSecondary, fontSize: 9, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 6 }}>{name || 'Player'}</div>
                  {statColumns.map(col => (
                    <div key={col.key} style={{ color: name ? C.green : C.textSecondary, fontSize: 9, fontWeight: 900, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{name ? readLiveStat(row, col.key) : '-'}</div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 16, padding: 12, background: 'linear-gradient(145deg, rgba(255,63,95,0.075), rgba(125,246,255,0.035))', border: '1px solid rgba(255,255,255,0.12)', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: game.status === 'in' ? C.red : C.green, boxShadow: '0 0 10px ' + (game.status === 'in' ? C.red : C.green), animation: game.status === 'in' ? 'liveDotPulse 1.2s ease-in-out infinite' : undefined }} />
            <span style={{ color: game.status === 'in' ? C.red : C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Game live</span>
          </div>
          <div style={{ color: C.textPrimary, fontSize: 18, fontWeight: 950, marginTop: 3 }}>{game.awayTeam.abbr} {awayScore || '-'} · {game.homeTeam.abbr} {homeScore || '-'}</div>
          <div style={{ color: C.textSecondary, fontSize: 9, marginTop: 2 }}>{progress || live?.statusLabel || live?.status || 'Live details pending'} · <UpdatedAgeLabel updatedAt={updatedAt} prefix="refreshed" empty={loading ? 'refreshing' : 'not refreshed'} /></div>
        </div>
        <div style={{ display: 'none', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map(tab => {
            const active = activeTab === tab.key
            return <button key={tab.key} onClick={() => onTabChange(tab.key)} style={{ borderRadius: 999, padding: '7px 9px', border: '1px solid ' + (active ? C.borderHot : C.border), background: active ? 'rgba(125,246,255,0.14)' : 'rgba(255,255,255,0.035)', color: active ? C.green : C.textSecondary, fontSize: 8, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{tab.label}</button>
          })}
        </div>
      </div>

      {error ? (
        <div style={{ color: C.gold, fontSize: 10, lineHeight: 1.45 }}>Live drawer waiting on /api/game-live: {error}</div>
      ) : activeTab === 'feed' ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ borderRadius: 12, padding: 10, background: 'rgba(0,0,0,0.24)', border: '1px solid rgba(125,246,255,0.18)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 9 }}>
              {(sport === 'nba'
                ? [{ label: 'Quarter', value: inningText || '-' }, { label: 'Clock', value: live?.clock || '-' }, { label: 'Status', value: live?.statusLabel || live?.status || '-' }]
                : [{ label: periodLabel, value: inningText || '-' }, { label: 'Count', value: countText }, { label: 'Outs', value: outsText }]
              ).map(item => (
                <div key={item.label} style={{ minWidth: 0, borderRadius: 9, padding: '7px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border }}>
                  <div style={{ color: C.textSecondary, fontSize: 7, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 950, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginBottom: 9 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 950, letterSpacing: '0.1em', textTransform: 'uppercase' }}>At bat</div>
                <div style={{ color: situation.batter ? C.green : C.textSecondary, fontSize: 11, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{situation.batter || '-'}</div>
                <div style={{ color: C.textSecondary, fontSize: 8, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Next: {nextText || '-'}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 950, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pitching</div>
                <div style={{ color: situation.pitcher ? C.green : C.textSecondary, fontSize: 11, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{situation.pitcher || '-'}</div>
                <div style={{ color: C.textSecondary, fontSize: 8, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[situation.pitcherRecord, pitcherLineText].filter(Boolean).join(' · ') || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
              {baseSlots.map(base => {
                const runner = compactText(base.runner?.name || base.runner)
                return (
                  <div key={base.label} style={{ minWidth: 0, borderRadius: 9, padding: '6px 7px', background: base.occupied ? 'rgba(125,246,255,0.10)' : 'rgba(255,255,255,0.035)', border: '1px solid ' + (base.occupied ? C.borderHot : C.border) }}>
                    <div style={{ color: base.occupied ? C.green : C.textSecondary, fontSize: 8, fontWeight: 950 }}>{base.label}</div>
                    <div style={{ color: base.occupied ? C.textPrimary : C.textSecondary, fontSize: 9, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{base.occupied ? (runner || 'Occupied') : 'Empty'}</div>
                  </div>
                )
              })}
            </div>
          </div>
          {(feed.length ? feed : [{ text: loading ? 'Refreshing live feed...' : 'No live events returned yet.' }]).map((item, idx) => (
            <div key={'feed-' + idx} style={{ borderRadius: 10, padding: '8px 9px', background: 'rgba(0,0,0,0.18)', border: '1px solid ' + C.border }}>
              <div style={{ color: idx === 0 && feed.length ? C.green : C.textPrimary, fontSize: 10, fontWeight: 850, lineHeight: 1.35 }}>{compactText(item) || compactText(item?.play) || compactText(item?.event) || 'Live event'}</div>
              {(item?.period || item?.inning || item?.clock) && <div style={{ color: C.textSecondary, fontSize: 8, marginTop: 3 }}>{[item.inning, item.period, item.clock].filter(Boolean).join(' · ')}</div>}
            </div>
          ))}
        </div>
      ) : activeTab === 'box' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          {[{ label: game.awayTeam.abbr, rows: awayRows }, { label: game.homeTeam.abbr, rows: homeRows }].map(renderLiveStatsTable)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          {[{ label: game.awayTeam.abbr, rows: arrayFromUnknown(live?.lineups?.away).length ? arrayFromUnknown(live?.lineups?.away) : (lineups?.away || []) }, { label: game.homeTeam.abbr, rows: arrayFromUnknown(live?.lineups?.home).length ? arrayFromUnknown(live?.lineups?.home) : (lineups?.home || []) }].map(section => (
            <div key={section.label} style={{ minWidth: 0, borderRadius: 12, padding: 10, background: 'rgba(0,0,0,0.18)', border: '1px solid ' + C.border }}>
              <div style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{section.label}</div>
              {(section.rows.length ? section.rows.slice(0, 9) : [{ name: 'Lineup pending' }]).map((row: any, idx: number) => (
                <div key={section.label + '-lineup-' + idx} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto', gap: 6, padding: '4px 0', borderTop: idx ? '1px solid rgba(255,255,255,0.055)' : 'none' }}>
                  <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>{idx + 1}</span>
                  <span style={{ color: C.textPrimary, fontSize: 10, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{compactText(row?.name || row?.player || row?.athlete) || 'Player'}</span>
                  <span style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900 }}>{row?.position || row?.pos || ''}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RowGroup({ games, cols, activeGame, panel, analysisLoadingGameId, onAnalysisDone, onLogBet, drift, onOpenIntel, onOpenAnalysis, bankroll }: {
  games: Game[]
  cols: number
  activeGame: Game | null
  panel: 'intel' | 'analysis' | null
  analysisLoadingGameId?: string | null
  onAnalysisDone?: () => void
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
            isAnalyzing={analysisLoadingGameId === g.id}
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
          <AnalysisPanel game={activeGame} onClose={() => onOpenAnalysis(activeGame)} onDone={onAnalysisDone} />
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
    let cancelled = false
    fetchJsonCached<PropsPanelData>(cacheKey('/api/props', { home: game.homeTeam.abbr, away: game.awayTeam.abbr, sport: 'nfl' }), 30_000)
      .then(d => { if (!cancelled) setProps(d) })
      .catch(() => { if (!cancelled) setProps(null) })
    return () => { cancelled = true }
  }, [game])

  const items = [
    { label: 'Market match', value: matched ? `${readiness.matchLabel} · ${readiness.matchQuality}%` : 'No Polymarket match yet', color: matched && readiness.matchQuality >= 55 ? C.green : C.gold },
    { label: 'Winner market', value: game.hasWinnerOdds ? `${game.awayTeam.abbr} ${(game.awayWinOdds * 100).toFixed(1)}¢ / ${game.homeTeam.abbr} ${(game.homeWinOdds * 100).toFixed(1)}¢` : 'Waiting', color: game.hasWinnerOdds ? C.cyan : C.textSecondary },
    { label: 'Spread gap', value: spreadGap != null ? `${spreadGap.toFixed(1)} pts` : 'Need market spread', color: spreadGap != null && spreadGap >= 1 ? C.green : C.textSecondary },
    { label: 'Total gap', value: totalGap != null ? `${totalGap.toFixed(1)} pts` : 'Need market total', color: totalGap != null && totalGap >= 1.5 ? C.green : C.textSecondary },
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
            <div key={item.label} style={{ borderRadius: 14, padding: 12, background: 'rgba(125,246,255,0.045)', border: '1px solid rgba(125,246,255,0.14)' }}>
              <div style={{ color: C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ color: item.color, fontSize: 14, fontWeight: 900, marginTop: 5 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {intel && (
          <div style={{ borderRadius: 16, padding: 14, background: 'rgba(125,246,255,0.035)', border: '1px solid rgba(125,246,255,0.16)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase' }}>NFL Prep Score</div>
              <div style={{ color: intel.prepScore >= 70 ? C.green : C.gold, fontSize: 20, fontWeight: 950 }}>{intel.prepScore}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
              {intel.checklist.map(item => (
                <div key={item.label} style={{ borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${item.status === 'edge' ? 'rgba(125,246,255,0.35)' : C.border}` }}>
                  <div style={{ color: item.status === 'edge' ? C.green : item.status === 'ready' ? C.cyan : C.gold, fontSize: 8, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ color: 'rgba(247,255,240,0.84)', fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>{item.value}</div>
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
            {[['Kalshi scanned', props.marketSummary.scanned], ['Game markets', props.marketSummary.gameMatched], ['Executable asks', props.marketSummary.executableMatched ?? props.marketSummary.gameMatched], ['Value-priced', props.marketSummary.playableMatched]].map(([label, value]) => (
              <span key={label} style={{ background: 'rgba(125,246,255,0.055)', border: '1px solid rgba(125,246,255,0.16)', borderRadius: 999, padding: '4px 9px', color: label === 'Value-priced' && Number(value) > 0 ? C.green : C.textSecondary, fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}: <span style={{ color: C.textPrimary }}>{value}</span></span>
            ))}
          </div>
        )}

        {props?.available && (
          <div style={{ borderRadius: 16, padding: 14, background: 'rgba(125,246,255,0.035)', border: '1px solid rgba(125,246,255,0.16)', marginBottom: 12 }}>
            <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>NFL Player Prop Reads</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {[...(props.away || []), ...(props.home || [])].filter((p: any) => p.bestBet).slice(0, 8).map((p: any) => (
                <div key={`${p.team}-${p.player}`} style={{ borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${p.bestBet?.quality === 'bet' ? 'rgba(125,246,255,0.32)' : C.border}` }}>
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
                  <div style={{ color: 'rgba(247,255,240,0.74)', fontSize: 10, lineHeight: 1.45, marginTop: 7 }}>{p.bestBet?.hits}/{p.bestBet?.games} hit · avg {p.bestBet?.avg}. {p.bestBet?.explanation}</div>
                {p.bestBet?.kalshi && <ExactKalshiBetButton player={p.player} bet={p.bestBet} compact />}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4, marginTop: 8 }}>
                    {(p.last12 || []).slice(0, 12).map((g: any, idx: number) => {
                      const metric = p.bestBet?.metric
                      const val = metric === 'passing yards' ? g.stats.passingYards : metric === 'passing TDs' ? g.stats.passingTouchdowns : metric === 'rushing yards' ? g.stats.rushingYards : metric === 'receptions' ? g.stats.receptions : g.stats.receivingYards
                      const hit = val >= p.bestBet?.line
                      return <div key={`${g.eventId}-${idx}`} style={{ borderRadius: 6, padding: '4px 2px', textAlign: 'center', background: hit ? 'rgba(125,246,255,0.13)' : 'rgba(255,255,255,0.04)', color: hit ? C.green : C.textSecondary, fontSize: 9, fontWeight: 800 }}>{val}</div>
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
              <div key={x} style={{ color: 'rgba(247,255,240,0.78)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
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
function GameCard({ game, onLogBet, drift, isActive, isAnalyzing, onOpenIntel, onOpenAnalysis, bankroll }: {
  game: Game
  onLogBet: (bet: Omit<BetLog, 'id' | 'createdAt' | 'stake' | 'result'>) => void
  drift?: OddsDrift
  isActive?: boolean
  isAnalyzing?: boolean
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
  const marketReadiness = getMarketReadiness(game)
  const hasTradeLink = Boolean(game.polyWinnerUrl || game.polySpreadUrl || game.polyTotalUrl)
  const marketReady = marketReadiness.matched && marketReadiness.matchQuality >= 55 && hasTradeLink && !marketReadiness.stale
  const readinessTone = marketReady ? 'execute' : marketReadiness.matched ? 'watch' : 'blocked'
  const readinessLabel = marketReady
    ? 'Market ready · links live'
    : marketReadiness.matched
      ? `Watch only · match ${marketReadiness.matchQuality}%`
      : 'Watch only · no market'

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
    background: 'linear-gradient(145deg, rgba(18,7,8,0.96), rgba(5,5,0,0.94))',
    border: '1px solid rgba(255,63,95,0.52)',
    borderRadius: 24,
    animation: 'liveBorderPulse 2s ease-in-out infinite',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
  } : isActive ? {
    position: 'relative' as const,
    zIndex: 1,
    background: SURFACE.panel,
    border: `1px solid ${C.borderHot}`,
    borderRadius: 24,
    boxShadow: `0 0 26px rgba(125,246,255,0.18), ${SURFACE.shadow}`,
    outline: 'none',
  } : {
    position: 'relative' as const,
    zIndex: 1,
    background: SURFACE.panel,
    border: `1px solid ${SURFACE.border}`,
    borderRadius: 24,
    outline: 'none',
    boxShadow: SURFACE.shadow,
  }

  return (
    <>
      <div className="mb-4" style={{ position: 'relative' }}>
        <div className={isLive ? '' : 'holo-projection holo-scanlines rounded-3xl'} style={{
          ...cardStyle,
          animation: isAnalyzing ? 'analysisCardBlink 0.94s steps(1, end) infinite' : cardStyle.animation,
          border: isAnalyzing ? `1px solid ${C.green}` : cardStyle.border,
          boxShadow: isAnalyzing ? `0 0 56px rgba(125,246,255,0.48), 0 18px 70px rgba(0,0,0,0.75), inset 0 0 28px rgba(125,246,255,0.10)` : cardStyle.boxShadow,
        }}>
          {isAnalyzing && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none', borderRadius: 24, overflow: 'hidden', background: 'rgba(3,5,0,0.16)', mixBlendMode: 'screen' }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 0.55, backgroundImage: 'repeating-linear-gradient(0deg, rgba(125,246,255,0.16) 0px, rgba(125,246,255,0.16) 1px, transparent 1px, transparent 4px)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '34%', background: 'linear-gradient(180deg, transparent, rgba(125,246,255,0.28), transparent)', animation: 'tvStaticSweep 0.72s linear infinite' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '28%', height: 22, background: 'rgba(125,246,255,0.18)', animation: 'tvGlitchSlice 0.94s steps(1, end) infinite' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '61%', height: 14, background: 'rgba(255,255,255,0.16)', animation: 'tvGlitchSlice 0.71s steps(1, end) infinite reverse' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ padding: '8px 12px', borderRadius: 999, background: 'rgba(3,5,0,0.88)', border: `1px solid ${C.borderHot}`, color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase', boxShadow: '0 0 24px rgba(125,246,255,0.42)' }}>Signal analyzing…</div>
              </div>
            </div>
          )}
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
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 8, background: 'rgba(231,238,226,0.1)', border: '1px solid rgba(231,238,226,0.3)' }}>
                        <span style={{ fontSize: 8 }}>📈</span>
                        <span style={{ color: C.purple, fontSize: 8, fontWeight: 800 }}>Spread: {lineMovement.spread}</span>
                      </div>
                    )}
                    {lineMovement.total && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 8, background: 'rgba(231,238,226,0.1)', border: '1px solid rgba(231,238,226,0.3)' }}>
                        <span style={{ fontSize: 8 }}>📈</span>
                        <span style={{ color: C.purple, fontSize: 8, fontWeight: 800 }}>Total: {lineMovement.total}</span>
                      </div>
                    )}
                  </div>
                )}
                <span style={{
                  background: readinessTone === 'execute' ? 'rgba(125,246,255,0.10)' : readinessTone === 'watch' ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${readinessTone === 'execute' ? 'rgba(125,246,255,0.32)' : readinessTone === 'watch' ? 'rgba(255,215,0,0.30)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 999, padding: '2px 8px',
                  color: readinessTone === 'execute' ? C.green : readinessTone === 'watch' ? C.gold : C.textSecondary,
                  fontSize: 8, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase'
                }}>{readinessLabel}</span>
                {hasEdge && (
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowEdgeInfo(v => !v)} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                      padding: '3px 8px', borderRadius: 8,
                      background: 'rgba(125,246,255,0.1)', border: `1px solid ${C.borderHot}`,
                      color: C.cyan, textTransform: 'uppercase',
                      boxShadow: `0 0 12px ${C.cyan}22`, cursor: 'pointer'
                    }}>⚡ LINE GAP</button>
                    {showEdgeInfo && (
                      <div style={{
                        position: 'absolute', left: 0, top: 30, zIndex: 30, width: 280,
                        background: 'rgba(8,12,5,0.98)', border: `1px solid ${C.borderHot}`,
                        borderRadius: 16, padding: 16,
                        boxShadow: `0 0 40px rgba(125,246,255,0.15), 0 16px 40px rgba(0,0,0,0.8)`,
                      }}>
                        <p style={{ color: C.cyan, fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ POLYMARKET LINE DISCREPANCY</p>
                        <p style={{ color: C.textPrimary, fontSize: 12, lineHeight: 1.6, opacity: 0.8, marginBottom: 10 }}>Polymarket's line differs from the reference market. This gap is a potential edge.</p>
                        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                          <p style={{ color: C.textSecondary, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>How to exploit it:</p>
                          {['Bet the reference-aligned side on Polymarket when the price still lags.', 'Arbitrage: bet both sides across platforms to lock guaranteed profit.', 'Move fast — these gaps close within hours.'].map((t, i) => (
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
                  background: isActive ? 'rgba(125,246,255,0.12)' : 'rgba(125,246,255,0.06)',
                  border: `1px solid ${isActive ? C.borderHot : 'rgba(125,246,255,0.2)'}`,
                  color: isActive ? C.cyan : C.textSecondary, cursor: 'pointer', transition: 'all 0.2s',
                }}>📊 Intel</button>
                <button onClick={() => onOpenAnalysis && onOpenAnalysis()} style={{
                  fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '4px 12px', borderRadius: 10, fontWeight: 700,
                  background: 'rgba(231,238,226,0.1)',
                  border: '1px solid rgba(231,238,226,0.25)',
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
                  <TeamBadge abbr={game.awayTeam.abbr} name={game.awayTeam.name} sport={game.sport} size={isMobile ? 30 : 36} />
                  <span style={{ color: C.textPrimary, fontSize: 28, fontWeight: 900 }}>{game.awayTeam.score}</span>
                </div>
                <span style={{ color: C.textSecondary, fontSize: 12 }}>—</span>
                <div className="flex items-center gap-2.5">
                  <span style={{ color: C.textPrimary, fontSize: 28, fontWeight: 900 }}>{game.homeTeam.score}</span>
                  <TeamBadge abbr={game.homeTeam.abbr} name={game.homeTeam.name} sport={game.sport} size={36} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-1 mb-4">
                <div className="flex items-center gap-2.5">
                  <TeamBadge abbr={game.awayTeam.abbr} name={game.awayTeam.name} sport={game.sport} size={32} compact />
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
                  <TeamBadge abbr={game.homeTeam.abbr} name={game.homeTeam.name} sport={game.sport} size={32} compact />
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
                  if (edgeScore <= 0.02 || !marketReady) return null
                  const betAmt = (bankroll || 0) * halfKelly
                  return (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 8,
                        background: 'rgba(125,246,255,0.07)', border: '1px solid rgba(125,246,255,0.25)',
                      }}>
                        <span style={{ fontSize: 9 }}>📐</span>
                        <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 700 }}>Sizing hint · verify ask:</span>
                        <span style={{ color: C.green, fontSize: 9, fontWeight: 900 }}>{(halfKelly * 100).toFixed(1)}% of bankroll</span>
                        {bankroll ? (
                          <span style={{ color: C.textSecondary, fontSize: 9 }}>→ <span style={{ color: C.green, fontWeight: 800 }}>${betAmt.toFixed(2)}</span></span>
                        ) : null}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 8,
                        background: 'rgba(231,238,226,0.08)', border: '1px solid rgba(231,238,226,0.2)',
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
                    <TeamBadge abbr={game.awayTeam.abbr} name={game.awayTeam.name} sport={game.sport} size={20} />
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
                    <TeamBadge abbr={game.homeTeam.abbr} name={game.homeTeam.name} sport={game.sport} size={20} />
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
    <div style={{ width: '100%', background: 'rgba(2,2,15,0.97)', borderTop: `1px solid rgba(125,246,255,0.3)`, padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, maxWidth: 900, margin: '0 auto 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: UFC_RED, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>◈ FIGHT INTEL</span>
          <span style={{ color: C.textSecondary, fontSize: 10 }}>— {a.name} vs {b.name}</span>
        </div>
        <button onClick={onClose} style={{ color: C.textSecondary, fontSize: 16, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, maxWidth: 1200, margin: '0 auto' }}>

        {/* Fighter comparison */}
        <div style={{ background: 'rgba(8,12,5,0.9)', border: `1px solid rgba(125,246,255,0.2)`, borderRadius: 16, padding: 20, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
            <span style={{ fontSize: 12 }}>⚔️</span>
            <span style={{ color: 'rgba(125,246,255,0.5)', fontSize: 10, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' }}>Fighter Stats Comparison</span>
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
          <div style={{ gridColumn: '1 / -1' }}>
            <AnalyzingLoader title="Analyzing fight" subtitle="XAI is checking fighter style, range, grappling paths, market odds, and upset triggers." />
          </div>
        ) : intel ? (
          <>
            {/* Top row: Verdict + Method */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ flex: 3, minWidth: 220, background: 'linear-gradient(135deg, rgba(125,246,255,0.1), rgba(231,238,226,0.05))', border: '1px solid rgba(125,246,255,0.3)', borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>🎯 VERDICT</p>
                <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700, lineHeight: 1.55 }}>{intel.verdict}</p>
              </div>
              {intel.prediction && (
                <div style={{ flex: 1, minWidth: 120, background: 'rgba(125,246,255,0.08)', border: '1px solid rgba(125,246,255,0.25)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>METHOD</p>
                  <p style={{ color: UFC_RED, fontSize: 14, fontWeight: 900 }}>{intel.prediction}</p>
                </div>
              )}
            </div>

            {/* Bottom row: Striking | Grappling | Key Factors | Watch For */}
            {intel.striking && (
              <div style={{ background: 'rgba(8,12,5,0.9)', border: `1px solid rgba(125,246,255,0.15)`, borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>👊 STRIKING</p>
                <p style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.6, opacity: 0.9 }}>{intel.striking}</p>
              </div>
            )}
            {intel.grappling && (
              <div style={{ background: 'rgba(8,12,5,0.9)', border: `1px solid rgba(125,246,255,0.15)`, borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ color: C.textSecondary, fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>🤼 GRAPPLING</p>
                <p style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.6, opacity: 0.9 }}>{intel.grappling}</p>
              </div>
            )}
            {intel.keyFactors?.length > 0 && (
              <div style={{ background: 'rgba(8,12,5,0.9)', border: `1px solid rgba(231,238,226,0.2)`, borderRadius: 14, padding: '14px 16px' }}>
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
          <div style={{ background: 'rgba(8,12,5,0.9)', border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, gridColumn: '1 / -1' }}>
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
  const statusBg = fight.status === 'in' ? 'rgba(125,246,255,0.10)' : fight.status === 'post' ? 'rgba(255,255,255,0.05)' : 'rgba(255,215,0,0.10)'
  const statusBorder = fight.status === 'in' ? 'rgba(125,246,255,0.35)' : fight.status === 'post' ? 'rgba(255,255,255,0.12)' : 'rgba(255,215,0,0.35)'
  const statusLabel = fight.status === 'in' ? (fight.statusDetail || 'LIVE / PRE-FIGHT') : fight.status === 'post' ? 'FINAL' : (fight.statusDetail || 'SCHEDULED')
  const { fighterA: a, fighterB: b, result } = fight

  const RankBadge = ({ r }: { r: number | null }) => r !== null ? (
    <span style={{ background: 'rgba(125,246,255,0.15)', border: `1px solid rgba(125,246,255,0.4)`, borderRadius: 6, padding: '1px 6px', color: UFC_RED, fontSize: 9, fontWeight: 900 }}>
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
      background: isActive ? 'rgba(125,246,255,0.06)' : 'rgba(8,12,5,0.85)',
      border: `1px solid ${isActive ? 'rgba(125,246,255,0.5)' : fight.isMainEvent ? 'rgba(125,246,255,0.3)' : C.border}`,
      boxShadow: fight.isMainEvent ? `0 0 30px rgba(125,246,255,0.1)` : 'none',
      backdropFilter: 'blur(24px)',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }} onClick={onOpenIntel}>
      {/* Bout header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: fight.isMainEvent ? `rgba(125,246,255,0.15)` : 'rgba(255,255,255,0.06)',
          border: `1px solid ${boutColor}`,
          borderRadius: 8, padding: '2px 10px',
          color: boutColor, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
        }}>{boutLabel}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 6, padding: '1px 7px', color: statusColor, fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{statusLabel}</span>
          {fight.isTitleFight && <span style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)', borderRadius: 6, padding: '1px 7px', color: C.gold, fontSize: 8, fontWeight: 900 }}>🏆 TITLE</span>}
          <span style={{ color: C.textSecondary, fontSize: 10 }}>{fight.weightClass}</span>
        </div>
        <button onClick={e => { e.stopPropagation(); onOpenIntel() }} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 8, background: 'rgba(125,246,255,0.1)', border: `1px solid rgba(125,246,255,0.3)`, color: UFC_RED, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.08em' }}>📊 INTEL</button>
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
          <p style={{ color: C.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 12, opacity: 0.75 }}>WATCH ONLY · no Polymarket market matched yet</p>
        )
        const lean = marketLean(fight)
        const hasExecutableLink = Boolean(p?.polyWinnerUrl || p?.polyTotalUrl)
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8, padding: '7px 10px', borderRadius: 12, background: hasExecutableLink ? 'rgba(125,246,255,0.07)' : 'rgba(255,215,0,0.07)', border: `1px solid ${hasExecutableLink ? 'rgba(125,246,255,0.25)' : 'rgba(255,215,0,0.25)'}` }}>
              <span style={{ color: hasExecutableLink ? C.green : C.gold, fontSize: 8, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{hasExecutableLink ? 'Market ready · linked chips executable' : 'Watch only · no executable link'}</span>
              <span style={{ color: C.textSecondary, fontSize: 9 }}>Confirm price/liquidity before sizing</span>
            </div>
            {lean && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{lean.label}</span>
                <span style={{ color: lean.edge >= 0.14 ? UFC_RED : C.cyan, fontSize: 11, fontWeight: 900, textAlign: 'right' }}>{lean.leader} · {Math.round(lean.edge * 100)}pt gap</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
              {chips.map(chip => (
                <a key={`${chip.label}-${chip.value}`} href={chip.href || undefined} target={chip.href ? '_blank' : undefined} rel={chip.href ? 'noreferrer' : undefined} onClick={e => chip.href ? e.stopPropagation() : e.preventDefault()} style={{ textDecoration: 'none', borderRadius: 12, padding: '8px 9px', background: chip.hot ? 'rgba(125,246,255,0.10)' : 'rgba(255,255,255,0.035)', border: `1px solid ${chip.hot ? 'rgba(125,246,255,0.35)' : 'rgba(255,255,255,0.08)'}` }}>
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

interface KalshiUFCMarket {
  ticker: string; eventTicker: string; series: string; category: string; categoryPriority: number; fighter: string; title: string; yesAsk: number; yesAskSize: number; yesBid: number; yesBidSize: number; status: string; url: string
}
interface KalshiUFCFight {
  id: string; eventKey: string; eventTickers: string[]; fighterA: string; fighterB: string; dateLabel: string; markets: KalshiUFCMarket[]
}

function groupUfcMarkets(markets: KalshiUFCMarket[]) {
  const groups: { category: string; markets: KalshiUFCMarket[] }[] = []
  for (const market of markets) {
    let group = groups.find(g => g.category === market.category)
    if (!group) {
      group = { category: market.category, markets: [] }
      groups.push(group)
    }
    group.markets.push(market)
  }
  return groups.sort((a, b) => (a.markets[0]?.categoryPriority || 99) - (b.markets[0]?.categoryPriority || 99))
}

function KalshiUFCSection() {
  const cols = useColCount()
  const isMobile = useIsMobile()
  const [data, setData] = useState<{ available: boolean; scanned: number; fights: KalshiUFCFight[]; scannedBySeries?: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [loadedFightIds, setLoadedFightIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/ufc-kalshi?ts=${Date.now()}`, { cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || `Kalshi UFC scan failed (${r.status})`)
        return d
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e?.message || 'Kalshi UFC unavailable') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return <LoadingMarketCards cols={cols} count={6} />
  if (error) return <p style={{ color: C.gold, fontSize: 12 }}>Kalshi UFC unavailable: {error}</p>
  const fights = data?.fights || []
  if (!fights.length) return <p style={{ color: C.textSecondary, fontSize: 13, textAlign: 'center', padding: '48px 0' }}>No live Kalshi UFC contracts found.</p>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, alignItems: 'start' }}>
      {fights.map(fight => {
        const totalSize = fight.markets.reduce((sum, m) => sum + (m.yesAskSize || 0), 0)
        const groups = groupUfcMarkets(fight.markets)
        const loaded = Boolean(loadedFightIds[fight.id])
        if (!loaded) {
          return (
            <button key={fight.id} className="load-board-card" onClick={() => setLoadedFightIds(prev => ({ ...prev, [fight.id]: true }))} style={{
              width: '100%',
              textAlign: 'left',
              borderRadius: isMobile ? 16 : 22,
              padding: 1,
              border: 'none',
              background: 'linear-gradient(135deg, rgba(125,246,255,0.56), rgba(255,255,255,0.10), rgba(168,240,255,0.18), rgba(125,246,255,0.22))',
              cursor: 'pointer',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'relative', zIndex: 2, borderRadius: isMobile ? 15 : 21, padding: isMobile ? 10 : 16, minHeight: isMobile ? 112 : 150, background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', alignContent: 'space-between', gap: isMobile ? 8 : 12, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(125,246,255,0.055), transparent 34%, rgba(168,240,255,0.035) 68%, transparent)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.green, fontSize: isMobile ? 7 : 9, fontWeight: 950, letterSpacing: isMobile ? '0.12em' : '0.16em', textTransform: 'uppercase' }}>Kalshi UFC</div>
                    <div style={{ color: C.textPrimary, fontSize: isMobile ? 14 : 18, fontWeight: 950, marginTop: 4, lineHeight: 1.08, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fight.fighterA}<br />vs {fight.fighterB}</div>
                    <div style={{ color: C.textSecondary, fontSize: isMobile ? 8 : 10, fontWeight: 800, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fight.dateLabel || fight.eventKey}</div>
                  </div>
                  <span style={{ flexShrink: 0, borderRadius: 999, padding: '3px 7px', background: 'rgba(125,246,255,0.10)', border: `1px solid ${C.borderHot}`, color: C.green, fontSize: 8, fontWeight: 950 }}>{fight.markets.length}</span>
                </div>
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <span style={{ color: C.textSecondary, fontSize: isMobile ? 8 : 10, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Load board</span>
                  <span style={{ color: C.green, fontSize: isMobile ? 8 : 10, fontWeight: 950 }}>{Math.round(totalSize).toLocaleString()} size</span>
                </div>
              </div>
            </button>
          )
        }
        return (
          <div key={fight.id} style={{ gridColumn: '1 / -1', borderRadius: 22, padding: 1, background: 'linear-gradient(135deg, rgba(125,246,255,0.46), rgba(255,255,255,0.10), rgba(125,246,255,0.08))', boxShadow: '0 14px 42px rgba(0,0,0,0.42)', overflow: 'hidden' }}>
            <div style={{ borderRadius: 21, padding: 14, background: SURFACE.panel, minHeight: 190 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Kalshi UFC · {fight.markets.length} options</div>
                  <div style={{ color: C.textPrimary, fontSize: 14, fontWeight: 950, marginTop: 4, lineHeight: 1.15 }}>{fight.fighterA} vs {fight.fighterB}</div>
                  <div style={{ color: C.textSecondary, fontSize: 9, marginTop: 3 }}>{fight.dateLabel || fight.eventKey}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ borderRadius: 999, padding: '3px 7px', background: 'rgba(125,246,255,0.10)', border: `1px solid ${C.borderHot}`, color: C.green, fontSize: 8, fontWeight: 950 }}>{Math.round(totalSize).toLocaleString()} size</span>
                  <button onClick={() => setLoadedFightIds(prev => { const next = { ...prev }; delete next[fight.id]; return next })} style={{ borderRadius: 999, padding: '7px 10px', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.045)', color: C.textPrimary, fontSize: 9, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Minimize</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {groups.map(group => {
                  const key = `${fight.id}|${group.category}`
                  const open = openGroups[key] ?? group.category === 'Winner'
                  const best = group.markets.reduce((low, m) => (low == null || (m.yesAsk && m.yesAsk < low.yesAsk) ? m : low), null as KalshiUFCMarket | null)
                  return (
                    <div key={group.category} style={{ borderRadius: 15, overflow: 'hidden', background: open ? 'rgba(125,246,255,0.045)' : 'rgba(255,255,255,0.03)', border: `1px solid ${open ? 'rgba(125,246,255,0.24)' : C.border}` }}>
                      <button
                        onClick={() => setOpenGroups(prev => ({ ...prev, [key]: !open }))}
                        style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 11px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: open ? C.green : C.textPrimary, fontSize: 10, fontWeight: 950, letterSpacing: '0.13em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.category}</div>
                          <div style={{ color: C.textSecondary, fontSize: 8, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.markets.length} options{best ? ` · low ${best.yesAsk || '—'}¢` : ''}</div>
                        </div>
                        <span style={{ borderRadius: 999, padding: '3px 7px', background: 'rgba(255,255,255,0.045)', border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 8, fontWeight: 950 }}>{group.markets.length}</span>
                        <span style={{ color: open ? C.green : C.textSecondary, fontSize: 13, fontWeight: 950, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.16s ease' }}>⌄</span>
                      </button>
                      {open && (
                        <div style={{ display: 'grid', gap: 6, padding: '0 9px 10px' }}>
                          {group.markets.map(m => (
                            <a key={m.ticker} href={m.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', borderRadius: 13, padding: '8px 9px', background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: C.textPrimary, fontSize: 11, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fighter || m.title || m.ticker}</div>
                                <div style={{ color: C.textSecondary, fontSize: 7, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.ticker}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ color: C.green, fontSize: 15, fontWeight: 950 }}>{m.yesAsk || '—'}¢</div>
                                <div style={{ color: C.textSecondary, fontSize: 7, fontWeight: 900 }}>{Math.round(m.yesAskSize || 0).toLocaleString()} ask</div>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
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

  return (
    <div>
      {chunkArray(sortedFights, cols).map((row, rowIdx) => {
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
  )
}


function MarketCommandDeck({ sport, games, loading, lastUpdatedAt, isMobile }: {
  sport: SupportedSport | 'ufc'
  games: Game[]
  loading: boolean
  lastUpdatedAt: Date | null
  isMobile: boolean
}) {
  const [feedAgeSec, setFeedAgeSec] = useState(0)

  useEffect(() => {
    if (!lastUpdatedAt) {
      setFeedAgeSec(0)
      return
    }
    const update = () => setFeedAgeSec(Math.max(0, Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000)))
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [lastUpdatedAt])
  // Mobile screen space is for decisions, not slate-count vanity stats.
  // Users can see/count the games themselves; keep the market deck desktop-only.
  if (sport === 'ufc' || isMobile) return null
  const matched = games.filter(g => g.hasWinnerOdds || g.hasSpreadOdds || g.hasTotalOdds).length
  const live = games.filter(g => g.status === 'in').length
  const upcoming = games.filter(g => g.status === 'pre').length
  const executable = games.filter(g => Boolean(g.polyWinnerUrl || g.polySpreadUrl || g.polyTotalUrl)).length
  const staleFeed = feedAgeSec >= 180
  const thinMatches = games.filter(g => (g.hasWinnerOdds || g.hasSpreadOdds || g.hasTotalOdds) && getMarketReadiness(g).matchQuality < 55).length
  const accent = sport === 'mlb' ? MLB_ORANGE : C.green
  const status = loading ? 'Scanning markets…' : staleFeed ? 'Feed stale' : executable > 0 ? 'Executable markets ready' : matched > 0 ? 'Markets matched' : 'Waiting on markets'
  const statusColor = loading ? C.gold : staleFeed ? C.gold : executable > 0 ? accent : C.textSecondary

  return (
    <section style={{
      marginBottom: isMobile ? 12 : 18,
      borderRadius: isMobile ? 18 : 22,
      padding: isMobile ? '11px 12px' : '13px 16px',
      background: 'linear-gradient(145deg, rgba(255,255,255,0.035), rgba(3,5,0,0.92))',
      border: `1px solid ${loading ? 'rgba(248,217,74,0.24)' : C.border}`,
      boxShadow: loading ? '0 0 28px rgba(248,217,74,0.09), 0 12px 44px rgba(0,0,0,0.38)' : '0 12px 44px rgba(0,0,0,0.34)',
      position: 'relative', overflow: 'hidden',
    }}>
      {loading && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(248,217,74,0.92), transparent)', animation: 'scanCardSweep 1.1s linear infinite' }} />}
      <div style={{ position: 'relative', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', background: statusColor,
            boxShadow: `0 0 16px ${statusColor}`,
            animation: loading ? 'liveDotPulse 1s ease-in-out infinite' : undefined,
            flexShrink: 0,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: statusColor, fontSize: 10, fontWeight: 950, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{status}</div>
            <div style={{ color: C.textSecondary, fontSize: 11, marginTop: 3, whiteSpace: isMobile ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {loading ? 'Building the card slate and checking live executable prices.' : <UpdatedAgeLabel updatedAt={lastUpdatedAt} empty="Standing by for market data." />}
              {(staleFeed || thinMatches > 0) && !loading ? ` · ${staleFeed ? 'refresh recommended' : `${thinMatches} thin match${thinMatches === 1 ? '' : 'es'}`}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(72px, 1fr))', gap: 8, width: isMobile ? '100%' : 'auto' }}>
          {[
            ['Games', games.length], ['Live', live], ['Upcoming', upcoming], ['Executable', executable || matched],
          ].map(([label, value]) => (
            <div key={label} style={{ borderRadius: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
              <div style={{ color: label === 'Executable' ? accent : C.textPrimary, fontSize: 16, fontWeight: 950 }}>{value}</div>
              <div style={{ color: C.textSecondary, fontSize: 7, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

type DayOption = { label: string; value: string }

function sportAccent(_sport: SupportedSport | 'ufc') {
  return C.green
}

function ControlButton({ active, accent, children, onClick, minWidth = 0 }: {
  active: boolean
  accent: string
  children: React.ReactNode
  onClick: () => void
  minWidth?: number
}) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0,
      minHeight: 36,
      minWidth,
      borderRadius: 999,
      padding: '8px 12px',
      background: active ? `${accent}22` : 'rgba(255,255,255,0.045)',
      border: `1px solid ${active ? accent : 'rgba(255,255,255,0.10)'}`,
      color: active ? accent : 'rgba(168,240,255,0.58)',
      fontSize: 10,
      fontWeight: 950,
      letterSpacing: '0.10em',
      textTransform: 'uppercase',
      cursor: 'pointer',
      boxShadow: active ? `0 0 18px ${accent}1f, inset 0 1px 0 rgba(255,255,255,0.07)` : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

type SportSubtab = 'slate' | 'teams' | 'playerSignals'

function SportSubtabBar({ active, onChange, isMobile }: { active: SportSubtab; onChange: (tab: SportSubtab) => void; isMobile: boolean }) {
  const tabs: { value: SportSubtab; label: string }[] = [
    { value: 'slate', label: 'Slate' },
    { value: 'teams', label: 'Teams' },
    { value: 'playerSignals', label: 'Player Signals' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, gap: isMobile ? 8 : 10, marginBottom: isMobile ? 14 : 18 }}>
      {tabs.map(tab => {
        const selected = active === tab.value
        return (
          <button key={tab.value} onClick={() => onChange(tab.value)} style={{
            minHeight: isMobile ? 46 : 50,
            borderRadius: 16,
            padding: isMobile ? '9px 8px' : '11px 14px',
            border: `1px solid ${selected ? C.borderHot : C.border}`,
            background: selected ? 'linear-gradient(145deg, rgba(125,246,255,0.18), rgba(3,10,13,0.98))' : 'rgba(255,255,255,0.035)',
            color: selected ? C.green : C.textSecondary,
            boxShadow: selected ? '0 0 26px rgba(125,246,255,0.16), inset 0 1px 0 rgba(255,255,255,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
            fontSize: isMobile ? 10 : 11,
            fontWeight: 950,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            whiteSpace: 'normal',
            lineHeight: 1.1,
          }}>{tab.label}</button>
        )
      })}
    </div>
  )
}

function TeamsDirectoryPanel({ sport, isMobile }: { sport: SupportedSport | 'ufc'; isMobile: boolean }) {
  const supported = sport === 'nba' || sport === 'mlb' || sport === 'nfl'
  const [teams, setTeams] = useState<TeamsDirectoryTeam[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TeamsDirectoryDetail | null>(null)
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!supported) {
      setTeams([])
      setSelectedTeamId(null)
      setDetail(null)
      return
    }
    let cancelled = false
    async function loadTeams() {
      setLoadingTeams(true)
      setError(null)
      try {
        const res = await fetch(`/api/teams?sport=${sport}&t=${Date.now()}`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error || `team feed failed (${res.status})`)
        const nextTeams = Array.isArray(json?.teams) ? json.teams : []
        if (cancelled) return
        setTeams(nextTeams)
        setSelectedTeamId(prev => prev && nextTeams.some((team: TeamsDirectoryTeam) => team.id === prev) ? prev : nextTeams[0]?.id || null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'team feed unavailable')
      } finally {
        if (!cancelled) setLoadingTeams(false)
      }
    }
    loadTeams()
    return () => { cancelled = true }
  }, [sport, supported])

  useEffect(() => {
    if (!supported || !selectedTeamId) {
      setDetail(null)
      return
    }
    const teamId = selectedTeamId as string
    let cancelled = false
    async function loadDetail() {
      setLoadingDetail(true)
      setError(null)
      try {
        const res = await fetch(`/api/teams?sport=${sport}&team=${encodeURIComponent(teamId)}&t=${Date.now()}`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error || `team detail failed (${res.status})`)
        if (!cancelled) setDetail(json)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'team detail unavailable')
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    }
    loadDetail()
    return () => { cancelled = true }
  }, [sport, selectedTeamId, supported])

  if (!supported) {
    return (
      <section style={{ borderRadius: 20, padding: 18, background: 'rgba(255,255,255,0.035)', border: `1px solid ${C.border}` }}>
        <p style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>Teams unavailable</p>
        <p style={{ color: C.textSecondary, fontSize: 13, lineHeight: 1.45 }}>Team rosters are wired for NBA, MLB, and NFL first. Switch sports from the dock to browse teams.</p>
      </section>
    )
  }

  const accent = detail?.team?.color || C.green
  const roster = detail?.roster || []
  const injuries = detail?.injuries || []
  const stats = detail?.stats || []
  const selectTeam = (teamId: string) => {
    setSelectedTeamId(teamId)
    if (isMobile) {
      window.setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 120)
    }
  }

  return (
    <section style={{ display: 'grid', gap: isMobile ? 12 : 16 }}>
      <div style={{ borderRadius: isMobile ? 18 : 22, padding: isMobile ? 12 : 14, background: 'transparent', border: '1px solid transparent', boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <p style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{sport.toUpperCase()} Teams</p>
            <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 4 }}>Tap a team for roster, season stats, and injury report.</p>
          </div>
          {(loadingTeams || loadingDetail) && <span style={{ color: C.gold, fontSize: 10, fontWeight: 900 }}>Loading…</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : 'repeat(8, minmax(0, 1fr))', gap: isMobile ? 7 : 9 }}>
          {teams.map((team, teamIdx) => {
            const selected = selectedTeamId === team.id
            return (
              <button key={team.id} type="button" aria-label={`View ${team.name} roster and injuries`} title={team.name} aria-pressed={selected} onClick={() => selectTeam(team.id)} style={{
                minHeight: isMobile ? 56 : 62,
                border: 0,
                background: 'transparent',
                color: C.textSecondary,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                padding: 0,
                ...getLoadInAnimationStyle(teamIdx, { durationMs: 720, delayStepMs: 28, maxDelayMs: 420 }),
              }}>
                <TeamLeagueCard abbr={team.abbr} name={team.name} sport={sport} selected={selected} />
              </button>
            )
          })}
        </div>
        {error && <p style={{ color: C.gold, fontSize: 11, marginTop: 10 }}>{error}</p>}
      </div>

      {detail && (
        <div key={detail.team.id} ref={detailRef} style={{ scrollMarginTop: isMobile ? 12 : 18, borderRadius: isMobile ? 20 : 24, padding: isMobile ? 14 : 18, background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(3,5,0,0.94))', border: `1px solid ${accent}55`, boxShadow: `0 0 34px ${accent}18, 0 20px 60px rgba(0,0,0,0.44)`, ...getLoadInAnimationStyle(0, { durationMs: 760 }) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ width: isMobile ? 74 : 88, flexShrink: 0 }}>
              <TeamLeagueCard abbr={detail.team.abbr} name={detail.team.name} sport={sport} selected compact />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ color: C.textPrimary, fontSize: isMobile ? 18 : 24, fontWeight: 950, margin: 0, lineHeight: 1.08, overflowWrap: 'anywhere' }}>{detail.team.name}</h2>
              <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 5 }}>{detail.team.record ? `Record ${detail.team.record}` : 'Season profile'}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
            {(stats.length ? stats : [{ label: 'Roster', value: String(roster.length) }]).map((stat, statIdx) => {
              const expandedLabel = expandTeamStatLabel(stat.label)
              return (
                <div key={`${stat.label}-${stat.value}`} style={{ borderRadius: 14, padding: '10px 9px', background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)', ...getLoadInAnimationStyle(statIdx + 1, { durationMs: 760, delayStepMs: 55, maxDelayMs: 520 }) }}>
                  <div style={{ color: C.textPrimary, fontSize: 17, fontWeight: 950 }}>{stat.value}</div>
                  <div style={{ color: C.textSecondary, fontSize: isMobile ? 9 : 10, fontWeight: 900, letterSpacing: '0.03em', textTransform: 'none', marginTop: 3, lineHeight: 1.18 }}>{expandedLabel}</div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.35fr 0.85fr', gap: 12 }}>
            <div style={{ borderRadius: 18, padding: 12, background: 'rgba(0,0,0,0.26)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>Roster</p>
              <div style={{ display: 'grid', gap: 7 }}>
                {roster.slice(0, 18).map((player, playerIdx) => (
                  <div key={player.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.055)', ...getLoadInAnimationStyle(playerIdx + 2, { durationMs: 720, delayStepMs: 45, maxDelayMs: 520 }) }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.name}</div>
                      <div style={{ color: C.textSecondary, fontSize: 10, marginTop: 2 }}>{player.position}{player.jersey ? ` · #${player.jersey}` : ''}{player.height ? ` · ${player.height}` : ''}</div>
                    </div>
                    {player.status && <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 800 }}>{player.status}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderRadius: 18, padding: 12, background: 'rgba(0,0,0,0.26)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ color: injuries.length ? C.gold : C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>Injury Report</p>
              {injuries.length ? injuries.slice(0, 10).map((injury, injuryIdx) => (
                <div key={`${injury.player}-${injuryIdx}`} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.055)', ...getLoadInAnimationStyle(injuryIdx + 2, { durationMs: 720, delayStepMs: 45, maxDelayMs: 420 }) }}>
                  <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 850 }}>{injury.player}</div>
                  <div style={{ color: C.gold, fontSize: 10, marginTop: 2 }}>{injury.status}{injury.detail ? ` · ${injury.detail}` : ''}</div>
                </div>
              )) : <p style={{ color: C.textSecondary, fontSize: 12, lineHeight: 1.45 }}>No current ESPN injury flags on this roster.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}


function FightersDirectoryPanel({ isMobile }: { isMobile: boolean }) {
  const [weightClasses, setWeightClasses] = useState<FighterWeightClassGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openWeightClasses, setOpenWeightClasses] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    async function loadFighters() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/fighters?t=${Date.now()}`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error || `fighter feed failed (${res.status})`)
        if (!cancelled) setWeightClasses(Array.isArray(json?.weightClasses) ? json.weightClasses : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'fighter feed unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadFighters()
    return () => { cancelled = true }
  }, [])

  const totalFighters = weightClasses.reduce((sum, group) => sum + group.fighters.length, 0)

  return (
    <section style={{ display: 'grid', gap: isMobile ? 12 : 16, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      <div style={{ borderRadius: isMobile ? 18 : 22, padding: isMobile ? 12 : 14, background: 'transparent', border: '1px solid transparent', boxShadow: 'none', maxWidth: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10, maxWidth: '100%' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase' }}>UFC Fighters</p>
            <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>{totalFighters ? `${totalFighters} ranked fighters across ${weightClasses.length} weight classes.` : 'Ranked fighters grouped by weight class.'}</p>
          </div>
          {loading && <span style={{ color: C.gold, fontSize: 10, fontWeight: 900, flex: '0 0 auto' }}>Loading…</span>}
        </div>
        {error && <p style={{ color: C.gold, fontSize: 11, marginTop: 10 }}>{error}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: isMobile ? 12 : 14, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        {weightClasses.map((group, groupIdx) => {
          const isOpen = openWeightClasses[group.id] ?? isWeightClassOpenByDefault(groupIdx)
          return (
            <section key={group.id} aria-label={`${group.name} fighters`} style={{
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              overflow: 'hidden',
              boxSizing: 'border-box',
              borderRadius: isMobile ? 18 : 22,
              padding: 0,
              background: 'linear-gradient(160deg, rgba(255,255,255,0.052), rgba(3,5,0,0.92))',
              border: '1px solid rgba(125,246,255,0.18)',
              boxShadow: '0 18px 42px rgba(0,0,0,0.30)',
            }}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenWeightClasses(prev => ({ ...prev, [group.id]: !isOpen }))}
                style={{ width: '100%', border: 0, background: 'transparent', padding: isMobile ? 12 : 14, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ color: C.textPrimary, fontSize: isMobile ? 16 : 19, fontWeight: 950, margin: 0, lineHeight: 1.1, overflowWrap: 'anywhere' }}>{group.name}</h2>
                  <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 4 }}>{group.limit ? `${group.limit} · ` : ''}{group.fighters.length} ranked</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ borderRadius: 999, padding: '3px 8px', background: isOpen ? 'rgba(125,246,255,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isOpen ? C.borderHot : C.border}`, color: isOpen ? C.green : C.textSecondary, fontSize: 8, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{isOpen ? 'Hide' : 'Show'}</span>
                  <span aria-hidden="true" style={{ color: isOpen ? C.green : C.textSecondary, fontSize: 16, fontWeight: 950, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.16s ease' }}>⌄</span>
                </div>
              </button>
              {isOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: isMobile ? 8 : 9, width: '100%', maxWidth: '100%', padding: isMobile ? '0 12px 12px' : '0 14px 14px' }}>
                  {group.fighters.map(fighter => {
                    const photoUrl = getFighterPhotoUrl(fighter)
                    return (
                      <a key={fighter.id} href={fighter.url || undefined} target={fighter.url ? '_blank' : undefined} rel={fighter.url ? 'noreferrer' : undefined} style={{
                        textDecoration: 'none',
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '44px minmax(0, 1fr) 42px' : '52px minmax(0, 1fr) 48px',
                        gap: 9,
                        alignItems: 'center',
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        boxSizing: 'border-box',
                        padding: '8px 9px',
                        borderRadius: 14,
                        background: 'rgba(0,0,0,0.22)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: C.textPrimary,
                        overflow: 'hidden',
                      }}>
                        <div style={{ width: isMobile ? 44 : 52, height: isMobile ? 44 : 52, borderRadius: '50%', overflow: 'hidden', background: fighter.color ? `${fighter.color}22` : 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,0.10)', minWidth: 0 }}>
                          {photoUrl ? (
                            <img src={photoUrl} alt={`${fighter.name} headshot`} loading="lazy" decoding="async" onError={e => { e.currentTarget.style.visibility = 'hidden' }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <span aria-hidden="true" style={{ color: C.green, fontSize: 16, fontWeight: 950 }}>◌</span>
                          )}
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ color: C.textPrimary, fontSize: isMobile ? 12 : 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fighter.name}</div>
                          <div style={{ color: C.textSecondary, fontSize: isMobile ? 9 : 10, marginTop: 2, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fighter.nickname ? `“${fighter.nickname}” · ` : ''}{fighter.record || 'Record unavailable'}{fighter.country ? ` · ${fighter.country}` : ''}</div>
                        </div>
                        <span style={{ justifySelf: 'end', color: fighter.champion ? C.gold : C.green, fontSize: isMobile ? 9 : 10, fontWeight: 950, whiteSpace: 'nowrap' }}>{fighter.champion ? 'CHAMP' : fighter.rank ? `#${fighter.rank}` : '—'}</span>
                      </a>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}

function AIAthleteHeader({ sport, setSport, days, date, setDate, pendingBets, onOpenTracker, onRefresh, loading, lastUpdatedAt, isMobile, accountEnabled }: {
  sport: SupportedSport | 'ufc'
  setSport: (s: SupportedSport | 'ufc') => void
  days: DayOption[]
  date: string
  setDate: (date: string) => void
  pendingBets: number
  onOpenTracker: () => void
  onRefresh: () => void
  loading: boolean
  lastUpdatedAt: Date | null
  isMobile: boolean
  accountEnabled: boolean
}) {
  const activeAccent = sportAccent(sport)
  const [sportsOpen, setSportsOpen] = useState(false)
  const sports: { value: SupportedSport | 'ufc'; label: string }[] = [
    { value: 'nba', label: 'NBA' },
    { value: 'mlb', label: 'MLB' },
    { value: 'nfl', label: 'NFL' },
    { value: 'ufc', label: 'UFC' },
  ]
  const sportLabel = sport === 'ncaaf' || sport === 'ncaab' ? 'NCAA' : sport.toUpperCase()
  const switchSport = (s: SupportedSport | 'ufc') => { setSport(s); if (isMobile) setSportsOpen(false) }
  const logoSrc = isMobile ? '/brand/ai-athlete-intelligence-mobile-logo.png?v=transparent-20260525' : '/brand/ai-athlete-intelligence-wordmark.png?v=transparent-20260525'

  return (
    <header style={{
      position: 'relative',
      zIndex: 100,
      marginBottom: isMobile ? 16 : 26,
      padding: 0,
      borderRadius: 0,
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
    }}>
      <div style={{ display: 'grid', gap: isMobile ? 8 : 12 }}>
        <div style={{ position: 'relative', overflow: 'visible', borderRadius: isMobile ? 18 : 24, border: 'none', background: 'transparent', boxShadow: 'none' }}>
          <button onClick={() => setSportsOpen(v => !v)} aria-label="Open sports" style={{ width: '100%', minHeight: isMobile ? 144 : 132, display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', padding: isMobile ? '14px 10px 12px' : '18px 260px 18px 22px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: isMobile ? 'center' : 'left' }}>
            <img src={logoSrc} alt="AI Athlete Intelligence" style={{ width: '100%', maxWidth: isMobile ? 384 : 500, height: isMobile ? 118 : 96, objectFit: 'contain', objectPosition: isMobile ? 'center center' : 'left center', display: 'block' }} />
          </button>
          {!isMobile && <div style={{ position: 'absolute', top: 18, right: 18, display: 'flex', gap: 7, alignItems: 'center' }}>
            <div style={{ color: C.textSecondary, fontSize: 11, whiteSpace: 'nowrap', padding: '9px 11px', borderRadius: 999, background: 'rgba(0,0,0,0.68)', border: `1px solid ${activeAccent}38`, backdropFilter: 'blur(10px)' }}>{loading ? 'Syncing…' : <UpdatedAgeLabel updatedAt={lastUpdatedAt} empty="Kalshi + market intelligence" />}</div>
            <button onClick={onRefresh} style={{ width: 40, height: 40, borderRadius: 13, background: 'rgba(0,0,0,0.68)', border: `1px solid ${activeAccent}66`, color: activeAccent, fontSize: 16, cursor: 'pointer', backdropFilter: 'blur(10px)' }}>↻</button>
            {accountEnabled && <AccountMenu isMobile={false} />}
          </div>}
          {!isMobile && <div style={{ position: 'absolute', right: 18, bottom: 18, padding: '8px 11px', borderRadius: 999, background: 'rgba(0,0,0,0.72)', border: `1px solid ${activeAccent}38`, color: activeAccent, fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{sportLabel} Board</div>}
        </div>
        {!isMobile && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {sports.map(({ value, label }) => <ControlButton key={value} active={sport === value || (label === 'NCAA' && (sport === 'ncaaf' || sport === 'ncaab'))} accent={sportAccent(value)} onClick={() => switchSport(value)} minWidth={78}>{label}</ControlButton>)}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flex: '0 0 auto' }}>{days.map(day => <ControlButton key={day.value} active={date === day.value} accent={activeAccent} onClick={() => setDate(day.value)}>{day.label}</ControlButton>)}</div>
        </div>}
      </div>
    </header>
  )
}

function MarketToggleButton({ active, accent, children, onClick, minWidth }: {
  active: boolean
  accent: string
  children: React.ReactNode
  onClick: () => void
  minWidth: number
}) {
  return (
    <button onClick={onClick} style={{
      appearance: 'none',
      WebkitAppearance: 'none',
      position: 'relative',
      zIndex: 1,
      flex: '0 0 auto',
      minHeight: 36,
      minWidth,
      borderRadius: 999,
      padding: '8px 12px',
      background: active ? `${accent}1f` : 'rgba(255,255,255,0.045)',
      backgroundClip: 'padding-box',
      border: `1px solid ${active ? accent : 'rgba(255,255,255,0.10)'}`,
      color: active ? accent : 'rgba(168,240,255,0.58)',
      fontSize: 10,
      fontWeight: 950,
      letterSpacing: '0.10em',
      textTransform: 'uppercase',
      cursor: 'pointer',
      boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.07)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      outline: 'none',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      transform: 'translateZ(0)',
    }}>{children}</button>
  )
}

function DockIcon({ icon, active, primary }: { icon: MobileDockIcon; active: boolean; primary?: boolean }) {
  const stroke = active ? '#b8fbff' : 'currentColor'
  const strokeWidth = primary ? 2.4 : 2.1
  const common = { fill: 'none', stroke, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  if (icon === 'sport') return <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: '100%', height: '100%' }}><circle {...common} cx="12" cy="12" r="7.5" /><path {...common} d="M12 4.5v15M4.5 12h15M7.3 6.8c2.5 2 6.9 2 9.4 0M7.3 17.2c2.5-2 6.9-2 9.4 0" /></svg>
  if (icon === 'teams') return <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: '100%', height: '100%' }}><circle {...common} cx="8.5" cy="8" r="3" /><circle {...common} cx="16" cy="9" r="2.5" /><path {...common} d="M3.8 19c0-3.3 1.9-5.2 4.7-5.2s4.7 1.9 4.7 5.2" /><path {...common} d="M12.8 16.8c.7-1.4 1.8-2.1 3.2-2.1 2.4 0 4 1.6 4.2 4.3" /></svg>
  if (icon === 'slate') return <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: '100%', height: '100%' }}><rect {...common} x="4.5" y="5.5" width="15" height="13" rx="3" /><path {...common} d="M8 9h8M8 13h5.5" /><circle cx="16.5" cy="13.5" r="1.2" fill={stroke} /></svg>
  if (icon === 'signals') return <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: '100%', height: '100%' }}><path {...common} d="M4 18h16" /><path {...common} d="M6.5 15.5l4.1-4.4 3.2 2.8 4.8-6.1" /><circle cx="18.6" cy="7.8" r="1.35" fill={stroke} /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: '100%', height: '100%' }}><circle {...common} cx="12" cy="8.5" r="3.5" /><path {...common} d="M5.5 19c1.2-3.4 3.4-5.1 6.5-5.1s5.3 1.7 6.5 5.1" /></svg>
}

function BottomDock({ active, openPanel, sport, sports, days, date, onChange, onTogglePanel, onSportChange, onDateChange }: {
  active: MobileDockTab
  openPanel: 'sport' | 'dates' | null
  sport: SupportedSport | 'ufc'
  sports: { value: SupportedSport | 'ufc'; label: string }[]
  days: DayOption[]
  date: string
  onChange: (tab: MobileDockTab) => void
  onTogglePanel: (panel: 'sport' | 'dates') => void
  onSportChange: (sport: SupportedSport | 'ufc') => void
  onDateChange: (date: string) => void
}) {
  const navItems = buildMobileDockTabs(sport)
  const dateOptions = mobileDockDateOptions(days)

  const dockButton = (selected: boolean): React.CSSProperties => ({
    appearance: 'none',
    WebkitAppearance: 'none',
    position: 'relative',
    zIndex: selected ? 3 : 2,
    minWidth: 0,
    minHeight: premiumMobileDockLayout.buttonMinHeight,
    borderRadius: 23,
    border: selected ? '1px solid rgba(125,246,255,0.92)' : '1px solid rgba(255,255,255,0.10)',
    background: selected
      ? 'linear-gradient(180deg, rgba(125,246,255,0.18) 0%, rgba(5,14,17,0.94) 48%, rgba(2,4,6,0.96) 100%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.070), rgba(255,255,255,0.026))',
    color: selected ? '#b8fbff' : 'rgba(238,246,255,0.76)',
    boxShadow: selected
      ? '0 0 0 1px rgba(125,246,255,0.12), 0 0 24px rgba(125,246,255,0.30), inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(125,246,255,0.18)'
      : 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 16px rgba(0,0,0,0.18)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    alignContent: 'center',
    gap: 4,
    padding: '7px 4px 6px',
    fontSize: 8,
    fontWeight: 950,
    letterSpacing: '0.07em',
    lineHeight: 1,
    textTransform: 'uppercase',
    transform: `translateY(${premiumMobileDockLayout.activeTranslateY}px) scale(${premiumMobileDockLayout.activeScale})`,
    transition: 'transform 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 180ms ease, background 180ms ease',
    WebkitTapHighlightColor: 'transparent',
    overflow: 'visible',
  })

  const iconWrap = (selected: boolean): React.CSSProperties => ({
    width: premiumMobileDockLayout.iconSize,
    height: premiumMobileDockLayout.iconSize,
    borderRadius: 999,
    display: 'grid',
    placeItems: 'center',
    color: selected ? '#b8fbff' : 'rgba(238,246,255,0.86)',
    background: selected
      ? 'rgba(125,246,255,0.075)'
      : 'rgba(255,255,255,0.040)',
    boxShadow: selected ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
  })

  const verticalDockStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    bottom: 'calc(100% + 12px)',
    [side]: 0,
    width: 104,
    display: 'grid',
    gap: 7,
    padding: 8,
    borderRadius: 24,
    border: '1px solid rgba(185,197,205,0.24)',
    background: 'linear-gradient(180deg, rgba(23,28,31,0.96), rgba(2,4,6,0.94))',
    boxShadow: '0 -14px 42px rgba(0,0,0,0.74), 0 0 26px rgba(125,246,255,0.11), inset 0 1px 0 rgba(255,255,255,0.12)',
    backdropFilter: 'blur(20px) saturate(1.25)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.25)',
  })

  const optionButtonStyle = (selected: boolean): React.CSSProperties => ({
    appearance: 'none',
    WebkitAppearance: 'none',
    minHeight: 38,
    borderRadius: 16,
    border: `1px solid ${selected ? 'rgba(125,246,255,0.72)' : 'rgba(255,255,255,0.10)'}`,
    background: selected ? 'linear-gradient(180deg, rgba(125,246,255,0.22), rgba(3,10,13,0.96))' : 'rgba(255,255,255,0.045)',
    color: selected ? '#7df6ff' : 'rgba(221,232,244,0.76)',
    boxShadow: selected ? '0 0 18px rgba(125,246,255,0.16), inset 0 1px 0 rgba(255,255,255,0.10)' : 'inset 0 1px 0 rgba(255,255,255,0.05)',
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  })

  return (
    <nav aria-label="Mobile bottom navigation" style={{
      position: 'fixed',
      left: '50%',
      right: 'auto',
      width: 'min(430px, calc(100vw - 18px))',
      bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      display: 'grid',
      gridTemplateColumns: `repeat(${premiumMobileDockLayout.columns}, minmax(0, 1fr))`,
      alignItems: 'stretch',
      gap: 7,
      padding: '8px 9px',
      borderRadius: premiumMobileDockLayout.containerRadius,
      border: '1px solid rgba(125,246,255,0.20)',
      background: 'linear-gradient(180deg, rgba(25,30,29,0.88) 0%, rgba(7,10,10,0.88) 46%, rgba(0,0,0,0.94) 100%)',
      boxShadow: '0 -20px 56px rgba(0,0,0,0.76), 0 0 34px rgba(125,246,255,0.14), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(125,246,255,0.18)',
      backdropFilter: 'blur(22px) saturate(1.25)',
      WebkitBackdropFilter: 'blur(22px) saturate(1.25)',
      overflow: 'visible',
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: 28, right: 28, top: 0, height: 2, borderRadius: 999, background: 'linear-gradient(90deg, transparent, rgba(125,246,255,0.82), transparent)', boxShadow: '0 0 16px rgba(125,246,255,0.5)', opacity: 0.9 }} />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 1, borderRadius: 33, pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.055)' }} />
      <style>{`
        @keyframes ${slateMainFeatureAnimation.ringAnimationName} {
          0%, 100% { opacity: 0.58; transform: scale(0.96); box-shadow: 0 0 0 0 rgba(125,246,255,0.34), 0 0 18px rgba(125,246,255,0.24); }
          50% { opacity: 1; transform: scale(1.04); box-shadow: 0 0 0 5px rgba(125,246,255,0.10), 0 0 30px rgba(125,246,255,0.48); }
        }
        @keyframes ${slateMainFeatureAnimation.shimmerAnimationName} {
          0% { transform: translateX(-145%) rotate(18deg); opacity: 0; }
          28% { opacity: 0.72; }
          58%, 100% { transform: translateX(145%) rotate(18deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-slate-main-feature="true"] [data-slate-ring="true"],
          [data-slate-main-feature="true"] [data-slate-shimmer="true"] {
            animation: none !important;
          }
        }
      `}</style>
      {openPanel === 'sport' && <div aria-label="Choose sport" style={verticalDockStyle('left')}>
        {sports.map(option => <button key={option.value} type="button" onClick={() => onSportChange(option.value)} style={optionButtonStyle(sport === option.value)}>{option.label}</button>)}
      </div>}
      {openPanel === 'dates' && <div aria-label="Choose date" style={verticalDockStyle('right')}>
        {dateOptions.map(option => <button key={option.value} type="button" onClick={() => onDateChange(option.value)} style={optionButtonStyle(date === option.value)}>{option.label}</button>)}
      </div>}
      {navItems.map(item => {
        const selected = active === item.key || (item.key === 'sport' && openPanel === 'sport')
        const click = item.key === 'sport'
          ? () => onTogglePanel('sport')
          : () => onChange(item.key)
        const isSlateMainFeature = item.key === slateMainFeatureAnimation.tab
        return (
          <button
            key={item.key}
            type="button"
            onClick={click}
            aria-current={selected ? 'page' : undefined}
            aria-label={isSlateMainFeature ? slateMainFeatureAnimation.ariaLabel : item.label}
            data-slate-main-feature={isSlateMainFeature ? 'true' : undefined}
            style={dockButton(selected)}
          >
            {isSlateMainFeature && <>
              <span aria-hidden="true" data-slate-ring="true" style={{
                position: 'absolute',
                inset: -3,
                borderRadius: 25,
                border: '1px solid rgba(125,246,255,0.78)',
                pointerEvents: 'none',
                animation: `${slateMainFeatureAnimation.ringAnimationName} 2.4s ease-in-out infinite`,
              }} />
              <span aria-hidden="true" style={{ position: 'absolute', inset: 2, borderRadius: 21, overflow: 'hidden', pointerEvents: 'none' }}>
                <span data-slate-shimmer="true" style={{
                  position: 'absolute',
                  top: -12,
                  bottom: -12,
                  left: '42%',
                  width: 18,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.38), rgba(125,246,255,0.26), transparent)',
                  filter: 'blur(0.5px)',
                  animation: `${slateMainFeatureAnimation.shimmerAnimationName} 3.2s ease-in-out infinite`,
                }} />
              </span>
            </>}
            <span style={iconWrap(selected)}><DockIcon icon={item.icon} active={selected} primary={false} /></span>
            <span style={{ position: 'relative', zIndex: 1 }}>{item.label}</span>
            {selected && <span aria-hidden="true" style={{ position: 'relative', zIndex: 1, width: 14, height: 2, borderRadius: 999, background: '#b8fbff', boxShadow: '0 0 11px rgba(125,246,255,0.82)' }} />}
          </button>
        )
      })}
    </nav>
  )
}

function MarketModeDock() {
  // Kalshi-focused build: Polymarket views/toggles are intentionally hidden.
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function chicagoYmd(date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).replace(/-/g, '')
}

function addChicagoDays(yyyymmdd: string, daysToAdd: number): string {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T12:00:00`)
  d.setDate(d.getDate() + daysToAdd)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).replace(/-/g, '')
}

function espnRequestDateForChicagoDay(yyyymmdd: string): string {
  // Late CST/CDT games can land on the previous/next UTC slate upstream. Ask
  // ESPN for a small range and let the API filter back to the Chicago day.
  return `${addChicagoDays(yyyymmdd, -1)}-${addChicagoDays(yyyymmdd, 1)}`
}

export default function Home({ clerkEnabled = false }: { clerkEnabled?: boolean }) {
  const today = chicagoYmd()
  const [date, setDate] = useState(today)
  const [sport, setSport] = useState<SupportedSport | 'ufc'>('nba')
  const [subtab, setSubtab] = useState<SportSubtab>('slate')
  const [mobileDockTab, setMobileDockTab] = useState<MobileDockTab>('slate')
  const [mobileDockPanel, setMobileDockPanel] = useState<'sport' | 'dates' | null>(null)
  const [openMobileProfile, setOpenMobileProfile] = useState(false)
  const [provider, setProvider] = useState<MarketProvider>('kalshi')
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showTracker, setShowTracker] = useState(false)
  const [bets, setBets] = useState<BetLog[]>([])
  const [oddsDrift, setOddsDrift] = useState<Record<string, OddsDrift>>({})
  const prevGamesRef = useRef<Map<string, Game>>(new Map())
  const startupSportResolvedRef = useRef(false)
  const [activeIntelGame, setActiveIntelGame] = useState<Game | null>(null)
  const [activeAnalysisGame, setActiveAnalysisGame] = useState<Game | null>(null)
  const [analysisLoadingGameId, setAnalysisLoadingGameId] = useState<string | null>(null)
  const [loadedKalshiGameIds, setLoadedKalshiGameIds] = useState<Record<string, boolean>>({})
  const cols = useColCount()
  const isMobile = useIsMobile()
  const hasLiveGames = games.some(g => g.status === 'in')

  useEffect(() => resetInitialSlateScroll(), [])

  useEffect(() => {
    const stored = localStorage.getItem('poly-bets')
    if (stored) setBets(JSON.parse(stored))
  }, [])

  const saveBets = (updated: BetLog[]) => {
    setBets(updated)
    localStorage.setItem('poly-bets', JSON.stringify(updated))
  }

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

  useEffect(() => {
    setLoadedKalshiGameIds({})
  }, [sport, date])

  const fetchGames = useCallback(async () => {
    try {
      const loadDate = async (sportToLoad: SupportedSport, yyyymmdd: string): Promise<Game[]> => {
        const res = await fetch(`/api/markets?date=${espnRequestDateForChicagoDay(yyyymmdd)}&sport=${sportToLoad}&displayDate=${yyyymmdd}&t=${Date.now()}`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error || `market feed failed (${res.status})`)
        return Array.isArray(json) ? json : []
      }
      const loadSportSlate = async (sportToLoad: SupportedSport, startDate: string): Promise<{ date: string; games: Game[] }> => {
        let resolvedDate = startDate
        let loadedGames = await loadDate(sportToLoad, startDate)

        // Only jump forward when ESPN has no games for the selected day. If games
        // are final, keep them on screen so the slate buttons still show scores.
        if (provider === 'kalshi' && loadedGames.length === 0) {
          for (let i = 1; i <= 3; i++) {
            const candidateDate = addChicagoDays(startDate, i)
            const candidateGames = await loadDate(sportToLoad, candidateDate)
            if (candidateGames.some(g => g.status !== 'post')) {
              resolvedDate = candidateDate
              loadedGames = candidateGames
              break
            }
          }
        }

        return { date: resolvedDate, games: loadedGames }
      }
      setFeedError(null)
      let resolvedDate = date
      let newGames: Game[] = []

      if (!startupSportResolvedRef.current && provider === 'kalshi' && sport === 'nba') {
        startupSportResolvedRef.current = true
        const startup = await resolveStartupSport({
          initialDate: date,
          loadGames: (sportToLoad, startDate) => loadSportSlate(sportToLoad, startDate),
        })
        resolvedDate = startup.date
        newGames = startup.games
        if (startup.sport !== sport) setSport(startup.sport)
        if (startup.date !== date) setDate(startup.date)
      } else {
        const loaded = sport === 'ufc' ? { date, games: [] as Game[] } : await loadSportSlate(sport, date)
        resolvedDate = loaded.date
        newGames = loaded.games
        if (resolvedDate !== date) setDate(resolvedDate)
      }

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
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'market feed unavailable')
      setGames([])
    } finally {
      setLoading(false)
    }
  }, [date, sport, provider])

  useEffect(() => {
    setLoading(true)
    fetchGames()
    const iv = setInterval(fetchGames, hasLiveGames ? 5000 : 60000)
    return () => clearInterval(iv)
  }, [fetchGames, hasLiveGames])

  const days = Array.from({ length: 5 }, (_, i) => {
    const value = addChicagoDays(today, i - 2)
    const d = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00`)
    return {
      label: i === 2 ? 'Today' : i === 1 ? 'Yest' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }),
      value,
    }
  })

  const live = games.filter(g => g.status === 'in')
  const upcoming = games.filter(g => g.status === 'pre')
  const final = games.filter(g => g.status === 'post')
  const pendingBets = bets.filter(b => b.result === 'pending').length
  const kalshiGridColumns = isMobile ? 'repeat(3, minmax(0, 1fr))' : `repeat(${cols}, 1fr)`
  const markKalshiGameLoaded = useCallback((gameId: string) => {
    setLoadedKalshiGameIds(prev => prev[gameId] ? prev : { ...prev, [gameId]: true })
  }, [])
  const markKalshiGameCollapsed = useCallback((gameId: string) => {
    setLoadedKalshiGameIds(prev => {
      if (!prev[gameId]) return prev
      const next = { ...prev }
      delete next[gameId]
      return next
    })
  }, [])
  const logBet = (b: Omit<BetLog, 'id' | 'createdAt' | 'stake' | 'result'>) =>
    saveBets([...bets, { ...b, id: crypto.randomUUID(), stake: 0, result: 'pending', createdAt: new Date().toISOString() }])
  const scrollMarketTop = () => {
    requestAnimationFrame(() => {
      document.getElementById('market-content-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  const handleSubtabChange = (nextSubtab: SportSubtab) => {
    setSubtab(nextSubtab)
    setMobileDockPanel(null)
    setMobileDockTab(getMobileDockActiveTab(nextSubtab))
    scrollMarketTop()
  }
  const handleDockPanelToggle = (panel: 'sport' | 'dates') => {
    if (panel === 'sport') setMobileDockTab('sport')
    setMobileDockPanel(prev => prev === panel ? null : panel)
  }
  const handleDockSportChange = (nextSport: SupportedSport | 'ufc') => {
    setSport(nextSport)
    setDate(chicagoYmd())
    setSubtab('slate')
    setMobileDockTab('slate')
    setMobileDockPanel(null)
    setProvider('kalshi')
    setFeedError(null)
    setLoading(true)
    scrollMarketTop()
  }
  const handleDockDateChange = (nextDate: string) => {
    setDate(nextDate)
    setSubtab('slate')
    setMobileDockTab('slate')
    setMobileDockPanel(null)
    setFeedError(null)
    setLoading(true)
    scrollMarketTop()
  }
  const handleDockChange = (nextTab: MobileDockTab) => {
    setMobileDockTab(nextTab)
    setMobileDockPanel(null)
    if (nextTab === 'profile') {
      setOpenMobileProfile(true)
      return
    }
    if (nextTab === 'signals') {
      setSubtab('playerSignals')
    } else if (nextTab === 'teams') {
      setSubtab('teams')
    } else {
      setSubtab('slate')
    }
    scrollMarketTop()
  }
  const header = (
    <AIAthleteHeader
      sport={sport}
      setSport={(s) => { setSport(s); setDate(chicagoYmd()); setSubtab('slate'); setMobileDockTab('slate'); setMobileDockPanel(null); setProvider('kalshi'); setFeedError(null); setLoading(true) }}
      days={days}
      date={date}
      setDate={(nextDate) => { setDate(nextDate); setFeedError(null); setLoading(true) }}
      pendingBets={pendingBets}
      onOpenTracker={() => setShowTracker(true)}
      onRefresh={() => { setLoading(true); fetchGames() }}
      loading={loading}
      lastUpdatedAt={lastUpdated}
      isMobile={true}
      accountEnabled={clerkEnabled}
    />
  )

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.textPrimary, position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{GLOBAL_STYLES}</style>
      {/* Soft logo glow background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 0% -10%, rgba(125,246,255,0.14) 0%, transparent 62%), radial-gradient(ellipse 70% 50% at 60% -10%, rgba(125,246,255,0.05) 0%, transparent 70%)',
      }} />

      <div style={{ position: 'relative', zIndex: 5, maxWidth: 1200, margin: '0 auto', padding: isMobile ? '14px 16px 0' : '32px 16px 0' }}>
        {header}
      </div>

      <div id="market-content-top" style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '0 16px calc(148px + env(safe-area-inset-bottom, 0px))', scrollMarginTop: 12 }}>

        <MarketModeDock />

        {subtab !== 'slate' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: isMobile ? 10 : 12,
            marginBottom: isMobile ? 14 : 18,
            alignItems: 'start',
            ...getLoadInAnimationStyle(0, { durationMs: 760 }),
          }}>
            {subtab === 'teams' && (sport === 'ufc' ? <FightersDirectoryPanel isMobile={isMobile} /> : <TeamsDirectoryPanel sport={sport} isMobile={isMobile} />)}
            {sport !== 'ufc' && subtab === 'playerSignals' && <SignalsModelPanel sport={sport} games={games} loading={loading} isMobile={isMobile} autoRun />}
          </div>
        )}


        {sport === 'ufc' && subtab === 'slate' && <KalshiUFCSection />}

        {sport !== 'ufc' && subtab === 'slate' && (loading ? (
          <LoadingMarketCards cols={cols} count={6} />
        ) : feedError ? (
          <div style={{ textAlign: 'center', padding: '54px 18px', border: `1px solid ${C.border}`, borderRadius: 18, background: 'rgba(255,255,255,0.035)' }}>
            <p style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>Feed error</p>
            <p style={{ color: C.textPrimary, fontSize: 15, fontWeight: 850, marginBottom: 8 }}>Market feed did not load.</p>
            <p style={{ color: C.textSecondary, fontSize: 11, lineHeight: 1.45, marginBottom: 14 }}>{feedError}</p>
            <button onClick={() => { setLoading(true); fetchGames() }} style={{ borderRadius: 999, padding: '10px 14px', border: `1px solid ${C.borderHot}`, background: 'rgba(125,246,255,0.14)', color: C.green, fontSize: 11, fontWeight: 950, cursor: 'pointer' }}>Retry feed</button>
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
                {provider === 'kalshi' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: kalshiGridColumns, gap: isMobile ? 8 : 16 }}>
                    {live.map((g, idx) => <div key={g.id} id={'game-board-' + g.id} style={{ gridColumn: loadedKalshiGameIds[g.id] ? '1 / -1' : undefined, ...getLoadInAnimationStyle(idx, { durationMs: 820, delayStepMs: 90, maxDelayMs: 540 }) }}><KalshiGameCard game={g} sport={sport as SupportedSport} onBoardLoadRequested={markKalshiGameLoaded} onBoardCollapse={markKalshiGameCollapsed} /></div>)}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {chunkArray(live, cols).map((row, rowIdx) => (
                      <div key={rowIdx} style={getLoadInAnimationStyle(rowIdx, { durationMs: 820, delayStepMs: 90, maxDelayMs: 540 })}>
                        <RowGroup games={row} cols={cols}
                          activeGame={activeIntelGame || activeAnalysisGame}
                          panel={activeIntelGame ? 'intel' : activeAnalysisGame ? 'analysis' : null}
                          analysisLoadingGameId={analysisLoadingGameId}
                          onAnalysisDone={() => setAnalysisLoadingGameId(null)}
                          onLogBet={logBet} drift={oddsDrift}
                          onOpenIntel={(g) => { setActiveIntelGame(prev => prev?.id === g.id ? null : g); setActiveAnalysisGame(null) }}
                          onOpenAnalysis={(g) => { setActiveAnalysisGame(prev => { const next = prev?.id === g.id ? null : g; setAnalysisLoadingGameId(next ? next.id : null); return next }); setActiveIntelGame(null) }} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Upcoming</p>
                {provider === 'kalshi' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: kalshiGridColumns, gap: isMobile ? 8 : 16 }}>
                    {upcoming.map((g, idx) => <div key={g.id} id={'game-board-' + g.id} style={{ gridColumn: loadedKalshiGameIds[g.id] ? '1 / -1' : undefined, ...getLoadInAnimationStyle(idx, { durationMs: 820, delayStepMs: 90, maxDelayMs: 540 }) }}><KalshiGameCard game={g} sport={sport as SupportedSport} onBoardLoadRequested={markKalshiGameLoaded} onBoardCollapse={markKalshiGameCollapsed} /></div>)}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {chunkArray(upcoming, cols).map((row, rowIdx) => (
                      <div key={rowIdx} style={getLoadInAnimationStyle(rowIdx, { durationMs: 820, delayStepMs: 90, maxDelayMs: 540 })}>
                        <RowGroup games={row} cols={cols}
                          activeGame={activeIntelGame || activeAnalysisGame}
                          panel={activeIntelGame ? 'intel' : activeAnalysisGame ? 'analysis' : null}
                          analysisLoadingGameId={analysisLoadingGameId}
                          onAnalysisDone={() => setAnalysisLoadingGameId(null)}
                          onLogBet={logBet} drift={oddsDrift}
                          onOpenIntel={(g) => { setActiveIntelGame(prev => prev?.id === g.id ? null : g); setActiveAnalysisGame(null) }}
                          onOpenAnalysis={(g) => { setActiveAnalysisGame(prev => { const next = prev?.id === g.id ? null : g; setAnalysisLoadingGameId(next ? next.id : null); return next }); setActiveIntelGame(null) }} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {final.length > 0 && (
              <section>
                <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Final</p>
                {provider === 'kalshi' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: kalshiGridColumns, gap: isMobile ? 8 : 16 }}>
                    {final.map((g, idx) => <div key={g.id} id={'game-board-' + g.id} style={{ gridColumn: loadedKalshiGameIds[g.id] ? '1 / -1' : undefined, ...getLoadInAnimationStyle(idx, { durationMs: 820, delayStepMs: 90, maxDelayMs: 540 }) }}><KalshiGameCard game={g} sport={sport as SupportedSport} onBoardLoadRequested={markKalshiGameLoaded} onBoardCollapse={markKalshiGameCollapsed} /></div>)}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {chunkArray(final, cols).map((row, rowIdx) => (
                      <div key={rowIdx} style={getLoadInAnimationStyle(rowIdx, { durationMs: 820, delayStepMs: 90, maxDelayMs: 540 })}>
                        <RowGroup games={row} cols={cols}
                          activeGame={activeIntelGame || activeAnalysisGame}
                          panel={activeIntelGame ? 'intel' : activeAnalysisGame ? 'analysis' : null}
                          analysisLoadingGameId={analysisLoadingGameId}
                          onAnalysisDone={() => setAnalysisLoadingGameId(null)}
                          onLogBet={logBet} drift={oddsDrift}
                          onOpenIntel={(g) => { setActiveIntelGame(prev => prev?.id === g.id ? null : g); setActiveAnalysisGame(null) }}
                          onOpenAnalysis={(g) => { setActiveAnalysisGame(prev => { const next = prev?.id === g.id ? null : g; setAnalysisLoadingGameId(next ? next.id : null); return next }); setActiveIntelGame(null) }} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        ))}
      </div>

      {provider === 'kalshi' && (
        <BottomDock
          active={subtab === 'slate' ? mobileDockTab : getMobileDockActiveTab(subtab)}
          openPanel={mobileDockPanel}
          sport={sport}
          sports={mobileDockSportOptions}
          days={days}
          date={date}
          onChange={handleDockChange}
          onTogglePanel={handleDockPanelToggle}
          onSportChange={handleDockSportChange}
          onDateChange={handleDockDateChange}
        />
      )}

      {clerkEnabled && (
        <AccountMenu
          isMobile
          hideTrigger
          forceOpen={openMobileProfile}
          onForceOpenConsumed={() => setOpenMobileProfile(false)}
        />
      )}

      {showTracker && <BetTracker bets={bets} onUpdate={saveBets} onClose={() => setShowTracker(false)} />}
    </main>
  )
}
