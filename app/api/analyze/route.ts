import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchTeamStats(teamName: string): Promise<any> {
  try {
    // Search ESPN for team
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=30`,
      { next: { revalidate: 3600 } }
    )
    const data = await res.json()
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams || []
    const match = teams.find((t: any) =>
      t.team.displayName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop() || '') ||
      teamName.toLowerCase().includes(t.team.name.toLowerCase())
    )
    if (!match) return null

    const teamId = match.team.id

    // Get team stats
    const statsRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}`,
      { next: { revalidate: 3600 } }
    )
    const teamData = await statsRes.json()

    // Get team injuries
    const injuryRes = await fetch(
      `https://site.api.espn.com/apis/v2/sports/basketball/nba/teams/${teamId}/injuries`,
      { next: { revalidate: 1800 } }
    )
    const injuryData = injuryRes.ok ? await injuryRes.json() : null

    return { teamData, injuryData, teamId }
  } catch {
    return null
  }
}

async function fetchGameData(teamA: string, teamB: string): Promise<string> {
  try {
    const [dataA, dataB] = await Promise.all([
      fetchTeamStats(teamA),
      fetchTeamStats(teamB),
    ])

    let context = ''

    if (dataA?.teamData) {
      const t = dataA.teamData.team
      const record = t.record?.items?.[0]?.summary || 'N/A'
      const standing = t.standingSummary || ''
      context += `\n${teamA}: Record ${record}. ${standing}.`

      // Injuries
      const injuries = dataA.injuryData?.injuries || []
      if (injuries.length > 0) {
        const injList = injuries.slice(0, 5).map((i: any) =>
          `${i.athlete?.displayName} (${i.status})`
        ).join(', ')
        context += ` Injuries: ${injList}.`
      } else {
        context += ` No significant injuries reported.`
      }
    }

    if (dataB?.teamData) {
      const t = dataB.teamData.team
      const record = t.record?.items?.[0]?.summary || 'N/A'
      const standing = t.standingSummary || ''
      context += `\n${teamB}: Record ${record}. ${standing}.`

      const injuries = dataB.injuryData?.injuries || []
      if (injuries.length > 0) {
        const injList = injuries.slice(0, 5).map((i: any) =>
          `${i.athlete?.displayName} (${i.status})`
        ).join(', ')
        context += ` Injuries: ${injList}.`
      } else {
        context += ` No significant injuries reported.`
      }
    }

    // Get today's scoreboard for any additional context
    const scoreRes = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { next: { revalidate: 60 } }
    )
    const scoreData = await scoreRes.json()
    const matchingGame = scoreData?.events?.find((e: any) => {
      const teams = e.competitions?.[0]?.competitors?.map((c: any) => c.team?.displayName?.toLowerCase()) || []
      return teams.some((t: string) => t.includes(teamA.toLowerCase().split(' ').pop() || '')) &&
             teams.some((t: string) => t.includes(teamB.toLowerCase().split(' ').pop() || ''))
    })

    if (matchingGame) {
      const comp = matchingGame.competitions?.[0]
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
      context += `\nGame info: ${away?.team?.displayName} @ ${home?.team?.displayName}.`

      // Season series
      const leaders = comp?.leaders || []
      if (leaders.length > 0) {
        context += ` Stat leaders available.`
      }
    }

    return context
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const { teamA, teamB, sport, polyOddsA, polyOddsB, question, recordA, recordB } = await req.json()

    // Pull real ESPN data
    const espnContext = await fetchGameData(teamA, teamB)

    const prompt = `You are a sharp NBA betting analyst. Give a detailed, data-driven breakdown of this game for someone who only bets on who wins outright.

Game: ${question}
${teamA} record: ${recordA || 'unknown'} — Polymarket win probability: ${polyOddsA}%
${teamB} record: ${recordB || 'unknown'} — Polymarket win probability: ${polyOddsB}%

ESPN Data:
${espnContext || 'Use your training data for this matchup.'}

Write your analysis in this format — be specific, use real stats and player names where you know them:

🏀 **[Away Team] vs [Home Team]**
*[Venue if known] | [Game time]*

**Win Probability:** [Team A] ${polyOddsA}% | [Team B] ${polyOddsB}%

**Standings:** [Team A record + conference rank] | [Team B record + conference rank]

**Season Series:** [Head-to-head record this season, notable games]

---

📊 **Offensive & Defensive Rankings**

**[Team A]**
[2-3 sentences on their offense — PPG, FG%, 3P%, ball movement. Then 1-2 on defense.]

**[Team B]**
[2-3 sentences on their offense — PPG, FG%, 3P%, ball movement. Then 1-2 on defense.]

---

🏥 **Injury Report**

**[Team A]:** [List key injuries with status — Out/Questionable/Day-to-day]
**[Team B]:** [List key injuries with status]

---

💪 **Strengths & Weaknesses**

**[Team A]**
• Strengths: [Key players, what they do well in this matchup]
• Weaknesses: [What could beat them tonight]

**[Team B]**
• Strengths: [Key players, what they do well in this matchup]
• Weaknesses: [What could beat them tonight]

---

🎯 **Underdog Case for [lower % team]**
[3-4 specific reasons why the underdog could win, with stats/context]

**Bottom line:** [1-2 sentence final pick recommendation. Be direct — name a team.]`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const analysis = (message.content[0] as any).text
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
