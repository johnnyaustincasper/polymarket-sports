import { NextResponse } from 'next/server'

const TEAM_ALIASES: Record<string, string> = {
  'atlanta hawks': 'hawks', 'boston celtics': 'celtics', 'brooklyn nets': 'nets',
  'charlotte hornets': 'hornets', 'chicago bulls': 'bulls', 'cleveland cavaliers': 'cavaliers',
  'dallas mavericks': 'mavericks', 'denver nuggets': 'nuggets', 'detroit pistons': 'pistons',
  'golden state warriors': 'warriors', 'houston rockets': 'rockets', 'indiana pacers': 'pacers',
  'la clippers': 'clippers', 'los angeles clippers': 'clippers',
  'la lakers': 'lakers', 'los angeles lakers': 'lakers',
  'memphis grizzlies': 'grizzlies', 'miami heat': 'heat', 'milwaukee bucks': 'bucks',
  'minnesota timberwolves': 'timberwolves', 'new orleans pelicans': 'pelicans',
  'new york knicks': 'knicks', 'oklahoma city thunder': 'thunder',
  'orlando magic': 'magic', 'philadelphia 76ers': '76ers',
  'phoenix suns': 'suns', 'portland trail blazers': 'trail blazers',
  'sacramento kings': 'kings', 'san antonio spurs': 'spurs',
  'toronto raptors': 'raptors', 'utah jazz': 'jazz', 'washington wizards': 'wizards',
}

function teamSlug(name: string): string {
  return TEAM_ALIASES[name.toLowerCase()] || name.toLowerCase().split(' ').pop() || name.toLowerCase()
}

async function getPolymarketOdds(awayName: string, homeName: string, dateStr: string): Promise<{ awayOdds: number; homeOdds: number } | null> {
  try {
    const awaySlug = teamSlug(awayName)
    const homeSlug = teamSlug(homeName)

    // Try multiple slug formats Polymarket uses
    const slugsToTry = [
      `nba-${awaySlug.replace(/\s+/g, '-')}-${homeSlug.replace(/\s+/g, '-')}-${dateStr}`,
      `nba-${awaySlug.replace(/\s+/g, '-')}-vs-${homeSlug.replace(/\s+/g, '-')}-${dateStr}`,
    ]

    for (const slug of slugsToTry) {
      const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`, {
        next: { revalidate: 60 }
      })
      if (!res.ok) continue
      const events = await res.json()
      if (!events?.length) continue

      const event = events[0]
      const winMarket = (event.markets || []).find((m: any) => {
        const outcomes = JSON.parse(m.outcomes || '[]')
        return outcomes.length === 2
      })
      if (!winMarket) continue

      const outcomes = JSON.parse(winMarket.outcomes || '[]') as string[]
      const prices = JSON.parse(winMarket.outcomePrices || '[]') as string[]

      // Match away/home to outcomes
      const awayIdx = outcomes.findIndex((o: string) =>
        o.toLowerCase().includes(awaySlug) || awaySlug.includes(o.toLowerCase().split(' ').pop() || '')
      )
      const homeIdx = awayIdx === 0 ? 1 : 0

      return {
        awayOdds: parseFloat(prices[awayIdx >= 0 ? awayIdx : 0] || '0.5'),
        homeOdds: parseFloat(prices[homeIdx] || '0.5'),
      }
    }

    // Fallback: search by title keyword
    const searchRes = await fetch(
      `https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&tag_slug=nba-game-lines`,
      { next: { revalidate: 60 } }
    )
    if (searchRes.ok) {
      const events: any[] = await searchRes.json()
      for (const event of events) {
        const title = (event.title || '').toLowerCase()
        if (title.includes(awaySlug) && title.includes(homeSlug)) {
          const winMarket = (event.markets || []).find((m: any) => {
            const outcomes = JSON.parse(m.outcomes || '[]')
            return outcomes.length === 2
          })
          if (!winMarket) continue
          const outcomes = JSON.parse(winMarket.outcomes || '[]') as string[]
          const prices = JSON.parse(winMarket.outcomePrices || '[]') as string[]
          const awayIdx = outcomes.findIndex((o: string) => o.toLowerCase().includes(awaySlug))
          return {
            awayOdds: parseFloat(prices[awayIdx >= 0 ? awayIdx : 0] || '0.5'),
            homeOdds: parseFloat(prices[awayIdx === 0 ? 1 : 0] || '0.5'),
          }
        }
      }
    }

    return null
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get('date') // YYYYMMDD format

    const dateStr = dateParam || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const espnDate = dateStr // ESPN uses YYYYMMDD

    const espnRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${espnDate}`,
      { next: { revalidate: 60 } }
    )
    const espnData = await espnRes.json()
    const events = espnData?.events || []

    if (events.length === 0) return NextResponse.json([])

    // Format date for Polymarket slugs: YYYY-MM-DD
    const polyDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`

    const games = await Promise.all(events.map(async (event: any) => {
      const comp = event.competitions?.[0]
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')

      const homeName = home?.team?.displayName || ''
      const awayName = away?.team?.displayName || ''
      const homeRecord = home?.records?.[0]?.summary || ''
      const awayRecord = away?.records?.[0]?.summary || ''
      const homeScore = home?.score || ''
      const awayScore = away?.score || ''
      const isLive = event.status?.type?.state === 'in'
      const isPost = event.status?.type?.state === 'post'
      const statusDetail = event.status?.type?.shortDetail || ''

      const gameDate = new Date(event.date)
      const startTime = gameDate.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
      })

      let gameTime = startTime
      if (isLive) gameTime = `LIVE — ${statusDetail}`
      else if (isPost) gameTime = 'Final'

      // Try to get real Polymarket odds
      const odds = await getPolymarketOdds(awayName, homeName, polyDate)

      return {
        id: event.id,
        homeTeam: {
          name: homeName,
          abbr: home?.team?.abbreviation || '',
          record: homeRecord,
          score: homeScore,
        },
        awayTeam: {
          name: awayName,
          abbr: away?.team?.abbreviation || '',
          record: awayRecord,
          score: awayScore,
        },
        gameTime,
        gameDate: event.date,
        status: event.status?.type?.state || 'pre',
        homeOdds: odds?.homeOdds ?? 0.5,
        awayOdds: odds?.awayOdds ?? 0.5,
        hasRealOdds: odds !== null,
      }
    }))

    // Sort by game time
    games.sort((a: any, b: any) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())

    return NextResponse.json(games)
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
