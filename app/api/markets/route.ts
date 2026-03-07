import { NextResponse } from 'next/server'

// Fetch NBA standings/records from ESPN
async function fetchTeamRecords(): Promise<Record<string, { abbr: string; record: string }>> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=30',
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return {}
    const data = await res.json()
    const map: Record<string, { abbr: string; record: string }> = {}
    for (const entry of data?.sports?.[0]?.leagues?.[0]?.teams || []) {
      const t = entry.team
      const name = t.displayName?.toLowerCase()
      const nickname = t.name?.toLowerCase()
      const abbr = t.abbreviation
      const record = t.record?.items?.[0]?.summary || ''
      if (name) map[name] = { abbr, record }
      if (nickname) map[nickname] = { abbr, record }
    }
    return map
  } catch {
    return {}
  }
}

// Fetch today's NBA schedule from ESPN
async function fetchTodayGames(): Promise<Record<string, { time: string; homeAbbr: string; awayAbbr: string }>> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { next: { revalidate: 60 } }
    )
    if (!res.ok) return {}
    const data = await res.json()
    const map: Record<string, { time: string; homeAbbr: string; awayAbbr: string }> = {}
    for (const event of data?.events || []) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const home = comp.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away')
      const status = event.status?.type?.shortDetail || ''
      const homeAbbr = home?.team?.abbreviation || ''
      const awayAbbr = away?.team?.abbreviation || ''
      const homeName = home?.team?.displayName?.toLowerCase() || ''
      const awayName = away?.team?.displayName?.toLowerCase() || ''
      map[`${awayName}-${homeName}`] = { time: status, homeAbbr, awayAbbr }
      map[`${homeName}-${awayName}`] = { time: status, homeAbbr, awayAbbr }
    }
    return map
  } catch {
    return {}
  }
}

export async function GET() {
  try {
    const [teamRecords, todayGames] = await Promise.all([fetchTeamRecords(), fetchTodayGames()])

    const res = await fetch(
      'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=200&order=volume&ascending=false',
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } }
    )
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const events: any[] = await res.json()

    const markets: any[] = []

    for (const event of events) {
      const title = (event.title || '').toLowerCase()
      if (!title.includes('nba')) continue

      const winnerMarket = (event.markets || []).find((m: any) => {
        const outcomes = JSON.parse(m.outcomes || '[]')
        const prices = JSON.parse(m.outcomePrices || '[]')
        if (outcomes.length !== 2) return false
        const sum = prices.reduce((a: number, b: string) => a + parseFloat(b), 0)
        return sum > 0.8 && sum < 1.2
      })

      if (!winnerMarket) continue

      const volume = parseFloat(event.volume || winnerMarket.volume || '0')
      if (volume < 1000) continue

      const outcomes = JSON.parse(winnerMarket.outcomes || '[]') as string[]
      const prices = JSON.parse(winnerMarket.outcomePrices || '[]') as string[]

      // Look up records and abbrs
      const enriched = outcomes.map((name: string, i: number) => {
        const key = name.toLowerCase()
        const info = teamRecords[key] || {}
        return {
          name,
          abbr: (info as any).abbr || name.split(' ').pop()?.toUpperCase().slice(0, 3) || name.slice(0, 3).toUpperCase(),
          record: (info as any).record || '',
          price: parseFloat(prices[i] || '0'),
        }
      })

      // Find game time
      const teamAKey = enriched[0]?.name?.toLowerCase()
      const teamBKey = enriched[1]?.name?.toLowerCase()
      const gameKey = `${teamAKey}-${teamBKey}`
      const gameInfo = todayGames[gameKey] || {}

      markets.push({
        id: event.id,
        question: event.title,
        volume,
        outcomes: enriched,
        sport: 'NBA',
        gameTime: (gameInfo as any).time || '',
      })
    }

    markets.sort((a, b) => b.volume - a.volume)
    return NextResponse.json(markets)
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
