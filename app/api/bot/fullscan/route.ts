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

// Normal CDF approximation (Abramowitz & Stegun)
function normCdf(x: number): number {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x)
  return 0.5 * (1 + sign * y)
}

// Convert DK spread to win probability using NBA std dev (~11 pts/game)
// Positive spread = underdog (getting points), negative = favorite (giving points)
function spreadToWinProb(spread: number): number {
  // DK spread is from the home team's perspective: negative means home is favored
  // spreadToWinProb returns the HOME team win probability
  const NBA_STD = 11
  return normCdf(spread / (NBA_STD * Math.sqrt(2)))
}

// Detect "live trade candidate" — cheap underdog in a competitive game
function liveTradeCandidateScore(polyPrice: number, spreadAbs: number): number {
  // High score = strong live trade candidate
  // Factors: price under 35¢ (cheap enough to 2-3x), spread under 8 (competitive game)
  if (polyPrice > 0.38 || spreadAbs > 9) return 0
  const priceScore = Math.max(0, (0.38 - polyPrice) / 0.38)  // cheaper = higher score
  const spreadScore = Math.max(0, (9 - spreadAbs) / 9)       // tighter spread = higher score
  return Math.round((priceScore * spreadScore) * 100)
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
    // Use CST date to avoid UTC rollover (e.g. 9pm CDT = next day UTC)
    const cst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
    const today = `${cst.getFullYear()}${String(cst.getMonth()+1).padStart(2,'0')}${String(cst.getDate()).padStart(2,'0')}`

    // ESPN games + Polymarket + league status — all in parallel
    const [espnRes, polyRes, leagueStatus] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`, { next: { revalidate: 120 } }),
      fetch(`${GAMMA_API}/events?active=true&closed=false&tag_slug=nba&limit=200`, { next: { revalidate: 60 } }),
      getLeagueStatus(),
    ])

    const espnData = await espnRes.json()
    const polyEvents: any[] = await polyRes.json()
    const events: any[] = (espnData.events || []).filter(
      (e: any) => {
        const state = e.competitions?.[0]?.status?.type?.state
        return state === 'pre' || state === 'in'
      }
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
      const gameState = comp.status?.type?.state || 'pre'
      const gameClock = comp.status?.displayClock || ''
      const gamePeriod = comp.status?.period || 0
      const isLive = gameState === 'in'
      const gameTime = isLive
        ? `🔴 LIVE — ${gamePeriod > 0 ? `Q${gamePeriod}` : ''} ${gameClock}`.trim()
        : new Date(comp.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
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

      // Spread-implied probability — second independent probability estimate
      // DK spread is stored as a negative number for the home team favorite
      // e.g. spread = -4.5 means home is favored by 4.5
      let spreadHomeImplied = 0.5, spreadAwayImplied = 0.5
      let spreadAbs = 0
      if (dkSpread !== null) {
        spreadAbs = Math.abs(dkSpread)
        // dkSpread from ESPN is typically the away team spread (positive = away dog, negative = away fave)
        // We'll treat it as: positive dkSpread = home is favored
        spreadHomeImplied = spreadToWinProb(dkSpread)
        spreadAwayImplied = 1 - spreadHomeImplied
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

      // Use the MORE favorable probability for each team — spread often more accurate for underdogs
      const awayTrueProb = Math.max(dkAwayImplied, spreadAwayImplied)
      const homeTrueProb = Math.max(dkHomeImplied, spreadHomeImplied)

      const awayEV = polyAwayPrice > 0 ? calcEdgeStats(awayTrueProb, polyAwayPrice, bankroll) : null
      const homeEV = polyHomePrice > 0 ? calcEdgeStats(homeTrueProb, polyHomePrice, bankroll) : null

      // Live trade score: cheap price + tight spread = strong cashout candidate
      const awayLiveScore = polyAwayPrice > 0 ? liveTradeCandidateScore(polyAwayPrice, spreadAbs) : 0
      const homeLiveScore = polyHomePrice > 0 ? liveTradeCandidateScore(polyHomePrice, spreadAbs) : 0

      const fmtEV = (ev: ReturnType<typeof calcEdgeStats>, teamName: string, polyPrice: number, isAway: boolean) => {
        const dkImplied = isAway ? dkAwayImplied : dkHomeImplied
        const spreadImplied = isAway ? spreadAwayImplied : spreadHomeImplied
        const trueProb = isAway ? awayTrueProb : homeTrueProb
        const liveScore = isAway ? awayLiveScore : homeLiveScore

        const spreadDiscrepancy = Math.abs(spreadImplied - dkImplied)
        const spreadNote = spreadDiscrepancy > 0.04
          ? `  ⚠️ SPREAD/ML DISCREPANCY: ML implies ${(dkImplied*100).toFixed(1)}% but spread implies ${(spreadImplied*100).toFixed(1)}% — ${spreadDiscrepancy > 0.08 ? 'LARGE gap, strong public money bias signal' : 'possible public bias'}`
          : `  ML: ${(dkImplied*100).toFixed(1)}% | Spread: ${(spreadImplied*100).toFixed(1)}% — consistent`

        const liveNote = liveScore >= 40
          ? `  🎯 LIVE TRADE CANDIDATE (${liveScore}/100): Price is cheap enough for a 2-4x cashout if they jump out to an early lead. Consider buying and watching the first half — don't just think hold-to-resolution.`
          : liveScore >= 20
          ? `  📊 Live trade potential (${liveScore}/100): modest cashout upside if they lead at half`
          : ''

        if (!ev || ev.edge <= 0) {
          return [`${teamName}: no hold-to-resolution edge vs Poly price`, spreadNote, liveNote].filter(Boolean).join('\n')
        }
        return [
          `${teamName}: +${(ev.edge*100).toFixed(1)}¢ EDGE (true prob est. ${(trueProb*100).toFixed(1)}% vs Poly ${(polyPrice*100).toFixed(1)}¢)`,
          spreadNote,
          `  EV per $1: ${ev.evPer1 >= 0 ? '+' : ''}${(ev.evPer1*100).toFixed(1)}¢ ${ev.evPer1 > 0 ? '✓ POSITIVE EV' : '✗ NEGATIVE EV'} | Half-Kelly: $${ev.betSize.toFixed(0)} → ${ev.shares} shares → +$${ev.profit} / -$${ev.betSize.toFixed(0)}`,
          liveNote,
        ].filter(Boolean).join('\n')
      }

      const awayEVStr = polyAwayPrice > 0 ? fmtEV(awayEV, awayName, polyAwayPrice, true) : `${awayName}: No Polymarket price`
      const homeEVStr = polyHomePrice > 0 ? fmtEV(homeEV, homeName, polyHomePrice, false) : `${homeName}: No Polymarket price`

      const awayScore = isLive ? (away.score || '') : ''
      const homeScore = isLive ? (home.score || '') : ''
      const scoreStr = isLive && awayScore && homeScore ? ` | Score: ${awayName} ${awayScore} — ${homeName} ${homeScore}` : ''

      gameContexts.push(`
════════════════════════════════════════
${awayName.toUpperCase()} @ ${homeName.toUpperCase()} — ${gameTime}${scoreStr}
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
- Betting a 90% favorite at 88¢ is TERRIBLE. You risk $88 to win $12. Even if they win, you barely profit.
- Betting a 25% underdog at 23¢ in a COMPETITIVE game is GREAT. Risk $23 to win $77. If you're right on 27% true prob, that's massive EV.
- The market is approximately right on who wins. It's frequently WRONG on the underdog's upset probability in close games.
- Polymarket and the public both systematically overprice favorites in competitive games. That's your edge.
- **BAD RECORD ≠ BAD BET.** A 20-win team's losing record is already in the 25¢ price. Don't double-count it.
- Half-Kelly sizing is pre-calculated. Use it. Never recommend more.
- PASS on anything with < 5¢ edge AND no live trade angle.

TWO WAYS TO MAKE MONEY — EVALUATE BOTH:

1. HOLD-TO-RESOLUTION: Buy and hold until game ends. Need clear positive EV (+5¢+ edge). Works for underdogs where market is genuinely mispriced.

2. LIVE TRADE (often better for underdogs): Buy cheap underdog shares pre-game. If they take an early lead, their Poly price jumps from 25¢ to 60-70¢. Sell and take the 2-3x. You don't need them to WIN — you just need them to be competitive in the first half. A team priced at 23.5¢ will be LEADING at halftime in ~35-40% of games. That's your cashout window.
   - Live trades work best: spread ≤ 7 pts + Poly price ≤ 32¢ = 🎯 flag it
   - The data already flags these as "LIVE TRADE CANDIDATE" — take that seriously

HOW TO FIND REAL EDGE:
1. Spread/ML discrepancy — if ML implies 75% but spread only implies 62%, public money inflated the favorite. Real edge is on the dog.
2. Rest advantage on the underdog — back-to-back favorite vs rested underdog = massive variance
3. Key player out for the FAVORITE — even a role player missing can shift 3-5% true probability
4. Personal/life distractions on star players — books miss this entirely
5. Tight spread + cheap Poly price = live trade setup regardless of hold-to-resolution EV

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
📍 Poly: [away]¢ / [home]¢ | Spread: [X] | Spread-implied: [away]% / [home]%
🧠 True prob: [away]% / [home]% (explain any gap vs market)

Verdict: STRONG BET / LIVE TRADE / LEAN / PASS
— STRONG BET: 5¢+ positive EV edge, hold to resolution
— LIVE TRADE: buy the underdog cheap, target a 2-3x cashout if they lead at end of Q1 or halftime. You do NOT need them to win.
— LEAN: real but thin edge, small position
— PASS: insufficient edge in either direction (explain why even if the favorite looks dominant)

The Play (skip if PASS):
Hold: "[Team] YES at X¢ — $[amount] → [shares] shares. Win: +$[profit]. Lose: -$[bet]."
Live trade: "Buy [Team] YES at X¢. If they're up or within [Y] at end of Q1, Poly price will be ~[Z]¢. Sell [half/all] for ~[X]x. Let rest ride free."

Why the market is wrong:
• [Specific mispricing — spread vs ML gap, rest edge, injury, discrepancy]
• [Stats from the data — cite actual numbers]
• [What public/Poly got wrong]

Risk:
• [Main thing that makes this bet fail]
═══════════════════════════════════════

End with:

⚡ TOP PICK OF THE DAY
Best edge on the slate — hold-to-resolution OR live trade. State the exact mispricing, the play, and what you're exploiting.

Be sharp. Underdogs in competitive games are systematically underpriced. A bad record is already in the price.`
      }]
    })

    const report = (message.content[0] as any).text || 'Analysis unavailable.'
    return NextResponse.json({ report, gamesAnalyzed: gameContexts.length, scannedAt: new Date().toISOString() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
