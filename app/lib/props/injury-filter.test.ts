import { describe, expect, it } from 'vitest'
import { applyUnavailableInjuryFilter, shouldScratchPlayerFromInjuryReport } from './injury-filter'

describe('MLB props injury availability filter', () => {
  it('does not scratch a player whose injury feed says he will be activated and start', () => {
    const report = {
      name: 'Logan Henderson',
      team: 'Milwaukee Brewers',
      status: '15-Day-IL',
      detail: "Henderson (back) will be activated from the 15-day injured list and start Thursday's game in St. Louis.",
    }

    expect(shouldScratchPlayerFromInjuryReport(report)).toBe(false)

    const filtered = applyUnavailableInjuryFilter([
      { player: 'Logan Henderson' },
      { player: 'Brandon Woodruff' },
    ], new Map([
      ['logan henderson', report],
      ['brandon woodruff', {
        name: 'Brandon Woodruff',
        team: 'Milwaukee Brewers',
        status: '15-Day-IL',
        detail: 'Medical imaging revealed an injury to his right shoulder capsule.',
      }],
    ]))

    expect(filtered.map(player => player.player)).toEqual(['Logan Henderson'])
    expect(filtered[0].injuryStatus).toBe('15-Day-IL')
  })

  it('keeps day-to-day players in the props board but scratches real IL players', () => {
    expect(shouldScratchPlayerFromInjuryReport({
      name: 'Kyle Harrison',
      team: 'Milwaukee Brewers',
      status: 'Day-To-Day',
      detail: 'Soreness but not ruled out.',
    })).toBe(false)

    expect(shouldScratchPlayerFromInjuryReport({
      name: 'Brandon Woodruff',
      team: 'Milwaukee Brewers',
      status: '15-Day-IL',
      detail: 'Shoulder capsule injury with no activation note.',
    })).toBe(true)
  })
})
