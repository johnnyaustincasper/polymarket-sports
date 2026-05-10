import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const GAMMA_API = 'https://gamma-api.polymarket.com'

// NBA team keyword map (same as markets route)
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

function normalize(s: string) {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}

function getKeywords(abbr: string, teamName: string): string[] {
  const direct = ESPN_TO_POLY[abbr] || []
  const normalizedName = normalize(teamName)
  const skip = new Set(['state', 'university', 'college', 'the', 'of', 'at', 'and', 'fc'])
  const words = normalizedName.split(/\s+/).filter(w => w.length > 2 && !skip.has(w))
  const fallback = words.length ? [words[0], words.at(-1)!, normalizedName] : [normalizedName]
  return Array.from(new Set([...direct, ...fallback].map(normalize).filter(Boolean)))
}

function keywordScore(abbr: string, teamName: string, title: string): number {
  const t = normalize(title)
  let best = 0
  for (const k of getKeywords(abbr, teamName)) {
    if (t === k) best = Math.max(best, 4)
    else if (t.includes(k)) best = Math.max(best, k.length >= 6 ? 3 : 2)
  }
  return best
}

function teamMatch(abbr: string, teamName: string, title: string): boolean {
  return keywordScore(abbr, teamName, title) >= 2
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

function parseRecord(rec: string): number {
  const parts = rec.split('-').map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0.5
  const tot = parts[0] + parts[1]
  return tot === 0 ? 0.5 : parts[0] / tot
}

function computeModelEdge(
  homeRecPct: number,
  awayRecPct: number,
  homeMarketOdds: number,
): { homeEdge: number; awayEdge: number } {
  let homeEdge = (homeRecPct + (1 - awayRecPct)) / 2
  homeEdge = homeEdge * 0.4 + homeMarketOdds * 0.6
  homeEdge += 0.03 // home court adjustment
  homeEdge = Math.min(0.88, Math.max(0.12, homeEdge))
  return { homeEdge, awayEdge: 1 - homeEdge }
}

export interface EdgeMarket {
  matchup: string           // "BOS @ MIA"
  marketTitle: string       // Polymarket market title/question
  marketType: 'winner' | 'spread' | 'total'
  side: string              // "BOS" or "Over" etc
  tokenId: string           // CLOB token ID for CLI
  currentPrice: number      // 0–1
  impliedProbability: number // same as price, explicit
  modelEdge: number         // 0–1
  divergence: number        // modelEdge - impliedProbability (positive = underpriced)
  suggestedAction: 'buy' | 'sell'
  polyUrl: string | null
  eventSlug: string | null
}

export async function GET() {
  try {
    // 1. Fetch today's NBA games from ESPN
    const toCST = (d: Date) => {
      const cst = new Date(d.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
      return cst.toISOString().slice(0, 10).replace(/-/g, '')
    }
    const dateParam = toCST(new Date())
    const espnRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateParam}`,
      { cache: 'no-store' }
    )
    const espnData = await espnRes.json()
    const espnEvents: any[] = espnData?.events || []

    // 2. Fetch active NBA markets from Polymarket Gamma API
    const polyRes = await fetch(
      `${GAMMA_API}/events?active=true&closed=false&tag_slug=nba&limit=200`,
      { next: { revalidate: 60 } }
    )
    if (!polyRes.ok) return NextResponse.json([])
    const polyEvents: any[] = await polyRes.json()
    if (!polyEvents.length) return NextResponse.json([])

    const edgeMarkets: EdgeMarket[] = []

    for (const espnEvent of espnEvents) {
      const comp = espnEvent.competitions?.[0]
      const homeComp = comp?.competitors?.find((c: any) => c.homeAway === 'home')
      const awayComp = comp?.competitors?.find((c: any) => c.homeAway === 'away')
      if (!homeComp || !awayComp) continue

      const homeName = homeComp.team?.displayName || ''
      const homeAbbr = homeComp.team?.abbreviation || ''
      const awayName = awayComp.team?.displayName || ''
      const awayAbbr = awayComp.team?.abbreviation || ''
      const homeRecord = homeComp.records?.[0]?.summary || ''
      const awayRecord = awayComp.records?.[0]?.summary || ''

      const homeRecPct = parseRecord(homeRecord)
      const awayRecPct = parseRecord(awayRecord)

      // Find matching Polymarket event
      const polyEvent = polyEvents.find(e => {
        const title = (e.title || '').toLowerCase()
        return teamMatch(homeAbbr, homeName, title) && teamMatch(awayAbbr, awayName, title)
      })
      if (!polyEvent) continue

      const markets: any[] = polyEvent.markets || []
      const matchup = `${awayAbbr} @ ${homeAbbr}`
      const eventSlug = polyEvent.slug || null
      const polyUrl = eventSlug ? `https://polymarket.com/event/${eventSlug}` : null

      // ─── Winner market ──────────────────────────────────────────────
      const winnerMarket = markets
        .filter(m => {
          const q = (m.question || '').toLowerCase()
          return !q.includes(':') && !q.includes('o/u') &&
            teamMatch(homeAbbr, homeName, q) && teamMatch(awayAbbr, awayName, q)
        })
        .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

      if (winnerMarket) {
        const outcomes = safeJson<string[]>(winnerMarket.outcomes, [])
        const prices = safeJson<string[]>(winnerMarket.outcomePrices, [])
        const tokenIds = safeJson<string[]>(winnerMarket.clobTokenIds, [])

        if (outcomes.length === 2 && prices.length === 2) {
          const outcomeIndexes = findDistinctTeamOutcomeIndexes(outcomes, homeAbbr, homeName, awayAbbr, awayName)
          if (!outcomeIndexes) continue
          const { homeIdx, awayIdx } = outcomeIndexes

          const homeMarketOdds = validProbability(prices[homeIdx])
          const awayMarketOdds = validProbability(prices[awayIdx])
          if (homeMarketOdds === null || awayMarketOdds === null) continue

          const { homeEdge, awayEdge } = computeModelEdge(homeRecPct, awayRecPct, homeMarketOdds)

          const homeDivergence = homeEdge - homeMarketOdds
          const awayDivergence = awayEdge - awayMarketOdds

          // Flag if divergence > 5%
          if (Math.abs(homeDivergence) > 0.05) {
            const homeTokenId = tokenIds[homeIdx] || ''
            edgeMarkets.push({
              matchup,
              marketTitle: winnerMarket.question || `${awayName} vs ${homeName}`,
              marketType: 'winner',
              side: homeAbbr,
              tokenId: homeTokenId,
              currentPrice: homeMarketOdds,
              impliedProbability: homeMarketOdds,
              modelEdge: homeEdge,
              divergence: homeDivergence,
              suggestedAction: homeDivergence > 0 ? 'buy' : 'sell',
              polyUrl,
              eventSlug,
            })
          }
          if (Math.abs(awayDivergence) > 0.05) {
            const awayTokenId = tokenIds[awayIdx] || ''
            edgeMarkets.push({
              matchup,
              marketTitle: winnerMarket.question || `${awayName} vs ${homeName}`,
              marketType: 'winner',
              side: awayAbbr,
              tokenId: awayTokenId,
              currentPrice: awayMarketOdds,
              impliedProbability: awayMarketOdds,
              modelEdge: awayEdge,
              divergence: awayDivergence,
              suggestedAction: awayDivergence > 0 ? 'buy' : 'sell',
              polyUrl,
              eventSlug,
            })
          }
        }
      }

      // ─── Spread market ──────────────────────────────────────────────
      const spreadMarket = markets
        .filter(m => (m.question || '').toLowerCase().startsWith('spread:'))
        .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

      if (spreadMarket) {
        const outcomes = safeJson<string[]>(spreadMarket.outcomes, [])
        const prices = safeJson<string[]>(spreadMarket.outcomePrices, [])
        const tokenIds = safeJson<string[]>(spreadMarket.clobTokenIds, [])

        if (outcomes.length === 2 && prices.length === 2) {
          for (let i = 0; i < 2; i++) {
            const price = validProbability(prices[i]) ?? 0.5
            // Spread markets should be near 50/50 — flag if market diverges from 50% by more than 10% (i.e. strong lean)
            // vs our model read (which we approximate from the winner edge)
            const divergence = price - 0.5
            if (Math.abs(divergence) > 0.08) {
              const tokenId = tokenIds[i] || ''
              const sideName = outcomes[i] || `Side ${i + 1}`
              edgeMarkets.push({
                matchup,
                marketTitle: spreadMarket.question || 'Spread',
                marketType: 'spread',
                side: sideName,
                tokenId,
                currentPrice: price,
                impliedProbability: price,
                modelEdge: 0.5,
                divergence: 0.5 - price,
                suggestedAction: price < 0.5 ? 'buy' : 'sell',
                polyUrl,
                eventSlug,
              })
            }
          }
        }
      }
    }

    // Sort by absolute divergence descending
    edgeMarkets.sort((a, b) => Math.abs(b.divergence) - Math.abs(a.divergence))

    return NextResponse.json(edgeMarkets)
  } catch (err) {
    console.error('[polymarket-edge]', err)
    return NextResponse.json([], { status: 500 })
  }
}
