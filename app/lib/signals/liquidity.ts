export type LiquidityGrade = 'blocked' | 'thin' | 'real' | 'deep' | 'unknown'

export interface GradeLiquidityInput {
  ask?: number | null
  askSize?: number | null
  bid?: number | null
  bidSize?: number | null
  lastTradeAt?: string | null
  now?: Date
}

export interface LiquidityGradeResult {
  grade: LiquidityGrade
  label: string
  warnings: string[]
}

const THIN_ASK_SIZE = 25
const REAL_ASK_SIZE = 50
const DEEP_ASK_SIZE = 250
const THIN_BID_SIZE = 10
const REAL_BID_SIZE = 25
const DEEP_BID_SIZE = 150
const REAL_MAX_SPREAD = 0.12
const DEEP_MAX_SPREAD = 0.06
const WIDE_SPREAD = 0.15
const STALE_TRADE_MS = 60 * 60 * 1000

function isUsableNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasPositiveSize(value: number | null | undefined): value is number {
  return isUsableNumber(value) && value > 0
}

function hasPrice(value: number | null | undefined): value is number {
  return isUsableNumber(value) && value > 0 && value < 1
}

function pushWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning)
}

function isStale(lastTradeAt: string | null | undefined, now: Date) {
  if (!lastTradeAt) return false

  const tradedAt = new Date(lastTradeAt).getTime()
  if (!Number.isFinite(tradedAt)) return false

  return now.getTime() - tradedAt > STALE_TRADE_MS
}

export function gradeLiquidity(input: GradeLiquidityInput): LiquidityGradeResult {
  const now = input.now ?? new Date()
  const warnings: string[] = []
  const hasAnyBookData = [input.ask, input.askSize, input.bid, input.bidSize].some((value) => value !== null && value !== undefined)

  if (!hasAnyBookData) {
    return {
      grade: 'unknown',
      label: 'Unknown liquidity',
      warnings: ['missing_book'],
    }
  }

  if (!hasPrice(input.ask)) pushWarning(warnings, 'missing_ask')
  if (!hasPositiveSize(input.askSize)) pushWarning(warnings, 'missing_ask_size')

  if (warnings.includes('missing_ask') || warnings.includes('missing_ask_size')) {
    if (isStale(input.lastTradeAt, now)) pushWarning(warnings, 'stale_trade')

    return {
      grade: 'blocked',
      label: 'Blocked liquidity',
      warnings,
    }
  }

  const ask = input.ask
  const askSize = input.askSize
  if (!hasPrice(ask) || !hasPositiveSize(askSize)) {
    return {
      grade: 'blocked',
      label: 'Blocked liquidity',
      warnings,
    }
  }

  const bid = hasPrice(input.bid) ? input.bid : null
  const bidSize = hasPositiveSize(input.bidSize) ? input.bidSize : 0
  const spread = bid === null ? null : ask - bid

  if (askSize < THIN_ASK_SIZE) pushWarning(warnings, 'thin_ask')
  if (bid === null) pushWarning(warnings, 'missing_bid')
  if (bidSize > 0 && bidSize < THIN_BID_SIZE) pushWarning(warnings, 'thin_bid')
  if (bidSize === 0) pushWarning(warnings, 'missing_bid_size')
  if (spread !== null && spread > WIDE_SPREAD) pushWarning(warnings, 'wide_spread')
  if (spread !== null && spread < 0) pushWarning(warnings, 'crossed_book')
  if (isStale(input.lastTradeAt, now)) pushWarning(warnings, 'stale_trade')

  const wideOrStaleOrCrossed = warnings.some((warning) => ['wide_spread', 'stale_trade', 'crossed_book'].includes(warning))
  const hasDeepBook = askSize >= DEEP_ASK_SIZE && bidSize >= DEEP_BID_SIZE && spread !== null && spread <= DEEP_MAX_SPREAD
  const hasRealBook = askSize >= REAL_ASK_SIZE && bidSize >= REAL_BID_SIZE && spread !== null && spread <= REAL_MAX_SPREAD

  if (hasDeepBook && !wideOrStaleOrCrossed) {
    return { grade: 'deep', label: 'Deep liquidity', warnings }
  }

  if (hasRealBook && !wideOrStaleOrCrossed) {
    return { grade: 'real', label: 'Real liquidity', warnings }
  }

  return {
    grade: 'thin',
    label: 'Thin liquidity',
    warnings,
  }
}
