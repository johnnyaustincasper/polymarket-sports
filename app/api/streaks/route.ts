import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  fetchTeamRecentGames,
  calcStreak,
  fetchTodayTeamAbbrs,
  ESPN_ABBR,
} from '@/app/lib/nba-api'
import type { TeamStreak } from '@/app/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const BRAVE_KEY = process.env.BRAVE_API_KEY || ''

async function searchStreakContext(teamName: string, streakLabel: string): Promise<string> {
  if (!BRAVE_KEY) return ''
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const query = `${teamName} ${streakLabel} streak reason ${month}`
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&freshness=pw`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': BRAVE_KEY,
        },
        signal: AbortSignal.timeout(6000),
      }
    )
    if (!res.ok) return ''
    const data = await res.json()
    const results: any[] = data.web?.results || []
    return results.slice(0, 3)
      .map((r: any) => `${r.title}: ${r.description || ''}`)
      .join('\n')
  } catch {
    return ''
  }
}

async function generateStreakAnalysis(
  teamName: string,
  abbr: string,
  streakLabel: string,
  lastGames: ('W' | 'L')[],
  newsContext: string
): Promise<{ analysis: string; keyFactors: string[] }> {
  const prompt = `You are an NBA analyst. The ${teamName} are on a ${streakLabel} streak. Their last ${lastGames.length} results: ${lastGames.join(' ')}.

Recent news context:
${newsContext || 'No recent news found.'}

In 2-3 sentences, explain WHY they are on this streak. Then list 3 key factors as bullet points.

Format exactly:
ANALYSIS: [2-3 sentence explanation]
FACTORS:
• [factor 1]
• [factor 2]
• [factor 3]`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (msg.content[0] as any).text || ''
    const analysisMatch = text.match(/ANALYSIS:\s*([\s\S]+?)(?=FACTORS:|$)/)
    const factorsMatch = text.match(/FACTORS:\s*([\s\S]+)/)
    const analysis = analysisMatch?.[1]?.trim() || text.slice(0, 200)
    const factors = (factorsMatch?.[1] || '')
      .split('\n')
      .map((l: string) => l.replace(/^[•\-*]\s*/, '').trim())
      .filter((l: string) => l.length > 5)
      .slice(0, 3)
    return { analysis, keyFactors: factors.length ? factors : ['Momentum', 'Team chemistry', 'Scheduling'] }
  } catch {
    return {
      analysis: `The ${teamName} are showing ${lastGames[0] === 'W' ? 'strong form' : 'struggles'} with a ${streakLabel} streak.`,
      keyFactors: ['Momentum', 'Depth', 'Scheduling'],
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const forceAll = searchParams.get('all') === 'true'

    // Fetch today's teams (or all 30 if ?all=true)
    let abbrs: string[]
    if (forceAll) {
      abbrs = Object.keys(ESPN_ABBR)
    } else {
      abbrs = await fetchTodayTeamAbbrs()
      if (!abbrs.length) abbrs = Object.keys(ESPN_ABBR)
    }

    // Fetch recent games for all teams in parallel (limit concurrency)
    const BATCH = 10
    const teamData: TeamStreak[] = []

    for (let i = 0; i < abbrs.length; i += BATCH) {
      const batch = abbrs.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map(async (abbr) => {
          const games = await fetchTeamRecentGames(abbr, 10)
          const { streak, label, lastFive } = calcStreak(games)

          // Only do AI analysis for streaks 3+
          let analysis = ''
          let keyFactors: string[] = []

          if (Math.abs(streak) >= 3) {
            const teamName = Object.entries(require('@/app/lib/nba-api').TEAM_NAME_TO_ABBR || {})
              .find(([, a]) => a === abbr)?.[0] || abbr
            const newsCtx = await searchStreakContext(teamName, label)
            const result = await generateStreakAnalysis(teamName, abbr, label, lastFive, newsCtx)
            analysis = result.analysis
            keyFactors = result.keyFactors
          }

          return {
            name: abbr, // Will use abbr as name fallback; ESPN data has full name in schedule
            abbr,
            streak,
            streakLabel: label,
            lastGames: lastFive,
            analysis,
            keyFactors,
          } satisfies TeamStreak
        })
      )
      teamData.push(...results)
    }

    // Sort: biggest streaks first (by absolute value)
    teamData.sort((a, b) => Math.abs(b.streak) - Math.abs(a.streak))

    return NextResponse.json({
      teams: teamData,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Streaks error:', err)
    return NextResponse.json({ error: 'Failed to fetch streaks' }, { status: 500 })
  }
}
