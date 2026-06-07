import { NextRequest, NextResponse } from 'next/server'
import {
  calcStreak,
  ESPN_ABBR,
  fetchTeamRecentGames,
  fetchTodayTeamAbbrs,
  type GameResult,
} from '@/app/lib/nba-api'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type EnrichedBettingTrend = {
  team: string
  atsRecord: string
  atsWinPct: number
  ouRecord: string
  ouOverPct: number
  homeSURecord: string
  awaySURecord: string
  lastTenATS: string
  atsAvailable: false
  totalLine: number
  gamesAnalyzed: number
  lastTenSU: string
  avgFor: number
  avgAgainst: number
  avgMargin: number
  avgTotal: number
  homeWinPct: number | null
  awayWinPct: number | null
  recentForm: string
  scoringTrend: 'over' | 'under' | 'neutral'
  edgeFlags: string[]
  notes: string
  lastGames: {
    date: string
    opponent: string
    result: 'W' | 'L'
    score: string
    location: 'home' | 'away'
    margin: number
    total: number
  }[]
}

function parseScore(score: string): { team: number; opp: number } | null {
  const [teamRaw, oppRaw] = String(score || '').split('-')
  const team = Number(teamRaw)
  const opp = Number(oppRaw)
  if (!Number.isFinite(team) || !Number.isFinite(opp)) return null
  return { team, opp }
}

function pct(wins: number, total: number): number {
  return total ? wins / total : 0
}

function record(wins: number, losses: number): string {
  return `${wins}-${losses}`
}

function avg(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildTrend(abbr: string, games: GameResult[], totalLine: number): EnrichedBettingTrend {
  const rows = games
    .map((game) => {
      const parsed = parseScore(game.score)
      if (!parsed) return null
      const margin = parsed.team - parsed.opp
      const total = parsed.team + parsed.opp
      return {
        date: game.date,
        opponent: game.opponent,
        result: game.win ? 'W' as const : 'L' as const,
        score: game.score,
        location: game.isHome ? 'home' as const : 'away' as const,
        margin,
        total,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const wins = rows.filter(g => g.result === 'W').length
  const losses = rows.length - wins
  const home = rows.filter(g => g.location === 'home')
  const away = rows.filter(g => g.location === 'away')
  const homeWins = home.filter(g => g.result === 'W').length
  const awayWins = away.filter(g => g.result === 'W').length
  const overs = rows.filter(g => g.total > totalLine).length
  const unders = rows.filter(g => g.total <= totalLine).length
  const avgMargin = avg(rows.map(g => g.margin))
  const avgTotal = avg(rows.map(g => g.total))
  const { label } = calcStreak(games)

  const edgeFlags: string[] = []
  if (rows.length >= 5) {
    if (pct(wins, rows.length) >= 0.7) edgeFlags.push(`Strong recent SU form (${record(wins, losses)} last ${rows.length})`)
    if (pct(wins, rows.length) <= 0.3) edgeFlags.push(`Cold recent SU form (${record(wins, losses)} last ${rows.length})`)
    if (pct(overs, rows.length) >= 0.65) edgeFlags.push(`Over-leaning profile vs ${totalLine.toFixed(1)} baseline`)
    if (pct(unders, rows.length) >= 0.65) edgeFlags.push(`Under-leaning profile vs ${totalLine.toFixed(1)} baseline`)
    if (avgMargin >= 6) edgeFlags.push(`Winning by +${avgMargin.toFixed(1)} ppg recently`)
    if (avgMargin <= -6) edgeFlags.push(`Losing by ${avgMargin.toFixed(1)} ppg recently`)
    if (home.length >= 3 && pct(homeWins, home.length) >= 0.67) edgeFlags.push(`Home form live: ${record(homeWins, home.length - homeWins)}`)
    if (away.length >= 3 && pct(awayWins, away.length) <= 0.33) edgeFlags.push(`Road fade watch: ${record(awayWins, away.length - awayWins)}`)
  }

  const scoringTrend = avgTotal >= totalLine + 4 ? 'over' : avgTotal <= totalLine - 4 ? 'under' : 'neutral'

  return {
    team: abbr,
    atsRecord: 'N/A',
    atsWinPct: 0,
    ouRecord: `${overs}-${unders} O/U`,
    ouOverPct: pct(overs, rows.length),
    homeSURecord: record(homeWins, home.length - homeWins),
    awaySURecord: record(awayWins, away.length - awayWins),
    lastTenATS: 'N/A',
    atsAvailable: false,
    totalLine,
    gamesAnalyzed: rows.length,
    lastTenSU: record(wins, losses),
    avgFor: avg(rows.map(g => Number(g.score.split('-')[0]))),
    avgAgainst: avg(rows.map(g => Number(g.score.split('-')[1]))),
    avgMargin,
    avgTotal,
    homeWinPct: home.length ? pct(homeWins, home.length) : null,
    awayWinPct: away.length ? pct(awayWins, away.length) : null,
    recentForm: label,
    scoringTrend,
    edgeFlags,
    notes: 'ESPN recent-game trend read. ATS is intentionally marked unavailable until a reliable closing-spread source is connected.',
    lastGames: rows,
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const team = searchParams.get('team')?.toUpperCase() || ''
    const forceAll = searchParams.get('all') === 'true'
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 10), 5), 20)
    const totalLineRaw = Number(searchParams.get('totalLine') || searchParams.get('total') || 226.5)
    const totalLine = Number.isFinite(totalLineRaw) ? totalLineRaw : 226.5

    let abbrs: string[]
    if (team) {
      abbrs = [team]
    } else if (forceAll) {
      abbrs = Object.keys(ESPN_ABBR)
    } else {
      abbrs = await fetchTodayTeamAbbrs()
      if (!abbrs.length) abbrs = Object.keys(ESPN_ABBR)
    }

    abbrs = Array.from(new Set(abbrs.map(a => a.toUpperCase()).filter(a => ESPN_ABBR[a])))

    const trends: EnrichedBettingTrend[] = []
    const BATCH = 8
    for (let i = 0; i < abbrs.length; i += BATCH) {
      const batch = abbrs.slice(i, i + BATCH)
      const results = await Promise.all(batch.map(async (abbr) => {
        const games = await fetchTeamRecentGames(abbr, limit)
        return buildTrend(abbr, games, totalLine)
      }))
      trends.push(...results)
    }

    trends.sort((a, b) => {
      const aScore = a.edgeFlags.length * 10 + Math.abs(a.avgMargin) + Math.abs(a.avgTotal - totalLine) / 2
      const bScore = b.edgeFlags.length * 10 + Math.abs(b.avgMargin) + Math.abs(b.avgTotal - totalLine) / 2
      return bScore - aScore
    })

    return NextResponse.json({
      available: trends.length > 0,
      source: 'ESPN recent results',
      atsAvailable: false,
      totalLine,
      teams: trends,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Trends error:', err)
    return NextResponse.json({ available: false, error: 'Failed to fetch market trends' }, { status: 500 })
  }
}
