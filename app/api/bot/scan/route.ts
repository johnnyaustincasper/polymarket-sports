import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
  LAC: ['clippers', 'chargers', 'los angeles chargers'], LAL: ['lakers', 'los angeles lakers', 'lakers'],
  MEM: ['grizzlies', 'memphis'], MIA: ['heat', 'miami'], MIL: ['bucks', 'milwaukee'],
  MIN: ['timberwolves', 'minnesota'], NOP: ['pelicans', 'new orleans'], NO: ['pelicans', 'new orleans'],
  NYK: ['knicks', 'new york'], NY: ['knicks', 'new york'], OKC: ['thunder', 'oklahoma city'],
  ORL: ['magic', 'orlando'], PHI: ['76ers', 'philadelphia'],
  PHX: ['suns', 'phoenix'], POR: ['trail blazers', 'portland'],
  SAC: ['kings', 'sacramento'], SAS: ['spurs', 'san antonio'], SA: ['spurs', 'san antonio'],
  TOR: ['raptors', 'toronto'], UTA: ['jazz', 'utah'], UTAH: ['jazz', 'utah'],
  WAS: ['wizards', 'washington', 'commanders'], WSH: ['wizards', 'washington', 'commanders'],
  ARI: ['cardinals', 'arizona'], BAL: ['ravens', 'baltimore'], BUF: ['bills', 'buffalo'], CAR: ['panthers', 'carolina'],
  CIN: ['bengals', 'cincinnati'], GB: ['packers', 'green bay'], JAX: ['jaguars', 'jacksonville'], KC: ['chiefs', 'kansas city'],
  LAR: ['rams', 'los angeles rams'], LV: ['raiders', 'las vegas'], NE: ['patriots', 'new england'],
  NYG: ['giants', 'new york giants'], NYJ: ['jets', 'new york jets'], PIT: ['steelers', 'pittsburgh'], SEA: ['seahawks', 'seattle'],
  SF: ['49ers', 'niners', 'san francisco'], TB: ['buccaneers', 'bucs', 'tampa bay'], TEN: ['titans', 'tennessee'],
}


function normalize(s: string) {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}

function getKeywords(abbr: string, name: string): string[] {
  const direct = ESPN_TO_POLY[abbr] || []
  const normalizedName = normalize(name)
  const skip = new Set(['state', 'university', 'college', 'the', 'of', 'at', 'and', 'fc'])
  const words = normalizedName.split(/\s+/).filter(w => w.length > 2 && !skip.has(w))
  const fallback = words.length ? [words[0], words.at(-1)!, normalizedName] : [normalizedName]
  return Array.from(new Set([...direct, ...fallback].map(normalize).filter(Boolean)))
}

function keywordScore(abbr: string, name: string, title: string): number {
  const t = normalize(title)
  let best = 0
  for (const k of getKeywords(abbr, name)) {
    if (t === k) best = Math.max(best, 4)
    else if (t.includes(k)) best = Math.max(best, k.length >= 6 ? 3 : 2)
  }
  return best
}

function teamMatchesTitle(abbr: string, name: string, title: string): boolean {
  return keywordScore(abbr, name, title) >= 2
}

function findDistinctTeamOutcomeIndexes(
  outcomes: string[],
  homeAbbr: string,
  homeName: string,
  awayAbbr: string,
  awayName: string,
): { homeIdx: number; awayIdx: number } | null {
  const scores = outcomes.map(o => ({
    home: keywordScore(homeAbbr, homeName, o),
    away: keywordScore(awayAbbr, awayName, o),
  }))
  const homeCandidates = scores
    .map((score, idx) => ({ ...score, idx }))
    .filter(score => score.home >= 2 && score.home > score.away)
  const awayCandidates = scores
    .map((score, idx) => ({ ...score, idx }))
    .filter(score => score.away >= 2 && score.away > score.home)

  if (homeCandidates.length !== 1 || awayCandidates.length !== 1) return null
  const homeIdx = homeCandidates[0].idx
  const awayIdx = awayCandidates[0].idx
  if (homeIdx === awayIdx) return null
  return { homeIdx, awayIdx }
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

function validProbability(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null
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

async function getBestAsk(tokenId: string): Promise<number | null> {
  if (!tokenId) return null
  try {
    const res = await fetch(`${CLOB_API}/book?token_id=${encodeURIComponent(tokenId)}`, { next: { revalidate: 15 } })
    if (!res.ok) return null
    const data = await res.json()
    const asks: any[] = Array.isArray(data.asks) ? data.asks : []
    const prices = asks.map(a => validProbability(a.price)).filter((p): p is number => p !== null)
    return prices.length ? Math.min(...prices) : null
  } catch { return null }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const sportParam = (searchParams.get('sport') || 'nba').toLowerCase()
    const sport = sportParam === 'nfl' ? 'nfl' : 'nba'
    const leaguePath = sport === 'nfl' ? 'football/nfl' : 'basketball/nba'
    const polyTag = sport === 'nfl' ? 'nfl' : 'nba'
    const label = sport.toUpperCase()
    const cst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
    const dateStr = searchParams.get('date') || `${cst.getFullYear()}${String(cst.getMonth()+1).padStart(2,'0')}${String(cst.getDate()).padStart(2,'0')}`
    const espnRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/scoreboard?dates=${dateStr}`,
      { cache: 'no-store' }
    )
    if (!espnRes.ok) return NextResponse.json({ error: 'ESPN fetch failed' }, { status: 500 })
    const espnData = await espnRes.json()
    const events: any[] = espnData.events || []

    // 2. Fetch active Polymarket events
    const polyRes = await fetch(
      `${GAMMA_API}/events?active=true&closed=false&tag_slug=${polyTag}&limit=200`,
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
      const outcomes = safeJson<string[]>(winnerMarket.outcomes, [])
      const prices = safeJson<string[]>(winnerMarket.outcomePrices, [])
      const tokens = safeJson<string[]>(winnerMarket.clobTokenIds, [])
      if (outcomes.length !== 2 || prices.length !== 2) continue

      const outcomeIndexes = findDistinctTeamOutcomeIndexes(outcomes, homeAbbr, homeName, awayAbbr, awayName)
      if (!outcomeIndexes) continue
      const { homeIdx, awayIdx } = outcomeIndexes

      const polyHomePrice = validProbability(prices[homeIdx])
      const polyAwayPrice = validProbability(prices[awayIdx])
      if (polyHomePrice === null || polyAwayPrice === null) continue

      // 7. Prefer live CLOB best asks when token IDs are available; Gamma is fallback.
      const conditionId = winnerMarket.conditionId || ''
      const homeTokenId = tokens[homeIdx] || ''
      const awayTokenId = tokens[awayIdx] || ''
      const [clobHomeAsk, clobAwayAsk] = await Promise.all([getBestAsk(homeTokenId), getBestAsk(awayTokenId)])
      const liveHomePrice = clobHomeAsk ?? polyHomePrice
      const liveAwayPrice = clobAwayAsk ?? polyAwayPrice

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
        sport: label,
      })
    }

    // Sort: best edge first
    signals.sort((a, b) => b.bestEdge - a.bestEdge)

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      gamesScanned: events.filter(e => ['pre', 'in'].includes(e.competitions?.[0]?.status?.type?.state)).length,
      polyMarketsFound: signals.length,
      edgeSignals: signals.filter(s => s.bestSide !== 'none').length,
      signals,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
