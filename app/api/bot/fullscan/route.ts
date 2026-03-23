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

async function braveSearch(query: string, freshness = 'pw'): Promise<string> {
  if (!BRAVE_KEY) return ''
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&freshness=${freshness}`,
      { headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY }, signal: AbortSignal.timeout(7000) }
    )
    if (!res.ok) return ''
    const data = await res.json()
    return (data.web?.results || []).slice(0, 4).map((r: any) => `${r.title}: ${r.description}`).join('\n')
  } catch { return '' }
}

// ── Get star players from ESPN roster ────────────────────────────────────────
async function getStarPlayers(teamId: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const athletes: any[] = data.athletes?.flatMap((g: any) => g.items || []) || []
    // Sort by jersey number as a rough proxy, but prefer known stars
    // Take first 5 (usually sorted by importance in ESPN)
    return athletes.slice(0, 5).map((a: any) => a.displayName || a.fullName || '').filter(Boolean)
  } catch { return [] }
}

// ── Deep player intel search ──────────────────────────────────────────────────
async function getPlayerIntel(playerName: string): Promise<string> {
  // Search for personal life news — the stuff that moves markets but books miss
  const queries = [
    `"${playerName}" 2026 personal life news`,
    `"${playerName}" divorce OR arrest OR suspended OR family OR death OR drama OR beef OR controversy`,
  ]
  const results = await Promise.all(queries.map(q => braveSearch(q, 'pm')))
  const combined = results.filter(Boolean).join('\n')
  return combined ? `${playerName}:\n${combined}` : ''
}

// ── Team culture / locker room search ────────────────────────────────────────
async function getTeamIntel(teamName: string): Promise<string> {
  const result = await braveSearch(
    `${teamName} NBA locker room drama trade rumors controversy 2026`, 'pm'
  )
  return result ? `${teamName} team intel:\n${result}` : ''
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const bankroll = parseFloat(searchParams.get('bankroll') || '200')
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

      // Star players + news/narrative — all in parallel
      const today2 = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const homeId = home.team.id
      const awayId = away.team.id

      const [injuryNews, gameNews, homeStars, awayStars, homeTeamIntel, awayTeamIntel] = await Promise.all([
        braveSearch(`${awayName} ${homeName} injury report ${today2}`, 'pd'),
        braveSearch(`${awayName} ${homeName} NBA preview ${today2}`, 'pd'),
        getStarPlayers(homeId),
        getStarPlayers(awayId),
        getTeamIntel(homeName),
        getTeamIntel(awayName),
      ])

      // Per-player intel for top 3 stars each team
      const allStars = Array.from(new Set([...awayStars.slice(0,3), ...homeStars.slice(0,3)]))
      const playerIntelResults = await Promise.all(allStars.map(p => getPlayerIntel(p)))
      const playerIntel = playerIntelResults.filter(Boolean).join('\n\n')

      gameContexts.push(`
=== ${awayName.toUpperCase()} @ ${homeName.toUpperCase()} · ${gameTime} CT ===
${edgeSection}
${polySection}

INJURY REPORT: ${injuryNews || 'None found'}
GAME PREVIEW: ${gameNews || 'None found'}

KEY PLAYERS — ${awayName}: ${awayStars.join(', ') || 'Unknown'} | ${homeName}: ${homeStars.join(', ') || 'Unknown'}

PLAYER INTEL (personal life, off-court, social):
${playerIntel || 'Nothing significant found'}

TEAM/LOCKER ROOM INTEL:
${[homeTeamIntel, awayTeamIntel].filter(Boolean).join('\n') || 'Nothing significant found'}`)
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
        content: `You are an elite sharp sports bettor advising a friend on how to trade NBA games on Polymarket today. Your bankroll to work with is $${bankroll} USDC.

**How Polymarket works (use this for your math):**
- You buy YES shares for a team at their current price (e.g. 45¢ per share)
- Each share pays out $1.00 if that team wins, $0 if they lose
- So if you buy $45 worth of shares at 45¢, you get 100 shares
- If they win: 100 shares × $1.00 = $100 back → $55 profit
- If they lose: $0 back → $45 loss
- Formula: shares = dollars_spent / price_per_share. Payout if win = shares × $1.00. Profit = payout - cost.

**Three signals to analyze:**
1. **PRICE EDGE**: Polymarket price vs DraftKings implied probability. If DK implies 60% but Poly has them at 52¢, that's an 8¢ edge — Poly is underpricing them. Buy cheap, profit when market corrects OR hold to resolution.

2. **INJURY/FATIGUE EDGE**: Key player out or questionable, back-to-back games, travel fatigue, load management. A star sitting out can flip a line by 10+ points.

3. **LIFE/NARRATIVE EDGE — this is the most important and most overlooked signal:**
   - Star player going through a divorce or breakup → distraction, emotional drain, affects focus
   - Death in family → could make them play harder (tribute game) OR devastate them
   - Arrest, legal trouble, public scandal → distraction and possible suspension
   - Locker room beef, trade demands, unhappy player → affects team chemistry
   - Revenge game (traded away, released, booed by fans) → massive motivation
   - Contract year → extra motivation
   - A player just won a personal award or got engaged → elevated mood/confidence
   Books price injuries fast. They NEVER price personal life situations — that's where the edge lives.

Today's games (total bankroll: $${bankroll}):
${gameContexts.join('\n')}

---

For each game give:
**[TEAM A] @ [TEAM B]**
- Verdict: STRONG BET / LEAN / PASS
- The trade: "Buy [Team X] YES at [price]¢ — put $[amount] on it. You'd get [shares] shares. If they win: $[return] back, $[profit] profit. If they lose: -$[amount]."
- Why: 1-2 sentences combining price edge + any narrative signals
- Confidence: X/10

Size bets based on edge strength and confidence. Strong edges get 15-25% of bankroll. Leans get 5-10%. Passes get $0. Total allocation should not exceed the bankroll.

End with:
**⚡ TOP PICK OF THE DAY**
Full breakdown of your single best bet — the trade, the edge, the reasoning, and exactly what to do on Polymarket.

Be conversational and direct, like you're texting a friend real money advice.`
      }]
    })

    const report = (message.content[0] as any).text || 'Analysis unavailable.'
    return NextResponse.json({ report, gamesAnalyzed: gameContexts.length, scannedAt: new Date().toISOString() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
