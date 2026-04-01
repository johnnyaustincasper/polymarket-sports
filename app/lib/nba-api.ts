// ─── Shared NBA Data Fetching Utilities ────────────────────────────────────────

// stats.nba.com team IDs (2024-25 season)
export const NBA_TEAM_IDS: Record<string, number> = {
  ATL: 1610612737, BOS: 1610612738, BKN: 1610612751,
  CHA: 1610612766, CHI: 1610612741, CLE: 1610612739,
  DAL: 1610612742, DEN: 1610612743, DET: 1610612765,
  GSW: 1610612744, HOU: 1610612745, IND: 1610612754,
  LAC: 1610612746, LAL: 1610612747, MEM: 1610612763,
  MIA: 1610612748, MIL: 1610612749, MIN: 1610612750,
  NOP: 1610612740, NYK: 1610612752, OKC: 1610612760,
  ORL: 1610612753, PHI: 1610612755, PHX: 1610612756,
  POR: 1610612757, SAC: 1610612758, SAS: 1610612759,
  TOR: 1610612761, UTA: 1610612762, WAS: 1610612764,
}

// ESPN abbreviation map (ESPN uses slightly different abbreviations)
export const ESPN_ABBR: Record<string, string> = {
  ATL: 'atl', BOS: 'bos', BKN: 'bkn', CHA: 'cha', CHI: 'chi',
  CLE: 'cle', DAL: 'dal', DEN: 'den', DET: 'det', GSW: 'gs',
  HOU: 'hou', IND: 'ind', LAC: 'lac', LAL: 'lal', MEM: 'mem',
  MIA: 'mia', MIL: 'mil', MIN: 'min', NOP: 'no', NYK: 'ny',
  OKC: 'okc', ORL: 'orl', PHI: 'phi', PHX: 'phx', POR: 'por',
  SAC: 'sac', SAS: 'sa', TOR: 'tor', UTA: 'utah', WAS: 'wsh',
}

// Full team names to abbreviation map (for matching ESPN data)
export const TEAM_NAME_TO_ABBR: Record<string, string> = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'LA Clippers': 'LAC', 'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX', 'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
}

export interface GameResult {
  date: string
  win: boolean
  score: string       // e.g. "110-105"
  opponent: string    // opponent abbreviation
  isHome: boolean
}

/**
 * Fetch recent games for a team from ESPN schedule API.
 * Returns results newest-first.
 */
export async function fetchTeamRecentGames(abbr: string, limit = 10): Promise<GameResult[]> {
  const upper = abbr.toUpperCase()
  const espnAbbr = ESPN_ABBR[upper] || abbr.toLowerCase()

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnAbbr}/schedule`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 300 }, // cache 5 min
      }
    )
    if (!res.ok) return []
    const data = await res.json()

    const games: GameResult[] = []
    const events: any[] = data.events || []

    const completed = events
      .filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit)

    for (const event of completed) {
      const comp = event.competitions?.[0]
      const competitors: any[] = comp?.competitors || []

      const team = competitors.find((c: any) =>
        c.team?.abbreviation?.toUpperCase() === upper
      )
      const opp = competitors.find((c: any) =>
        c.team?.abbreviation?.toUpperCase() !== upper
      )

      if (!team) continue

      const win = team.winner === true
      const teamScore = team.score?.value ?? team.score ?? 0
      const oppScore = opp?.score?.value ?? opp?.score ?? 0
      const isHome = team.homeAway === 'home'

      games.push({
        date: (event.date || '').slice(0, 10),
        win,
        score: `${teamScore}-${oppScore}`,
        opponent: opp?.team?.abbreviation?.toUpperCase() || '???',
        isHome,
      })
    }

    return games
  } catch {
    return []
  }
}

/**
 * Calculate current streak from game results (newest first).
 * Returns: streak (positive = W, negative = L), label ('W5'), lastFive array.
 */
export function calcStreak(games: GameResult[]): {
  streak: number
  label: string
  lastFive: ('W' | 'L')[]
} {
  if (!games.length) return { streak: 0, label: 'N/A', lastFive: [] }

  const lastFive = games.slice(0, 5).map(g => (g.win ? 'W' : 'L') as 'W' | 'L')

  const firstResult = games[0].win
  let count = 0
  for (const g of games) {
    if (g.win === firstResult) count++
    else break
  }

  return {
    streak: firstResult ? count : -count,
    label: firstResult ? `W${count}` : `L${count}`,
    lastFive,
  }
}

/**
 * Calculate rest days since last completed game.
 * Uses today in CST.
 */
export function calcRestDays(games: GameResult[]): number {
  if (!games.length) return 3 // assume well-rested if no data
  const lastDate = new Date(games[0].date + 'T12:00:00Z') // noon UTC to avoid timezone issues
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const today = new Date(todayStr + 'T12:00:00Z')
  const diff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

/**
 * Fetch today's NBA scoreboard from ESPN and extract team abbreviations.
 * Used to limit streak fetches to only today's teams.
 */
export async function fetchTodayTeamAbbrs(): Promise<string[]> {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).replace(/-/g, '')
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    const abbrs = new Set<string>()
    for (const event of data.events || []) {
      for (const comp of event.competitions || []) {
        for (const c of comp.competitors || []) {
          const abbr = c.team?.abbreviation?.toUpperCase()
          if (abbr) abbrs.add(abbr)
        }
      }
    }
    return Array.from(abbrs)
  } catch {
    return []
  }
}

/**
 * Fetch the most recent completed game's event ID for a team from ESPN schedule.
 */
export async function fetchLastEventId(abbr: string): Promise<string | null> {
  const upper = abbr.toUpperCase()
  const espnAbbr = ESPN_ABBR[upper] || abbr.toLowerCase()
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnAbbr}/schedule`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const events: any[] = data.events || []
    const completed = events
      .filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return completed[0]?.id || null
  } catch {
    return null
  }
}

/**
 * Parse minutes string like "38:24" or "38" into integer minutes.
 */
export function parseMinutes(minStr: string | null | undefined): number {
  if (!minStr) return -1
  const str = String(minStr).trim()
  if (!str || str === '--' || str === 'DNP' || str === '0:00') return -1
  const parts = str.split(':')
  const mins = parseInt(parts[0], 10)
  return isNaN(mins) ? -1 : mins
}

import type { PlayerMinutes, FatigueReport } from './types'

/**
 * Fetch player minutes from ESPN game summary boxscore.
 * Returns FatigueReport for a given team.
 */
export async function fetchFatigueReport(
  abbr: string,
  restDays: number,
  lastGameDate: string
): Promise<FatigueReport | null> {
  const upper = abbr.toUpperCase()

  // Get last event ID
  const eventId = await fetchLastEventId(upper)
  if (!eventId) return null

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()

    // Find this team's boxscore
    const boxscores: any[] = data.boxscore?.players || []
    const teamBox = boxscores.find((b: any) =>
      b.team?.abbreviation?.toUpperCase() === upper
    )
    if (!teamBox) return null

    const isBackToBack = restDays === 0

    // Parse player stats
    const stats: any[] = teamBox.statistics || []
    // ESPN boxscore statistics[0] is usually the main stats table
    const mainStats = stats[0]
    if (!mainStats) return null

    const athletes: any[] = mainStats.athletes || []
    const labels: string[] = mainStats.labels || []
    const minIdx = labels.findIndex((l: string) => l.toUpperCase() === 'MIN')

    const players: PlayerMinutes[] = []

    for (const athlete of athletes) {
      const isStarter = athlete.starter === true
      const didNotPlay = athlete.didNotPlay === true
      const reason = (athlete.reason || '').toLowerCase()

      let minutes = -1
      if (!didNotPlay && minIdx >= 0) {
        const statValues: string[] = athlete.stats || []
        minutes = parseMinutes(statValues[minIdx])
      }

      // Skip if DNP and not a notable name (keep all starters + 6th man type players)
      if (minutes < 0 && !isStarter) {
        // still include but mark DNP
      }

      const fatigueFlag: PlayerMinutes['fatigueFlag'] =
        minutes < 0 ? 'dnp' :
        minutes >= 36 ? 'high' :
        minutes >= 28 ? 'moderate' : 'normal'

      // Resting starter: starter with DNP and reason is NOT injury-related
      const injuryKeywords = ['knee', 'ankle', 'hamstring', 'shoulder', 'back', 'hip', 'concussion', 'illness', 'personal', 'foot', 'calf', 'wrist', 'elbow', 'suspension']
      const isInjury = injuryKeywords.some(k => reason.includes(k))
      const restingStarter = isStarter && minutes < 0 && !isInjury

      // Critical fatigue: B2B AND high minutes last game
      const criticalFatigue = isBackToBack && minutes >= 35

      const name = athlete.athlete?.shortName || athlete.athlete?.displayName || 'Unknown'

      players.push({
        name,
        minutes,
        fatigueFlag,
        isStarter,
        restingStarter,
        criticalFatigue,
      })
    }

    // Sort: starters first, then by minutes desc
    players.sort((a, b) => {
      if (a.isStarter && !b.isStarter) return -1
      if (!a.isStarter && b.isStarter) return 1
      return b.minutes - a.minutes
    })

    // Top 8 rotation players
    const topPlayers = players.slice(0, 8)

    const hasFatigueRisk = topPlayers.some(p => p.criticalFatigue)
    const hasRestingStarter = topPlayers.some(p => p.restingStarter)
    const restingStarters = topPlayers.filter(p => p.restingStarter).map(p => p.name)

    let summary = '✅ Full strength'
    if (hasRestingStarter) {
      summary = `⚠️ ${restingStarters.join(', ')} likely resting tonight`
    } else if (hasFatigueRisk) {
      const fatigued = topPlayers.filter(p => p.criticalFatigue).map(p => p.name)
      summary = `🔥 Fatigue risk: ${fatigued.join(', ')} (B2B, 35+ min)`
    } else if (isBackToBack) {
      summary = '⚡ Back-to-back — monitor for load management'
    }

    return {
      teamAbbr: upper,
      isBackToBack,
      lastGameDate,
      players: topPlayers,
      hasFatigueRisk,
      hasRestingStarter,
      restingStarters,
      summary,
    }
  } catch {
    return null
  }
}

/**
 * Fetch from stats.nba.com with required headers.
 * Note: This API often blocks requests — ESPN is preferred.
 */
export async function fetchNBAStats(path: string): Promise<any> {
  try {
    const res = await fetch(`https://stats.nba.com/stats/${path}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://stats.nba.com',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://stats.nba.com',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
