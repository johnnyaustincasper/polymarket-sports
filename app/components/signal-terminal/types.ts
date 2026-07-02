import type { CorrelationInputItem, CorrelationWarning } from '../../lib/parlays/correlation'
import type { LiquidityGrade } from '../../lib/signals/liquidity'
import type { SignalDelta } from '../../lib/signals/delta-feed'

export type SignalTier = 'A' | 'B' | 'WATCH' | 'KILL' | string
export type SignalDetailTab = 'read' | 'numbers' | 'risk' | 'stats'
export type SignalSide = 'over' | 'under' | 'yes' | 'no' | 'home' | 'away' | string
export type Severity = 'info' | 'watch' | 'danger'
export type NumericValue = number | null | undefined

export interface SignalLineOption {
  id?: string
  label: string
  line?: NumericValue
  ask?: NumericValue
  fairPrice?: NumericValue
  edge?: NumericValue
  maxBuy?: NumericValue
  tier?: SignalTier | null
  hits?: NumericValue
  games?: NumericValue
  avg?: NumericValue
  ticker?: string | null
  url?: string | null
}

export interface SignalMovementPoint {
  label?: string
  time?: string
  timestamp?: string
  ask?: NumericValue
  bid?: NumericValue
  price?: NumericValue
  fairPrice?: NumericValue
  maxBuy?: NumericValue
  edge?: NumericValue
}

export interface SportsbookConsensusBook {
  name: string
  line?: NumericValue
  price?: NumericValue
  odds?: string | number | null
  lean?: string | null
  lastUpdated?: string | null
}

export interface SportsbookConsensus {
  status?: 'available' | 'pending' | 'unavailable' | string
  marketName?: string
  provider?: string
  bestBook?: string | null
  consensusLine?: NumericValue
  consensusPrice?: NumericValue
  fairPrice?: NumericValue
  averageLine?: NumericValue
  books?: SportsbookConsensusBook[]
  notes?: string[]
  updatedAt?: string | null
}

export interface LineupInjuryFlagItem {
  id?: string
  team?: string
  player?: string
  status?: string
  injury?: string
  severity?: Severity
  impact?: 'star' | 'starter' | 'role' | 'bench' | 'unknown' | string
  detail?: string
  expectedMinutes?: string | null
  source?: string | null
}

export interface SignalTerminalSignal {
  id: string
  sport?: string
  league?: string
  gameId?: string
  matchup?: string
  gameTime?: string
  player?: string
  team?: string
  opponent?: string
  metric?: string
  label?: string
  side?: SignalSide | null
  tier?: SignalTier | null
  projectedHitPct?: NumericValue
  hitRate?: NumericValue
  fairPrice?: NumericValue
  ask?: NumericValue
  bid?: NumericValue
  maxBuy?: NumericValue
  edge?: NumericValue
  confidence?: NumericValue
  hits?: NumericValue
  games?: NumericValue
  avg?: NumericValue
  line?: NumericValue
  bookLine?: NumericValue
  risk?: string | null
  liquidity?: NumericValue
  liquidityGrade?: LiquidityGrade | null
  liquidityLabel?: string | null
  askSize?: NumericValue
  bidSize?: NumericValue
  ticker?: string | null
  url?: string | null
  marketTitle?: string | null
  reasons?: string[]
  flags?: string[]
  createdAt?: string | null
  generatedAt?: string | null
  movement?: SignalMovementPoint[]
  consensus?: SportsbookConsensus | null
  sportsbookConsensus?: SportsbookConsensus | null
  lineupFlags?: LineupInjuryFlagItem[]
  correlationWarnings?: CorrelationWarning[]
  correlationItems?: CorrelationInputItem[]
  metadata?: Record<string, unknown>
}

export interface WatchlistState {
  watched?: boolean
  alertArmed?: boolean
  muted?: boolean
  note?: string | null
}

export interface SignalTerminalCardProps {
  signal: SignalTerminalSignal
  selected?: boolean
  compact?: boolean
  detailTab?: SignalDetailTab
  watched?: boolean
  onOpen?: (signal: SignalTerminalSignal) => void
  onToggleWatch?: (signal: SignalTerminalSignal) => void
  onOpenMarket?: (signal: SignalTerminalSignal) => void
}

export interface SignalDrawerProps {
  signal: SignalTerminalSignal | null
  open?: boolean
  watched?: boolean
  onClose?: () => void
  onToggleWatch?: (signal: SignalTerminalSignal) => void
  onOpenMarket?: (signal: SignalTerminalSignal) => void
  deltas?: SignalDelta[]
}

export interface PropDetailDrawerProps extends SignalDrawerProps {
  title?: string
}
