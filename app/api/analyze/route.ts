import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchESPNData(sport: string, teamA: string, teamB: string) {
  try {
    const sportMap: Record<string, string> = {
      NBA: 'basketball/nba',
      NHL: 'hockey/nhl',
      NFL: 'football/nfl',
      MLB: 'baseball/mlb',
      NCAAB: 'basketball/mens-college-basketball',
    }
    const espnSport = sportMap[sport] || 'basketball/nba'
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/scoreboard`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { teamA, teamB, sport, polyOddsA, polyOddsB, question } = await req.json()

    // Try to get ESPN context
    const espnData = await fetchESPNData(sport, teamA, teamB)
    const espnContext = espnData
      ? `ESPN scoreboard data is available for context.`
      : `No live ESPN data available.`

    const prompt = `You are a sharp sports betting analyst. A user wants to know who to pick to WIN this game outright.

Game: ${question}
Sport: ${sport}
Team A: ${teamA} — Polymarket win probability: ${polyOddsA}%
Team B: ${teamB} — Polymarket win probability: ${polyOddsB}%

Provide a concise betting analysis in this exact format:

**PICK: [TEAM NAME]**

**Why:**
2-3 sentences on why this team wins. Cover recent form, key matchup advantages, or momentum.

**Injury Watch:**
Any notable injuries or absences affecting either team right now. If unknown, say "Check latest reports before betting."

**Underdog Value:**
If the underdog (lower %) is worth considering, explain why in 1-2 sentences. If the favorite is the clear right play, say so.

**Confidence:** [LOW / MEDIUM / HIGH]

Keep it sharp and direct. No fluff. This person just wants to know who to pick.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const analysis = (message.content[0] as any).text

    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
