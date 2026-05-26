import { NextRequest, NextResponse } from 'next/server'
import { normalizeNbaAbbr } from '@/app/lib/nba-api'
import { finishRouteTiming, startRouteTiming } from '@/app/lib/route-observability'
import { enforceRateLimit } from '@/app/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type TeamSport = 'nba' | 'nfl' | 'mlb'

const SPORT_PATH: Record<TeamSport, string> = {
  nba: 'basketball/nba',
  nfl: 'football/nfl',
  mlb: 'baseball/mlb',
}

function isTeamSport(value: string | null): value is TeamSport {
  return value === 'nba' || value === 'nfl' || value === 'mlb'
}

async function fetchEspnJson(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function flattenStats(data: any) {
  const categories = data?.results?.stats?.categories || []
  const wanted = new Set([
    'gamesPlayed', 'pointsPerGame', 'avgPoints', 'avgRebounds', 'avgAssists', 'avgTurnovers',
    'battingAverage', 'runs', 'homeRuns', 'era', 'whip', 'pointsFor', 'pointsAgainst',
    'totalYardsPerGame', 'passingYardsPerGame', 'rushingYardsPerGame', 'yardsPerGame',
  ])
  const stats: { label: string; value: string }[] = []
  for (const category of categories) {
    for (const stat of category?.stats || []) {
      if (!wanted.has(stat?.name) && stats.length >= 8) continue
      const label = stat?.shortDisplayName || stat?.abbreviation || stat?.displayName
      const value = stat?.displayValue || stat?.perGameDisplayValue
      if (label && value && !stats.some(item => item.label === label)) stats.push({ label, value })
      if (stats.length >= 10) return stats
    }
  }
  return stats.slice(0, 10)
}

function normalizeTeam(raw: any) {
  const team = raw?.team || raw
  const abbr = normalizeNbaAbbr(team?.abbreviation || '')
  return {
    id: String(team?.id || abbr),
    abbr,
    name: team?.displayName || team?.name || abbr,
    shortName: team?.shortDisplayName || team?.name || abbr,
    color: team?.color ? `#${String(team.color).replace(/^#/, '')}` : '#7df6ff',
    logo: null,
    record: team?.record?.items?.[0]?.summary || team?.recordSummary || null,
  }
}

function flattenRosterAthletes(athletes: any[]) {
  return athletes.flatMap((entry: any) => {
    if (Array.isArray(entry?.items)) {
      return entry.items.map((athlete: any) => ({
        ...athlete,
        rosterGroup: entry?.position || null,
      }))
    }
    return [entry]
  })
}

function normalizeRoster(athletes: any[]) {
  return flattenRosterAthletes(athletes).map((athlete: any) => ({
    id: String(athlete?.id || athlete?.uid || athlete?.displayName),
    name: athlete?.displayName || athlete?.fullName || athlete?.shortName || 'Unknown',
    position: athlete?.position?.abbreviation || athlete?.position?.displayName || athlete?.rosterGroup || '—',
    jersey: athlete?.jersey || null,
    age: athlete?.age || null,
    height: athlete?.displayHeight || null,
    weight: athlete?.displayWeight || null,
    headshot: athlete?.headshot?.href || athlete?.headshot || null,
    status: athlete?.status?.name || athlete?.status?.type || null,
    injuries: Array.isArray(athlete?.injuries) ? athlete.injuries.map((injury: any) => ({
      status: injury?.status || injury?.type || 'Injury',
      detail: injury?.details?.detail || injury?.detail || injury?.shortComment || injury?.description || '',
    })) : [],
  })).filter((player: any) => player.name !== 'Unknown')
}

function normalizeInjuries(data: any, roster: any[]) {
  const fromRoster = roster.flatMap((player: any) =>
    (player.injuries || []).map((injury: any) => ({ player: player.name, position: player.position, ...injury }))
  )
  if (fromRoster.length) return fromRoster
  const injuries = Array.isArray(data?.injuries) ? data.injuries : Array.isArray(data) ? data : []
  return injuries.map((item: any) => ({
    player: item?.athlete?.displayName || item?.athlete?.fullName || item?.name || 'Unknown',
    position: item?.athlete?.position?.abbreviation || item?.position || '—',
    status: item?.status || item?.type || 'Injury',
    detail: item?.details?.detail || item?.detail || item?.shortComment || item?.description || '',
  })).filter((injury: any) => injury.player !== 'Unknown')
}

export async function GET(req: NextRequest) {
  const routeTimer = startRouteTiming('/api/teams')
  const rateLimited = enforceRateLimit(req, 'teams', { limit: 60, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  const { searchParams } = new URL(req.url)
  const sportParam = searchParams.get('sport')
  if (!isTeamSport(sportParam)) {
    return finishRouteTiming(routeTimer, NextResponse.json({ error: 'Teams are currently available for NBA, MLB, and NFL.' }, { status: 400 }))
  }

  const sport = sportParam
  const path = SPORT_PATH[sport]
  const teamsData = await fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams`)
  const teams = (teamsData?.sports?.[0]?.leagues?.[0]?.teams || []).map(normalizeTeam)
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  const teamId = searchParams.get('team')
  if (!teamId) {
    return finishRouteTiming(routeTimer, NextResponse.json({ sport, teams, generatedAt: new Date().toISOString() }))
  }

  const team = teams.find((item: any) => item.id === teamId || item.abbr === normalizeNbaAbbr(teamId) || item.abbr === teamId.toUpperCase())
  if (!team) {
    return finishRouteTiming(routeTimer, NextResponse.json({ error: 'team not found' }, { status: 404 }))
  }

  const [rosterData, statsData, injuryData] = await Promise.all([
    fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${team.id}/roster`),
    fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${team.id}/statistics`),
    fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${team.id}/injuries`, 5000),
  ])

  const roster = normalizeRoster(rosterData?.athletes || [])
  const injuries = normalizeInjuries(injuryData, roster)
  const stats = flattenStats(statsData)

  return finishRouteTiming(routeTimer, NextResponse.json({
    sport,
    team,
    roster,
    stats,
    injuries,
    generatedAt: new Date().toISOString(),
  }))
}
