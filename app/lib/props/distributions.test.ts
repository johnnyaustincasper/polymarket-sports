import { describe, expect, it } from 'vitest'
import { buildPropLadder, buildStatDistribution, getMetricStatValue } from './distributions'

describe('prop stat distributions', () => {
  it('computes mean, median, quartiles, min/max, and hit rate from numeric values', () => {
    const distribution = buildStatDistribution([10, null, 14, undefined, 18, 30], 15)

    expect(distribution).toEqual({
      count: 4,
      mean: 18,
      median: 16,
      p25: 13,
      p75: 21,
      min: 10,
      max: 30,
      hitRate: 0.5,
      volatility: 'high',
      values: [10, 14, 18, 30],
    })
  })

  it('returns null distribution fields and unknown volatility for empty arrays', () => {
    expect(buildStatDistribution([null, undefined], 10)).toEqual({
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
    })
  })

  it('leaves hit rate null when no line is supplied', () => {
    expect(buildStatDistribution([1, 2, 3]).hitRate).toBeNull()
  })
})

describe('prop ladders', () => {
  it('counts hits using greater-than-or-equal thresholds', () => {
    expect(buildPropLadder([9, 10, 10, 11], [10, 11, 12])).toEqual([
      { line: 10, hits: 3, games: 4, hitRate: 0.75 },
      { line: 11, hits: 1, games: 4, hitRate: 0.25 },
      { line: 12, hits: 0, games: 4, hitRate: 0 },
    ])
  })

  it('returns zero-game ladder rows for empty arrays', () => {
    expect(buildPropLadder([], [1, 2])).toEqual([
      { line: 1, hits: 0, games: 0, hitRate: 0 },
      { line: 2, hits: 0, games: 0, hitRate: 0 },
    ])
  })
})

describe('metric stat aliases', () => {
  it('extracts NBA stat aliases and computes PRA from component stats', () => {
    const log = { pts: 27, total_rebounds: '11', ast: 8 }

    expect(getMetricStatValue(log, 'points')).toBe(27)
    expect(getMetricStatValue(log, 'rebounds')).toBe(11)
    expect(getMetricStatValue(log, 'assists')).toBe(8)
    expect(getMetricStatValue(log, 'PRA')).toBe(46)
    expect(getMetricStatValue(log, 'PTS+REB+AST')).toBe(46)
  })

  it('extracts MLB stat aliases', () => {
    const log = {
      h: 3,
      home_runs: 1,
      strikeOuts: '7',
      totalBases: 6,
    }

    expect(getMetricStatValue(log, 'hits')).toBe(3)
    expect(getMetricStatValue(log, 'home runs')).toBe(1)
    expect(getMetricStatValue(log, 'strikeouts')).toBe(7)
    expect(getMetricStatValue(log, 'total bases')).toBe(6)
  })

  it('returns null for unknown metrics or non-numeric values', () => {
    expect(getMetricStatValue({ pts: 'DNP' }, 'points')).toBeNull()
    expect(getMetricStatValue({ points: 10 }, 'steals')).toBeNull()
  })
})
