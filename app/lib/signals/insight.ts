import type { LiquidityGrade } from './liquidity'

export type SignalDecision = 'actionable' | 'watch' | 'pass' | 'stale' | 'trap' | 'thin'

export interface ClassifySignalDecisionInput {
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

export function classifySignalDecision(input: ClassifySignalDecisionInput): SignalDecisionResult {
  const now = input.now ?? new Date()
  const flags = normalizedFlags(input.flags)
  const tier = input.tier ?? 'WATCH'
  const edge = input.edge

  if (flags.has('stale') || isGeneratedAtStale(input.generatedAt, now)) {
    return result('stale', 'Stale signal', 'Signal is stale; refresh before acting.')
  }

  if (flags.has('trap') || flags.has('price_trap') || flags.has('bad_line')) {
    return result('trap', 'Execution trap', 'Flagged as a trap; do not chase this price.')
  }

  if (isFiniteNumber(input.ask) && isFiniteNumber(input.maxBuy) && input.ask > input.maxBuy) {
    return result('trap', 'Above max buy', `Ask ${formatCents(input.ask)} is above max buy ${formatCents(input.maxBuy)}.`)
  }

  if (tier === 'KILL') {
    return result('pass', 'Pass', 'Kill-tier signal; no entry.')
  }

  if (!isFiniteNumber(edge) || edge <= 0) {
    return result('pass', 'Pass', 'No positive edge available.')
  }

  if (input.liquidityGrade === 'blocked' || input.liquidityGrade === 'thin') {
    return result('thin', 'Thin liquidity', 'Execution liquidity is too thin for an actionable call.')
  }

  if (tier === 'A' && edge >= ACTIONABLE_EDGE && (input.liquidityGrade === 'real' || input.liquidityGrade === 'deep')) {
    return result('actionable', 'Actionable signal', `A-tier signal with ${formatSignedCents(edge)} edge and executable liquidity.`)
  }

  if ((tier === 'A' || tier === 'B' || tier === 'WATCH') && edge >= WATCH_EDGE) {
    return result('watch', 'Watch signal', 'Positive edge, but keep on watch until tier, price, or liquidity improves.')
  }

  return result('pass', 'Pass', 'Edge is below the watch threshold.')
}

function formatSignedCents(value: number) {
  const cents = value * 100
  const sign = cents > 0 ? '+' : ''
  return `${sign}${formatNumber(cents)}c`
}

function formatCents(value: number) {
  return `${formatNumber(value * 100)}c`
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
    bullets.push(`Price gap is the trigger: ${formatCents(input.fairPrice)} fair vs ${formatCents(input.ask)} ask (${formatSignedCents(input.edge)} cushion).`)
  } else if (isFiniteNumber(input.edge)) {
    bullets.push(`Price gap is the trigger: ${formatSignedCents(input.edge)} cushion vs market.`)
  } else if (isFiniteNumber(input.fairPrice)) {
    bullets.push(`Model likes the side at ${formatCents(input.fairPrice)} fair.`)
  } else if (isFiniteNumber(input.ask)) {
    bullets.push(`Current entry is ${formatCents(input.ask)}.`)
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
