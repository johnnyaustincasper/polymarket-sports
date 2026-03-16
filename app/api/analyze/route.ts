import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const BRAVE_KEY = process.env.BRAVE_API_KEY || ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
}

async function safeTextFetch(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NBALinesBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    return htmlToText(await res.text())
  } catch { return '' }
}

async function safeFetch(url: string): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ─── Injury Search ────────────────────────────────────────────────────────────

function getTodayString(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * Search Brave for game-preview articles (they compile both teams' injury reports).
 * Query pattern: "[TeamA] vs [TeamB] injury report [Month Day Year]"
 */
async function searchInjuryArticles(teamA: string, teamB: string): Promise<string[]> {
  if (!BRAVE_KEY) return []
  const today = getTodayString()
  const query = `${teamA} vs ${teamB} injury report ${today}`
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&freshness=pd`,
      {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    // Preferred sources in order
    const preferred = ['espn.com', 'cbssports.com', 'rotowire.com', 'clutchpoints.com']
    const results: any[] = data.web?.results || []
    results.sort((a, b) => {
      const ai = preferred.findIndex(p => a.url?.includes(p))
      const bi = preferred.findIndex(p => b.url?.includes(p))
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    return results.slice(0, 3).map((r: any) => r.url).filter(Boolean)
  } catch { return [] }
}

/**
 * Fetch up to 3 injury article URLs and extract relevant content.
 * Cross-references multiple sources; notes conflicts.
 */
async function getInjuryReport(teamA: string, teamB: string): Promise<string> {
  const today = getTodayString()

  // Try Brave search first
  const urls = await searchInjuryArticles(teamA, teamB)

  // Fallback: construct known working URLs for game-specific pages
  const teamASlug = teamA.split(' ').pop()!.toLowerCase().replace(/\s+/g, '-')
  const teamBSlug = teamB.split(' ').pop()!.toLowerCase().replace(/\s+/g, '-')
  const fallbacks = [
    `https://www.rotowire.com/basketball/nba-lineups.php`,
    `https://www.cbssports.com/nba/gametracker/preview/NBA_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${teamASlug.toUpperCase()}@${teamBSlug.toUpperCase()}`,
  ]

  const allUrls = [...urls, ...fallbacks].slice(0, 3)

  const results: { url: string; content: string }[] = []

  await Promise.all(allUrls.map(async (url) => {
    const text = await safeTextFetch(url)
    if (text.length > 200) {
      // Extract injury-relevant sections
      const lower = text.toLowerCase()
      const teamALast = teamA.split(' ').pop()!.toLowerCase()
      const teamBLast = teamB.split(' ').pop()!.toLowerCase()

      let snippet = ''
      for (const keyword of ['injury', 'out', 'questionable', 'doubtful', 'probable', teamALast, teamBLast]) {
        const idx = lower.indexOf(keyword)
        if (idx > -1) {
          snippet += text.slice(Math.max(0, idx - 100), idx + 600) + '\n...\n'
          if (snippet.length > 2000) break
        }
      }
      if (snippet.length > 100) {
        results.push({ url, content: snippet.slice(0, 2000) })
      }
    }
  }))

  if (!results.length) {
    return `No live injury data found for ${teamA} vs ${teamB} on ${today}. Use your training knowledge for this matchup.`
  }

  return results.map(r => `SOURCE: ${r.url}\n${r.content}`).join('\n\n---\n\n')
}

// ─── Standings ────────────────────────────────────────────────────────────────

async function getStandings(): Promise<string> {
  const data = await safeFetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2026')
  if (!data) return ''
  try {
    const lines: string[] = []
    for (const conf of data.children || []) {
      for (const entry of conf.standings?.entries || []) {
        const team = entry.team?.displayName
        const stats = entry.stats || []
        const wins = stats.find((s: any) => s.name === 'wins')?.value ?? ''
        const losses = stats.find((s: any) => s.name === 'losses')?.value ?? ''
        const gb = stats.find((s: any) => s.name === 'gamesBehind')?.value ?? ''
        if (team) lines.push(`${team}: ${wins}-${losses} (${conf.name}, ${gb} GB)`)
      }
    }
    return lines.join('\n')
  } catch { return '' }
}

// ─── Game Context ─────────────────────────────────────────────────────────────

async function getGameContext(teamA: string, teamB: string): Promise<string> {
  const data = await safeFetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard')
  if (!data) return ''
  const teamALast = teamA.split(' ').pop()!.toLowerCase()
  const teamBLast = teamB.split(' ').pop()!.toLowerCase()
  const game = data.events?.find((e: any) => {
    const names = (e.competitions?.[0]?.competitors || []).map((c: any) => c.team?.displayName?.toLowerCase() || '')
    return names.some((n: string) => n.includes(teamALast)) && names.some((n: string) => n.includes(teamBLast))
  })
  if (!game) return ''
  const comp = game.competitions?.[0]
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
  const time = game.status?.type?.shortDetail || ''
  const venue = comp?.venue?.fullName || ''
  const homeRecord = home?.records?.[0]?.summary || ''
  const awayRecord = away?.records?.[0]?.summary || ''
  return `${away?.team?.displayName} (${awayRecord}) @ ${home?.team?.displayName} (${homeRecord}) | ${time} | ${venue}`
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { teamA, teamB, polyOddsA, polyOddsB, recordA, recordB } = await req.json()
    const today = getTodayString()

    const [injuries, standings, gameContext] = await Promise.all([
      getInjuryReport(teamA, teamB),
      getStandings(),
      getGameContext(teamA, teamB),
    ])

    const context = `
TODAY: ${today}
GAME: ${gameContext || `${teamA} vs ${teamB}`}
POLYMARKET WIN ODDS: ${teamA} ${polyOddsA}% | ${teamB} ${polyOddsB}%
${teamA} Record: ${recordA || 'N/A'} | ${teamB} Record: ${recordB || 'N/A'}

INJURY REPORT (live web sources — cross-referenced):
${injuries}

NBA STANDINGS:
${standings || 'N/A'}
`.trim()

    const prompt = `You are a sharp NBA betting analyst. A bettor wants to know who to pick to WIN this game outright.

INSTRUCTIONS FOR INJURY DATA:
- The injury data below was fetched live today (${today}) from multiple sources
- If sources conflict on a player's status, report the most recent and note the conflict
- Include: player name, status (OUT/QUESTIONABLE/PROBABLE/DOUBTFUL), injury type, games missed, return timeline if mentioned
- Do NOT use cached or assumed injury info — only what's in the data below

Use ALL the live data below plus your knowledge of this season's stats, player performance, and matchup trends.

${context}

Write a comprehensive betting breakdown in this exact format:

🏀 **${teamA} vs ${teamB}**

**Win Probability:** ${teamA} ${polyOddsA}% | ${teamB} ${polyOddsB}%

**Standings:** [Conference record + playoff position for each team from standings data above]

**Season Series:** [Head-to-head this season — who leads, any patterns]

---

📊 **Offensive & Defensive Rankings**

**${teamA}**
[PPG, FG%, 3P%, key playmakers with stats, pace/style, defensive ranking]

**${teamB}**
[PPG, FG%, 3P%, key playmakers with stats, pace/style, defensive ranking]

---

🏥 **Injury Report — ${today}**

**${teamA}:** [From live data above: each player, status, injury, impact on tonight]
**${teamB}:** [From live data above: each player, status, injury, impact on tonight]

---

💪 **Matchup Breakdown**

**${teamA} advantages:** [2-3 specific stat-backed edges in THIS matchup]
**${teamB} advantages:** [2-3 specific stat-backed edges in THIS matchup]

---

🎯 **Underdog Case for ${polyOddsA < polyOddsB ? teamA : teamB} (~${Math.min(polyOddsA, polyOddsB)}%)**
[3 specific reasons why the underdog has real value tonight]

**⚡ Pick:** [Name the team. One sentence. Be direct.]`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    return NextResponse.json({ analysis: (message.content[0] as any).text })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
