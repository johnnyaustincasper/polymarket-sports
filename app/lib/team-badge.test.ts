import { describe, expect, it } from 'vitest'
import { getTeamBadgeText, getTeamBadgeTone, getTeamLeagueCardLabel, teamLogoReplacementContract } from './team-badge'

describe('team badge logo replacement', () => {
  it('uses neutral app-native badges instead of external logo images', () => {
    expect(teamLogoReplacementContract.rendersOfficialLogos).toBe(false)
    expect(teamLogoReplacementContract.usesExternalImageSrc).toBe(false)
    expect(teamLogoReplacementContract.defaultFallback).toBe('AI')
  })

  it('normalizes team abbreviations for compact badges', () => {
    expect(getTeamBadgeText('BOS')).toBe('BOS')
    expect(getTeamBadgeText('ny')).toBe('NY')
    expect(getTeamBadgeText('L.A.')).toBe('LA')
    expect(getTeamBadgeText('')).toBe('AI')
    expect(getTeamBadgeText(null)).toBe('AI')
  })

  it('uses the soft cyan app palette for team tones without official team colors', () => {
    expect(getTeamBadgeTone('nba').accent).toBe('#b8fbff')
    expect(getTeamBadgeTone('mlb').accent).toBe('#b8fbff')
    expect(getTeamBadgeTone('nfl').accent).toBe('#b8fbff')
    expect(getTeamBadgeTone('nhl').accent).toBe('#b8fbff')
    expect(getTeamBadgeTone('soccer').accent).toBe('#b8fbff')
    expect(getTeamBadgeTone('ufc').accent).toBe('#b8fbff')
  })

  it('frames logo-free teams as compact league-card badges', () => {
    expect(teamLogoReplacementContract.defaultPresentation).toBe('compact-league-card-badge')
    expect(teamLogoReplacementContract.includesContextLabel).toBe(true)
    expect(teamLogoReplacementContract.mobileGridColumns).toBe(3)
    expect(getTeamLeagueCardLabel('nba')).toBe('NBA')
    expect(getTeamLeagueCardLabel('mlb')).toBe('MLB')
    expect(getTeamLeagueCardLabel('nfl')).toBe('NFL')
    expect(getTeamLeagueCardLabel('nhl')).toBe('NHL')
    expect(getTeamLeagueCardLabel('soccer')).toBe('MLS')
  })
})
