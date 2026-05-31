import { describe, expect, it } from 'vitest'
import { parseEspnStat, parseNbaGameLogStats } from './espn-gamelog'

describe('ESPN NBA gamelog stat parsing', () => {
  it('extracts made threes from ESPN made-attempted composite stats', () => {
    const names = [
      'minutes',
      'fieldGoalsMade-fieldGoalsAttempted',
      'fieldGoalPct',
      'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
      'threePointPct',
      'freeThrowsMade-freeThrowsAttempted',
      'freeThrowPct',
      'totalRebounds',
      'assists',
      'blocks',
      'steals',
      'fouls',
      'turnovers',
      'points',
    ]
    const rowStats = ['36', '4-16', '25.0', '3-10', '30.0', '6-6', '100.0', '4', '4', '0', '2', '1', '4', '17']

    expect(parseEspnStat(names, rowStats, ['threePointFieldGoalsMade', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'])).toBe(3)
    expect(parseNbaGameLogStats(names, rowStats)).toMatchObject({
      minutes: 36,
      points: 17,
      rebounds: 4,
      assists: 4,
      blocks: 0,
      steals: 2,
      threes: 3,
      turnovers: 4,
      fieldGoalsMade: 4,
      fieldGoalsAttempted: 16,
      fieldGoalPct: 25,
      threePointersMade: 3,
      threePointersAttempted: 10,
      threePointPct: 30,
      freeThrowsMade: 6,
      freeThrowsAttempted: 6,
      freeThrowPct: 100,
    })
  })
})
