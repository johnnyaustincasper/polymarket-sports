import type { SupportedSport } from './sports-utils'
import { appPalette } from './app-palette'

export type TeamBadgeSport = SupportedSport | 'ufc'

export type TeamBadgeTone = {
  accent: string
  background: string
  border: string
  glow: string
}

const TEAM_BADGE_TONE: TeamBadgeTone = {
  accent: appPalette.primaryBright,
  background: 'linear-gradient(145deg, rgba(125,246,255,0.15), rgba(3,7,10,0.94))',
  border: appPalette.primaryBorder,
  glow: `0 0 18px ${appPalette.primaryGlow}`,
}

const SPORT_BADGE_TONES: Record<TeamBadgeSport, TeamBadgeTone> = {
  nba: TEAM_BADGE_TONE,
  ncaab: TEAM_BADGE_TONE,
  nfl: TEAM_BADGE_TONE,
  ncaaf: TEAM_BADGE_TONE,
  mlb: TEAM_BADGE_TONE,
  nhl: TEAM_BADGE_TONE,
  soccer: TEAM_BADGE_TONE,
  ufc: TEAM_BADGE_TONE,
}

export function getTeamBadgeText(abbr: string | null | undefined, fallback = 'AI'): string {
  const clean = String(abbr || '').replace(/[^a-z0-9]/gi, '').toUpperCase()
  return (clean || fallback).slice(0, 4)
}

export function getTeamBadgeTone(sport: TeamBadgeSport | null | undefined): TeamBadgeTone {
  return SPORT_BADGE_TONES[sport || 'nba'] || SPORT_BADGE_TONES.nba
}

export function getTeamLeagueCardLabel(sport: TeamBadgeSport | null | undefined): string {
  const labels: Record<TeamBadgeSport, string> = {
    nba: 'NBA',
    ncaab: 'NCAAB',
    nfl: 'NFL',
    ncaaf: 'NCAAF',
    mlb: 'MLB',
    nhl: 'NHL',
    soccer: 'MLS',
    ufc: 'UFC',
  }
  return labels[sport || 'nba'] || 'AI'
}

export const teamLogoReplacementContract = {
  rendersOfficialLogos: false,
  usesExternalImageSrc: false,
  defaultFallback: 'AI',
  accessibleLabelPattern: 'Team abbreviation badge for {team}',
  defaultPresentation: 'compact-league-card-badge',
  includesContextLabel: true,
  mobileGridColumns: 3,
} as const
