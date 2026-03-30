import { NextRequest, NextResponse } from 'next/server'
import { ESPN_ABBR } from '@/app/lib/nba-api'

export interface PlayerPropLine {
  player: string
  team: string
  position: string
  headshot?: string
  pts: { line: number; avg: number; trend: 'over' | 'under' | 'push' }
  reb: { line: number; avg: number; trend: 'over' | 'under' | 'push' }
  ast: { line: number; avg: number; trend: 'over' | 'under' | 'push' }
  gamesPlayed: number
  lastFive: { pts: number; reb: number; ast: number }[]
}

export interface PropsResponse {
  home: PlayerPropLine[]
  away: PlayerPropLine[]
  homeTeam: string
  awayTeam: string
  available: boolean
}

// Round to nearest .5
function roundLine(avg: number): number {
  return Math.round(avg * 2) / 2
}

function calcTrend(avg: number, line: number): 'over' | 'under' | 'push' {
  if (avg > line + 0.25) return 'over'
  if (avg < line - 0.25) return 'under'
  return 'push'
}

// Fetch player season averages from ESPN athlete stats
async function fetchPlayerStats(athleteId: string): Promise<{
  pts: number; reb: number; ast: number; gamesPlayed: number; lastFive: { pts: number; reb: number; ast: number }[]
} | null> {
  try {
    // Get season splits/averages
    const [statsRes, gamelogRes] = await Promise.all([
      fetch(
        `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${athleteId}/stats`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000), next: { revalidate: 3600 } }
      ),
      fetch(
        `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${athleteId}/gamelog`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000), next: { revalidate: 1800 } }
      ),
    ])

    let pts = 0, reb = 0, ast = 0, gamesPlayed = 0
    const lastFive: { pts: number; reb: number; ast: number }[] = []

    // Parse season averages
    if (statsRes.ok) {
      const statsData = await statsRes.json()
      // Find regular season splits
      const splits: any[] = statsData.splits?.categories || []
      for (const cat of splits) {
        if (cat.name === 'regularSeason' || cat.abbreviation === 'Regular Season') {
          const stats: any[] = cat.stats || []
          for (const stat of stats) {
            if (stat.name === 'avgPoints' || stat.abbreviation === 'PTS') pts = stat.value || 0
            if (stat.name === 'avgRebounds' || stat.abbreviation === 'REB') reb = stat.value || 0
            if (stat.name === 'avgAssists' || stat.abbreviation === 'AST') ast = stat.value || 0
            if (stat.name === 'gamesPlayed' || stat.abbreviation === 'GP') gamesPlayed = stat.value || 0
          }
          break
        }
      }
      // fallback: first category
      if (!pts && splits.length > 0) {
        const stats: any[] = splits[0].stats || []
        for (const stat of stats) {
          if (stat.abbreviation === 'PTS') pts = stat.value || 0
          if (stat.abbreviation === 'REB') reb = stat.value || 0
          if (stat.abbreviation === 'AST') ast = stat.value || 0
          if (stat.abbreviation === 'GP') gamesPlayed = stat.value || 0
        }
      }
    }

    // Parse gamelog for last 5 games
    if (gamelogRes.ok) {
      const gamelogData = await gamelogRes.json()
      const events: any[] = gamelogData.events?.events || []
      const labels: string[] = gamelogData.events?.labels || []
      const ptsIdx = labels.findIndex((l: string) => l === 'PTS')
      const rebIdx = labels.findIndex((l: string) => l === 'REB')
      const astIdx = labels.findIndex((l: string) => l === 'AST')

      const completed = events
        .filter((e: any) => e.stats && e.stats.length > 0)
        .slice(-5)
        .reverse()

      for (const event of completed.slice(0, 5)) {
        const stats = event.stats || []
        lastFive.push({
          pts: ptsIdx >= 0 ? (parseFloat(stats[ptsIdx]) || 0) : 0,
          reb: rebIdx >= 0 ? (parseFloat(stats[rebIdx]) || 0) : 0,
          ast: astIdx >= 0 ? (parseFloat(stats[astIdx]) || 0) : 0,
        })
      }
    }

    if (!pts && !reb && !ast) return null
    return { pts, reb, ast, gamesPlayed, lastFive }
  } catch {
    return null
  }
}

// Fetch top players from a team's roster with their stats
async function fetchTeamProps(abbr: string): Promise<PlayerPropLine[]> {
  const espnAbbr = ESPN_ABBR[abbr.toUpperCase()] || abbr.toLowerCase()

  try {
    // Fetch roster
    const rosterRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnAbbr}/roster`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } }
    )
    if (!rosterRes.ok) return []
    const rosterData = await rosterRes.json()

    const athletes: any[] = rosterData.athletes || []
    // Focus on "forwards" + "guards" sections, grab first 6 by jersey/position
    const allPlayers: any[] = []
    for (const group of athletes) {
      for (const player of (group.items || [])) {
        allPlayers.push(player)
      }
    }

    if (!allPlayers.length) return []

    // Sort by jersey number as proxy for starters (lower numbers often starters, but not always)
    // Better: try to detect starter status from the athlete's position/role
    // Take top 8 by default
    const topPlayers = allPlayers.slice(0, 10)

    // Fetch stats for each in parallel (limit to avoid rate limiting)
    const results = await Promise.all(
      topPlayers.map(async (player) => {
        const athleteId = player.id
        const stats = await fetchPlayerStats(String(athleteId))
        if (!stats || stats.pts < 5) return null // skip low-usage players

        const ptsLine = roundLine(stats.pts)
        const rebLine = roundLine(stats.reb)
        const astLine = roundLine(stats.ast)

        // Compute trend from last 5 games
        let avgPtsL5 = stats.pts, avgRebL5 = stats.reb, avgAstL5 = stats.ast
        if (stats.lastFive.length >= 3) {
          avgPtsL5 = stats.lastFive.reduce((s, g) => s + g.pts, 0) / stats.lastFive.length
          avgRebL5 = stats.lastFive.reduce((s, g) => s + g.reb, 0) / stats.lastFive.length
          avgAstL5 = stats.lastFive.reduce((s, g) => s + g.ast, 0) / stats.lastFive.length
        }

        const prop: PlayerPropLine = {
          player: player.displayName || player.fullName || 'Unknown',
          team: abbr.toUpperCase(),
          position: player.position?.abbreviation || '?',
          headshot: player.headshot?.href || undefined,
          pts: { line: ptsLine, avg: parseFloat(stats.pts.toFixed(1)), trend: calcTrend(avgPtsL5, ptsLine) },
          reb: { line: rebLine, avg: parseFloat(stats.reb.toFixed(1)), trend: calcTrend(avgRebL5, rebLine) },
          ast: { line: astLine, avg: parseFloat(stats.ast.toFixed(1)), trend: calcTrend(avgAstL5, astLine) },
          gamesPlayed: stats.gamesPlayed,
          lastFive: stats.lastFive,
        }
        return prop
      })
    )

    return results
      .filter(Boolean)
      .sort((a, b) => b!.pts.avg - a!.pts.avg)
      .slice(0, 6) as PlayerPropLine[]
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const home = searchParams.get('home')?.toUpperCase()
  const away = searchParams.get('away')?.toUpperCase()

  if (!home || !away) {
    return NextResponse.json({ error: 'Missing home or away param' }, { status: 400 })
  }

  try {
    const [homeProps, awayProps] = await Promise.all([
      fetchTeamProps(home),
      fetchTeamProps(away),
    ])

    const response: PropsResponse = {
      home: homeProps,
      away: awayProps,
      homeTeam: home,
      awayTeam: away,
      available: homeProps.length > 0 || awayProps.length > 0,
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('Props error:', err)
    return NextResponse.json({ error: 'Failed to fetch props' }, { status: 500 })
  }
}
