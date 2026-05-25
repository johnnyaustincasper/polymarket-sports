import type { SupportedSport } from './sports-utils'

export type TeamBadgeSport = SupportedSport | 'ufc'

export type TeamBadgeTone = {
  accent: string
  background: string
  border: string
  glow: string
}

const SPORT_BADGE_TONES: Record<TeamBadgeSport, TeamBadgeTone> = {
  nba: {
    accent: '#a6ff3f',
    background: 'linear-gradient(145deg, rgba(166,255,63,0.16), rgba(3,5,0,0.94))',
    border: 'rgba(166,255,63,0.42)',
    glow: '0 0 18px rgba(166,255,63,0.18)',
  },
  ncaab: {
    accent: '#a6ff3f',
    background: 'linear-gradient(145deg, rgba(166,255,63,0.16), rgba(3,5,0,0.94))',
    border: 'rgba(166,255,63,0.42)',
    glow: '0 0 18px rgba(166,255,63,0.18)',
  },
  nfl: {
    accent: '#a8f0ff',
    background: 'linear-gradient(145deg, rgba(168,240,255,0.14), rgba(3,5,0,0.94))',
    border: 'rgba(168,240,255,0.38)',
    glow: '0 0 18px rgba(168,240,255,0.16)',
  },
  ncaaf: {
    accent: '#a8f0ff',
    background: 'linear-gradient(145deg, rgba(168,240,255,0.14), rgba(3,5,0,0.94))',
    border: 'rgba(168,240,255,0.38)',
    glow: '0 0 18px rgba(168,240,255,0.16)',
  },
  mlb: {
    accent: '#f8d94a',
    background: 'linear-gradient(145deg, rgba(248,217,74,0.15), rgba(3,5,0,0.94))',
    border: 'rgba(248,217,74,0.40)',
    glow: '0 0 18px rgba(248,217,74,0.16)',
  },
  ufc: {
    accent: '#ff3f5f',
    background: 'linear-gradient(145deg, rgba(255,63,95,0.14), rgba(3,5,0,0.94))',
    border: 'rgba(255,63,95,0.34)',
    glow: '0 0 18px rgba(255,63,95,0.14)',
  },
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
