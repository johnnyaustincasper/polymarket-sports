import { NextResponse } from 'next/server'

const SPORT_KEYWORDS: Record<string, string[]> = {
  NBA: ['nba', ' lakers', ' celtics', ' warriors', ' bulls', ' heat', ' bucks', ' suns', ' nuggets', ' knicks', ' nets', ' sixers', ' clippers', ' mavericks', ' mavs ', ' spurs', ' rockets', ' grizzlies', ' pelicans', ' thunder', ' jazz ', ' blazers', ' kings ', ' timberwolves', ' pacers', ' pistons', ' cavaliers', ' hornets', ' hawks ', ' magic ', ' raptors', ' wizards'],
  NHL: ['nhl', ' bruins', ' sabres', ' flames', ' blackhawks', ' avalanche', ' stars ', ' red wings', ' oilers', ' panthers', ' wild ', ' canadiens', ' predators', ' devils ', ' islanders', ' rangers', ' senators', ' flyers', ' penguins', ' blues ', ' sharks', ' kraken', ' lightning', ' maple leafs', ' canucks', ' golden knights', ' capitals', ' jets ', ' hurricanes', ' ducks '],
  NCAAB: ['ncaab', 'ncaa basketball', 'college basketball', 'march madness'],
  NFL: ['nfl', 'super bowl', ' patriots', ' cowboys', ' packers', ' chiefs', ' eagles', ' ravens', ' steelers', ' 49ers', ' seahawks', ' rams ', ' chargers', ' broncos', ' raiders', ' dolphins', ' bills ', ' jets ', ' texans', ' colts', ' jaguars', ' titans', ' bengals', ' browns', ' lions ', ' bears ', ' vikings', ' saints', ' falcons', ' buccaneers', ' commanders', ' giants ', ' cardinals'],
  MLB: ['mlb', 'world series', ' yankees', ' red sox', ' dodgers', ' cubs ', ' braves', ' mets ', ' phillies', ' nationals', ' marlins', ' pirates', ' reds ', ' brewers', ' astros', ' rangers ', ' athletics', ' angels ', ' mariners', ' padres', ' rockies', ' diamondbacks', ' tigers', ' white sox', ' royals', ' twins', ' blue jays', ' orioles', ' rays '],
  MLS: ['mls', ' lafc', 'la galaxy', 'inter miami', 'nycfc', 'red bulls', ' fc '],
  UFC: ['ufc', 'mma', 'fight night', ' vs. ', 'championship fight'],
}

function detectSport(question: string): string {
  const q = ` ${question.toLowerCase()} `
  for (const [sport, keywords] of Object.entries(SPORT_KEYWORDS)) {
    if (keywords.some(k => q.includes(k.toLowerCase()))) return sport
  }
  return 'OTHER'
}

const SPORTS_SET = new Set(['NBA', 'NHL', 'NCAAB', 'NFL', 'MLB', 'MLS', 'UFC'])

export async function GET() {
  try {
    // Fetch large batch from Gamma API - this is what polymarket.com uses
    const url = 'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=500&order=volume&ascending=false'

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 },
    })

    if (!res.ok) throw new Error(`Gamma API error: ${res.status}`)
    const raw: any[] = await res.json()

    const markets = raw
      .filter((m: any) => m.question && parseFloat(m.volume || '0') > 500)
      .map((m: any) => {
        const outcomes = JSON.parse(m.outcomes || '[]') as string[]
        const prices = JSON.parse(m.outcomePrices || '[]') as string[]

        return {
          id: m.id,
          question: m.question,
          volume: parseFloat(m.volume || '0'),
          outcomes: outcomes.map((name: string, i: number) => ({
            name,
            price: parseFloat(prices[i] || '0'),
          })),
          sport: detectSport(m.question),
          status: m.active ? 'active' : 'closed',
          endDate: m.endDate,
        }
      })
      .filter((m: any) => {
        if (!SPORTS_SET.has(m.sport)) return false
        // Only head-to-head game markets: must have exactly 2 outcomes
        if (m.outcomes.length !== 2) return false
        // Must look like "Team A vs. Team B" or "Team A vs Team B" or "NBA: X vs Y"
        const q = m.question.toLowerCase()
        if (!q.includes(' vs') && !q.includes(' at ')) return false
        // Exclude props, awards, season markets
        const exclude = ['mvp', 'champion', 'title', 'playoff', 'draft', 'series', 'season', 'award', 'win the', 'make the', 'finish', 'total', 'points', 'rebounds', 'assists', 'score', 'lead', 'half', 'quarter', 'overtime', 'sweep']
        if (exclude.some(e => q.includes(e))) return false
        return true
      })
      .sort((a: any, b: any) => b.volume - a.volume)

    return NextResponse.json(markets)
  } catch (err) {
    console.error('Polymarket fetch error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
