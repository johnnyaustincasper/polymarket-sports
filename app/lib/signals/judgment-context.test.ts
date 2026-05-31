import { describe, expect, it } from 'vitest'
import { buildJudgmentContext, statValueForMetric } from './judgment-context'

const baseLast12 = [
  { eventId: 'g1', date: '2026-05-30', opponent: 'DEN', stats: { minutes: 37, points: 29, fieldGoalsMade: 10, fieldGoalsAttempted: 21, fieldGoalPct: 47.6, threePointersMade: 4, threePointersAttempted: 9, threePointPct: 44.4, freeThrowsMade: 5, freeThrowsAttempted: 6, freeThrowPct: 83.3, rebounds: 6, assists: 5 } },
  { eventId: 'g2', date: '2026-05-28', opponent: 'DAL', stats: { minutes: 35, points: 24, fieldGoalsMade: 8, fieldGoalsAttempted: 19, fieldGoalPct: 42.1, threePointersMade: 2, threePointersAttempted: 7, freeThrowsMade: 6, freeThrowsAttempted: 7, rebounds: 5, assists: 7 } },
  { eventId: 'g3', date: '2026-05-26', opponent: 'OKC', stats: { minutes: 38, points: 31, fieldGoalsMade: 11, fieldGoalsAttempted: 23, threePointersMade: 3, threePointersAttempted: 8, freeThrowsMade: 6, freeThrowsAttempted: 8, rebounds: 7, assists: 4 } },
  { eventId: 'g4', date: '2026-05-24', opponent: 'PHX', stats: { minutes: 32, points: 18, fieldGoalsMade: 7, fieldGoalsAttempted: 16, threePointersMade: 1, threePointersAttempted: 5, freeThrowsMade: 3, freeThrowsAttempted: 4, rebounds: 4, assists: 6 } },
  { eventId: 'g5', date: '2026-05-22', opponent: 'LAL', stats: { minutes: 39, points: 37, fieldGoalsMade: 12, fieldGoalsAttempted: 25, threePointersMade: 5, threePointersAttempted: 11, freeThrowsMade: 8, freeThrowsAttempted: 9, rebounds: 8, assists: 3 } },
]

describe('signal judgment context', () => {
  it('extracts metric values and shooting-volume snapshots from full game logs', () => {
    expect(statValueForMetric(baseLast12[0], 'points')).toBe(29)
    expect(statValueForMetric(baseLast12[0], 'pts+reb+ast')).toBe(40)

    const context = buildJudgmentContext({
      player: 'Anthony Edwards',
      metric: 'points',
      line: 24.5,
      label: '25+ points',
      last12: baseLast12,
      lastGameMinutes: 37,
      risk: 'medium',
    })

    expect(context?.lastGame).toMatchObject({
      opponent: 'DEN',
      value: 29,
      minutes: 37,
      points: 29,
      fgMade: 10,
      fgAttempted: 21,
      fgPct: 47.6,
      threeMade: 4,
      threeAttempted: 9,
      ftMade: 5,
      ftAttempted: 6,
    })
    expect(context?.trend.last5Avg).toBe(27.8)
    expect(context?.trend.last5HitRate).toBe(3)
    expect(context?.trend.last5Games).toBe(5)
    expect(context?.volume.shotAttemptsLast5Avg).toBe(20.8)
    expect(context?.minutes.last5Avg).toBe(36.2)
  })

  it('writes judgment bullets around volume, minutes, matchup/injury risk, and playable number', () => {
    const context = buildJudgmentContext({
      player: 'Anthony Edwards',
      metric: 'points',
      line: 24.5,
      label: '25+ points',
      last12: baseLast12,
      lastGameMinutes: 37,
      risk: 'medium',
      teamIntel: {
        pace: { edgeLabel: 'fast', implication: 'Pace helps shot volume.' },
        injuryImpact: { homeNotes: ['Opponent missing a wing defender'] },
      },
      todayIntel: {
        lineup: { status: 'confirmed starter', reason: 'Normal starter minutes expected' },
        injuryContext: ['Teammate questionable could push usage his way'],
        usageContext: ['20+ shots in four straight games'],
        whatCouldKillIt: ['Blowout risk could cut 4Q minutes'],
      },
    })

    expect(context?.summaryBullets).toContain('Last game: 29 pts, 10/21 FG (47.6%), 4/9 3PT (44.4%), 5/6 FT in 37 min.')
    expect(context?.summaryBullets).toContain('Volume: 20.8 shots, 8.0 threes, and 6.8 free throws per game over the last 5.')
    expect(context?.summaryBullets.some(bullet => bullet.includes('Minutes: 37 last game / 36.2 last 5'))).toBe(true)
    expect(context?.matchupNotes.join(' ')).toMatch(/Pace helps shot volume|Opponent missing/)
    expect(context?.riskNotes.join(' ')).toMatch(/Blowout risk/)
    expect(context?.playableNumber).toBe('Playable at 24.5. Pass if the line moves past 25.5.')
  })

  it('supports MLB combo props without calling them points', () => {
    const last12 = [
      { eventId: 'm1', date: '2026-05-30', opponent: 'BAL', stats: { hits: 2, runs: 1, RBIs: 3, totalBases: 5 } },
      { eventId: 'm2', date: '2026-05-29', opponent: 'NYY', stats: { hits: 1, runs: 0, RBIs: 1, totalBases: 2 } },
      { eventId: 'm3', date: '2026-05-28', opponent: 'BOS', stats: { hits: 0, runs: 1, RBIs: 0, totalBases: 0 } },
    ]

    expect(statValueForMetric(last12[0], 'hits + runs + RBIs')).toBe(6)
    const context = buildJudgmentContext({
      player: 'Vladimir Guerrero Jr.',
      metric: 'hits + runs + RBIs',
      label: '3+ hits + runs + RBIs',
      line: 3,
      last12,
    })

    expect(context?.lastGame.value).toBe(6)
    expect(context?.summaryBullets[0]).toBe('Last game: 6 hits + runs + RBIs.')
    expect(context?.trend.last5HitRate).toBe(1)
  })
})
