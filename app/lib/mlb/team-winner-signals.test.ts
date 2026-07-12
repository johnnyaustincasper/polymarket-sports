import { describe, expect, it } from 'vitest'
import { buildMlbTeamWinnerSignal } from './team-winner-signals'

describe('buildMlbTeamWinnerSignal', () => {
  it('leans to the team with the cleaner starter and offense matchup', () => {
    const signal = buildMlbTeamWinnerSignal({
      gameId: 'game-1',
      matchup: 'BAL @ NYY',
      gameTime: '7:05 PM',
      home: {
        abbr: 'NYY',
        record: '55-38',
        pitcher: { name: 'Ace Starter', era: 2.85, whip: 1.04, kPer9: 9.6, difficulty: 28 },
        battingProfile: { team: 'NYY', hitterCount: 9, hitsAvg: 1.05, totalBasesAvg: 1.75, hrrAvg: 2.4, strikeoutsAvg: 0.75, powerScore: 72, weaknessScore: 38 },
      },
      away: {
        abbr: 'BAL',
        record: '46-47',
        pitcher: { name: 'Volatile Starter', era: 5.10, whip: 1.48, kPer9: 6.8, difficulty: 72 },
        battingProfile: { team: 'BAL', hitterCount: 9, hitsAvg: 0.82, totalBasesAvg: 1.18, hrrAvg: 1.55, strikeoutsAvg: 1.22, powerScore: 43, weaknessScore: 67 },
      },
    })

    expect(signal?.team).toBe('NYY')
    expect(signal?.opponent).toBe('BAL')
    expect(signal?.score).toBeGreaterThan(65)
    expect(signal?.edge).toBeGreaterThan(10)
    expect(signal?.whyLive.join(' ')).toContain('Ace Starter')
    expect(signal?.whyLive.join(' ')).toContain('recent bats')
    expect(signal?.decision).toBe('PLAY')
    expect(signal?.playabilityScore).toBeGreaterThan(70)
    expect(signal?.playabilityReasons?.length).toBeGreaterThan(0)
    expect(signal?.numberDiscipline).toMatch(/fair|downgrade/i)
  })

  it('does not fake strength when the matchup gap is thin', () => {
    const signal = buildMlbTeamWinnerSignal({
      gameId: 'game-2',
      matchup: 'SEA @ TEX',
      home: {
        abbr: 'TEX',
        record: '48-45',
        pitcher: { name: 'Starter A', difficulty: 50 },
        battingProfile: { team: 'TEX', hitterCount: 8, powerScore: 55, weaknessScore: 48 },
      },
      away: {
        abbr: 'SEA',
        record: '47-46',
        pitcher: { name: 'Starter B', difficulty: 51 },
        battingProfile: { team: 'SEA', hitterCount: 8, powerScore: 54, weaknessScore: 50 },
      },
    })

    expect(signal).not.toBeNull()
    expect(['Price watch', 'Needs better setup']).toContain(signal?.label)
    expect(signal?.decision).toBe('PASS')
    expect(signal?.passReasons?.join(' ')).toMatch(/thin|volatile|force/i)
  })
})
