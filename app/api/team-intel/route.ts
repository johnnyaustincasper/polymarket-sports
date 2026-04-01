import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  fetchTeamRecentGames,
  calcStreak,
  calcRestDays,
  fetchFatigueReport,
} from '@/app/lib/nba-api'
import type { TeamIntel } from '@/app/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const BRAVE_KEY = process.env.BRAVE_API_KEY || ''

// ─── Static pace data (possessions per 48 min, 2024-25 approx) ──────────────
const PACE_DATA: Record<string, number> = {
  ATL: 101.2, BOS: 99.1, BKN: 98.3, CHA: 97.8, CHI: 98.4,
  CLE: 96.2, DAL: 98.7, DEN: 99.5, DET: 98.1, GSW: 99.8,
  HOU: 100.6, IND: 100.4, LAC: 98.2, LAL: 99.0, MEM: 101.8,
  MIA: 96.8, MIL: 99.3, MIN: 99.6, NOP: 98.5, NYK: 100.1,
  OKC: 100.9, ORL: 98.9, PHI: 97.5, PHX: 98.6, POR: 99.2,
  SAC: 100.3, SAS: 97.2, TOR: 98.8, UTA: 97.9, WAS: 99.4,
}

// Denver altitude note
const ALTITUDE_TEAMS = ['DEN']

function getPaceEdge(homePace: number, awayPace: number): { label: string; implication: string } {
  const avg = (homePace + awayPace) / 2
  const diff = Math.abs(homePace - awayPace)

  if (avg >= 100.5 && diff < 2) return { label: 'Fast vs Fast', implication: '🔥 O/U leans OVER' }
  if (avg <= 97.5 && diff < 2) return { label: 'Slow vs Slow', implication: '🧊 O/U leans UNDER' }
  if (avg >= 100.5) return { label: 'Fast vs Slow', implication: '⚡ Variance play' }
  if (diff >= 3) return { label: 'Pace mismatch', implication: '⚡ Variance play' }
  return { label: 'Similar pace', implication: '— Neutral O/U' }
}

function computeHomeAwaySplits(games: { win: boolean; isHome: boolean }[]) {
  let homeW = 0, homeL = 0, awayW = 0, awayL = 0
  for (const g of games) {
    if (g.isHome) { g.win ? homeW++ : homeL++ }
    else { g.win ? awayW++ : awayL++ }
  }
  return {
    homeRecord: `${homeW}-${homeL}`,
    awayRecord: `${awayW}-${awayL}`,
    homeWins: homeW, homeLosses: homeL,
    awayWins: awayW, awayLosses: awayL,
  }
}

// ─── Injured Player type ─────────────────────────────────────────────────────
export interface InjuredPlayer {
  name: string
  position: string
  status: string
  detail: string
}

// ─── ESPN Injury API ─────────────────────────────────────────────────────────
// Uses the global NBA injuries endpoint — the per-team endpoint returns {}
// NOTE: the injuries endpoint returns abbreviation=undefined for all teams,
// so we must match by exact displayName using this map.
const TEAM_DISPLAY_NAMES: Record<string, string> = {
  ATL: 'Atlanta Hawks',    BOS: 'Boston Celtics',     BKN: 'Brooklyn Nets',
  CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls',    CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets',     DET: 'Detroit Pistons',
  GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'LA Clippers',      LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat',       MIL: 'Milwaukee Bucks',    MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans', NYK: 'New York Knicks', OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic',    PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors',  UTA: 'Utah Jazz',          WAS: 'Washington Wizards',
}

let _injuryCacheTime = 0
let _injuryCache: any[] = []

async function fetchEspnInjuries(teamAbbr: string): Promise<InjuredPlayer[]> {
  try {
    // Cache for 5 min to avoid hammering the endpoint for each team
    if (Date.now() - _injuryCacheTime > 300000 || _injuryCache.length === 0) {
      const res = await fetch(
        'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries',
        { signal: AbortSignal.timeout(8000), next: { revalidate: 300 } }
      )
      if (!res.ok) return []
      const data = await res.json()
      _injuryCache = data.injuries || []
      _injuryCacheTime = Date.now()
    }

    // Match by exact displayName — abbreviation field is undefined in this endpoint
    const targetName = TEAM_DISPLAY_NAMES[teamAbbr.toUpperCase()]
    const teamSection = _injuryCache.find((t: any) =>
      targetName ? t.displayName === targetName : false
    )
    if (!teamSection) return []

    return (teamSection.injuries || []).map((inj: any) => ({
      name: inj.athlete?.displayName || 'Unknown',
      position: inj.athlete?.position?.abbreviation || '?',
      status: inj.status || 'Unknown',
      detail: inj.shortComment || inj.longComment?.slice(0, 120) || '',
    })).filter((p: InjuredPlayer) => p.name !== 'Unknown')
  } catch {
    return []
  }
}

function classifyInjuryImpact(players: InjuredPlayer[]): 'none' | 'minor' | 'major' {
  if (players.length === 0) return 'none'
  if (players.some(p => p.status === 'Out' || p.status === 'Doubtful')) return 'major'
  if (players.some(p => p.status === 'Questionable' || p.status === 'Day-To-Day' || p.status === 'GTD')) return 'minor'
  return 'none'
}

// ─── H2H with last meeting ────────────────────────────────────────────────────
interface H2HResult {
  summary: string
  lastMeeting: string | null
}

async function fetchH2H(homeAbbr: string, awayAbbr: string): Promise<H2HResult> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${homeAbbr.toLowerCase()}/schedule`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return { summary: 'H2H data unavailable', lastMeeting: null }
    const data = await res.json()

    let homeWins = 0
    let awayWins = 0
    let lastMeeting: string | null = null
    const games: any[] = (data.events || []).filter((e: any) =>
      e.competitions?.[0]?.status?.type?.completed
    )

    for (const event of games) {
      const comp = event.competitions?.[0]
      const competitors: any[] = comp?.competitors || []
      const hasAway = competitors.some((c: any) =>
        c.team?.abbreviation?.toUpperCase() === awayAbbr.toUpperCase()
      )
      if (!hasAway) continue

      const homeTeam = competitors.find((c: any) =>
        c.team?.abbreviation?.toUpperCase() === homeAbbr.toUpperCase()
      )
      const awayTeam = competitors.find((c: any) =>
        c.team?.abbreviation?.toUpperCase() === awayAbbr.toUpperCase()
      )

      if (homeTeam?.winner) homeWins++
      else awayWins++

      // Record last meeting score
      if (!lastMeeting && homeTeam && awayTeam) {
        const homeScore = homeTeam.score || '?'
        const awayScore = awayTeam.score || '?'
        const dateRaw = event.date || ''
        const dateFmt = dateRaw ? new Date(dateRaw).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
        lastMeeting = `${awayAbbr} ${awayScore} @ ${homeAbbr} ${homeScore}${dateFmt ? ` (${dateFmt})` : ''}`
      }
    }

    const total = homeWins + awayWins
    if (!total) return { summary: 'No H2H games this season yet', lastMeeting: null }

    let summary: string
    if (homeWins > awayWins) summary = `${homeAbbr} leads ${homeWins}-${awayWins} this season`
    else if (awayWins > homeWins) summary = `${awayAbbr} leads ${awayWins}-${homeWins} this season`
    else summary = `Series tied ${homeWins}-${awayWins} this season`

    return { summary, lastMeeting }
  } catch {
    return { summary: 'H2H data unavailable', lastMeeting: null }
  }
}

// ─── Public Betting Splits (Action Network) ───────────────────────────────────
interface BettingSplits {
  homePct: number | null
  awayPct: number | null
  homeTeam: string
  awayTeam: string
  reverseLineMovement: boolean
}

async function fetchPublicBettingSplits(
  homeAbbr: string,
  awayAbbr: string,
  dateStr: string
): Promise<BettingSplits | null> {
  try {
    const date = dateStr.replace(/-/g, '')
    const res = await fetch(
      `https://api.actionnetwork.com/web/v1/games?sport=nba&date=${date}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const games: any[] = data.games || []

    // Try to match by team name / abbr
    const game = games.find((g: any) => {
      const awayId = g.away_team?.abbr?.toUpperCase() || g.teams?.away?.abbr?.toUpperCase() || ''
      const homeId = g.home_team?.abbr?.toUpperCase() || g.teams?.home?.abbr?.toUpperCase() || ''
      return (homeId === homeAbbr && awayId === awayAbbr)
        || (homeId.includes(homeAbbr) || awayId.includes(awayAbbr))
    })
    if (!game) return null

    // Try both possible structures
    const awayBets = game.away_team?.ml_percent ?? game.teams?.away?.ml_percent ?? null
    const homeBets = game.home_team?.ml_percent ?? game.teams?.home?.ml_percent ?? null

    if (awayBets === null && homeBets === null) return null

    // Detect reverse line movement:
    // If >60% public on one side but spread moved the other way
    let reverseLineMovement = false
    if (awayBets !== null && homeBets !== null) {
      const publicFavsHome = homeBets > 60
      const publicFavsAway = awayBets > 60
      // We can't easily detect line movement here without historical data
      // so we'll just flag it if public is heavily lopsided (65%+)
      if (homeBets >= 65 || awayBets >= 65) {
        reverseLineMovement = false // will be checked client-side vs line movement
      }
    }

    return {
      homePct: homeBets,
      awayPct: awayBets,
      homeTeam: homeAbbr,
      awayTeam: awayAbbr,
      reverseLineMovement,
    }
  } catch {
    return null
  }
}

async function fetchRefereeAssignments(dateStr: string): Promise<string[]> {
  if (!BRAVE_KEY) return []
  const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const query = `NBA referee assignments ${dateFormatted} tonight`
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3&freshness=pd`,
      {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const text = (data.web?.results || [])
      .slice(0, 2)
      .map((r: any) => r.description || '')
      .join(' ')
    const refMatches = text.match(/(?:referee|official|crew chief)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/gi)
    if (refMatches && refMatches.length > 0) {
      return refMatches.slice(0, 3).map((m: string) => m.replace(/^(referee|official|crew chief)[:\s]+/i, ''))
    }
    return []
  } catch {
    return []
  }
}

async function generateEdgeRead(
  homeAbbr: string,
  awayAbbr: string,
  homeStreak: string,
  awayStreak: string,
  homeRest: number,
  awayRest: number,
  h2h: string,
  homeFatigueSummary: string,
  awayFatigueSummary: string
): Promise<string> {
  const prompt = `NBA game: ${awayAbbr} (${awayStreak}, ${awayRest}d rest, ${awayFatigueSummary}) @ ${homeAbbr} (${homeStreak}, ${homeRest}d rest, ${homeFatigueSummary}). H2H: ${h2h}.

Write exactly 2 sentences: "Edge: [TEAM] — [reason1]. [reason2]."
Prioritize load management / fatigue / back-to-back factors if relevant. Be direct and specific. No fluff.`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    })
    return (msg.content[0] as any).text?.trim() || ''
  } catch {
    return `Edge: ${homeStreak.startsWith('W') ? homeAbbr : awayAbbr} — home advantage and current form favor them tonight.`
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const home = searchParams.get('home')?.toUpperCase()
    const away = searchParams.get('away')?.toUpperCase()

    if (!home || !away) {
      return NextResponse.json({ error: 'Missing home or away param' }, { status: 400 })
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

    // Fetch all data in parallel
    const [homeGames, awayGames, h2hResult, homeInjuries, awayInjuries, refs, bettingSplits] = await Promise.all([
      fetchTeamRecentGames(home, 15),
      fetchTeamRecentGames(away, 15),
      fetchH2H(home, away),
      fetchEspnInjuries(home),
      fetchEspnInjuries(away),
      fetchRefereeAssignments(today),
      fetchPublicBettingSplits(home, away, today),
    ])

    const homeStreakData = calcStreak(homeGames)
    const awayStreakData = calcStreak(awayGames)
    const homeRest = calcRestDays(homeGames)
    const awayRest = calcRestDays(awayGames)
    const homeLastDate = homeGames[0]?.date || ''
    const awayLastDate = awayGames[0]?.date || ''

    // Home/Away splits
    const homeSplits = computeHomeAwaySplits(homeGames)
    const awaySplits = computeHomeAwaySplits(awayGames)

    // Pace data
    const homePace = PACE_DATA[home] || 99.0
    const awayPace = PACE_DATA[away] || 99.0
    const paceEdge = getPaceEdge(homePace, awayPace)

    // Fetch fatigue reports + edge read in parallel
    const [homeFatigue, awayFatigue] = await Promise.all([
      fetchFatigueReport(home, homeRest, homeLastDate),
      fetchFatigueReport(away, awayRest, awayLastDate),
    ])

    const edgeRead = await generateEdgeRead(
      home, away,
      homeStreakData.label, awayStreakData.label,
      homeRest, awayRest,
      h2hResult.summary,
      homeFatigue?.summary || 'no data',
      awayFatigue?.summary || 'no data'
    )

    // Altitude note
    const altitudeNote = ALTITUDE_TEAMS.includes(home)
      ? `Denver altitude (~5,280 ft) affects visiting team stamina — fatigue amplified for away players`
      : null

    const intel = {
      home: {
        abbr: home,
        streak: homeStreakData.streak,
        streakLabel: homeStreakData.label,
        lastGames: homeStreakData.lastFive,
        restDays: homeRest,
        fatigue: homeFatigue,
      },
      away: {
        abbr: away,
        streak: awayStreakData.streak,
        streakLabel: awayStreakData.label,
        lastGames: awayStreakData.lastFive,
        restDays: awayRest,
        fatigue: awayFatigue,
      },
      h2h: h2hResult.summary,
      h2hLastMeeting: h2hResult.lastMeeting,
      edgeRead,
      injuryImpact: {
        home: classifyInjuryImpact(homeInjuries),
        away: classifyInjuryImpact(awayInjuries),
        homeNotes: '',
        awayNotes: '',
        homePlayers: homeInjuries,
        awayPlayers: awayInjuries,
      },
      pace: {
        home: homePace,
        away: awayPace,
        edgeLabel: paceEdge.label,
        implication: paceEdge.implication,
      },
      homeAwaySplits: {
        home: homeSplits,
        away: awaySplits,
      },
      refs,
      bettingSplits,
      altitudeNote,
    }

    return NextResponse.json(intel)
  } catch (err) {
    console.error('Team intel error:', err)
    return NextResponse.json({ error: 'Failed to fetch team intel' }, { status: 500 })
  }
}
