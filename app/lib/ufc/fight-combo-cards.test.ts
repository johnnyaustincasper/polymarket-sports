import { describe, expect, it } from 'vitest'
import { buildUfcComboCards, type UfcComboAnalysisFight, type UfcComboFight } from './fight-combo-cards'

const fight = (id: string, a: string, b: string, pick: string, price: number, size = 1000, confidence: UfcComboAnalysisFight['ai']['confidence'] = 'lean'): { kalshi: UfcComboFight; analysis: UfcComboAnalysisFight } => ({
  kalshi: {
    id,
    fighterA: a,
    fighterB: b,
    markets: [
      { ticker: `${id}-YES`, category: 'Winner', fighter: pick, title: `${pick} to win`, yesAsk: price, yesAskSize: size, url: `https://example.com/${id}` },
      { ticker: `${id}-NO`, category: 'Winner', fighter: pick === a ? b : a, title: 'Other side', yesAsk: 100 - price, yesAskSize: 500 },
    ],
  },
  analysis: {
    fighterA: { name: a, lastFive: [{ result: pick === a ? 'win' : 'loss', method: 'Decision' }, { result: 'win', method: 'KO/TKO' }] },
    fighterB: { name: b, lastFive: [{ result: pick === b ? 'win' : 'loss', method: 'Decision' }] },
    ai: { pick, confidence, method: 'Decision', thesis: `${pick} has the cleaner read.`, risks: ['Opponent can flip phase early.'] },
  },
})

describe('buildUfcComboCards', () => {
  it('builds curated multi-leg UFC cards from deep-analysis aligned winner markets', () => {
    const rows = [
      fight('f1', 'Manel Kape', 'Kyoji Horiguchi', 'Manel Kape', 59, 10000, 'solid'),
      fight('f2', 'Christian Rodriguez', 'Hyder Amil', 'Christian Rodriguez', 63, 2500, 'lean'),
      fight('f3', 'Navajo Stirling', 'Ion Cutelaba', 'Navajo Stirling', 75, 8000, 'lean'),
      fight('f4', 'Vinicius Oliveira', 'Andre Fili', 'Vinicius De Oliveira Prestes De Matos', 71, 3000, 'lean'),
    ]
    const cards = buildUfcComboCards(rows.map(r => r.kalshi), rows.map(r => r.analysis))
    expect(cards.length).toBeGreaterThanOrEqual(2)
    expect(cards[0].label).toBe('Smart 2-leg')
    expect(cards[0].legs).toHaveLength(2)
    expect(cards[0].estimatedReturn).toBeGreaterThan(2)
    expect(cards.flatMap(card => card.legs).every(leg => leg.price > 0 && leg.ticker)).toBe(true)
  })

  it('filters legs that do not match the cached fight pick or have unusable prices', () => {
    const good = fight('f1', 'A Fighter', 'B Fighter', 'A Fighter', 58, 1000, 'solid')
    const tooExpensive = fight('f2', 'C Fighter', 'D Fighter', 'C Fighter', 90, 1000, 'strong')
    const mismatch = fight('f3', 'E Fighter', 'F Fighter', 'E Fighter', 55, 1000, 'solid')
    mismatch.kalshi.markets[0].fighter = 'F Fighter'
    const cards = buildUfcComboCards([good.kalshi, tooExpensive.kalshi, mismatch.kalshi], [good.analysis, tooExpensive.analysis, mismatch.analysis])
    expect(cards).toEqual([])
  })
})
