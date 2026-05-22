import type { LiquidityGrade } from './liquidity'

export type SignalDeltaType = 'new' | 'removed' | 'tier' | 'edge' | 'ask' | 'fairPrice' | 'liquidity'

export interface SignalDeltaSnapshot {
  id: string
  label?: string
  player?: string
  tier?: 'A' | 'B' | 'WATCH' | 'KILL' | string | null
  edge?: number | null
  ask?: number | null
  fairPrice?: number | null
  liquidityGrade?: LiquidityGrade | null
}

export interface SignalDeltaThresholds {
  edge: number
  ask: number
  fairPrice: number
}

export interface ComputeSignalDeltasOptions {
  thresholds?: Partial<SignalDeltaThresholds>
}

export interface SignalDelta {
  id: string
  type: SignalDeltaType
  label: string
  before?: string | number | null
  after?: string | number | null
  magnitude?: number
}

export const DEFAULT_SIGNAL_DELTA_THRESHOLDS: SignalDeltaThresholds = {
  edge: 0.01,
  ask: 0.01,
  fairPrice: 0.01,
}

function signalName(signal: SignalDeltaSnapshot) {
  return signal.label ?? signal.player ?? signal.id
}

function toMap(signals: SignalDeltaSnapshot[]) {
  return new Map(signals.map((signal) => [signal.id, signal]))
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function roundedDelta(before: number, after: number) {
  return Math.round((after - before) * 1000) / 1000
}

function changedNumber(
  deltas: SignalDelta[],
  signal: SignalDeltaSnapshot,
  type: 'edge' | 'ask' | 'fairPrice',
  before: number | null | undefined,
  after: number | null | undefined,
  threshold: number,
) {
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) return

  const rawMagnitude = after - before
  if (Math.abs(rawMagnitude) < threshold) return

  const magnitude = roundedDelta(before, after)

  deltas.push({
    id: signal.id,
    type,
    label: `${signalName(signal)} ${type} moved ${formatSignedNumber(magnitude)}`,
    before,
    after,
    magnitude,
  })
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value)
}

export function computeSignalDeltas(
  previous: SignalDeltaSnapshot[],
  next: SignalDeltaSnapshot[],
  options: ComputeSignalDeltasOptions = {},
): SignalDelta[] {
  const thresholds = { ...DEFAULT_SIGNAL_DELTA_THRESHOLDS, ...options.thresholds }
  const previousById = toMap(previous)
  const nextById = toMap(next)
  const deltas: SignalDelta[] = []

  for (const signal of next) {
    const prior = previousById.get(signal.id)

    if (!prior) {
      deltas.push({
        id: signal.id,
        type: 'new',
        label: `New signal: ${signalName(signal)}`,
        after: signal.tier ?? null,
      })
      continue
    }

    if ((prior.tier ?? null) !== (signal.tier ?? null)) {
      deltas.push({
        id: signal.id,
        type: 'tier',
        label: `${signalName(signal)} tier changed`,
        before: prior.tier ?? null,
        after: signal.tier ?? null,
      })
    }

    changedNumber(deltas, signal, 'edge', prior.edge, signal.edge, thresholds.edge)
    changedNumber(deltas, signal, 'ask', prior.ask, signal.ask, thresholds.ask)
    changedNumber(deltas, signal, 'fairPrice', prior.fairPrice, signal.fairPrice, thresholds.fairPrice)

    if ((prior.liquidityGrade ?? null) !== (signal.liquidityGrade ?? null)) {
      deltas.push({
        id: signal.id,
        type: 'liquidity',
        label: `${signalName(signal)} liquidity changed`,
        before: prior.liquidityGrade ?? null,
        after: signal.liquidityGrade ?? null,
      })
    }
  }

  for (const signal of previous) {
    if (nextById.has(signal.id)) continue

    deltas.push({
      id: signal.id,
      type: 'removed',
      label: `Removed signal: ${signalName(signal)}`,
      before: signal.tier ?? null,
    })
  }

  return deltas
}
