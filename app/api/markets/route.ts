import { NextResponse } from 'next/server'

const SPORT_KEYWORDS: Record<string, string[]> = {
  NBA: ['nba', 'lakers', 'celtics', 'warriors', 'bulls', 'heat', 'bucks', 'suns', 'nuggets', 'knicks', 'nets', 'sixers', 'clippers', 'mavs', 'mavericks', 'spurs', 'rockets', 'grizzlies', 'pelicans', 'thunder', 'jazz', 'blazers', 'kings', 'timberwolves', 'pacers', 'pistons', 'cavaliers', 'hornets', 'hawks', 'magic', 'raptors', 'wizards'],
  NHL: ['nhl', 'bruins', 'sabres', 'flames', 'blackhawks', 'avalanche', 'blue jackets', 'stars', 'red wings', 'oilers', 'panthers', 'kings', 'wild', 'canadiens', 'predators', 'devils', 'islanders', 'rangers', 'senators', 'flyers', 'penguins', 'blues', 'sharks', 'kraken', 'lightning', 'maple leafs', 'canucks', 'golden knights', 'capitals', 'jets', 'hurricanes', 'ducks'],
  NCAAB: ['ncaab', 'ncaa basketball', 'college basketball', 'march madness'],
  NFL: ['nfl', 'super bowl', 'patriots', 'cowboys', 'packers', 'chiefs', 'eagles', 'ravens', 'steelers', '49ers', 'seahawks', 'rams', 'chargers', 'broncos', 'raiders', 'dolphins', 'bills', 'jets', 'texans', 'colts', 'jaguars', 'titans', 'bengals', 'browns', 'lions', 'bears', 'vikings', 'saints', 'falcons', 'buccaneers', 'panthers', 'commanders', 'giants', 'cardinals'],
  MLB: ['mlb', 'world series', 'yankees', 'red sox', 'dodgers', 'cubs', 'cardinals', 'braves', 'mets', 'phillies', 'nationals', 'marlins', 'pirates', 'reds', 'brewers', 'cubs', 'astros', 'rangers', 'athletics', 'angels', 'mariners', 'giants baseball', 'padres', 'rockies', 'diamondbacks', 'tigers', 'indians', 'white sox', 'royals', 'twins', 'blue jays', 'orioles', 'rays'],
  MLS: ['mls', 'soccer', 'lafc', 'la galaxy', 'inter miami', 'nycfc', 'red bulls'],
  UFC: ['ufc', 'mma', 'fight night', 'versus'],
}

function detectSport(question: string): string {
  const q = question.toLowerCase()
  for (const [sport, keywords] of Object.entries(SPORT_KEYWORDS)) {
    if (keywords.some(k => q.includes(k))) return sport
  }
  return 'OTHER'
}

export async function GET() {
  try {
    // Fetch live/active sports markets from Polymarket CLOB API
    const url = 'https://clob.polymarket.com/markets?active=true&closed=false&limit=100&tag_id=15'
    
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 }
    })

    if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`)
    const data = await res.json()

    const rawMarkets = data.data || data.markets || data || []

    // Also fetch NBA tag specifically
    const nbaRes = await fetch('https://clob.polymarket.com/markets?active=true&closed=false&limit=100&tag_id=21', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 }
    })
    const nbaData = nbaRes.ok ? await nbaRes.json() : { data: [] }
    const nbaMarkets = nbaData.data || []

    // Combine and dedupe
    const allRaw = [...rawMarkets, ...nbaMarkets]
    const seen = new Set<string>()
    const unique = allRaw.filter((m: any) => {
      if (seen.has(m.condition_id || m.id)) return false
      seen.add(m.condition_id || m.id)
      return true
    })

    const markets = unique
      .filter((m: any) => m.question && m.volume !== undefined)
      .map((m: any) => {
        const tokens = m.tokens || []
        const outcomes = tokens.map((t: any) => ({
          name: t.outcome || t.name || 'Yes',
          price: parseFloat(t.price) || 0,
        }))

        return {
          id: m.condition_id || m.id,
          question: m.question,
          volume: parseFloat(m.volume) || 0,
          outcomes,
          sport: detectSport(m.question),
          status: m.active ? 'live' : 'upcoming',
          startDate: m.game_start_time || m.end_date_iso,
        }
      })
      .filter((m: any) => m.volume > 1000) // Only markets with real volume
      .sort((a: any, b: any) => b.volume - a.volume)

    return NextResponse.json(markets)
  } catch (err) {
    console.error('Polymarket fetch error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
