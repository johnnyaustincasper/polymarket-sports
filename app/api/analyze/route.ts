import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function safeFetch(url: string, opts: RequestInit = {}): Promise<any> {
  try {
    const res = await fetch(url, { ...opts, next: { revalidate: 300 } } as any)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function safeTextFetch(url: string): Promise<string> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } } as any)
    if (!res.ok) return ''
    return await res.text()
  } catch { return '' }
}

function extractText(html: string, maxChars = 3000): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

async function getESPNTeamId(teamName: string): Promise<string | null> {
  const data = await safeFetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=30')
  const teams = data?.sports?.[0]?.leagues?.[0]?.teams || []
  const keyword = teamName.toLowerCase().split(' ').pop() || ''
  const match = teams.find((t: any) =>
    t.team.displayName.toLowerCase().includes(keyword) ||
    t.team.name.toLowerCase().includes(keyword)
  )
  return match?.team?.id || null
}

async function getTeamData(teamName: string) {
  const teamId = await getESPNTeamId(teamName)
  if (!teamId) return { stats: null, injuries: [] }

  const [teamData, injuryData] = await Promise.all([
    safeFetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}`),
    safeFetch(`https://site.api.espn.com/apis/v2/sports/basketball/nba/teams/${teamId}/injuries`),
  ])

  const injuries = (injuryData?.injuries || []).slice(0, 6).map((i: any) => ({
    name: i.athlete?.displayName,
    status: i.status,
    detail: i.details?.type || '',
  }))

  return { stats: teamData?.team, injuries, teamId }
}

async function scrapeInjuryNews(teamA: string, teamB: string): Promise<string> {
  const teamALast = teamA.split(' ').pop() || teamA
  const teamBLast = teamB.split(' ').pop() || teamB

  // Hit ESPN injury pages for both teams
  const sources = [
    `https://www.espn.com/nba/injuries`,
    `https://www.cbssports.com/nba/injuries/`,
  ]

  const results: string[] = []

  for (const url of sources) {
    const html = await safeTextFetch(url)
    if (!html) continue
    const text = extractText(html, 5000)
    // Find relevant sections
    const lower = text.toLowerCase()
    const idxA = lower.indexOf(teamALast.toLowerCase())
    const idxB = lower.indexOf(teamBLast.toLowerCase())
    if (idxA > -1) results.push(text.slice(Math.max(0, idxA - 100), idxA + 500))
    if (idxB > -1) results.push(text.slice(Math.max(0, idxB - 100), idxB + 500))
    if (results.length >= 4) break
  }

  return results.join('\n\n').slice(0, 3000)
}

async function getStandings(): Promise<string> {
  const data = await safeFetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings')
  if (!data) return ''
  try {
    const entries: string[] = []
    for (const conf of data.children || []) {
      for (const div of conf.standings?.entries || conf.entries || []) {
        const team = div.team?.displayName
        const stats = div.stats || []
        const wins = stats.find((s: any) => s.name === 'wins')?.value
        const losses = stats.find((s: any) => s.name === 'losses')?.value
        const gb = stats.find((s: any) => s.name === 'gamesBehind')?.value
        if (team) entries.push(`${team}: ${wins}-${losses} (${gb} GB)`)
      }
    }
    return entries.join(', ')
  } catch { return '' }
}

export async function POST(req: NextRequest) {
  try {
    const { teamA, teamB, polyOddsA, polyOddsB, recordA, recordB } = await req.json()

    // Parallel data fetch: ESPN stats + injuries + standings + web scrape
    const [dataA, dataB, injuryNews, standings] = await Promise.all([
      getTeamData(teamA),
      getTeamData(teamB),
      scrapeInjuryNews(teamA, teamB),
      getStandings(),
    ])

    // Build context block
    let context = `GAME: ${teamA} (${recordA || 'N/A'}) vs ${teamB} (${recordB || 'N/A'})\n`
    context += `POLYMARKET ODDS: ${teamA} ${polyOddsA}% | ${teamB} ${polyOddsB}%\n\n`

    if (standings) context += `CURRENT NBA STANDINGS:\n${standings}\n\n`

    if (dataA.injuries.length > 0) {
      context += `${teamA.toUpperCase()} INJURY REPORT (ESPN):\n`
      dataA.injuries.forEach((i: any) => context += `- ${i.name}: ${i.status} ${i.detail ? `(${i.detail})` : ''}\n`)
      context += '\n'
    } else {
      context += `${teamA.toUpperCase()} INJURY REPORT: No players listed on ESPN injury report.\n\n`
    }

    if (dataB.injuries.length > 0) {
      context += `${teamB.toUpperCase()} INJURY REPORT (ESPN):\n`
      dataB.injuries.forEach((i: any) => context += `- ${i.name}: ${i.status} ${i.detail ? `(${i.detail})` : ''}\n`)
      context += '\n'
    } else {
      context += `${teamB.toUpperCase()} INJURY REPORT: No players listed on ESPN injury report.\n\n`
    }

    if (injuryNews) {
      context += `LATEST INJURY NEWS (web):\n${injuryNews}\n\n`
    }

    const prompt = `You are a sharp NBA betting analyst. A bettor wants to know who to pick to WIN this game outright — no spreads, no props, just who wins.

Use the real data below combined with your training knowledge of this season's stats, trends, and matchups to write a comprehensive betting breakdown.

${context}

Write the analysis in this exact format:

🏀 **${teamA} vs ${teamB}**

**Win Probability:** ${teamA} ${polyOddsA}% | ${teamB} ${polyOddsB}%

**Standings:** [conference records, playoff positioning for both teams]

**Season Series:** [head-to-head record this season, any notable games between them]

---

📊 **Offensive & Defensive Rankings**

**${teamA}**
[2-3 sentences: PPG, FG%, 3P%, key playmakers, pace. Then defensive ranking/style.]

**${teamB}**
[2-3 sentences: PPG, FG%, 3P%, key playmakers, pace. Then defensive ranking/style.]

---

🏥 **Injury Report**

**${teamA}:** [Use the ESPN data above. Note any impact on tonight's game.]
**${teamB}:** [Use the ESPN data above. Note any impact on tonight's game.]

---

💪 **Strengths & Weaknesses**

**${teamA}**
• Strengths: [specific to this matchup]
• Weaknesses: [specific to this matchup]

**${teamB}**
• Strengths: [specific to this matchup]  
• Weaknesses: [specific to this matchup]

---

🎯 **Underdog Case for ${polyOddsA < polyOddsB ? teamA : teamB} (~${Math.min(polyOddsA, polyOddsB)}%)**
[3-4 specific reasons with stats and context why the underdog could win]

**⚡ Bottom line:** [Direct pick. Name the team. 2 sentences max.]`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    })

    const analysis = (message.content[0] as any).text
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
