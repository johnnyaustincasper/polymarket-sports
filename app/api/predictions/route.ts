import { NextRequest, NextResponse } from 'next/server'
import { fetchTeamRecentGames, calcStreak, calcRestDays } from '@/app/lib/nba-api'

// Parse "W-L" record string to win percentage
function parseWinPct(record: string): number {
  const parts = record.split('-').map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0.5
  const total = parts[0] + parts[1]
  if (total === 0) return 0.5
  return parts[0] / total
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const home = searchParams.get('home')?.toUpperCase()
  const away = searchParams.get('away')?.toUpperCase()
  const homeRecord = searchParams.get('homeRecord') || ''
  const awayRecord = searchParams.get('awayRecord') || ''
  const homePolyOdds = parseFloat(searchParams.get('homeOdds') || '0') // 0-1
  const awayPolyOdds = parseFloat(searchParams.get('awayOdds') || '0')
  const injuryHome = searchParams.get('injHome') || 'none'
  const injuryAway = searchParams.get('injAway') || 'none'

  if (!home || !away) {
    return NextResponse.json({ error: 'Missing home or away' }, { status: 400 })
  }

  try {
    const [homeGames, awayGames] = await Promise.all([
      fetchTeamRecentGames(home, 10),
      fetchTeamRecentGames(away, 10),
    ])

    const homeStreakData = calcStreak(homeGames)
    const awayStreakData = calcStreak(awayGames)
    const homeRest = calcRestDays(homeGames)
    const awayRest = calcRestDays(awayGames)

    // --- Factor calculations ---

    // 1. Record-based baseline (50% base + record adjustment)
    const homeRecordPct = parseWinPct(homeRecord)
    const awayRecordPct = parseWinPct(awayRecord)
    let homeEdge = 0.5

    // Blend record win% vs 50/50
    if (homeRecord && awayRecord) {
      homeEdge = (homeRecordPct + (1 - awayRecordPct)) / 2
    }

    // 2. Market baseline (blend with Polymarket if available)
    if (homePolyOdds > 0 && awayPolyOdds > 0) {
      homeEdge = homeEdge * 0.4 + homePolyOdds * 0.6
    }

    // 3. Home court advantage
    homeEdge += 0.03

    // 4. Streak factor (capped at ±5%)
    const homeStreakBoost = Math.min(5, Math.max(-5, homeStreakData.streak)) * 0.01
    const awayStreakPenalty = Math.min(5, Math.max(-5, awayStreakData.streak)) * 0.01
    homeEdge += homeStreakBoost - awayStreakPenalty * 0.5

    // 5. Rest advantage
    const restDiff = homeRest - awayRest
    if (restDiff >= 1) homeEdge += 0.02
    else if (restDiff <= -1) homeEdge -= 0.02
    // B2B penalty
    if (homeRest === 0) homeEdge -= 0.04
    if (awayRest === 0) homeEdge += 0.04

    // 6. Injury impact
    const injPenalty = (inj: string) => inj === 'major' ? 0.08 : inj === 'minor' ? 0.03 : 0
    homeEdge -= injPenalty(injuryHome)
    homeEdge += injPenalty(injuryAway)

    // Clamp
    homeEdge = Math.min(0.88, Math.max(0.12, homeEdge))
    const awayEdge = 1 - homeEdge

    // Confidence: how far from 50/50
    const deviation = Math.abs(homeEdge - 0.5)
    const confidence = Math.round(50 + deviation * 100)

    // Recommendation
    let recommendation: 'home' | 'away' | 'pass' = 'pass'
    if (homeEdge >= 0.55) recommendation = 'home'
    else if (awayEdge >= 0.55) recommendation = 'away'

    // Factors
    const factors = {
      streak: Math.abs(homeStreakBoost) + Math.abs(awayStreakPenalty),
      rest: Math.abs(homeRest - awayRest) > 0 ? 0.4 : 0,
      injury: injPenalty(injuryHome) + injPenalty(injuryAway),
      homeCourtAdv: 0.03,
    }

    // Build notes
    const notes: string[] = []
    if (homeStreakData.streak >= 3) notes.push(`${home} on ${homeStreakData.label} streak`)
    if (awayStreakData.streak >= 3) notes.push(`${away} on ${awayStreakData.label} streak`)
    if (homeRest === 0) notes.push(`${home} B2B fatigue risk`)
    if (awayRest === 0) notes.push(`${away} B2B fatigue risk`)
    if (injuryHome === 'major') notes.push(`${home} injury concern`)
    if (injuryAway === 'major') notes.push(`${away} injury concern`)
    if (!notes.length) notes.push('No strong edge signals detected')

    return NextResponse.json({
      homeWinPct: Math.round(homeEdge * 100),
      awayWinPct: Math.round(awayEdge * 100),
      confidence,
      recommendation,
      recommendedTeam: recommendation === 'home' ? home : recommendation === 'away' ? away : null,
      factors,
      notes: notes.join(' · '),
      homeStreak: homeStreakData.label,
      awayStreak: awayStreakData.label,
      homeRest,
      awayRest,
    })
  } catch (err) {
    console.error('Predictions error:', err)
    return NextResponse.json({ error: 'Prediction failed' }, { status: 500 })
  }
}
