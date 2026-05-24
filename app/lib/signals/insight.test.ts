import { describe, expect, it } from 'vitest'
import { buildWhyCare, classifySignalDecision } from './insight'

describe('classifySignalDecision', () => {
  const now = new Date('2026-05-22T16:00:00.000Z')

  it('classifies fresh A-tier signals with edge and executable liquidity as actionable', () => {
    const result = classifySignalDecision({
      tier: 'A',
      edge: 0.11,
      ask: 0.47,
      maxBuy: 0.55,
      liquidityGrade: 'real',
      generatedAt: '2026-05-22T15:56:00.000Z',
      now,
    })

    expect(result.decision).toBe('actionable')
    expect(result.label).toContain('Actionable')
    expect(result.reason).toContain('A-tier')
  })

  it('keeps B-tier or modest-edge signals on watch', () => {
    const result = classifySignalDecision({
      tier: 'B',
      edge: 0.045,
      ask: 0.50,
      maxBuy: 0.55,
      liquidityGrade: 'real',
      now,
    })

    expect(result.decision).toBe('watch')
    expect(result.reason).toContain('watch')
  })

  it('passes kill-tier or negative-edge signals', () => {
    expect(classifySignalDecision({ tier: 'KILL', edge: 0.20, liquidityGrade: 'deep', now }).decision).toBe('pass')
    expect(classifySignalDecision({ tier: 'A', edge: -0.01, liquidityGrade: 'deep', now }).decision).toBe('pass')
  })

  it('marks stale generated signals stale before other positive classifications', () => {
    const result = classifySignalDecision({
      tier: 'A',
      edge: 0.12,
      ask: 0.45,
      maxBuy: 0.55,
      liquidityGrade: 'deep',
      generatedAt: '2026-05-22T15:10:00.000Z',
      now,
    })

    expect(result.decision).toBe('stale')
    expect(result.reason).toContain('stale')
  })

  it('identifies trap flags and asks above max buy', () => {
    expect(classifySignalDecision({ tier: 'A', edge: 0.10, liquidityGrade: 'real', flags: ['trap'], now }).decision).toBe('trap')
    expect(classifySignalDecision({ tier: 'A', edge: 0.10, ask: 0.61, maxBuy: 0.55, liquidityGrade: 'deep', now }).decision).toBe('trap')
  })

  it('blocks actionable calls when execution liquidity is thin or blocked', () => {
    expect(classifySignalDecision({ tier: 'A', edge: 0.10, liquidityGrade: 'thin', now }).decision).toBe('thin')
    expect(classifySignalDecision({ tier: 'A', edge: 0.10, liquidityGrade: 'blocked', now }).decision).toBe('thin')
  })

  it('does not mark missing or unknown liquidity as actionable', () => {
    expect(classifySignalDecision({ tier: 'A', edge: 0.10, now }).decision).toBe('watch')
    expect(classifySignalDecision({ tier: 'A', edge: 0.10, liquidityGrade: 'unknown', now }).decision).toBe('watch')
  })
})

describe('buildWhyCare', () => {
  it('builds concise user-facing reasons with prices, hit rate, reasons, and flags', () => {
    const result = buildWhyCare({
      player: 'Jalen Brunson',
      label: 'Over 28.5 points',
      edge: 0.084,
      fairPrice: 0.61,
      ask: 0.52,
      hitRate: 0.67,
      hits: 8,
      games: 12,
      reasons: ['Usage jumps without OG', 'Knicks projected tight rotation'],
      flags: ['thin_liquidity'],
    })

    expect(result[0]).toContain('Jalen Brunson')
    expect(result).toEqual(expect.arrayContaining([
      expect.stringContaining('+8.4c edge'),
      expect.stringContaining('fair 61c vs ask 52c'),
      expect.stringContaining('8/12 hit in recent sample'),
      expect.stringContaining('Usage jumps without OG'),
      expect.stringContaining('Watch: thin liquidity'),
    ]))
    expect(result.length).toBeLessThanOrEqual(6)
  })

  it('omits unavailable numeric details instead of printing nulls', () => {
    const result = buildWhyCare({ player: 'Aja Wilson', label: 'Over rebounds' })

    expect(result.join(' ')).not.toMatch(/null|undefined|NaN/)
    expect(result[0]).toContain('Aja Wilson')
  })
})
