import { NextResponse } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UFCFighter {
  id: string
  name: string
  record: string
  ranking: number | null
  country: string
  age: number | null
  height: string
  reach: string
  strikingAccuracy: number | null
  takedownAccuracy: number | null
  recentForm: string[]
}

export interface UFCFight {
  id: string
  boutOrder: number
  isMainEvent: boolean
  weightClass: string
  isTitleFight: boolean
  fighterA: UFCFighter
  fighterB: UFCFighter
  moneyLineA: number | null
  moneyLineB: number | null
  result?: { winner: string; method: string; round: number; time: string }
}

export interface UFCEvent {
  id: string
  name: string
  date: string
  venue: string
  location: string
  status: 'pre' | 'in' | 'post'
  fights: UFCFight[]
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
let _cache: { events: UFCEvent[]; ts: number } | null = null
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

const TIMEOUT = 10000

async function safeFetch(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(TIMEOUT),
      next: { revalidate: 600 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function flagEmoji(country: string): string {
  if (!country) return '🌐'
  const map: Record<string, string> = {
    'United States': '🇺🇸', 'USA': '🇺🇸', 'US': '🇺🇸',
    'Brazil': '🇧🇷', 'Russia': '🇷🇺',
    'Mexico': '🇲🇽', 'Ireland': '🇮🇪', 'United Kingdom': '🇬🇧', 'UK': '🇬🇧',
    'Nigeria': '🇳🇬', 'Cameroon': '🇨🇲', 'China': '🇨🇳', 'Australia': '🇦🇺',
    'Canada': '🇨🇦', 'New Zealand': '🇳🇿', 'France': '🇫🇷', 'Georgia': '🇬🇪',
    'Poland': '🇵🇱', 'Czech Republic': '🇨🇿', 'Netherlands': '🇳🇱',
    'Germany': '🇩🇪', 'Sweden': '🇸🇪', 'Ukraine': '🇺🇦', 'Jamaica': '🇯🇲',
    'Colombia': '🇨🇴', 'Peru': '🇵🇪', 'Venezuela': '🇻🇪', 'Argentina': '🇦🇷',
    'Japan': '🇯🇵', 'South Korea': '🇰🇷', 'Korea': '🇰🇷', 'Thailand': '🇹🇭',
    'Philippines': '🇵🇭', 'Kyrgyzstan': '🇰🇬', 'Kazakhstan': '🇰🇿',
    'Dagestan': '🇷🇺', 'Azerbaijan': '🇦🇿', 'Serbia': '🇷🇸', 'Romania': '🇷🇴',
  }
  return map[country] || '🌐'
}

function parseFighter(competitor: any, rankingsMap: Record<string, number>): UFCFighter {
  const athlete = competitor?.athlete || {}

  // Record: ESPN puts it in competitor.records[0].summary e.g. "17-7-1"
  const recordSummary =
    competitor?.records?.find((r: any) => r.type === 'total' || r.name === 'overall')?.summary ||
    competitor?.records?.[0]?.summary ||
    athlete?.record ||
    ''

  // Country: ESPN puts it in competitor.athlete.flag.alt
  const country =
    athlete?.flag?.alt ||
    athlete?.citizenship ||
    athlete?.birthPlace?.country ||
    ''

  const height = athlete?.displayHeight || athlete?.height || ''
  const reach = athlete?.reach ? `${athlete.reach}"` : ''
  const age = athlete?.age || (athlete?.dateOfBirth
    ? Math.floor((Date.now() - new Date(athlete.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null)

  const name = athlete?.displayName || athlete?.fullName || 'TBA'
  // ESPN puts athlete ID directly on competitor.id
  const id = String(competitor?.id || athlete?.id || athlete?.uid || Math.random())

  return {
    id,
    name,
    record: typeof recordSummary === 'string' ? recordSummary : '',
    ranking: rankingsMap[id] ?? null,
    country: flagEmoji(country),
    age: typeof age === 'number' ? age : null,
    height: String(height),
    reach: String(reach),
    strikingAccuracy: null,
    takedownAccuracy: null,
    recentForm: [],
  }
}

async function fetchRankingsMap(): Promise<Record<string, number>> {
  const data = await safeFetch('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/rankings')
  if (!data) return {}
  const map: Record<string, number> = {}
  const groups: any[] = data.rankings || []
  for (const group of groups) {
    const ranks: any[] = group.ranks || []
    for (const rank of ranks) {
      const id = String(rank.athlete?.id || rank.athlete?.uid || '')
      if (id) map[id] = rank.current || rank.rank || 0
    }
  }
  return map
}

function parseEventFromScoreboard(ev: any, rankingsMap: Record<string, number>): UFCEvent {
  const id = String(ev.id || ev.uid || '')
  const name = ev.name || ev.shortName || 'UFC Event'
  const dateRaw = ev.date || ev.competitions?.[0]?.date || ''
  const date = dateRaw ? new Date(dateRaw).toISOString() : ''

  const venue = ev.competitions?.[0]?.venue?.fullName || ev.venue?.fullName || ev.venue?.name || ''
  const city = ev.competitions?.[0]?.venue?.address?.city || ev.venue?.address?.city || ''
  const state = ev.competitions?.[0]?.venue?.address?.state || ev.venue?.address?.state || ''
  const location = [city, state].filter(Boolean).join(', ')

  const stateStr = ev.competitions?.[0]?.status?.type?.state || ev.status?.type?.state || 'pre'
  const status: UFCEvent['status'] =
    stateStr === 'in' ? 'in' : stateStr === 'post' ? 'post' : 'pre'

  // Fights come directly from event.competitions — no separate summary fetch needed
  const competitions: any[] = ev.competitions || []
  const totalBouts = competitions.length
  const fights: UFCFight[] = []

  for (let i = 0; i < competitions.length; i++) {
    const comp = competitions[i]
    const competitors: any[] = comp?.competitors || []
    if (competitors.length < 2) continue

    // ESPN orders competitions main-event-first (index 0 = main event)
    const boutOrder = i + 1
    const isMainEvent = boutOrder === 1

    const isCompleted = comp?.status?.type?.completed || false

    // Weight class from competition type
    const weightClass = comp?.type?.text || comp?.type?.abbreviation || comp?.name || 'Unknown'
    const isTitleFight = weightClass?.toLowerCase().includes('title') || false

    const fighterA = parseFighter(competitors[0], rankingsMap)
    const fighterB = parseFighter(competitors[1], rankingsMap)

    // Parse moneyline odds from ESPN's odds array
    let moneyLineA: number | null = null
    let moneyLineB: number | null = null
    const oddsArr: any[] = comp?.odds || []
    if (oddsArr.length > 0) {
      const oddsEntry = oddsArr[0]
      const rawHome = oddsEntry?.homeMoneyLine ?? oddsEntry?.homeTeamOdds?.moneyLine ?? null
      const rawAway = oddsEntry?.awayMoneyLine ?? oddsEntry?.awayTeamOdds?.moneyLine ?? null
      if (rawHome !== null && rawHome !== undefined) moneyLineA = Number(rawHome)
      if (rawAway !== null && rawAway !== undefined) moneyLineB = Number(rawAway)
    }

    let result: UFCFight['result'] | undefined
    if (isCompleted) {
      const winner = competitors.find((c: any) => c.winner)
      if (winner) {
        const method = comp?.notes?.[0]?.text || 'Decision'
        const round = comp?.completedRound || 0
        const time = comp?.completedTime || ''
        result = {
          winner: winner.athlete?.displayName || winner.athlete?.fullName || 'Unknown',
          method,
          round,
          time,
        }
      }
    }

    fights.push({
      id: String(comp?.id || i),
      boutOrder,
      isMainEvent,
      weightClass: String(weightClass),
      isTitleFight: Boolean(isTitleFight),
      fighterA,
      fighterB,
      moneyLineA,
      moneyLineB,
      result,
    })
  }

  // Sort: main event first (boutOrder 1), then co-main, etc.
  fights.sort((a, b) => a.boutOrder - b.boutOrder)

  // Fix isMainEvent — first fight in sorted order is main event
  if (fights.length > 0) {
    fights[0].isMainEvent = true
    for (let i = 1; i < fights.length; i++) fights[i].isMainEvent = false
  }

  return { id, name, date, venue, location, status, fights }
}

async function fetchUFCEvents(): Promise<UFCEvent[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.events
  }

  const rankingsMap = await fetchRankingsMap()

  // Get the calendar from scoreboard to find upcoming event dates
  const baseScoreboard = await safeFetch('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard')
  if (!baseScoreboard) return []

  // Extract upcoming event dates from calendar
  const calendar: any[] = baseScoreboard.leagues?.[0]?.calendar || []
  const now = Date.now()

  // Get dates for upcoming events (next 6)
  const upcomingDates: string[] = []
  for (const cal of calendar) {
    const dt = new Date(cal.startDate).getTime()
    if (dt >= now - 24 * 60 * 60 * 1000) { // include today
      const d = new Date(cal.startDate)
      const dateStr = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
      upcomingDates.push(dateStr)
      if (upcomingDates.length >= 6) break
    }
  }

  // Fetch scoreboard for each date (deduplicated by event ID)
  const seenIds = new Set<string>()
  const events: UFCEvent[] = []

  // Always include current scoreboard events first
  const currentEvents: any[] = baseScoreboard.events || []
  for (const ev of currentEvents) {
    const eid = String(ev.id || '')
    if (eid && !seenIds.has(eid)) {
      seenIds.add(eid)
      events.push(parseEventFromScoreboard(ev, rankingsMap))
    }
  }

  // Fetch each upcoming date
  const dateBoards = await Promise.all(
    upcomingDates.map(dateStr =>
      safeFetch(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${dateStr}`)
    )
  )

  for (const board of dateBoards) {
    if (!board) continue
    const evts: any[] = board.events || []
    for (const ev of evts) {
      const eid = String(ev.id || '')
      if (eid && !seenIds.has(eid)) {
        seenIds.add(eid)
        events.push(parseEventFromScoreboard(ev, rankingsMap))
      }
    }
  }

  // Sort by date
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const result = events.slice(0, 6)
  _cache = { events: result, ts: Date.now() }
  return result
}

export async function GET() {
  try {
    const events = await fetchUFCEvents()
    return NextResponse.json(events)
  } catch (err) {
    console.error('UFC API error:', err)
    return NextResponse.json([], { status: 200 })
  }
}
