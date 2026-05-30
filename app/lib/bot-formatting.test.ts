import { describe, expect, it } from 'vitest'
import {
  formatCents,
  formatEdge,
  formatGameTime,
  formatPct,
  formatTimeUntil,
  formatUnits,
} from './bot-formatting'

describe('bot formatting helpers', () => {
  it('formats percentages, market chance, edges, and units with legacy precision/signs', () => {
    expect(formatPct(0.5512)).toBe('55.1%')
    expect(formatPct(0)).toBe('0.0%')

    expect(formatCents(0.456)).toBe('45.6%')

    expect(formatEdge(0.037)).toBe('+3.7%')
    expect(formatEdge(-0.012)).toBe('-1.2%')
    expect(formatEdge(0)).toBe('+0.0%')

    expect(formatUnits(0.12345)).toBe('+0.123u')
    expect(formatUnits(-0.5)).toBe('-0.500u')
    expect(formatUnits(0)).toBe('+0.000u')
  })

  it('formats game time through the same en-US short time display', () => {
    const formatted = formatGameTime('2026-05-20T15:05:00Z')

    expect(formatted).toMatch(/3:05|11:05|10:05|9:05|8:05|7:05|6:05|5:05|4:05|12:05|1:05|2:05/)
    expect(formatted).toMatch(/AM|PM/)
  })

  it('formats time until kickoff relative to an injectable clock', () => {
    const now = Date.parse('2026-05-20T12:00:00Z')

    expect(formatTimeUntil('2026-05-20T11:59:59Z', now)).toBe('Now')
    expect(formatTimeUntil('2026-05-20T12:45:00Z', now)).toBe('45m')
    expect(formatTimeUntil('2026-05-20T14:05:00Z', now)).toBe('2h 5m')
    expect(formatTimeUntil('2026-05-22T15:30:00Z', now)).toBe('2d 3h')
  })
})
