import { describe, expect, it } from 'vitest'
import { gradeLiquidity } from './liquidity'

describe('gradeLiquidity', () => {
  const now = new Date('2026-05-22T16:00:00.000Z')

  it('marks missing executable asks as blocked', () => {
    const result = gradeLiquidity({ bid: 0.43, bidSize: 100, now })

    expect(result.grade).toBe('blocked')
    expect(result.label).toContain('Blocked')
    expect(result.warnings).toContain('missing_ask')
  })

  it('grades tiny top-of-book size as thin with warnings', () => {
    const result = gradeLiquidity({ ask: 0.52, askSize: 12, bid: 0.49, bidSize: 8, now })

    expect(result.grade).toBe('thin')
    expect(result.label).toContain('Thin')
    expect(result.warnings).toEqual(expect.arrayContaining(['thin_ask', 'thin_bid']))
  })

  it('grades usable balanced books as real liquidity', () => {
    const result = gradeLiquidity({ ask: 0.54, askSize: 80, bid: 0.51, bidSize: 50, now })

    expect(result.grade).toBe('real')
    expect(result.label).toContain('Real')
    expect(result.warnings).toEqual([])
  })

  it('grades deep tight books as deep liquidity', () => {
    const result = gradeLiquidity({ ask: 0.54, askSize: 350, bid: 0.52, bidSize: 275, now })

    expect(result.grade).toBe('deep')
    expect(result.label).toContain('Deep')
    expect(result.warnings).toEqual([])
  })

  it('adds stale and wide-spread warnings without hiding executable liquidity', () => {
    const result = gradeLiquidity({
      ask: 0.64,
      askSize: 90,
      bid: 0.44,
      bidSize: 40,
      lastTradeAt: '2026-05-22T14:55:00.000Z',
      now,
    })

    expect(result.grade).toBe('thin')
    expect(result.warnings).toEqual(expect.arrayContaining(['wide_spread', 'stale_trade']))
  })

  it('returns unknown when no book data is present', () => {
    const result = gradeLiquidity({ now })

    expect(result.grade).toBe('unknown')
    expect(result.label).toContain('Unknown')
    expect(result.warnings).toContain('missing_book')
  })

  it('does not grade missing-bid books as real even with strong ask and bid size', () => {
    const result = gradeLiquidity({ ask: 0.50, askSize: 100, bidSize: 80, now })

    expect(result.grade).toBe('thin')
    expect(result.warnings).toContain('missing_bid')
  })
})
