import { describe, expect, it } from 'vitest'
import { publicBullets, publicResponse, stripPublicJargon } from '../../lib/signals/public-response'

const baseSignal = {
  id: 'nba-1-player-points-ladder',
  sport: 'nba',
  gameId: '1',
  matchup: 'DAL @ BOS',
  gameTime: '8:00 PM',
  player: 'Normie Guard',
  team: 'DAL',
  metric: 'points',
  label: '10+ / 15+ points',
  tier: 'A',
  projectedHitPct: 83,
  fairPrice: 83,
  ask: 32,
  maxBuy: 45,
  edge: 51,
  confidence: 91,
  hits: 11,
  games: 12,
  avg: 18.4,
  risk: 'medium',
  liquidity: 100,
  ticker: 'KXNBA-TEST',
  url: 'https://kalshi.com/markets/test',
  reasons: [
    '1c ask is extreme misprice vs 83 fair with huge edge cushion.',
    'Recent form: 11/12 clears with a 18.4 average.',
    'Do not chase if minutes get capped.',
  ],
  flags: ['Thin liquidity', 'Line moved against the signal'],
  createdAt: '2026-05-30T12:00:00.000Z',
  metadata: {
    recentGames: [{ value: 18, opponent: 'BOS' }],
    lineOptions: [
      { id: 'low', label: '10+ points', line: 10, ask: 32, fairPrice: 83, edge: 51, maxBuy: 45, tier: 'A', hits: 11, games: 12, avg: 18.4, ticker: 'LOW', url: 'https://kalshi.com/low' },
      { id: 'high', label: '15+ points', line: 15, ask: 44, fairPrice: 68, edge: 24, maxBuy: 50, tier: 'B', hits: 9, games: 12, avg: 18.4, ticker: 'HIGH', url: 'https://kalshi.com/high' },
    ],
    todayIntel: {
      displayBullets: ['32¢ ask is free vs fair value', 'He only needs 10 points and his minutes are stable.'],
      riskFactors: ['Ask/liquidity got worse', 'A blowout could cut minutes.'],
      whatCouldKillIt: ['Minutes cap or late scratch.'],
      summary: 'No market math should leak.',
      generatedAt: '2026-05-30T12:00:00.000Z',
    },
  },
} as any

describe('public Today Signals response', () => {
  it('removes cents/trading jargon from normie-facing bullets instead of turning 32¢ into price language', () => {
    expect(stripPublicJargon('32¢ ask vs 83 fair leaves edge cushion')).not.toMatch(/32|¢|ask|fair|edge|cushion/i)
    const bullets = publicBullets(baseSignal)
    expect(bullets.join(' ')).not.toMatch(/¢|\b\d+c\b|ask|fair|edge|misprice|cushion|liquidity/i)
    expect(bullets.join(' ')).toContain('Recent form')
  })

  it('does not expose raw market pricing fields or line option prices to public app responses', () => {
    const response = publicResponse({
      sport: 'nba',
      generatedAt: '2026-05-30T12:00:00.000Z',
      gamesScanned: 1,
      contractsScored: 2,
      signals: [baseSignal],
      summary: { a: 1, b: 0, watch: 0, avgEdge: 51, bestEdge: 51 },
    } as any) as any

    const publicSignal = response.signals[0]
    expect(publicSignal.ask).toBeUndefined()
    expect(publicSignal.fairPrice).toBeUndefined()
    expect(publicSignal.edge).toBeUndefined()
    expect(publicSignal.maxBuy).toBeUndefined()
    expect(publicSignal.liquidity).toBeUndefined()
    expect(publicSignal.metadata.lineOptions[0]).toEqual({ id: 'low', label: '10+ points', line: 10, tier: 'A', hits: 11, games: 12, avg: 18.4 })
    expect(JSON.stringify(publicSignal)).not.toMatch(/¢|\b\d+c\b|ask|fairPrice|edge|maxBuy|liquidity/i)
  })
})
