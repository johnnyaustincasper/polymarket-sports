import { describe, expect, it } from 'vitest'
import { buildKalshiUFCFightIntel } from './kalshi-fight-intel'

const base = {
  eventTicker: 'KXUFCFIGHT-TEST',
  series: 'KXUFCFIGHT',
  categoryPriority: 1,
  yesBid: 0,
  yesBidSize: 0,
  status: 'open',
  url: 'https://kalshi.com',
}

describe('buildKalshiUFCFightIntel', () => {
  it('promotes the clean winner read above the raw market list', () => {
    const intel = buildKalshiUFCFightIntel([
      { ...base, ticker: 'A', category: 'Winner', fighter: 'Alex Silva', title: 'Will Alex Silva win?', yesAsk: 66, yesAskSize: 140 },
      { ...base, ticker: 'B', category: 'Winner', fighter: 'Ben Cruz', title: 'Will Ben Cruz win?', yesAsk: 34, yesAskSize: 80 },
      { ...base, ticker: 'D', category: 'Distance', fighter: 'Fight goes the distance', title: 'Will the fight go the distance?', yesAsk: 58, yesAskSize: 90 },
    ])

    expect(intel.primaryLean).toBe('Alex Silva 66%')
    expect(intel.marketRead).toContain('market lean')
    expect(intel.recommendedLooks[0]).toMatchObject({ label: 'Start here', confidence: 'strong' })
    expect(intel.recommendedLooks[1].label).toBe('Fight script')
  })

  it('warns when derivative props are live but winner context is missing', () => {
    const intel = buildKalshiUFCFightIntel([
      { ...base, ticker: 'M1', category: 'Victory Method', fighter: 'By KO/TKO', title: 'Will the fight end by KO/TKO?', yesAsk: 42, yesAskSize: 12 },
      { ...base, ticker: 'R1', category: 'Victory Round', fighter: 'Round 1', title: 'Will the fight end in round 1?', yesAsk: 31, yesAskSize: 10 },
    ])

    expect(intel.primaryLean).toBe('No clear fighter lean yet')
    expect(intel.redFlags).toContain('No clean winner market found yet; start with fight style, not props.')
    expect(intel.recommendedLooks[0]).toMatchObject({ label: 'Method clue', confidence: 'watch' })
  })
})
