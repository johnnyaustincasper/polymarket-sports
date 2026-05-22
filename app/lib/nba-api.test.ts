import { describe, expect, it } from 'vitest'
import { boxscoreTeamMatches, espnTeamSlug, normalizeNbaAbbr } from './nba-api'

describe('NBA API team abbreviation normalization', () => {
  it('normalizes ESPN Spurs SA abbreviation to internal SAS', () => {
    expect(normalizeNbaAbbr('SA')).toBe('SAS')
    expect(normalizeNbaAbbr('SAS')).toBe('SAS')
  })

  it('uses ESPN slugs for schedule/summary team paths', () => {
    expect(espnTeamSlug('SAS')).toBe('sa')
    expect(espnTeamSlug('SA')).toBe('sa')
    expect(espnTeamSlug('GSW')).toBe('gs')
  })

  it('matches ESPN boxscore team abbreviations against internal abbreviations', () => {
    expect(boxscoreTeamMatches({ team: { abbreviation: 'SA' } }, 'SAS')).toBe(true)
    expect(boxscoreTeamMatches({ team: { abbreviation: 'OKC' } }, 'OKC')).toBe(true)
    expect(boxscoreTeamMatches({ team: { abbreviation: 'SA' } }, 'OKC')).toBe(false)
  })
})
