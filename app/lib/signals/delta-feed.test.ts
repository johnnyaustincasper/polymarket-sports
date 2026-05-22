import { describe, expect, it } from 'vitest'
import { computeSignalDeltas } from './delta-feed'

describe('computeSignalDeltas', () => {
  it('emits new-signal deltas for ids that appear in the next feed', () => {
    const deltas = computeSignalDeltas([], [
      { id: 'sig-1', label: 'Brunson over points', tier: 'A', edge: 0.09, ask: 0.52, fairPrice: 0.61, liquidityGrade: 'real' },
    ])

    expect(deltas).toEqual([
      expect.objectContaining({ id: 'sig-1', type: 'new', label: expect.stringContaining('New signal') }),
    ])
  })

  it('emits tier, edge, ask, fair-price, and liquidity changes above thresholds', () => {
    const deltas = computeSignalDeltas(
      [{ id: 'sig-1', label: 'Brunson over points', tier: 'B', edge: 0.04, ask: 0.55, fairPrice: 0.59, liquidityGrade: 'thin' }],
      [{ id: 'sig-1', label: 'Brunson over points', tier: 'A', edge: 0.08, ask: 0.50, fairPrice: 0.64, liquidityGrade: 'real' }],
    )

    expect(deltas).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tier', before: 'B', after: 'A' }),
      expect.objectContaining({ type: 'edge', magnitude: 0.04 }),
      expect.objectContaining({ type: 'ask', magnitude: -0.05 }),
      expect.objectContaining({ type: 'fairPrice', magnitude: 0.05 }),
      expect.objectContaining({ type: 'liquidity', before: 'thin', after: 'real' }),
    ]))
  })

  it('ignores tiny price and edge moves at default thresholds', () => {
    const deltas = computeSignalDeltas(
      [{ id: 'sig-1', tier: 'A', edge: 0.080, ask: 0.520, fairPrice: 0.610, liquidityGrade: 'real' }],
      [{ id: 'sig-1', tier: 'A', edge: 0.089, ask: 0.511, fairPrice: 0.619, liquidityGrade: 'real' }],
    )

    expect(deltas).toEqual([])
  })

  it('supports custom thresholds for more sensitive feeds', () => {
    const deltas = computeSignalDeltas(
      [{ id: 'sig-1', edge: 0.080, ask: 0.520, fairPrice: 0.610 }],
      [{ id: 'sig-1', edge: 0.089, ask: 0.511, fairPrice: 0.619 }],
      { thresholds: { edge: 0.005, ask: 0.005, fairPrice: 0.005 } },
    )

    expect(deltas.map((delta) => delta.type).sort()).toEqual(['ask', 'edge', 'fairPrice'])
  })

  it('compares raw moves to thresholds before rounding display magnitudes', () => {
    const deltas = computeSignalDeltas(
      [{ id: 'sig-1', edge: 0.0800 }],
      [{ id: 'sig-1', edge: 0.0896 }],
    )

    expect(deltas).toEqual([])
  })
})
