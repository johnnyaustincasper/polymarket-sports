import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export interface StarterPlayer {
  id?: string
  name: string
  position: string
  jersey: string
  hitRatio?: string
  rbi?: string
  avg?: string
  era?: string
  whip?: string
  strikeouts?: string
  form7?: string
  form20?: string
}

export interface LineupsResponse {
  home: StarterPlayer[]
  away: StarterPlayer[]
  homeTeam: string
  awayTeam: string
  available: boolean
  homePitcher?: StarterPlayer | null
  awayPitcher?: StarterPlayer | null
  homeSource?: string
  awaySource?: string
  homeSourceGame?: string
  awaySourceGame?: string
}

const statAt = (labels: string[], stats: any[], label: string) => {
  const idx = labels.findIndex(x => x === label)
  return idx >= 0 ? String(stats?.[idx] ?? '') : ''
}

async function fetchEspnJson(url: string, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json()
}

function parseMlbSummary(data: any) {
  const competitors: any[] = data.header?.competitions?.[0]?.competitors || []
  const homeComp = competitors.find((c: any) => c.homeAway === 'home')
  const awayComp = competitors.find((c: any) => c.homeAway === 'away')
  const homeAbbr = homeComp?.team?.abbreviation?.toUpperCase() || ''
  const awayAbbr = awayComp?.team?.abbreviation?.toUpperCase() || ''
  const homeId = homeComp?.team?.id ? String(homeComp.team.id) : ''
  const awayId = awayComp?.team?.id ? String(awayComp.team.id) : ''
  const eventName = data.header?.name || data.header?.shortName || ''

  const home: StarterPlayer[] = []
  const away: StarterPlayer[] = []
  let homePitcher: StarterPlayer | null = null
  let awayPitcher: StarterPlayer | null = null

  for (const group of (data.boxscore?.players || [])) {
    const teamAbbr = group.team?.abbreviation?.toUpperCase() || ''
    const isHome = teamAbbr === homeAbbr
    for (const statGroup of (group.statistics || [])) {
      const labels = (statGroup.labels || []).map((x: string) => String(x).toUpperCase())
      const isMlbBatting = labels.includes('H-AB')
      const isMlbPitching = labels.includes('IP') && labels.includes('ERA')
      if (!isMlbBatting && !isMlbPitching) continue
      for (const entry of (statGroup.athletes || [])) {
        if (!entry.starter) continue
        const ath = entry.athlete || {}
        const player: StarterPlayer = {
          id: ath.id || '',
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
        player.hitRatio = statAt(labels, entry.stats || [], 'H-AB')
        player.rbi = statAt(labels, entry.stats || [], 'RBI')
        player.avg = statAt(labels, entry.stats || [], 'AVG')
        if (isHome) home.push(player)
        else away.push(player)
      }
    }
  }

  return { home, away, homeTeam: homeAbbr, awayTeam: awayAbbr, homeId, awayId, homePitcher, awayPitcher, eventName }
}

async function findPreviousCompletedEventId(teamId: string, currentEventId: string) {
  if (!teamId) return ''
  const schedule = await fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${teamId}/schedule`, 8000)
  const events: any[] = schedule?.events || []
  const now = Date.now()
  const previous = events
    .filter((event: any) => String(event.id) !== String(currentEventId))
    .filter((event: any) => new Date(event.date).getTime() <= now)
    .filter((event: any) => event.competitions?.[0]?.status?.type?.completed && event.competitions?.[0]?.boxscoreAvailable)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
  return previous?.id ? String(previous.id) : ''
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const eventId = searchParams.get('eventId')
  const sport = (searchParams.get('sport') || 'nba').toLowerCase()
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })

  try {
    const leaguePath = sport === 'mlb' ? 'baseball/mlb' : 'basketball/nba'
    const data = await fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/summary?event=${eventId}`, 8000)
    if (!data) return NextResponse.json({ home: [], away: [], homeTeam: '', awayTeam: '', available: false })
    const season = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 4)
    const parsed = sport === 'mlb'
      ? parseMlbSummary(data)
      : { home: [], away: [], homeTeam: '', awayTeam: '', homeId: '', awayId: '', homePitcher: null, awayPitcher: null, eventName: '' }
    let { home, away, homeTeam: homeAbbr, awayTeam: awayAbbr, homePitcher, awayPitcher } = parsed
    let homeSource = home.length || homePitcher ? 'current' : ''
    let awaySource = away.length || awayPitcher ? 'current' : ''
    let homeSourceGame = ''
    let awaySourceGame = ''

    if (sport === 'mlb' && (!home.length || !away.length || !homePitcher || !awayPitcher)) {
      const fillPreviousSide = async (side: 'home' | 'away') => {
        const teamId = side === 'home' ? parsed.homeId : parsed.awayId
        const teamAbbr = side === 'home' ? parsed.homeTeam : parsed.awayTeam
        const previousId = await findPreviousCompletedEventId(teamId, eventId)
        if (!previousId) return
        const previousSummary = await fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${previousId}`, 8000)
        if (!previousSummary) return
        const previous = parseMlbSummary(previousSummary)
        const previousIsHome = previous.homeTeam === teamAbbr
        const previousPlayers = previousIsHome ? previous.home : previous.away
        const previousPitcher = previousIsHome ? previous.homePitcher : previous.awayPitcher
        if (side === 'home') {
          if (!home.length) home = previousPlayers
          if (!homePitcher) homePitcher = previousPitcher
          homeSource = 'previous'
          homeSourceGame = previous.eventName
        } else {
          if (!away.length) away = previousPlayers
          if (!awayPitcher) awayPitcher = previousPitcher
          awaySource = 'previous'
          awaySourceGame = previous.eventName
        }
      }
      await Promise.all([
        (!home.length || !homePitcher) ? fillPreviousSide('home') : Promise.resolve(),
        (!away.length || !awayPitcher) ? fillPreviousSide('away') : Promise.resolve(),
      ])
    }

    if (sport === 'mlb') {
      const enrich = async (player: StarterPlayer, category: 'batting' | 'pitching') => {
        if (!player.id) return player
        try {
          const logRes = await fetch(
            `https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${player.id}/gamelog?season=${season}&category=${category}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000), cache: 'no-store' }
          )
          if (!logRes.ok) return player
          const log = await logRes.json()
          const labels: string[] = (log.labels || []).map((x: string) => String(x).toUpperCase())
          const events = (log.seasonTypes || []).flatMap((st: any) => (st.categories || []).flatMap((cat: any) => cat.events || []))
          const seen = new Set<string>()
          const rows = events.filter((event: any) => {
            const id = event.eventId || JSON.stringify(event.stats || [])
            if (seen.has(id)) return false
            seen.add(id)
            return Array.isArray(event.stats)
          })
          const stat = (row: any, label: string) => {
            const idx = labels.findIndex(x => x === label)
            return idx >= 0 ? row.stats?.[idx] : undefined
          }
          const inningsToFloat = (value: any) => {
            const s = String(value || '0')
            const [whole, part] = s.split('.')
            return Number(whole || 0) + (part === '1' ? 1 / 3 : part === '2' ? 2 / 3 : 0)
          }
          const summarizeBatting = (n: number) => {
            const slice = rows.slice(0, n)
            const ab = slice.reduce((sum: number, row: any) => sum + Number(stat(row, 'AB') || 0), 0)
            const h = slice.reduce((sum: number, row: any) => sum + Number(stat(row, 'H') || 0), 0)
            const rbi = slice.reduce((sum: number, row: any) => sum + Number(stat(row, 'RBI') || 0), 0)
            if (!ab) return ''
            return `.${String(Math.round((h / ab) * 1000)).padStart(3, '0')} · ${h}/${ab} · ${rbi} RBI`
          }
          const summarizePitching = (n: number) => {
            const slice = rows.slice(0, n)
            const ip = slice.reduce((sum: number, row: any) => sum + inningsToFloat(stat(row, 'IP')), 0)
            const er = slice.reduce((sum: number, row: any) => sum + Number(stat(row, 'ER') || 0), 0)
            const k = slice.reduce((sum: number, row: any) => sum + Number(stat(row, 'K') || 0), 0)
            if (!ip) return ''
            return `ERA ${((er * 9) / ip).toFixed(2)} · ${k} K`
          }
          player.form7 = category === 'pitching' ? summarizePitching(7) : summarizeBatting(7)
          player.form20 = category === 'pitching' ? summarizePitching(20) : summarizeBatting(20)
        } catch {}
        return player
      }
      await Promise.all([
        ...away.map(p => enrich(p, 'batting')),
        ...home.map(p => enrich(p, 'batting')),
        awayPitcher ? enrich(awayPitcher, 'pitching') : Promise.resolve(null),
        homePitcher ? enrich(homePitcher, 'pitching') : Promise.resolve(null),
      ])
    }

    const available = home.length > 0 || away.length > 0 || Boolean(homePitcher || awayPitcher)
    return NextResponse.json({ home, away, homeTeam: homeAbbr, awayTeam: awayAbbr, homePitcher, awayPitcher, available, homeSource, awaySource, homeSourceGame, awaySourceGame })
  } catch {
    return NextResponse.json({ home: [], away: [], homeTeam: '', awayTeam: '', available: false })
  }
}
