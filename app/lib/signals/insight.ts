import type { LiquidityGrade } from './liquidity'

export type SignalDecision = 'actionable' | 'watch' | 'pass' | 'stale' | 'trap' | 'thin'

export interface ClassifySignalDecisionInput {
  sport?: string | null
  tier?: 'A' | 'B' | 'WATCH' | 'KILL'
  edge?: number | null
  ask?: number | null
  maxBuy?: number | null
  liquidityGrade?: LiquidityGrade
  flags?: string[]
  generatedAt?: string | null
  now?: Date
}

export interface SignalDecisionResult {
  decision: SignalDecision
  label: string
  reason: string
}

export interface BuildWhyCareInput {
  player: string
  label: string
  edge?: number | null
  fairPrice?: number | null
  ask?: number | null
  hitRate?: number | null
  hits?: number | null
  games?: number | null
  reasons?: string[]
  flags?: string[]
}

const STALE_SIGNAL_MS = 30 * 60 * 1000
const ACTIONABLE_EDGE = 0.07
const WATCH_EDGE = 0.025

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizedFlags(flags: string[] | undefined) {
  return new Set((flags ?? []).map((flag) => flag.trim().toLowerCase()).filter(Boolean))
}

function isGeneratedAtStale(generatedAt: string | null | undefined, now: Date) {
  if (!generatedAt) return false

  const generatedTime = new Date(generatedAt).getTime()
  if (!Number.isFinite(generatedTime)) return false

  return now.getTime() - generatedTime > STALE_SIGNAL_MS
}

function result(decision: SignalDecision, label: string, reason: string): SignalDecisionResult {
  return { decision, label, reason }
}

function isMlbSignal(sport: string | null | undefined) {
  return String(sport || '').trim().toLowerCase() === 'mlb'
}

function mlbNonPass(label: string, reason: string): SignalDecisionResult {
  return result('watch', label, reason)
}

export function classifySignalDecision(input: ClassifySignalDecisionInput): SignalDecisionResult {
  const now = input.now ?? new Date()
  const flags = normalizedFlags(input.flags)
  const tier = input.tier ?? 'WATCH'
  const edge = input.edge
  const mlb = isMlbSignal(input.sport)

  if (flags.has('stale') || isGeneratedAtStale(input.generatedAt, now)) {
    return result('stale', 'Stale signal', 'Signal is stale; refresh before acting.')
  }

  if (flags.has('trap') || flags.has('price_trap') || flags.has('bad_line')) {
    return result('trap', 'Execution trap', 'Flagged as a trap; do not chase this price.')
  }

  if (isFiniteNumber(input.ask) && isFiniteNumber(input.maxBuy) && input.ask > input.maxBuy) {
    return result('trap', 'Line moved', 'Wait for a better YES line before entering.')
  }

  if (tier === 'KILL') {
    if (mlb) return mlbNonPass('Needs better setup', 'Baseball read is not clean enough yet; wait for lineup spot, starter handedness, park/weather, or a softer number.')
    return result('pass', 'Pass', 'Kill-tier signal; no entry.')
  }

  if (!isFiniteNumber(edge) || edge <= 0) {
    if (mlb) return mlbNonPass('Price watch', 'The baseball case needs a better number or stronger matchup context before it becomes a real look.')
    return result('pass', 'Pass', 'No positive edge available.')
  }

  if (input.liquidityGrade === 'blocked' || input.liquidityGrade === 'thin') {
    return result('thin', 'Thin liquidity', 'Execution liquidity is too thin for an actionable call.')
  }

  if (tier === 'A' && edge >= ACTIONABLE_EDGE && (input.liquidityGrade === 'real' || input.liquidityGrade === 'deep')) {
    return result('actionable', 'Actionable signal', `A-tier signal with ${formatSignedPercent(edge)} value gap and executable liquidity.`)
  }

  if ((tier === 'A' || tier === 'B' || tier === 'WATCH') && edge >= WATCH_EDGE) {
    return result('watch', 'Watch signal', 'Positive value gap, but keep on watch until tier, line, or liquidity improves.')
  }

  if (mlb) return mlbNonPass('Small lean', 'There is a baseball angle, but the number is thin; confirm lineup, opposing starter, and park/weather before trusting it.')
  return result('pass', 'Pass', 'Value gap is below the watch threshold.')
}

function formatSignedPercent(value: number) {
  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${formatNumber(pct)}%`
}

function formatMarketChance(value: number) {
  return `${formatNumber(value * 100)}%`
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatFlag(flag: string) {
  return flag.replace(/[_-]+/g, ' ').trim()
}

export function buildWhyCare(input: BuildWhyCareInput): string[] {
  const bullets: string[] = []

  for (const reason of input.reasons ?? []) {
    const cleaned = reason.trim()
    if (cleaned) bullets.push(cleaned)
    if (bullets.length >= 2) break
  }

  if (isFiniteNumber(input.hits) && isFiniteNumber(input.games)) {
    bullets.push(`Recent form backs it: ${formatNumber(input.hits)}/${formatNumber(input.games)} cleared the line.`)
  } else if (isFiniteNumber(input.hitRate)) {
    bullets.push(`Recent form backs it: cleared this line ${formatNumber(input.hitRate * 100)}% of the time.`)
  }

  if (isFiniteNumber(input.edge) && isFiniteNumber(input.fairPrice) && isFiniteNumber(input.ask)) {
    bullets.push(`Value gap is the trigger: ${formatMarketChance(input.fairPrice)} model vs ${formatMarketChance(input.ask)} market (${formatSignedPercent(input.edge)} gap).`)
  } else if (isFiniteNumber(input.edge)) {
    bullets.push(`Value gap is the trigger: ${formatSignedPercent(input.edge)} vs market.`)
  } else if (isFiniteNumber(input.fairPrice)) {
    bullets.push(`Model likes the side at ${formatMarketChance(input.fairPrice)} true chance.`)
  } else if (isFiniteNumber(input.ask)) {
    bullets.push(`Current market chance is ${formatMarketChance(input.ask)}.`)
  }

  if (bullets.length === 0) {
    bullets.push(`${input.player}: ${input.label}`)
  }

  const flags = (input.flags ?? []).map(formatFlag).filter(Boolean)
  if (flags.length > 0 && bullets.length < 4) {
    bullets.push(`Risk check: ${flags.join(', ')}`)
  }

  return bullets.slice(0, 4)
}
