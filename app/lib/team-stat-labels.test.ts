import { describe, expect, it } from 'vitest'
import { expandTeamStatLabel } from './team-stat-labels'

describe('expandTeamStatLabel', () => {
  it('spells out compact basketball stat labels for the mobile team profile', () => {
    expect(expandTeamStatLabel('PPG')).toBe('Points per game')
    expect(expandTeamStatLabel('RPG')).toBe('Rebounds per game')
    expect(expandTeamStatLabel('AST/TO')).toBe('Assist/turnover ratio')
    expect(expandTeamStatLabel('PFPG')).toBe('Personal fouls per game')
    expect(expandTeamStatLabel('GP')).toBe('Games played')
    expect(expandTeamStatLabel('GS')).toBe('Games started')
    expect(expandTeamStatLabel('MIN')).toBe('Total minutes')
    expect(expandTeamStatLabel('MPG')).toBe('Minutes per game')
    expect(expandTeamStatLabel('REB')).toBe('Total rebounds')
    expect(expandTeamStatLabel('APG')).toBe('Assists per game')
  })

  it('leaves already-readable labels intact', () => {
    expect(expandTeamStatLabel('Home runs')).toBe('Home runs')
    expect(expandTeamStatLabel('Total yards per game')).toBe('Total yards per game')
  })
})
