import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const BRAVE_KEY = process.env.BRAVE_API_KEY || ''
const GAMMA_API = 'https://gamma-api.polymarket.com'

// ── Helpers ───────────────────────────────────────────────────────────────────

function americanToProb(american: string): number {
  const n = parseFloat(american)
  if (isNaN(n)) return 0.5
  return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100)
}
function removeVig(p1: number, p2: number): [number, number] {
  const t = p1 + p2; return [p1 / t, p2 / t]
}

const ESPN_TO_POLY: Record<string, string[]> = {
  ATL:['hawks','atlanta'],BOS:['celtics','boston'],BKN:['nets','brooklyn'],
  CHA:['hornets','charlotte'],CHI:['bulls','chicago'],CLE:['cavaliers','cleveland'],
  DAL:['mavericks','dallas'],DEN:['nuggets','denver'],DET:['pistons','detroit'],
  GSW:['warriors','golden state'],GS:['warriors','golden state'],
  HOU:['rockets','houston'],IND:['pacers','indiana'],
  LAC:['clippers','clippers'],LAL:['lakers','los angeles lakers','lakers'],
  MEM:['grizzlies','memphis'],MIA:['heat','miami'],MIL:['bucks','milwaukee'],
  MIN:['timberwolves','minnesota'],NOP:['pelicans','new orleans'],NO:['pelicans','new orleans'],
  NYK:['knicks','new york'],NY:['knicks','new york'],OKC:['thunder','oklahoma city'],
  ORL:['magic','orlando'],PHI:['76ers','philadelphia'],PHX:['suns','phoenix'],
  POR:['trail blazers','portland'],SAC:['kings','sacramento'],
  SAS:['spurs','san antonio'],SA:['spurs','san antonio'],
  TOR:['raptors','toronto'],UTA:['jazz','utah'],UTAH:['jazz','utah'],
  WAS:['wizards','washington'],WSH:['wizards','washington'],
}
function getKw(abbr: string, name: string) {
  if (ESPN_TO_POLY[abbr]) return ESPN_TO_POLY[abbr]
  const skip = new Set(['state','university','college','the','of','at'])
  const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !skip.has(w))
  return words.length ? [words[0]] : [name.toLowerCase()]
}
function matchTitle(abbr: string, name: string, title: string) {
  return getKw(abbr, name).some(k => title.toLowerCase().includes(k))
}

async function braveSearch(query: string): Promise<string> {
  if (!BRAVE_KEY) return ''
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&freshness=pd`,
      { headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY }, signal: AbortSignal.timeout(7000) }
    )
    if (!res.ok) return ''
    const data = await res.json()
    return (data.web?.results || []).slice(0, 4).map((r: any) => `${r.title}: ${r.description}`).join('\n')
  } catch { return '' }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    // 1. ESPN games
    const espnRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`,
      { next: { revalidate: 120 } }
    )
    const espnData = await espnRes.json()
    const events: any[] = (espnData.events || []).filter(
      (e: any) => e.competitions?.[0]?.status?.type?.state === 'pre'
    )

    // 2. Polymarket events
    const polyRes = await fetch(
      `${GAMMA_API}/events?active=true&closed=false&tag_slug=nba&limit=200`,
      { next: { revalidate: 60 } }
    )
    const polyEvents: any[] = await polyRes.json()

    // 3. Build game context for each matchup
    const gameContexts: string[] = []

    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const competitors: any[] = comp.competitors || []
      const home = competitors.find((c: any) => c.homeAway === 'home')
      const away = competitors.find((c: any) => c.homeAway === 'away')
      if (!home || !away) continue

      const homeAbbr = home.team.abbreviation
      const awayAbbr = away.team.abbreviation
      const homeName = home.team.displayName
      const awayName = away.team.displayName
      const gameTime = new Date(comp.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })

      // DK moneyline
      const oddsArr: any[] = comp.odds || []
      const dk = oddsArr.find((o: any) => o.provider?.name?.toLowerCase().includes('draft')) || oddsArr[0]
      const dkHomeML: string = dk?.moneyline?.home?.close?.odds || ''
      const dkAwayML: string = dk?.moneyline?.away?.close?.odds || ''
      const dkSpread = dk?.spread ?? null
      const dkTotal = dk?.overUnder ?? null

      let dkHomeImplied = 0.5, dkAwayImplied = 0.5
      if (dkHomeML && dkAwayML) {
        const [h, a] = removeVig(americanToProb(dkHomeML), americanToProb(dkAwayML))
        dkHomeImplied = h; dkAwayImplied = a
      }

      // Polymarket match
      const polyEvent = polyEvents.find(e => {
        const t = (e.title || '').toLowerCase()
        return matchTitle(awayAbbr, awayName, t) && matchTitle(homeAbbr, homeName, t)
      })

      let polySection = 'No Polymarket market found.'
      let polyAwayPrice = 0, polyHomePrice = 0
      let awayEdge = 0, homeEdge = 0

      if (polyEvent) {
        const markets: any[] = polyEvent.markets || []
        const winnerMarket = markets
          .filter((m: any) => {
            const q = (m.question || '').toLowerCase()
            return !q.includes(':') && !q.includes('o/u') &&
                   matchTitle(awayAbbr, awayName, q) && matchTitle(homeAbbr, homeName, q)
          })
          .sort((a: any, b: any) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

        if (winnerMarket) {
          const outcomes: string[] = JSON.parse(winnerMarket.outcomes || '[]')
          const prices: string[] = JSON.parse(winnerMarket.outcomePrices || '[]')
          if (outcomes.length === 2 && prices.length === 2) {
            const homeKw = getKw(homeAbbr, homeName)
            const homeIdx = outcomes.findIndex((o: string) => homeKw.some(k => o.toLowerCase().includes(k)))
            const awayIdx = homeIdx === 0 ? 1 : 0
            polyHomePrice = parseFloat(prices[homeIdx]) || 0
            polyAwayPrice = parseFloat(prices[awayIdx]) || 0
            awayEdge = dkAwayImplied - polyAwayPrice
            homeEdge = dkHomeImplied - polyHomePrice
          }
          polySection = `Polymarket winner market: ${awayName} ${(polyAwayPrice*100).toFixed(1)}¢ | ${homeName} ${(polyHomePrice*100).toFixed(1)}¢`
        }
      }

      const edgeSection = dkHomeML
        ? `DK moneyline: ${awayName} ${dkAwayML} (${(dkAwayImplied*100).toFixed(1)}% implied) | ${homeName} ${dkHomeML} (${(dkHomeImplied*100).toFixed(1)}% implied)
Edge vs Poly: ${awayName} ${awayEdge >= 0 ? '+' : ''}${(awayEdge*100).toFixed(1)}¢ | ${homeName} ${homeEdge >= 0 ? '+' : ''}${(homeEdge*100).toFixed(1)}¢
${dkSpread != null ? `DK Spread: ${dkSpread > 0 ? '+' : ''}${dkSpread} | DK Total: ${dkTotal}` : ''}`
        : 'No DK odds available.'

      // News/narrative search
      const today2 = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const [injuryNews, gameNews] = await Promise.all([
        braveSearch(`${awayName} ${homeName} injury report ${today2}`),
        braveSearch(`${awayName} ${homeName} NBA preview ${today2}`),
      ])

      gameContexts.push(`
=== ${awayName.toUpperCase()} @ ${homeName.toUpperCase()} · ${gameTime} CT ===
${edgeSection}
${polySection}
INJURY/NEWS: ${injuryNews || 'None found'}
PREVIEW: ${gameNews || 'None found'}`)
    }

    if (gameContexts.length === 0) {
      return NextResponse.json({ report: 'No pre-game NBA games found today.' })
    }

    // 4. Sonnet synthesizes everything into actionable picks
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `You are an elite sharp sports bettor analyzing today's NBA slate on Polymarket. Your job is to give clear, actionable betting recommendations based on two signals:

1. **PRICE EDGE**: If Polymarket has a team priced cheaper than DraftKings implied probability, that's a buy signal. Edge = DK implied % minus Poly price. Positive = Poly is cheap = opportunity.

2. **NARRATIVE EDGE**: Injuries to key players, revenge games, motivation factors, back-to-backs, personal situations — anything that moves the needle that the market may not have priced in.

Today's games:
${gameContexts.join('\n')}

---

Analyze each game. Then output your recommendations clearly:

For each game, say:
- **STRONG BET / LEAN / PASS**
- Which side and why (price edge + narrative combined)
- Confidence 1-10
- One sentence on the key reason

End with a **TOP PICK** — your single best bet of the day with full reasoning.

Be direct. No hedging. Think like a sharp who is putting real money on this.`
      }]
    })

    const report = (message.content[0] as any).text || 'Analysis unavailable.'
    return NextResponse.json({ report, gamesAnalyzed: gameContexts.length, scannedAt: new Date().toISOString() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
