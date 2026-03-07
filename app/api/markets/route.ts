import { NextResponse } from 'next/server'

interface Team {
  name: string
  abbr: string
  record: string
  score?: string
}

interface Game {
  id: string
  homeTeam: Team
  awayTeam: Team
  gameTime: string
  status: string
  homeOdds: number
  awayOdds: number
  polymarketId?: string
}

// All NBA team name variations → standardized name
const TEAM_ALIASES: Record<string, string> = {
  'atlanta hawks': 'Atlanta Hawks', 'hawks': 'Atlanta Hawks',
  'boston celtics': 'Boston Celtics', 'celtics': 'Boston Celtics',
  'brooklyn nets': 'Brooklyn Nets', 'nets': 'Brooklyn Nets',
  'charlotte hornets': 'Charlotte Hornets', 'hornets': 'Charlotte Hornets',
  'chicago bulls': 'Chicago Bulls', 'bulls': 'Chicago Bulls',
  'cleveland cavaliers': 'Cleveland Cavaliers', 'cavaliers': 'Cleveland Cavaliers', 'cavs': 'Cleveland Cavaliers',
  'dallas mavericks': 'Dallas Mavericks', 'mavericks': 'Dallas Mavericks', 'mavs': 'Dallas Mavericks',
  'denver nuggets': 'Denver Nuggets', 'nuggets': 'Denver Nuggets',
  'detroit pistons': 'Detroit Pistons', 'pistons': 'Detroit Pistons',
  'golden state warriors': 'Golden State Warriors', 'warriors': 'Golden State Warriors',
  'houston rockets': 'Houston Rockets', 'rockets': 'Houston Rockets',
  'indiana pacers': 'Indiana Pacers', 'pacers': 'Indiana Pacers',
  'la clippers': 'LA Clippers', 'los angeles clippers': 'LA Clippers', 'clippers': 'LA Clippers',
  'la lakers': 'LA Lakers', 'los angeles lakers': 'LA Lakers', 'lakers': 'LA Lakers',
  'memphis grizzlies': 'Memphis Grizzlies', 'grizzlies': 'Memphis Grizzlies',
  'miami heat': 'Miami Heat', 'heat': 'Miami Heat',
  'milwaukee bucks': 'Milwaukee Bucks', 'bucks': 'Milwaukee Bucks',
  'minnesota timberwolves': 'Minnesota Timberwolves', 'timberwolves': 'Minnesota Timberwolves', 'wolves': 'Minnesota Timberwolves',
  'new orleans pelicans': 'New Orleans Pelicans', 'pelicans': 'New Orleans Pelicans',
  'new york knicks': 'New York Knicks', 'knicks': 'New York Knicks',
  'oklahoma city thunder': 'Oklahoma City Thunder', 'thunder': 'Oklahoma City Thunder', 'okc': 'Oklahoma City Thunder',
  'orlando magic': 'Orlando Magic', 'magic': 'Orlando Magic',
  'philadelphia 76ers': 'Philadelphia 76ers', '76ers': 'Philadelphia 76ers', 'sixers': 'Philadelphia 76ers',
  'phoenix suns': 'Phoenix Suns', 'suns': 'Phoenix Suns',
  'portland trail blazers': 'Portland Trail Blazers', 'trail blazers': 'Portland Trail Blazers', 'blazers': 'Portland Trail Blazers',
  'sacramento kings': 'Sacramento Kings', 'kings': 'Sacramento Kings',
  'san antonio spurs': 'San Antonio Spurs', 'spurs': 'San Antonio Spurs',
  'toronto raptors': 'Toronto Raptors', 'raptors': 'Toronto Raptors',
  'utah jazz': 'Utah Jazz', 'jazz': 'Utah Jazz',
  'washington wizards': 'Washington Wizards', 'wizards': 'Washington Wizards',
}

function normalize(name: string): string {
  return TEAM_ALIASES[name.toLowerCase()] || name
}

export async function GET() {
  try {
    // Step 1: Get today's NBA games from ESPN
    const espnRes = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { next: { revalidate: 60 } }
    )
    const espnData = await espnRes.json()
    const events = espnData?.events || []

    if (events.length === 0) {
      return NextResponse.json([])
    }

    // Step 2: Get Polymarket NBA game odds
    // Search for recent NBA game events on Polymarket
    const polyRes = await fetch(
      'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=500&tag_slug=nba-game-lines',
      { next: { revalidate: 60 } }
    )
    const polyEvents: any[] = polyRes.ok ? await polyRes.json() : []

    // Also try the general search with "NBA:" prefix
    const polyRes2 = await fetch(
      'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=500&order=startDate&ascending=false',
      { next: { revalidate: 60 } }
    )
    const polyEvents2: any[] = polyRes2.ok ? await polyRes2.json() : []

    // Combine and filter for NBA game matchups only
    const allPolyEvents = [...polyEvents, ...polyEvents2]
    const nbaMatchups = allPolyEvents.filter((e: any) => {
      const title = (e.title || '').toLowerCase()
      return title.includes('nba') && title.includes('vs')
    })

    // Build odds lookup: normalized team name → win probability
    const oddsMap: Record<string, number> = {}
    for (const event of nbaMatchups) {
      for (const market of (event.markets || [])) {
        const outcomes = JSON.parse(market.outcomes || '[]') as string[]
        const prices = JSON.parse(market.outcomePrices || '[]') as string[]
        if (outcomes.length !== 2) continue
        outcomes.forEach((name: string, i: number) => {
          const normalized = normalize(name)
          oddsMap[normalized] = parseFloat(prices[i] || '0')
        })
      }
    }

    // Step 3: Build game list from ESPN + attach Polymarket odds
    const games: Game[] = events.map((event: any) => {
      const comp = event.competitions?.[0]
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')

      const homeName = normalize(home?.team?.displayName || '')
      const awayName = normalize(away?.team?.displayName || '')
      const homeAbbr = home?.team?.abbreviation || ''
      const awayAbbr = away?.team?.abbreviation || ''
      const homeRecord = home?.records?.[0]?.summary || ''
      const awayRecord = away?.records?.[0]?.summary || ''
      const homeScore = home?.score || ''
      const awayScore = away?.score || ''
      const statusDetail = event.status?.type?.shortDetail || ''
      const startTime = event.date
        ? new Date(event.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
        : ''
      const isLive = event.status?.type?.state === 'in'
      const gameTime = isLive ? `LIVE — ${statusDetail}` : startTime

      // Get odds from Polymarket or fallback to 50/50
      const homeOdds = oddsMap[homeName] || 0.5
      const awayOdds = oddsMap[awayName] || (1 - homeOdds)

      return {
        id: event.id,
        homeTeam: { name: homeName, abbr: homeAbbr, record: homeRecord, score: homeScore },
        awayTeam: { name: awayName, abbr: awayAbbr, record: awayRecord, score: awayScore },
        gameTime,
        status: event.status?.type?.state || 'pre',
        homeOdds,
        awayOdds,
      }
    })

    return NextResponse.json(games)
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
