export type StatDistribution = {
  count: number
  mean: number | null
  median: number | null
  p25: number | null
  p75: number | null
  min: number | null
  max: number | null
  hitRate: number | null
  volatility: 'low' | 'medium' | 'high' | 'unknown'
  values: number[]
}

export function buildStatDistribution(values: Array<number | null | undefined>, line?: number | null): StatDistribution {
  const cleanValues = values.filter(isFiniteNumber).sort((a, b) => a - b)
  const count = cleanValues.length

  if (count === 0) {
    return {
      count: 0,
      mean: null,
      median: null,
      p25: null,
      p75: null,
      min: null,
      max: null,
      hitRate: null,
      volatility: 'unknown',
      values: [],
    }
  }

  const mean = cleanValues.reduce((sum, value) => sum + value, 0) / count
  const hits = isFiniteNumber(line) ? cleanValues.filter(value => value >= line).length : null

  return {
    count,
    mean,
    median: percentile(cleanValues, 0.5),
    p25: percentile(cleanValues, 0.25),
    p75: percentile(cleanValues, 0.75),
    min: cleanValues[0],
    max: cleanValues[count - 1],
    hitRate: hits === null ? null : hits / count,
    volatility: classifyVolatility(cleanValues, mean),
    values: cleanValues,
  }
}

export function buildPropLadder(values: number[], thresholds: number[]): Array<{ line: number; hits: number; games: number; hitRate: number }> {
  const cleanValues = values.filter(isFiniteNumber)
  const games = cleanValues.length

  return thresholds.filter(isFiniteNumber).map(line => {
    const hits = cleanValues.filter(value => value >= line).length

    return {
      line,
      hits,
      games,
      hitRate: games === 0 ? 0 : hits / games,
    }
  })
}

export function getMetricStatValue(log: Record<string, unknown>, metric: string): number | null {
  const normalizedMetric = normalizeKey(metric)

  if (isPraMetric(normalizedMetric)) {
    return findStatValue(log, [
      'pra',
      'ptsrebast',
      'ptsrebsast',
      'ptsrebsasts',
      'pointsreboundsassists',
      'pointsrebsasts',
    ]) ?? sumStats(log, ['points', 'rebounds', 'assists'])
  }

  const aliases = metricAliases[normalizedMetric]
  if (!aliases) return null

  return findStatValue(log, aliases)
}

const metricAliases: Record<string, string[]> = {
  points: ['points', 'point', 'pts', 'pt', 'p'],
  rebounds: ['rebounds', 'rebound', 'rebs', 'reb', 'totalrebounds', 'totalrebound', 'trb'],
  assists: ['assists', 'assist', 'asts', 'ast'],
  hits: ['hits', 'hit', 'h'],
  homeruns: ['homeruns', 'homerun', 'homers', 'hr', 'hrs'],
  strikeouts: ['strikeouts', 'strikeout', 'ks', 'k', 'so', 'pitcherstrikeouts'],
  totalbases: ['totalbases', 'totalbase', 'tb'],
}

function percentile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 1) return sortedValues[0]

  const index = (sortedValues.length - 1) * q
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower

  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight
}

function classifyVolatility(values: number[], mean: number): StatDistribution['volatility'] {
  if (!values.length) return 'unknown'

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const standardDeviation = Math.sqrt(variance)

  if (standardDeviation === 0) return 'low'
  if (mean === 0) return 'high'

  const coefficientOfVariation = standardDeviation / Math.abs(mean)
  if (coefficientOfVariation < 0.15) return 'low'
  if (coefficientOfVariation < 0.35) return 'medium'
  return 'high'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function findStatValue(log: Record<string, unknown>, aliases: string[]): number | null {
  const normalizedAliases = new Set(aliases.map(normalizeKey))

  for (const [key, value] of Object.entries(log)) {
    if (!normalizedAliases.has(normalizeKey(key))) continue

    const numericValue = toFiniteNumber(value)
    if (numericValue !== null) return numericValue
  }

  return null
}

function sumStats(log: Record<string, unknown>, metrics: Array<'points' | 'rebounds' | 'assists'>): number | null {
  const values = metrics.map(metric => findStatValue(log, metricAliases[metric]))
  if (values.some(value => value === null)) return null

  return values.reduce<number>((sum, value) => sum + Number(value), 0)
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function isPraMetric(metric: string): boolean {
  return ['pra', 'ptsrebast', 'ptsrebsast', 'ptsrebsasts', 'pointsreboundsassists', 'pointsrebsasts'].includes(metric)
}
