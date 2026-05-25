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

  it('spells out compact baseball stat labels for the mobile team profile', () => {
    expect(expandTeamStatLabel('G')).toBe('Games')
    expect(expandTeamStatLabel('AB')).toBe('At bats')
    expect(expandTeamStatLabel('H')).toBe('Hits')
    expect(expandTeamStatLabel('R')).toBe('Runs')
    expect(expandTeamStatLabel('RBI')).toBe('Runs batted in')
    expect(expandTeamStatLabel('HR')).toBe('Home runs')
    expect(expandTeamStatLabel('SB')).toBe('Stolen bases')
    expect(expandTeamStatLabel('BA')).toBe('Batting average')
    expect(expandTeamStatLabel('OBP')).toBe('On-base percentage')
    expect(expandTeamStatLabel('OPS')).toBe('On-base plus slugging')
  })

  it('leaves already-readable labels intact', () => {
    expect(expandTeamStatLabel('Home runs')).toBe('Home runs')
    expect(expandTeamStatLabel('Total yards per game')).toBe('Total yards per game')
  })
})
