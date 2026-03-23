import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const BRAVE_KEY = process.env.BRAVE_API_KEY || ''
const GAMMA_API = 'https://gamma-api.polymarket.com'

// ── Odds helpers ──────────────────────────────────────────────────────────────
function americanToProb(ml: string): number {
  const n = parseFloat(ml)
  if (isNaN(n)) return 0.5
  return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100)
}
function removeVig(p1: number, p2: number): [number, number] {
  const t = p1 + p2; return [p1 / t, p2 / t]
}

// ── Polymarket team matching ──────────────────────────────────────────────────
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

// ── Brave web search ──────────────────────────────────────────────────────────
async function braveSearch(query: string, freshness = 'pw'): Promise<{ title: string; url: string; snippet: string }[]> {
  if (!BRAVE_KEY) return []
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&freshness=${freshness}`,
      { headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY }, signal: AbortSignal.timeout(7000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.web?.results || []).slice(0, 5).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || '',
    }))
  } catch { return [] }
}

// ── Scrape full article text ──────────────────────────────────────────────────
async function fetchArticleText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NBAEdgeBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim()
    // Return the most relevant 3000 chars
    return text.slice(0, 3000)
  } catch { return '' }
}

// ── ESPN authoritative player/team status ─────────────────────────────────────
async function getLeagueStatus(): Promise<string> {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=50', { next: { revalidate: 300 } })
    if (!res.ok) return ''
    const data = await res.json()
    const keywords = ['suspend','out for','ruled out','injur','questionable','doubtful','will not play','inactive','scratched','banned','fined','waived','traded','arrested','altercation','technic']
    const relevant = (data.articles || [])
      .map((a: any) => a.headline || '')
      .filter((h: string) => keywords.some(k => h.toLowerCase().includes(k)))
    return relevant.join('\n')
  } catch { return '' }
}

async function getTeamNews(teamId: string): Promise<string> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/news?limit=10`, { next: { revalidate: 300 } })
    if (!res.ok) return ''
    const data = await res.json()
    return (data.articles || []).map((a: any) => a.headline || '').filter(Boolean).join('\n')
  } catch { return '' }
}

// ── ESPN team stats ───────────────────────────────────────────────────────────
interface TeamStats {
  avgPoints: number; avgPointsAllowed: number
  avgAssists: number; avgTurnovers: number; avgRebounds: number
  fieldGoalPct: number; threePointPct: number; freeThrowPct: number
  record: string; homeRecord: string; awayRecord: string
  lastTenGames: string; restDays: number; streak: string
}

async function getTeamStats(teamId: string): Promise<TeamStats | null> {
  try {
    const [statsRes, schedRes] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics`, { next: { revalidate: 3600 } }),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule`, { next: { revalidate: 3600 } }),
    ])

    const statsData = statsRes.ok ? await statsRes.json() : null
    const schedData = schedRes.ok ? await schedRes.json() : null

    // Parse stats
    let avgPoints = 0, avgRebounds = 0, avgAssists = 0, avgTurnovers = 0
    let fieldGoalPct = 0, threePointPct = 0, freeThrowPct = 0, avgPointsAllowed = 0

    if (statsData) {
      const cats = statsData.results?.stats?.categories || []
      for (const cat of cats) {
        for (const s of cat.stats || []) {
          const val = parseFloat(s.value) || 0
          switch (s.name) {
            case 'avgPoints': avgPoints = val; break
            case 'avgRebounds': avgRebounds = val; break
            case 'avgAssists': avgAssists = val; break
            case 'avgTurnovers': avgTurnovers = val; break
            case 'fieldGoalPct': fieldGoalPct = val; break
            case 'threePointPct': threePointPct = val; break
            case 'freeThrowPct': freeThrowPct = val; break
            case 'avgPointsAllowed': avgPointsAllowed = val; break
          }
        }
      }
    }

    // Parse schedule for rest days, last 10 games, streak
    let restDays = 0, lastTenGames = '', streak = '', record = '', homeRecord = '', awayRecord = ''
    if (schedData) {
      const events = schedData.events || []
      const completed = events.filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
      
      if (completed.length > 0) {
        const lastGame = completed[completed.length - 1]
        const lastDate = new Date(lastGame.date)
        restDays = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))

        // Last 10
        const last10 = completed.slice(-10)
        const wins = last10.filter((e: any) => {
          const comp = e.competitions[0]
          const team = comp.competitors.find((c: any) => c.id === teamId)
          return team?.winner
        }).length
        lastTenGames = `${wins}-${10 - wins} last 10`

        // Current streak
        let streakCount = 0
        let streakType = ''
        for (let i = completed.length - 1; i >= 0; i--) {
          const comp = completed[i].competitions[0]
          const team = comp.competitors.find((c: any) => c.id === teamId)
          const won = team?.winner
          if (i === completed.length - 1) { streakType = won ? 'W' : 'L'; streakCount = 1 }
          else if ((won && streakType === 'W') || (!won && streakType === 'L')) streakCount++
          else break
        }
        streak = streakCount > 0 ? `${streakType}${streakCount}` : ''
      }

      // Record from team info
      const teamRecord = schedData.team?.record?.items || []
      for (const r of teamRecord) {
        if (r.type === 'total') record = r.summary || ''
        if (r.type === 'home') homeRecord = r.summary || ''
        if (r.type === 'road') awayRecord = r.summary || ''
      }
    }

    return { avgPoints, avgPointsAllowed, avgAssists, avgTurnovers, avgRebounds, fieldGoalPct, threePointPct, freeThrowPct, record, homeRecord, awayRecord, lastTenGames, restDays, streak }
  } catch { return null }
}

// ── Star players from ESPN roster ─────────────────────────────────────────────
async function getStarPlayers(teamId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    const athletes: any[] = data.athletes?.flatMap((g: any) => g.items || []) || []
    return athletes.slice(0, 5).map((a: any) => a.displayName || a.fullName || '').filter(Boolean)
  } catch { return [] }
}

// ── Deep player intel (personal life, off-court signals) ──────────────────────
async function getPlayerIntel(playerName: string): Promise<string> {
  const results = await braveSearch(
    `"${playerName}" divorce OR arrest OR suspended OR "family tragedy" OR death OR drama OR controversy OR beef OR altercation 2026`,
    'pm'
  )
  if (!results.length) return ''
  // Fetch the most relevant article
  const topResult = results.find(r => !r.url.includes('youtube') && !r.url.includes('twitter'))
  const fullText = topResult ? await fetchArticleText(topResult.url) : ''
  const snippets = results.map(r => `${r.title}: ${r.snippet}`).join('\n')
  return fullText
    ? `${playerName}: ${snippets}\n[Article excerpt]: ${fullText.slice(0, 800)}`
    : `${playerName}: ${snippets}`
}

// ── H2H history ───────────────────────────────────────────────────────────────
async function getH2H(awayAbbr: string, homeName: string): Promise<string> {
  const results = await braveSearch(`${awayAbbr} ${homeName} NBA head to head last 5 games history 2025 2026`, 'py')
  return results.map(r => r.title + ': ' + r.snippet).join('\n')
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const bankroll = parseFloat(searchParams.get('bankroll') || '200')

  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    // ESPN games + Polymarket + league status — all in parallel
    const [espnRes, polyRes, leagueStatus] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`, { next: { revalidate: 120 } }),
      fetch(`${GAMMA_API}/events?active=true&closed=false&tag_slug=nba&limit=200`, { next: { revalidate: 60 } }),
      getLeagueStatus(),
    ])

    const espnData = await espnRes.json()
    const polyEvents: any[] = await polyRes.json()
    const events: any[] = (espnData.events || []).filter(
      (e: any) => e.competitions?.[0]?.status?.type?.state === 'pre'
    )

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
      const homeId = home.team.id
      const awayId = away.team.id
      const gameTime = new Date(comp.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
      const today2 = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

      // DK moneyline + spread
      const oddsArr: any[] = comp.odds || []
      const dk = oddsArr.find((o: any) => o.provider?.name?.toLowerCase().includes('draft')) || oddsArr[0]
      const dkHomeML = dk?.moneyline?.home?.close?.odds || ''
      const dkAwayML = dk?.moneyline?.away?.close?.odds || ''
      const dkSpread = dk?.spread ?? null
      const dkTotal = dk?.overUnder ?? null

      let dkHomeImplied = 0.5, dkAwayImplied = 0.5
      if (dkHomeML && dkAwayML) {
        const [h, a] = removeVig(americanToProb(dkHomeML), americanToProb(dkAwayML))
        dkHomeImplied = h; dkAwayImplied = a
      }

      // Polymarket
      const polyEvent = polyEvents.find(e => {
        const t = (e.title || '').toLowerCase()
        return matchTitle(awayAbbr, awayName, t) && matchTitle(homeAbbr, homeName, t)
      })
      let polyLine = 'No Polymarket market found.'
      let awayEdge = 0, homeEdge = 0, polyAwayPrice = 0, polyHomePrice = 0

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
            // EV and Kelly pre-calculated so Claude doesn't have to
            // EV per $1 risked = (trueProb * (1/polyPrice - 1)) - (1 - trueProb)
            // Kelly fraction = (trueProb - polyPrice) / (1 - polyPrice)
            polyLine = `${awayName}: ${(polyAwayPrice*100).toFixed(1)}¢ | ${homeName}: ${(polyHomePrice*100).toFixed(1)}¢ | Volume: $${((winnerMarket.volumeNum||0)/1000).toFixed(0)}k`
          }
        }
      }

      // All data fetches in parallel
      const [homeStats, awayStats, homeStars, awayStars, homeTeamNews, awayTeamNews, previewResults, h2h] = await Promise.all([
        getTeamStats(homeId),
        getTeamStats(awayId),
        getStarPlayers(homeId),
        getStarPlayers(awayId),
        getTeamNews(homeId),
        getTeamNews(awayId),
        braveSearch(`${awayName} vs ${homeName} NBA preview prediction ${today2}`, 'pd'),
        getH2H(awayAbbr, homeName),
      ])

      // Fetch full text of best preview article
      const bestPreviewUrl = previewResults.find(r =>
        !r.url.includes('youtube') && (r.url.includes('espn') || r.url.includes('cbs') || r.url.includes('bleacher') || r.url.includes('athletic'))
      )?.url || previewResults[0]?.url || ''
      const previewFullText = bestPreviewUrl ? await fetchArticleText(bestPreviewUrl) : ''

      // Per-player intel — top 3 per team
      const allStars = Array.from(new Set([...awayStars.slice(0,3), ...homeStars.slice(0,3)]))
      const playerIntelRaw = await Promise.all(allStars.map(p => getPlayerIntel(p)))
      const playerIntel = playerIntelRaw.filter(Boolean).join('\n\n')

      // Format stats
      const fmtStats = (stats: TeamStats | null, name: string, isHome: boolean): string => {
        if (!stats) return `${name}: Stats unavailable`
        const side = isHome ? `Home: ${stats.homeRecord}` : `Away: ${stats.awayRecord}`
        return [
          `${name} (${stats.record}, ${side}):`,
          `  Streak: ${stats.streak} | Last 10: ${stats.lastTenGames} | Rest: ${stats.restDays} day(s) since last game`,
          `  Offense: ${stats.avgPoints.toFixed(1)} PPG | ${stats.fieldGoalPct.toFixed(1)}% FG | ${stats.threePointPct.toFixed(1)}% 3P | ${stats.avgAssists.toFixed(1)} APG`,
          `  Defense: ${stats.avgPointsAllowed > 0 ? stats.avgPointsAllowed.toFixed(1) + ' allowed/g' : 'N/A'} | ${stats.avgTurnovers.toFixed(1)} TOV/g`,
        ].join('\n')
      }

      // Pre-calculate EV and Kelly for each side
      const calcEdgeStats = (trueProb: number, polyPrice: number, bankrollAmt: number) => {
        if (polyPrice <= 0 || polyPrice >= 1) return null
        const edge = trueProb - polyPrice                          // cents of edge
        const evPer1 = trueProb * (1 / polyPrice - 1) - (1 - trueProb)  // EV per $1 risked
        const kelly = Math.max(0, edge / (1 - polyPrice))         // Kelly fraction
        const halfKelly = kelly / 2                                // Half-Kelly (safer)
        const betSize = Math.round(halfKelly * bankrollAmt * 100) / 100
        const shares = betSize > 0 ? Math.round(betSize / polyPrice) : 0
        const profit = shares > 0 ? Math.round((shares * (1 - polyPrice)) * 100) / 100 : 0
        return { edge, evPer1, kelly, halfKelly, betSize, shares, profit }
      }

      const awayEV = polyAwayPrice > 0 ? calcEdgeStats(dkAwayImplied, polyAwayPrice, bankroll) : null
      const homeEV = polyHomePrice > 0 ? calcEdgeStats(dkHomeImplied, polyHomePrice, bankroll) : null

      const fmtEV = (ev: ReturnType<typeof calcEdgeStats>, teamName: string, polyPrice: number) => {
        if (!ev || ev.edge <= 0) return `${teamName}: NO EDGE (Poly price ≥ DK implied — market already pricing them correctly or overpricing)`
        return [
          `${teamName}: EDGE +${(ev.edge*100).toFixed(1)}¢`,
          `  DK sharp implied: ${(dkAwayImplied === (polyPrice === polyAwayPrice ? dkAwayImplied : dkHomeImplied) ? (dkAwayImplied*100).toFixed(1) : (dkHomeImplied*100).toFixed(1))}% | Poly price: ${(polyPrice*100).toFixed(1)}¢ | Poly underpricing by ${(ev.edge*100).toFixed(1)}%`,
          `  EV per $1 risked: ${ev.evPer1 >= 0 ? '+' : ''}${(ev.evPer1*100).toFixed(1)}¢ (${ev.evPer1 > 0 ? 'POSITIVE EV ✓' : 'NEGATIVE EV ✗'})`,
          `  Half-Kelly bet: $${ev.betSize.toFixed(0)} → ${ev.shares} shares → profit $${ev.profit} if win, lose $${ev.betSize.toFixed(0)} if loss`,
          `  Break-even: ${(polyPrice*100).toFixed(1)}% — you believe true prob is ${(dkAwayImplied === (polyPrice === polyAwayPrice ? dkAwayImplied : dkHomeImplied) ? (dkAwayImplied*100).toFixed(1) : (dkHomeImplied*100).toFixed(1))}%`,
        ].join('\n')
      }

      const awayEVStr = awayEV ? fmtEV(awayEV, awayName, polyAwayPrice) : `${awayName}: No Polymarket price`
      const homeEVStr = homeEV ? fmtEV(homeEV, homeName, polyHomePrice) : `${homeName}: No Polymarket price`

      gameContexts.push(`
════════════════════════════════════════
${awayName.toUpperCase()} @ ${homeName.toUpperCase()} — ${gameTime} CT
════════════════════════════════════════

💰 MARKET ANALYSIS (is Polymarket wrong, and by how much?):
DK Moneyline: ${awayName} ${dkAwayML} | ${homeName} ${dkHomeML}
DK Spread: ${dkSpread !== null ? `${awayAbbr} ${dkSpread > 0 ? '+' : ''}${-dkSpread}` : 'N/A'} | Total O/U: ${dkTotal ?? 'N/A'}
Polymarket: ${polyLine}

AWAY — ${awayEVStr}

HOME — ${homeEVStr}

RULE: Only bet when EV is positive AND edge ≥ 5¢. Otherwise it's just agreeing with the market.

📊 TEAM STATS & FORM:
${fmtStats(awayStats, awayName, false)}

${fmtStats(homeStats, homeName, true)}

📰 OFFICIAL ESPN STATUS (AUTHORITATIVE):
${awayName}: ${awayTeamNews || 'No news'}
${homeName}: ${homeTeamNews || 'No news'}

📋 PREVIEW / CONTEXT:
${previewFullText ? previewFullText.slice(0, 1200) : previewResults.map(r => r.title + ': ' + r.snippet).join('\n') || 'None found'}

🔄 HEAD-TO-HEAD:
${h2h || 'No H2H data found'}

🕵️ OFF-COURT / PERSONAL SIGNALS:
${playerIntel || 'None found'}
`)
    }

    if (gameContexts.length === 0) {
      return NextResponse.json({ report: 'No pre-game NBA games found today.' })
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are a professional sports bettor who thinks exclusively in terms of EDGE and EXPECTED VALUE. You do not care who is likely to win — you only care where the market is WRONG and by how much. Bankroll: $${bankroll} USDC.

${leagueStatus ? `⚠️ PLAYER STATUS (ESPN — HARD FACTS, do not contradict):
${leagueStatus}\n` : ''}
═══════════════════════════════════════
THE ONLY QUESTION THAT MATTERS:
"Where is Polymarket mispricing the true probability, and why?"
═══════════════════════════════════════

SHARP BETTING PHILOSOPHY:
- Betting a 90% favorite at 88¢ is TERRIBLE. You risk $88 to win $12. The 2¢ edge barely covers noise.
- Betting a 40% underdog at 30¢ is GREAT if you believe true prob is 42%+. Risk $30 to win $70, with edge.
- The market is ALWAYS approximately right. You're looking for the rare cases where it's meaningfully wrong.
- Positive EV = (your estimated true prob) > (Poly price). That's the only filter that matters.
- Half-Kelly sizing is already pre-calculated for you. Use it. Do not recommend betting more.
- If edge < 5¢ and EV is near zero: PASS. Risking $90 to make $11 is a bad bet even if the team wins 85% of the time.

HOW TO FIND REAL EDGE:
1. Key player OUT that the market hasn't fully priced (a star missing = 5-10% swing in true prob)
2. Personal/life situation dragging down a player (divorce, death, legal — books miss this)
3. Revenge game, contract year, extreme motivation — underdog punching above their weight
4. Back-to-back fatigue on the favorite (rest edge on the underdog)
5. Stylistic mismatch that creates an upset opportunity (pace, defense, three-point variance)
6. Public money hammering a team, creating false line movement away from true value

HOW POLYMARKET WORKS:
- Each share = $1.00 if that team wins. You buy at the current price.
- Profit per share = $1.00 − price paid. Risk = price paid × shares.
- Shares = bet / price. Net profit if win = shares × (1 − price). Net loss = bet size.

CRITICAL: ESPN status is law. If ESPN says suspended = suspended. Do not say "might play."

TODAY'S GAMES:
${gameContexts.join('\n')}

═══════════════════════════════════════
OUTPUT FORMAT — FOR EACH GAME:

**[AWAY] @ [HOME]**
📍 Market says: [away]% / [home]% (Poly prices)
🧠 We say: [your estimated true prob for each team, based on ALL factors]
📊 Edge: +X¢ on [team] — Poly is underpricing them by X% because [specific reason]

Verdict: STRONG BET / LEAN / PASS
[If PASS: explain why the edge isn't there even if a team is likely to win]

The Trade (only if bet):
"[Team] YES at [price]¢ — $[halfKellyAmount] buys [shares] shares. Win: +$[profit]. Lose: -$[bet]."

Why the market is wrong here:
• [Factor 1 — be specific, cite stats or news]
• [Factor 2]
• [Factor 3 — the thing the public/market is missing]

Risk flags:
• [What could make you wrong — be honest about downside]
═══════════════════════════════════════

End with:

⚡ TOP PICK OF THE DAY
The single game where the market mispricing is largest and most justified. State exactly what edge you're exploiting and why it's not already priced in. Include the full trade.

Be a sharp. Most games should be PASS. Only bet where the edge is real and explainable.`
      }]
    })

    const report = (message.content[0] as any).text || 'Analysis unavailable.'
    return NextResponse.json({ report, gamesAnalyzed: gameContexts.length, scannedAt: new Date().toISOString() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
