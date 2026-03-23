import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const BRAVE_KEY = process.env.BRAVE_API_KEY || ''

async function braveSearch(query: string, count = 5): Promise<string> {
  if (!BRAVE_KEY) return ''
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&freshness=pw`,
      {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return ''
    const data = await res.json()
    const results: any[] = data.web?.results || []
    return results.map((r: any) => `${r.title}: ${r.description}`).join('\n')
  } catch { return '' }
}

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NBAEdgeBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 4000)
  } catch { return '' }
}

export interface NarrativeSignal {
  game: string
  awayTeam: string
  homeTeam: string
  gameTime: string
  signals: {
    type: 'injury' | 'motivation' | 'revenge' | 'fatigue' | 'personal' | 'lineup' | 'trend'
    severity: 'high' | 'medium' | 'low'
    team: string  // which team this affects
    direction: 'favors_away' | 'favors_home' | 'neutral'
    summary: string
    source?: string
  }[]
  overallEdge: 'away' | 'home' | 'none'
  edgeConfidence: number  // 0-100
  aiSummary: string
  rawContext: string
}

export async function POST(req: NextRequest) {
  const { game, awayTeam, homeTeam, gameTime } = await req.json()

  if (!game || !awayTeam || !homeTeam) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    // Parallel search: injury reports + player news + team news
    const [injurySnippets, awayNews, homeNews, gamePreview, socialSignals] = await Promise.all([
      braveSearch(`${awayTeam} ${homeTeam} injury report ${today} NBA`, 5),
      braveSearch(`${awayTeam} NBA news last 7 days`, 5),
      braveSearch(`${homeTeam} NBA news last 7 days`, 5),
      braveSearch(`${awayTeam} vs ${homeTeam} preview prediction ${today}`, 3),
      braveSearch(`${awayTeam} ${homeTeam} NBA player personal news motivation 2026`, 4),
    ])

    // Also try to get Rotowire lineups
    const rotowire = await fetchPage('https://www.rotowire.com/basketball/nba-lineups.php')
    const rotowireRelevant = rotowire.toLowerCase().includes(awayTeam.split(' ').pop()!.toLowerCase())
      ? rotowire.slice(0, 2000)
      : ''

    const context = [
      `=== INJURY REPORTS ===\n${injurySnippets}`,
      `=== ${awayTeam.toUpperCase()} RECENT NEWS ===\n${awayNews}`,
      `=== ${homeTeam.toUpperCase()} RECENT NEWS ===\n${homeNews}`,
      `=== GAME PREVIEW ===\n${gamePreview}`,
      `=== SOCIAL/PERSONAL SIGNALS ===\n${socialSignals}`,
      rotowireRelevant ? `=== ROTOWIRE LINEUPS ===\n${rotowireRelevant}` : '',
    ].filter(Boolean).join('\n\n')

    // Claude analyzes everything
    const prompt = `You are a sharp sports bettor analyzing NBA games for betting edges. Your job is to find REAL, ACTIONABLE signals that the market may have underpriced.

GAME: ${awayTeam} @ ${homeTeam}
TIME: ${gameTime}
TODAY: ${today}

Here is all available context about this game:
---
${context}
---

Analyze this game for the following signal types:

1. **INJURY signals** — Key player out/questionable/doubtful. Focus on stars and key rotation guys. A star being out can completely flip a game.

2. **MOTIVATION signals** — Examples:
   - Revenge game (player returning to former team, especially if traded/released badly)
   - Player honoring a deceased family member or close friend
   - Player publicly called out / has a point to prove
   - Team eliminated from playoffs, nothing to lose / going through the motions
   - Player in contract year, playing for their next deal
   - Team on a hot streak with strong momentum
   - Player recently in personal controversy (divorce, arrest, distraction)

3. **FATIGUE signals** — Back-to-back games, travel fatigue, 3rd game in 4 nights

4. **LINEUP signals** — Starter sitting out for rest (load management), unexpected lineup change

5. **TREND signals** — Team ATS record recently, team historically strong/weak in this spot

For each signal you find, rate its severity (high/medium/low) and which team it favors.

Then give an OVERALL EDGE call: which team has the narrative/situational edge today, and how confident are you (0-100)?

Be honest — if there are no real signals, say so. Don't manufacture signals that aren't there.

Respond in this exact JSON format:
{
  "signals": [
    {
      "type": "injury|motivation|revenge|fatigue|personal|lineup|trend",
      "severity": "high|medium|low",
      "team": "team name",
      "direction": "favors_away|favors_home|neutral",
      "summary": "1-2 sentence description of the signal"
    }
  ],
  "overallEdge": "away|home|none",
  "edgeConfidence": 0-100,
  "aiSummary": "2-3 sentence plain English summary of the most important things you found"
}`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = (message.content[0] as any).text || ''

    // Parse JSON from response
    let parsed: any = { signals: [], overallEdge: 'none', edgeConfidence: 0, aiSummary: 'Analysis unavailable.' }
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch { /* use defaults */ }

    const result: NarrativeSignal = {
      game,
      awayTeam,
      homeTeam,
      gameTime,
      signals: parsed.signals || [],
      overallEdge: parsed.overallEdge || 'none',
      edgeConfidence: parsed.edgeConfidence || 0,
      aiSummary: parsed.aiSummary || responseText.slice(0, 300),
      rawContext: context.slice(0, 500),
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
