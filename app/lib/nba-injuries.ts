import { normalizeNbaAbbr, TEAM_NAME_TO_ABBR } from './nba-api'

export type InjuryStatus = 'Out' | 'Questionable' | 'Doubtful' | 'Probable' | 'GTD' | 'Day-To-Day' | 'Unknown'

export interface InjuredPlayer {
  name: string
  position: string
  status: InjuryStatus
  detail: string
  injury?: string
  fantasyStatus?: string
  source?: string
  updatedAt?: string
}

export const TEAM_DISPLAY_NAMES: Record<string, string> = {
  ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets',
  CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons',
  GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'LA Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans', NYK: 'New York Knicks', OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors', UTA: 'Utah Jazz', WAS: 'Washington Wizards',
}

function normalizeStatus(value: unknown, raw: any): InjuryStatus {
  const text = [
    value,
    raw?.type?.description,
    raw?.type?.abbreviation,
    raw?.details?.fantasyStatus?.description,
    raw?.details?.fantasyStatus?.abbreviation,
    raw?.longComment,
    raw?.shortComment,
  ].map(x => String(x || '').toLowerCase()).join(' ')

  if (/\bout\b|inactive|will not play/.test(text)) return 'Out'
  if (/doubtful/.test(text)) return 'Doubtful'
  if (/questionable|game[- ]time decision|\bgtd\b|true game-time decision/.test(text)) return 'Questionable'
  if (/probable/.test(text)) return 'Probable'
  if (/day[- ]to[- ]day|daytoday|\bdd\b/.test(text)) return 'Day-To-Day'
  return String(value || 'Unknown') as InjuryStatus
}

function compact(parts: Array<string | undefined | null>) {
  return parts.map(p => String(p || '').trim()).filter(Boolean).join(' ')
}

export function parseEspnInjuryPlayer(raw: any): InjuredPlayer | null {
  const name = raw?.athlete?.displayName || raw?.athlete?.shortName || 'Unknown'
  if (!name || name === 'Unknown') return null
  const fantasyStatus = raw?.details?.fantasyStatus?.abbreviation || raw?.details?.fantasyStatus?.description || undefined
  const injury = compact([raw?.details?.side, raw?.details?.type, raw?.details?.detail]) || raw?.details?.type || undefined
  const detail = raw?.shortComment || raw?.longComment?.slice(0, 160) || compact([injury, fantasyStatus])

  return {
    name,
    position: raw?.athlete?.position?.abbreviation || '?',
    status: normalizeStatus(raw?.status, raw),
    detail,
    injury,
    fantasyStatus,
    source: raw?.source?.description || raw?.athlete?.notes?.items?.[0]?.source || undefined,
    updatedAt: raw?.date || raw?.athlete?.notes?.items?.[0]?.date || undefined,
  }
}

function teamNamesFor(abbr: string) {
  const normalized = normalizeNbaAbbr(abbr)
  return new Set([
    TEAM_DISPLAY_NAMES[normalized],
    TEAM_DISPLAY_NAMES[abbr.toUpperCase()],
    Object.entries(TEAM_NAME_TO_ABBR).find(([, value]) => value === normalized)?.[0],
  ].filter(Boolean))
}

function rawInjuryTeamMatches(raw: any, abbr: string) {
  const normalized = normalizeNbaAbbr(abbr)
  const athleteTeamAbbr = normalizeNbaAbbr(raw?.athlete?.team?.abbreviation)
  const athleteTeamName = raw?.athlete?.team?.displayName
  const names = teamNamesFor(normalized)
  return athleteTeamAbbr === normalized || (athleteTeamName && names.has(athleteTeamName))
}

export function filterInjuriesForTeam(sections: any[], teamAbbr: string): InjuredPlayer[] {
  const normalized = normalizeNbaAbbr(teamAbbr)
  const names = teamNamesFor(normalized)
  const matchingRaw = (sections || []).flatMap((section: any) => {
    const sectionName = section?.displayName || section?.team?.displayName
    const sectionAbbr = normalizeNbaAbbr(section?.abbreviation || section?.team?.abbreviation)
    const sectionMatches = sectionAbbr === normalized || names.has(sectionName)
    return (section?.injuries || []).filter((injury: any) => sectionMatches || rawInjuryTeamMatches(injury, normalized))
  })

  const seen = new Set<string>()
  return matchingRaw
    .map(parseEspnInjuryPlayer)
    .filter((player): player is InjuredPlayer => Boolean(player))
    .filter(player => {
      const key = `${player.name}:${player.status}:${player.detail}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function classifyInjuryImpact(players: InjuredPlayer[]): 'none' | 'minor' | 'major' {
  if (players.length === 0) return 'none'
  if (players.some(p => p.status === 'Out' || p.status === 'Doubtful')) return 'major'
  if (players.some(p => p.status === 'Questionable' || p.status === 'Day-To-Day' || p.status === 'GTD')) return 'minor'
  return 'none'
}

export function summarizeInjuries(players: InjuredPlayer[]) {
  if (!players.length) return 'None reported'
  return players
    .slice()
    .sort((a, b) => {
      const rank = (status: InjuryStatus) => status === 'Out' ? 0 : status === 'Doubtful' ? 1 : status === 'Questionable' ? 2 : 3
      return rank(a.status) - rank(b.status)
    })
    .slice(0, 4)
    .map(player => `${player.name} ${player.status}${player.injury ? ` (${player.injury})` : ''}`)
    .join('; ')
}
