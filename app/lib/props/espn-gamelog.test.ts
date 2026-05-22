import { describe, expect, it } from 'vitest'
import { parseEspnStat, parseNbaGameLogStats } from './espn-gamelog'

describe('ESPN NBA gamelog stat parsing', () => {
  it('extracts made threes from ESPN made-attempted composite fields', () => {
    const names = [
      'minutes',
      'fieldGoalsMade-fieldGoalsAttempted',
      'fieldGoalPct',
      'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
      'threePointPct',
      'totalRebounds',
      'assists',
      'blocks',
      'steals',
      'turnovers',
      'points',
    ]
    const row = ['36', '4-16', '25.0', '3-10', '30.0', '4', '4', '0', '2', '4', '17']

    expect(parseEspnStat(names, row, ['threePointFieldGoalsMade', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'])).toBe(3)
    expect(parseNbaGameLogStats(names, row)).toMatchObject({
      minutes: 36,
      points: 17,
      rebounds: 4,
      assists: 4,
      threes: 3,
      steals: 2,
      blocks: 0,
      turnovers: 4,
    })
  })
})
