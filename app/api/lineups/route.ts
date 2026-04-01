import { NextRequest, NextResponse } from 'next/server'

export interface StarterPlayer {
  name: string
  position: string
  jersey: string
}

export interface LineupsResponse {
  home: StarterPlayer[]
  away: StarterPlayer[]
  homeTeam: string
  awayTeam: string
  available: boolean
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const eventId = searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000), next: { revalidate: 120 } }
    )
    if (!res.ok) return NextResponse.json({ home: [], away: [], homeTeam: '', awayTeam: '', available: false })
    const data = await res.json()

    // Team names from header
    const competitors: any[] = data.header?.competitions?.[0]?.competitors || []
    const homeComp = competitors.find((c: any) => c.homeAway === 'home')
    const awayComp = competitors.find((c: any) => c.homeAway === 'away')
    const homeAbbr = homeComp?.team?.abbreviation?.toUpperCase() || ''
    const awayAbbr = awayComp?.team?.abbreviation?.toUpperCase() || ''

    // Lineups from boxscore.players
    const playerGroups: any[] = data.boxscore?.players || []
    const home: StarterPlayer[] = []
    const away: StarterPlayer[] = []

    for (const group of playerGroups) {
      const teamAbbr = group.team?.abbreviation?.toUpperCase() || ''
      const isHome = teamAbbr === homeAbbr
      for (const statGroup of (group.statistics || [])) {
        for (const entry of (statGroup.athletes || [])) {
          if (!entry.starter) continue
          const ath = entry.athlete || {}
          const player: StarterPlayer = {
            name: ath.displayName || ath.shortName || 'Unknown',
            position: ath.position?.abbreviation || '?',
            jersey: ath.jersey || '?',
          }
          if (isHome) home.push(player)
          else away.push(player)
        }
        if ((isHome ? home : away).length > 0) break
      }
    }

    const available = home.length > 0 || away.length > 0
    return NextResponse.json({ home, away, homeTeam: homeAbbr, awayTeam: awayAbbr, available })
  } catch {
    return NextResponse.json({ home: [], away: [], homeTeam: '', awayTeam: '', available: false })
  }
}
