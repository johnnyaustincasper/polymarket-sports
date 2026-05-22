import { describe, expect, it } from 'vitest'
import { getLivePropProgress } from './prop-progress'

describe('getLivePropProgress', () => {
  it('reads player values from a stats array', () => {
    const progress = getLivePropProgress({
      stats: [
        { athlete: { displayName: 'Jalen Brunson' }, name: 'points', value: 24 },
      ],
    }, 'Jalen Brunson', 'points', 20)

    expect(progress).toEqual({ value: 24, line: 20, hit: true, label: '24 / 20 points' })
  })

  it('reads player values from statistics objects', () => {
    const progress = getLivePropProgress({
      statistics: [
        { player: 'Anthony Davis', statistics: { rebounds: 9, assists: 3 } },
      ],
    }, 'Anthony Davis', 'rebounds', 10)

    expect(progress).toEqual({ value: 9, line: 10, hit: false, label: '9 / 10 rebounds' })
  })

  it('reads player values from direct row arrays', () => {
    const progress = getLivePropProgress([
      { playerName: 'Caitlin Clark', stat: 'assists', value: '11' },
    ], 'Caitlin Clark', 'assists', 8.5)

    expect(progress).toEqual({ value: 11, line: 8.5, hit: true, label: '11 / 8.5 assists' })
  })

  it('computes HRR from hits, runs, and RBIs', () => {
    const progress = getLivePropProgress({
      stats: [
        { player: 'Aaron Judge', hits: 1, runs: 1, rbi: 2 },
      ],
    }, 'Aaron Judge', 'hits + runs + RBIs', 3)

    expect(progress).toEqual({ value: 4, line: 3, hit: true, label: '4 / 3 hits + runs + RBIs' })
  })

  it('aggregates HRR when live data stores component stats in separate rows', () => {
    const progress = getLivePropProgress({
      stats: [
        { player: 'Aaron Judge', stat: 'hits', value: 1 },
        { player: 'Aaron Judge', stat: 'runs', value: 1 },
        { player: 'Aaron Judge', stat: 'rbi', value: 2 },
      ],
    }, 'Aaron Judge', 'hits + runs + RBIs', 3)

    expect(progress).toEqual({ value: 4, line: 3, hit: true, label: '4 / 3 hits + runs + RBIs' })
  })

  it('returns null when no matching player stat exists', () => {
    expect(getLivePropProgress({ stats: [] }, 'Shohei Ohtani', 'home runs', 1)).toBeNull()
  })
})
