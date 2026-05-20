import { describe, expect, it } from 'vitest'
import { filterInjuriesForTeam, parseEspnInjuryPlayer, summarizeInjuries } from './nba-injuries'

describe('nba injury normalization', () => {
  const foxRaw = {
    shortComment: "Fox (ankle) was present at Wednesday's morning shootaround.",
    longComment: "Fox remains questionable for Game 2 on the official injury report, and it's been previously reported that he will be a true game-time decision.",
    status: 'Day-To-Day',
    date: '2026-05-20T16:46Z',
    athlete: {
      displayName: "De'Aaron Fox",
      position: { abbreviation: 'G' },
      team: { abbreviation: 'SA', displayName: 'San Antonio Spurs' },
    },
    details: {
      fantasyStatus: { description: 'GTD', abbreviation: 'GTD' },
      type: 'Ankle',
      detail: 'Soreness',
      side: 'Right',
      returnDate: '2026-05-20',
    },
  }

  it('maps ESPN SA injury records to internal SAS requests', () => {
    const sections = [{ displayName: 'San Antonio Spurs', injuries: [foxRaw] }]

    expect(filterInjuriesForTeam(sections, 'SAS')).toEqual([
      expect.objectContaining({ name: "De'Aaron Fox", status: 'Questionable', injury: 'Right Ankle Soreness' }),
    ])
    expect(filterInjuriesForTeam(sections, 'SA')).toEqual([
      expect.objectContaining({ name: "De'Aaron Fox", status: 'Questionable' }),
    ])
  })

  it('promotes day-to-day/GTD records with questionable language to Questionable', () => {
    expect(parseEspnInjuryPlayer(foxRaw)).toEqual(expect.objectContaining({
      name: "De'Aaron Fox",
      status: 'Questionable',
      fantasyStatus: 'GTD',
      injury: 'Right Ankle Soreness',
      updatedAt: '2026-05-20T16:46Z',
    }))
  })

  it('summarizes questionable star injury alerts for prop context', () => {
    const [fox] = filterInjuriesForTeam([{ displayName: 'San Antonio Spurs', injuries: [foxRaw] }], 'SA')

    expect(summarizeInjuries([fox])).toBe("De'Aaron Fox Questionable (Right Ankle Soreness)")
    expect(summarizeInjuries([])).toBe('None reported')
  })

})
