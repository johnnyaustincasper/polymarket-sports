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
    'United States': '🇺🇸', 'USA': '🇺🇸', 'Brazil': '🇧🇷', 'Russia': '🇷🇺',
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
  const athlete = competitor?.athlete || competitor || {}
  const stats = athlete?.statistics || athlete?.stats || []

  const getStat = (name: string): number | null => {
    const s = stats.find((x: any) =>
      x.name?.toLowerCase().includes(name.toLowerCase()) ||
      x.displayName?.toLowerCase().includes(name.toLowerCase())
    )
    return s ? parseFloat(s.displayValue || s.value) || null : null
  }

  const record = athlete?.record || ''
  const country = athlete?.citizenship || athlete?.birthPlace?.country || ''
  const height = athlete?.displayHeight || athlete?.height || ''
  const reach = athlete?.reach ? `${athlete.reach}"` : ''
  const age = athlete?.age || (athlete?.dateOfBirth
    ? Math.floor((Date.now() - new Date(athlete.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null)

  // striking/takedown accuracy from stats
  let strikingAccuracy: number | null = getStat('striking accuracy') || getStat('Striking Accuracy') || getStat('sig. str. acc') || null
  let takedownAccuracy: number | null = getStat('takedown accuracy') || getStat('Takedown Accuracy') || null

  // Convert to percentage if decimal
  if (strikingAccuracy !== null && strikingAccuracy <= 1) strikingAccuracy = Math.round(strikingAccuracy * 100)
  if (takedownAccuracy !== null && takedownAccuracy <= 1) takedownAccuracy = Math.round(takedownAccuracy * 100)

  const name = athlete?.displayName || athlete?.fullName || 'TBA'
  const id = String(athlete?.id || athlete?.uid || Math.random())

  return {
    id,
    name,
    record: typeof record === 'string' ? record : `${record?.wins || 0}-${record?.losses || 0}-${record?.draws || 0}`,
    ranking: rankingsMap[id] ?? null,
    country: flagEmoji(country),
    age: typeof age === 'number' ? age : null,
    height: String(height),
    reach: String(reach),
    strikingAccuracy,
    takedownAccuracy,
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

async function fetchEventDetail(eventId: string, rankingsMap: Record<string, number>): Promise<UFCFight[]> {
  const data = await safeFetch(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/summary?event=${eventId}`)
  if (!data) return []

  const fights: UFCFight[] = []
  const bouts: any[] = data.fightCard || data.fights || data.competitions || []
  const totalBouts = bouts.length

  for (let i = 0; i < bouts.length; i++) {
    const bout = bouts[i]
    const comp = bout.competition || bout
    const competitors: any[] = comp?.competitors || bout?.competitors || []

    if (competitors.length < 2) continue

    const boutOrder = totalBouts - i // main event = 1, prelims = higher
    const isMainEvent = boutOrder === 1

    const status = comp?.status?.type?.state || bout?.status?.type?.state || 'pre'
    const isCompleted = comp?.status?.type?.completed || bout?.status?.type?.completed || false

    // Weight class
    const weightClass = bout?.weightClass || comp?.type?.text || bout?.name || 'Unknown'
    const isTitleFight = (weightClass?.toLowerCase().includes('title') ||
      bout?.titleFight || comp?.titleFight || false)

    const fighterA = parseFighter(competitors[0], rankingsMap)
    const fighterB = parseFighter(competitors[1], rankingsMap)

    let result: UFCFight['result'] | undefined
    if (isCompleted) {
      const winner = competitors.find((c: any) => c.winner)
      const loser = competitors.find((c: any) => !c.winner)
      if (winner && loser) {
        const method = bout?.winningMethod || comp?.notes?.[0]?.text || 'Decision'
        const round = bout?.completedRound || comp?.completedRound || 0
        const time = bout?.completedTime || comp?.completedTime || ''
        result = {
          winner: winner.athlete?.displayName || winner.athlete?.fullName || 'Unknown',
          method,
          round,
          time,
        }
      }
    }

    fights.push({
      id: String(comp?.id || bout?.id || i),
      boutOrder,
      isMainEvent,
      weightClass: String(weightClass),
      isTitleFight: Boolean(isTitleFight),
      fighterA,
      fighterB,
      result,
    })
  }

  return fights
}

async function fetchUFCEvents(): Promise<UFCEvent[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.events
  }

  const [scoreboard, rankingsMap] = await Promise.all([
    safeFetch('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard'),
    fetchRankingsMap(),
  ])

  if (!scoreboard) return []

  const rawEvents: any[] = scoreboard.events || scoreboard.leagues?.[0]?.events || []

  const events: UFCEvent[] = []

  for (const ev of rawEvents.slice(0, 6)) {
    const id = String(ev.id || ev.uid || '')
    if (!id) continue

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

    const fights = await fetchEventDetail(id, rankingsMap)

    events.push({ id, name, date, venue, location, status, fights })
  }

  _cache = { events, ts: Date.now() }
  return events
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
