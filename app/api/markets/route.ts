import { NextResponse } from 'next/server'

const SPORT_KEYWORDS: Record<string, string[]> = {
  NBA: ['nba'],
  NHL: ['nhl'],
  NCAAB: ['ncaab', 'ncaa'],
  NFL: ['nfl'],
  MLB: ['mlb'],
  UFC: ['ufc', 'mma'],
  MLS: ['mls'],
}

function detectSport(text: string): string {
  const t = text.toLowerCase()
  for (const [sport, keywords] of Object.entries(SPORT_KEYWORDS)) {
    if (keywords.some(k => t.includes(k))) return sport
  }
  return 'OTHER'
}

export async function GET() {
  try {
    // Use events endpoint — each event is a matchup with winner market embedded
    const res = await fetch(
      'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=200&order=volume&ascending=false',
      { headers: { Accept: 'application/json' }, next: { revalidate: 30 } }
    )
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const events: any[] = await res.json()

    const markets: any[] = []

    for (const event of events) {
      const sport = detectSport(event.title || event.slug || '')
      if (sport === 'OTHER') continue

      // Find the winner market (2 outcomes, "who wins" style)
      const winnerMarket = (event.markets || []).find((m: any) => {
        const outcomes = JSON.parse(m.outcomes || '[]')
        const prices = JSON.parse(m.outcomePrices || '[]')
        if (outcomes.length !== 2) return false
        // Both outcomes should have prices that roughly sum to 1
        const sum = prices.reduce((a: number, b: string) => a + parseFloat(b), 0)
        return sum > 0.8 && sum < 1.2
      })

      if (!winnerMarket) continue

      const volume = parseFloat(event.volume || winnerMarket.volume || '0')
      if (volume < 1000) continue

      const outcomes = JSON.parse(winnerMarket.outcomes || '[]') as string[]
      const prices = JSON.parse(winnerMarket.outcomePrices || '[]') as string[]

      markets.push({
        id: event.id,
        question: event.title || winnerMarket.question,
        volume,
        outcomes: outcomes.map((name: string, i: number) => ({
          name,
          price: parseFloat(prices[i] || '0'),
        })),
        sport,
        gameStartTime: event.startDate || winnerMarket.gameStartTime,
      })
    }

    markets.sort((a, b) => b.volume - a.volume)
    return NextResponse.json(markets)
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
