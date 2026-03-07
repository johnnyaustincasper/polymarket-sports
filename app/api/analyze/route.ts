import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function safeFetch(url: string): Promise<any> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } } as any)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function safeTextFetch(url: string, revalidate = 300): Promise<string> {
  try {
    const res = await fetch(url, { next: { revalidate } } as any)
    if (!res.ok) return ''
    return await res.text()
  } catch { return '' }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// Scrape full ESPN injury page and extract relevant team section
async function getInjuriesFromESPN(teamA: string, teamB: string): Promise<string> {
  const html = await safeTextFetch('https://www.espn.com/nba/injuries', 60)
  if (!html) return 'Could not load ESPN injury report.'

  const text = htmlToText(html)

  // Find team sections
  const teamALast = teamA.split(' ').slice(-1)[0]
  const teamBLast = teamB.split(' ').slice(-1)[0]

  let result = ''

  for (const [team, keyword] of [[teamA, teamALast], [teamB, teamBLast]]) {
    const idx = text.indexOf(team as string)
    if (idx > -1) {
      // Extract ~800 chars after team name (covers their injury list)
      const section = text.slice(idx, idx + 800)
      result += `\n${team} Injuries:\n${section}\n`
    } else {
      // Try with just last word
      const idx2 = text.indexOf(keyword as string)
      if (idx2 > -1) {
        result += `\n${team} Injuries:\n${text.slice(idx2, idx2 + 800)}\n`
      } else {
        result += `\n${team} Injuries: No injuries listed on ESPN.\n`
      }
    }
  }

  return result
}

// Get team standings from ESPN
async function getStandings(): Promise<string> {
  const data = await safeFetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2026')
  if (!data) return ''
  try {
    const lines: string[] = []
    for (const conf of data.children || []) {
      const confName = conf.name || ''
      for (const entry of conf.standings?.entries || []) {
        const team = entry.team?.displayName
        const stats = entry.stats || []
        const wins = stats.find((s: any) => s.name === 'wins')?.value ?? ''
        const losses = stats.find((s: any) => s.name === 'losses')?.value ?? ''
        const gb = stats.find((s: any) => s.name === 'gamesBehind')?.value ?? ''
        if (team) lines.push(`${team}: ${wins}-${losses} (${confName}, ${gb} GB)`)
      }
    }
    return lines.join('\n')
  } catch { return '' }
}

// Get CBS Sports injury page for extra context
async function getCBSInjuries(teamA: string, teamB: string): Promise<string> {
  const html = await safeTextFetch('https://www.cbssports.com/nba/injuries/', 60)
  if (!html) return ''
  const text = htmlToText(html)
  const teamALast = teamA.split(' ').slice(-1)[0]
  const teamBLast = teamB.split(' ').slice(-1)[0]
  let result = ''
  for (const keyword of [teamALast, teamBLast]) {
    const idx = text.indexOf(keyword)
    if (idx > -1) result += text.slice(Math.max(0, idx - 50), idx + 600) + '\n'
  }
  return result.slice(0, 2000)
}

// Get today's scoreboard for game context
async function getGameContext(teamA: string, teamB: string): Promise<string> {
  const data = await safeFetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard')
  if (!data) return ''
  const teamALast = teamA.split(' ').slice(-1)[0].toLowerCase()
  const teamBLast = teamB.split(' ').slice(-1)[0].toLowerCase()
  const game = data.events?.find((e: any) => {
    const names = (e.competitions?.[0]?.competitors || []).map((c: any) => c.team?.displayName?.toLowerCase() || '')
    return names.some((n: string) => n.includes(teamALast)) && names.some((n: string) => n.includes(teamBLast))
  })
  if (!game) return ''
  const comp = game.competitions?.[0]
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
  const homeRecord = home?.records?.[0]?.summary || ''
  const awayRecord = away?.records?.[0]?.summary || ''
  const time = game.status?.type?.shortDetail || ''
  const venue = comp?.venue?.fullName || ''
  return `Game: ${away?.team?.displayName} (${awayRecord}) @ ${home?.team?.displayName} (${homeRecord}) | ${time} | ${venue}`
}

export async function POST(req: NextRequest) {
  try {
    const { teamA, teamB, polyOddsA, polyOddsB, recordA, recordB } = await req.json()

    // Fetch all data in parallel
    const [espnInjuries, cbsInjuries, standings, gameContext] = await Promise.all([
      getInjuriesFromESPN(teamA, teamB),
      getCBSInjuries(teamA, teamB),
      getStandings(),
      getGameContext(teamA, teamB),
    ])

    const context = `
GAME INFO: ${gameContext || `${teamA} vs ${teamB}`}
POLYMARKET WIN ODDS: ${teamA} ${polyOddsA}% | ${teamB} ${polyOddsB}%
${teamA} Record: ${recordA || 'N/A'} | ${teamB} Record: ${recordB || 'N/A'}

ESPN INJURY REPORT (live):
${espnInjuries}

CBS SPORTS INJURY DATA:
${cbsInjuries || 'N/A'}

NBA STANDINGS:
${standings || 'N/A'}
`.trim()

    const prompt = `You are a sharp NBA betting analyst. A bettor wants to know who to pick to WIN this game outright.

Use ALL the live data below plus your training knowledge of this season's stats, player performance, and matchup trends.

${context}

Write a comprehensive betting breakdown in this exact format:

🏀 **${teamA} vs ${teamB}**

**Win Probability:** ${teamA} ${polyOddsA}% | ${teamB} ${polyOddsB}%

**Standings:** [Use standings data above to give conference record + playoff position for each team]

**Season Series:** [Head-to-head this season — games played, who leads, any notable matchups]

---

📊 **Offensive & Defensive Rankings**

**${teamA}**
[PPG, FG%, 3P%, key playmakers with their stats, pace/style. Then defensive ranking and what they allow per game.]

**${teamB}**
[PPG, FG%, 3P%, key playmakers with their stats, pace/style. Then defensive ranking and what they allow per game.]

---

🏥 **Injury Report**

**${teamA}:** [Use ESPN/CBS data above. Include player name, injury, status, and impact on tonight's game]
**${teamB}:** [Use ESPN/CBS data above. Include player name, injury, status, and impact on tonight's game]

---

💪 **Strengths & Weaknesses**

**${teamA}**
• Strengths: [specific advantages in THIS matchup with real stats]
• Weaknesses: [what could specifically hurt them tonight]

**${teamB}**
• Strengths: [specific advantages in THIS matchup with real stats]
• Weaknesses: [what could specifically hurt them tonight]

---

🎯 **Underdog Case for ${polyOddsA < polyOddsB ? teamA : teamB} (~${Math.min(polyOddsA, polyOddsB)}%)**
[3-4 specific, stat-backed reasons why the underdog has real value tonight]

**⚡ Bottom line:** [Name the team. Be direct. 2 sentences max — who wins and why.]`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const analysis = (message.content[0] as any).text
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
