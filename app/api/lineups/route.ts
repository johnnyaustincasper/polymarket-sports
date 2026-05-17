import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export interface StarterPlayer {
  name: string
  position: string
  jersey: string
  hitRatio?: string
  rbi?: string
  avg?: string
  era?: string
  whip?: string
  strikeouts?: string
}

export interface LineupsResponse {
  home: StarterPlayer[]
  away: StarterPlayer[]
  homeTeam: string
  awayTeam: string
  available: boolean
  homePitcher?: StarterPlayer | null
  awayPitcher?: StarterPlayer | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const eventId = searchParams.get('eventId')
  const sport = (searchParams.get('sport') || 'nba').toLowerCase()
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })

  try {
    const leaguePath = sport === 'mlb' ? 'baseball/mlb' : 'basketball/nba'
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/summary?event=${eventId}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000), cache: 'no-store' }
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
    let homePitcher: StarterPlayer | null = null
    let awayPitcher: StarterPlayer | null = null
    const statAt = (labels: string[], stats: any[], label: string) => {
      const idx = labels.findIndex(x => x === label)
      return idx >= 0 ? String(stats?.[idx] ?? '') : ''
    }

    for (const group of playerGroups) {
      const teamAbbr = group.team?.abbreviation?.toUpperCase() || ''
      const isHome = teamAbbr === homeAbbr
      for (const statGroup of (group.statistics || [])) {
        const labels = (statGroup.labels || []).map((x: string) => String(x).toUpperCase())
        const isMlbBatting = sport === 'mlb' && labels.includes('H-AB')
        const isMlbPitching = sport === 'mlb' && labels.includes('IP') && labels.includes('ERA')
        if (sport === 'mlb' && !isMlbBatting && !isMlbPitching) continue
        for (const entry of (statGroup.athletes || [])) {
          if (!entry.starter) continue
          const ath = entry.athlete || {}
          const player: StarterPlayer = {
            name: ath.displayName || ath.shortName || 'Unknown',
            position: ath.position?.abbreviation || '?',
            jersey: ath.jersey || '?',
          }
          if (isMlbPitching) {
            player.era = statAt(labels, entry.stats || [], 'ERA')
            player.whip = statAt(labels, entry.stats || [], 'WHIP')
            player.strikeouts = statAt(labels, entry.stats || [], 'K')
            if (isHome && !homePitcher) homePitcher = player
            if (!isHome && !awayPitcher) awayPitcher = player
            continue
          }
          if (isMlbBatting) {
            player.hitRatio = statAt(labels, entry.stats || [], 'H-AB')
            player.rbi = statAt(labels, entry.stats || [], 'RBI')
            player.avg = statAt(labels, entry.stats || [], 'AVG')
          }
          if (isHome) home.push(player)
          else away.push(player)
        }
        if (sport !== 'mlb' && (isHome ? home : away).length > 0) break
      }
    }

    const available = home.length > 0 || away.length > 0 || Boolean(homePitcher || awayPitcher)
    return NextResponse.json({ home, away, homeTeam: homeAbbr, awayTeam: awayAbbr, homePitcher, awayPitcher, available })
  } catch {
    return NextResponse.json({ home: [], away: [], homeTeam: '', awayTeam: '', available: false })
  }
}
