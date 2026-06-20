import { describe, expect, it } from 'vitest'
import { buildBaselineUFCEventAnalysis } from '../../lib/ufc/deep-analysis-service'

describe('UFC analysis route baseline fallback', () => {
  it('returns an available partial ESPN-backed analysis instead of unavailable stale/missing state', () => {
    const event = {
      id: 'event-1',
      name: 'UFC Test Card',
      date: '2026-06-20T21:00:00.000Z',
      venue: 'Test Arena',
      location: 'Las Vegas, NV',
      status: 'pre',
      fights: [
        {
          id: 'fight-1',
          boutOrder: 1,
          isMainEvent: true,
          weightClass: 'Flyweight',
          isTitleFight: false,
          status: 'pre',
          statusDetail: 'Tonight',
          fighterA: { id: 'a', name: 'Kyoji Horiguchi', record: '36-5-0', ranking: null, country: 'JP', age: null, height: '', reach: '', headshot: '' },
          fighterB: { id: 'b', name: 'Manel Kape', record: '21-7-0', ranking: null, country: 'AO', age: null, height: '', reach: '', headshot: '' },
          moneyLineA: 140,
          moneyLineB: -165,
          polyOdds: { hasWinner: false, fighterAWin: null, fighterBWin: null },
        },
      ],
    } as any

    const analysis = buildBaselineUFCEventAnalysis(event, 'stale')

    expect(analysis.status).toBe('partial')
    expect(analysis.eventId).toBe('event-1')
    expect(analysis.fights).toHaveLength(1)
    expect(analysis.fights[0].ai.pick).not.toMatch(/^pass$/i)
    expect(analysis.fights[0].bettingAngles[0].label).not.toMatch(/pass/i)
    expect(analysis.cardSummary.headline).toContain('baseline UFC matchup snapshot')
    expect(analysis.cardSummary.passFights.join(' ')).not.toContain('pass')
  })
})
