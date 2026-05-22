import { describe, expect, it } from 'vitest'
import { detectCorrelationWarnings } from './correlation'

describe('detectCorrelationWarnings', () => {
  it('flags duplicate tickers and duplicate player metric legs as danger', () => {
    const warnings = detectCorrelationWarnings([
      { player: 'Jalen Brunson', team: 'NYK', gameId: 'nyk-ind', metric: 'points', ticker: 'KXNBAPTS-NYKIND-JBRUNSON-20' },
      { player: 'Jalen Brunson', team: 'NYK', gameId: 'nyk-ind', metric: 'points', ticker: 'KXNBAPTS-NYKIND-JBRUNSON-20' },
    ])

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'danger', label: 'Duplicate ticker' }),
      expect.objectContaining({ severity: 'danger', label: 'Duplicate player prop' }),
    ]))
  })

  it('flags same-game clusters and same-team stacks', () => {
    const warnings = detectCorrelationWarnings([
      { player: 'Jalen Brunson', team: 'NYK', gameId: 'nyk-ind', metric: 'points' },
      { player: 'Josh Hart', team: 'NYK', gameId: 'nyk-ind', metric: 'rebounds' },
      { player: 'Tyrese Haliburton', team: 'IND', gameId: 'nyk-ind', metric: 'assists' },
    ])

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'watch', label: 'Same-game cluster' }),
      expect.objectContaining({ severity: 'watch', label: 'Same-team stack' }),
    ]))
  })

  it('flags pitcher-vs-hitter conflicts in the same game', () => {
    const warnings = detectCorrelationWarnings([
      { player: 'Gerrit Cole', team: 'NYY', gameId: 'nyy-bos', metric: 'strikeouts', label: 'Gerrit Cole 7+ strikeouts' },
      { player: 'Rafael Devers', team: 'BOS', gameId: 'nyy-bos', metric: 'hits + runs + RBIs', label: 'Rafael Devers 2+ HRR' },
    ])

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'danger', label: 'Pitcher vs hitter' }),
    ]))
  })

  it('flags thin liquidity when ask size is missing or below threshold', () => {
    const warnings = detectCorrelationWarnings([
      { player: 'Aaron Judge', ticker: 'KXMLBHRR-NYYBOS-AJUDGE-3', askSize: 2 },
      { player: 'Juan Soto', ticker: 'KXMLBHRR-NYYBOS-JSOTO-2', askSize: null },
    ])

    expect(warnings.filter((warning) => warning.label === 'Thin liquidity')).toHaveLength(2)
    expect(warnings.every((warning) => warning.detail.length > 0)).toBe(true)
  })
})
