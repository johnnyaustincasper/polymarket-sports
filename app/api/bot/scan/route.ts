import { NextResponse } from 'next/server'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

// Convert American odds string (e.g. "-130", "+110") to implied probability (0-1), vig-removed
function americanToProb(american: string): number {
  const n = parseFloat(american)
  if (isNaN(n)) return 0.5
  const raw = n < 0 ? (-n) / (-n + 100) : 100 / (n + 100)
  return raw
}

// Remove vig from a pair of raw implied probs so they sum to 1
function removeVig(p1: number, p2: number): [number, number] {
  const total = p1 + p2
  return [p1 / total, p2 / total]
}

// Convert spread to win probability using standard NBA logistic model
// σ ≈ 11 points for NBA (one std dev = ~11pt spread)
function spreadToWinProb(spread: number): number {
  // spread is favorite's number (negative), so favored team has spread < 0
  // prob(favorite wins) given spread s: logistic(-s / 11 * 1.4)
  // We return prob that the FAVORITE wins
  const z = Math.abs(spread) / 11.0
  return 1 / (1 + Math.exp(-z * 1.4))
}

const ESPN_TO_POLY: Record<string, string[]> = {
  ATL: ['hawks', 'atlanta'], BOS: ['celtics', 'boston'], BKN: ['nets', 'brooklyn'],
  CHA: ['hornets', 'charlotte'], CHI: ['bulls', 'chicago'], CLE: ['cavaliers', 'cleveland'],
  DAL: ['mavericks', 'dallas'], DEN: ['nuggets', 'denver'], DET: ['pistons', 'detroit'],
  GSW: ['warriors', 'golden state'], GS: ['warriors', 'golden state'],
  HOU: ['rockets', 'houston'], IND: ['pacers', 'indiana'],
  LAC: ['clippers', 'clippers'], LAL: ['lakers', 'los angeles lakers', 'lakers'],
  MEM: ['grizzlies', 'memphis'], MIA: ['heat', 'miami'], MIL: ['bucks', 'milwaukee'],
  MIN: ['timberwolves', 'minnesota'], NOP: ['pelicans', 'new orleans'], NO: ['pelicans', 'new orleans'],
  NYK: ['knicks', 'new york'], NY: ['knicks', 'new york'], OKC: ['thunder', 'oklahoma city'],
  ORL: ['magic', 'orlando'], PHI: ['76ers', 'philadelphia'],
  PHX: ['suns', 'phoenix'], POR: ['trail blazers', 'portland'],
  SAC: ['kings', 'sacramento'], SAS: ['spurs', 'san antonio'], SA: ['spurs', 'san antonio'],
  TOR: ['raptors', 'toronto'], UTA: ['jazz', 'utah'], UTAH: ['jazz', 'utah'],
  WAS: ['wizards', 'washington'], WSH: ['wizards', 'washington'],
}

function getKeywords(abbr: string, name: string): string[] {
  if (ESPN_TO_POLY[abbr]) return ESPN_TO_POLY[abbr]
  const skip = new Set(['state', 'university', 'college', 'the', 'of', 'at'])
  const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !skip.has(w))
  return words.length ? [words[0]] : [name.toLowerCase()]
}

function teamMatchesTitle(abbr: string, name: string, title: string): boolean {
  const t = title.toLowerCase()
  return getKeywords(abbr, name).some(k => t.includes(k))
}

interface Signal {
  gameId: string
  gameName: string
  gameTime: string
  status: string
  isLive: boolean
  awayScore: string
  homeScore: string
  // DK moneyline
  dkAwayML: string
  dkHomeML: string
  dkAwayImplied: number  // vig-removed
  dkHomeImplied: number  // vig-removed
  // DK spread / total
  dkSpread: number | null
  dkTotal: number | null
  // Polymarket
  polyEventTitle: string
  polyEventUrl: string
  polyConditionId: string
  polyAwayTeam: string
  polyHomeTeam: string
  polyAwayPrice: number  // current ask price (cents on dollar = probability)
  polyHomePrice: number
  polyAwayTokenId: string
  polyHomeTokenId: string
  // Edge
  awayEdge: number  // polymarket price - dk implied (positive = poly is CHEAP = buy opportunity)
  homeEdge: number
  bestSide: 'away' | 'home' | 'none'
  bestEdge: number
  recommendation: string
  sport: string
}

async function getClobPrice(conditionId: string): Promise<{ yes: number; no: number } | null> {
  try {
    // Get the midpoint price from CLOB order book
    const res = await fetch(`${CLOB_API}/markets/${conditionId}`, {
      next: { revalidate: 30 }
    })
    if (!res.ok) return null
    const data = await res.json()
    // tokens[0] = outcome 0, tokens[1] = outcome 1
    const t = data.tokens || []
    if (t.length < 2) return null
    return {
      yes: parseFloat(t[0].price) || 0,
      no: parseFloat(t[1].price) || 0
    }
  } catch {
    return null
  }
}

export async function GET() {
  try {
    // 1. Fetch today's NBA games from ESPN
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const espnRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`,
      { next: { revalidate: 120 } }
    )
    if (!espnRes.ok) return NextResponse.json({ error: 'ESPN fetch failed' }, { status: 500 })
    const espnData = await espnRes.json()
    const events: any[] = espnData.events || []

    // 2. Fetch active Polymarket NBA events
    const polyRes = await fetch(
      `${GAMMA_API}/events?active=true&closed=false&tag_slug=nba&limit=200`,
      { next: { revalidate: 60 } }
    )
    if (!polyRes.ok) return NextResponse.json({ error: 'Polymarket fetch failed' }, { status: 500 })
    const polyEvents: any[] = await polyRes.json()

    const signals: Signal[] = []

    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue

      const status = comp.status?.type?.state || 'pre'
      const isLive = status === 'in'
      // Only scan pre-game and live markets
      if (status !== 'pre' && status !== 'in') continue

      const competitors: any[] = comp.competitors || []
      const home = competitors.find((c: any) => c.homeAway === 'home')
      const away = competitors.find((c: any) => c.homeAway === 'away')
      if (!home || !away) continue

      const homeAbbr = home.team.abbreviation
      const awayAbbr = away.team.abbreviation
      const homeName = home.team.displayName
      const awayName = away.team.displayName

      // 3. Get DK moneyline from ESPN odds
      const oddsArr: any[] = comp.odds || []
      const dk = oddsArr.find((o: any) => o.provider?.name?.toLowerCase().includes('draft')) || oddsArr[0]
      const dkHomeML: string = dk?.moneyline?.home?.close?.odds || ''
      const dkAwayML: string = dk?.moneyline?.away?.close?.odds || ''
      const dkSpread: number | null = dk?.spread ?? null
      const dkTotal: number | null = dk?.overUnder ?? null
      const awayScore: string = away?.score?.toString() || ''
      const homeScore: string = home?.score?.toString() || ''

      if (!dkHomeML || !dkAwayML) continue  // skip if no moneyline

      const rawHome = americanToProb(dkHomeML)
      const rawAway = americanToProb(dkAwayML)
      const [dkHomeImplied, dkAwayImplied] = removeVig(rawHome, rawAway)

      // 4. Find matching Polymarket event
      const polyEvent = polyEvents.find(e => {
        const title = (e.title || '').toLowerCase()
        return teamMatchesTitle(awayAbbr, awayName, title) &&
               teamMatchesTitle(homeAbbr, homeName, title)
      })
      if (!polyEvent) continue

      // 5. Find the winner market (moneyline equivalent)
      const markets: any[] = polyEvent.markets || []
      const winnerMarket = markets
        .filter((m: any) => {
          const q = (m.question || '').toLowerCase()
          return !q.includes(':') && !q.includes('o/u') &&
                 teamMatchesTitle(awayAbbr, awayName, q) &&
                 teamMatchesTitle(homeAbbr, homeName, q)
        })
        .sort((a: any, b: any) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

      if (!winnerMarket) continue

      // 6. Parse outcomes & current prices from Gamma API
      const outcomes: string[] = JSON.parse(winnerMarket.outcomes || '[]')
      const prices: string[] = JSON.parse(winnerMarket.outcomePrices || '[]')
      if (outcomes.length !== 2 || prices.length !== 2) continue

      const homeKw = getKeywords(homeAbbr, homeName)
      const homeIdx = outcomes.findIndex((o: string) =>
        homeKw.some(k => o.toLowerCase().includes(k))
      )
      const awayIdx = homeIdx === 0 ? 1 : 0

      const polyHomePrice = parseFloat(prices[homeIdx]) || 0
      const polyAwayPrice = parseFloat(prices[awayIdx]) || 0

      // 7. Get live CLOB prices if available (more accurate than Gamma snapshot)
      const conditionId = winnerMarket.conditionId || ''
      let liveHomePrice = polyHomePrice
      let liveAwayPrice = polyAwayPrice
      if (conditionId) {
        const clob = await getClobPrice(conditionId)
        if (clob) {
          liveHomePrice = homeIdx === 0 ? clob.yes : clob.no
          liveAwayPrice = awayIdx === 0 ? clob.yes : clob.no
        }
      }

      // 8. Calculate edge: DK_implied - Poly_price
      // Positive = Poly is cheap relative to sharp lines = BUY opportunity
      const homeEdge = dkHomeImplied - liveHomePrice
      const awayEdge = dkAwayImplied - liveAwayPrice

      const MIN_EDGE = 0.03  // 3 cent minimum edge to signal
      let bestSide: 'away' | 'home' | 'none' = 'none'
      let bestEdge = 0
      let recommendation = 'No edge'

      if (homeEdge >= MIN_EDGE && homeEdge >= awayEdge) {
        bestSide = 'home'
        bestEdge = homeEdge
        recommendation = `BUY ${homeName} YES @ ${(liveHomePrice * 100).toFixed(1)}¢ | DK implies ${(dkHomeImplied * 100).toFixed(1)}¢ | Edge: +${(homeEdge * 100).toFixed(1)}¢`
      } else if (awayEdge >= MIN_EDGE) {
        bestSide = 'away'
        bestEdge = awayEdge
        recommendation = `BUY ${awayName} YES @ ${(liveAwayPrice * 100).toFixed(1)}¢ | DK implies ${(dkAwayImplied * 100).toFixed(1)}¢ | Edge: +${(awayEdge * 100).toFixed(1)}¢`
      }

      // Get token IDs for trade execution later
      const tokens: any[] = winnerMarket.clobTokenIds
        ? JSON.parse(winnerMarket.clobTokenIds)
        : []
      const homeTokenId = tokens[homeIdx] || ''
      const awayTokenId = tokens[awayIdx] || ''

      signals.push({
        gameId: event.id,
        gameName: `${awayName} @ ${homeName}`,
        gameTime: comp.date,
        status,
        isLive,
        awayScore,
        homeScore,
        dkAwayML,
        dkHomeML,
        dkAwayImplied: Math.round(dkAwayImplied * 1000) / 1000,
        dkHomeImplied: Math.round(dkHomeImplied * 1000) / 1000,
        dkSpread,
        dkTotal,
        polyEventTitle: polyEvent.title,
        polyEventUrl: `https://polymarket.com/event/${polyEvent.slug || ''}`,
        polyConditionId: conditionId,
        polyAwayTeam: outcomes[awayIdx],
        polyHomeTeam: outcomes[homeIdx],
        polyAwayPrice: Math.round(liveAwayPrice * 1000) / 1000,
        polyHomePrice: Math.round(liveHomePrice * 1000) / 1000,
        polyAwayTokenId: awayTokenId,
        polyHomeTokenId: homeTokenId,
        awayEdge: Math.round(awayEdge * 1000) / 1000,
        homeEdge: Math.round(homeEdge * 1000) / 1000,
        bestSide,
        bestEdge: Math.round(bestEdge * 1000) / 1000,
        recommendation,
        sport: 'NBA',
      })
    }

    // Sort: best edge first
    signals.sort((a, b) => b.bestEdge - a.bestEdge)

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      gamesScanned: events.filter(e => e.competitions?.[0]?.status?.type?.state === 'pre').length,
      polyMarketsFound: signals.length,
      edgeSignals: signals.filter(s => s.bestSide !== 'none').length,
      signals,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
