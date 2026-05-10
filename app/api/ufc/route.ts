import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const GAMMA_API = 'https://gamma-api.polymarket.com'

// ─── Polymarket UFC odds ──────────────────────────────────────────────────────
export interface UFCPolyOdds {
  fighterAWin: number | null      // 0–1
  fighterBWin: number | null
  hasWinner: boolean
  totalLine: number | null        // e.g. 2.5
  overOdds: number | null
  underOdds: number | null
  hasTotal: boolean
  koTkoOdds: number | null        // prob fight ends by KO/TKO
  submissionOdds: number | null
  goDistanceOdds: number | null
  polyWinnerUrl: string | null
  polyTotalUrl: string | null
}

let _polyCache: { events: any[]; ts: number } | null = null
const POLY_TTL = 5 * 60 * 1000

async function fetchPolyUFCEvents(): Promise<any[]> {
  if (_polyCache && Date.now() - _polyCache.ts < POLY_TTL) return _polyCache.events
  try {
    const res = await fetch(`${GAMMA_API}/events?active=true&closed=false&tag_slug=ufc&limit=200`, {
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data: any[] = await res.json()
    _polyCache = { events: data, ts: Date.now() }
    return data
  } catch { return [] }
}

function normalizeName(n: string) {
  return n.toLowerCase().replace(/[^a-z]/g, '')
}

function safeArray<T = any>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch { return [] }
}

function toProb(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null
}

function getPolyOddsForFight(fighterA: string, fighterB: string, polyEvents: any[]): UFCPolyOdds {
  const def: UFCPolyOdds = {
    fighterAWin: null, fighterBWin: null, hasWinner: false,
    totalLine: null, overOdds: null, underOdds: null, hasTotal: false,
    koTkoOdds: null, submissionOdds: null, goDistanceOdds: null,
    polyWinnerUrl: null, polyTotalUrl: null,
  }

  const nA = normalizeName(fighterA)
  const nB = normalizeName(fighterB)

  // Match Polymarket event by checking if both fighter names appear in the title
  const event = polyEvents.find(e => {
    const t = normalizeName(e.title || '')
    // Need at least a significant portion of each name to match
    const aLast = nA.slice(Math.max(0, nA.length - 6))
    const bLast = nB.slice(Math.max(0, nB.length - 6))
    return t.includes(aLast) && t.includes(bLast)
  })
  if (!event) return def

  const markets: any[] = event.markets || []
  const result = { ...def }

  // Winner market: outcomes are fighter names
  const winnerMkt = markets.find(m => {
    const outcomes = safeArray<string>(m.outcomes)
    return outcomes.length === 2 && outcomes.every((o: string) => {
      const on = normalizeName(o)
      const aLast = nA.slice(Math.max(0, nA.length - 5))
      const bLast = nB.slice(Math.max(0, nB.length - 5))
      return on.includes(aLast) || on.includes(bLast)
    })
  })
  if (winnerMkt) {
    const outcomes = safeArray<string>(winnerMkt.outcomes)
    const prices = safeArray<unknown>(winnerMkt.outcomePrices)
    const aLast = nA.slice(Math.max(0, nA.length - 5))
    const bLast = nB.slice(Math.max(0, nB.length - 5))
    const idxA = outcomes.findIndex((o: string) => normalizeName(o).includes(aLast))
    const idxB = outcomes.findIndex((o: string) => normalizeName(o).includes(bLast))
    if (idxA >= 0 && idxB >= 0 && idxA !== idxB) {
      result.fighterAWin = toProb(prices[idxA])
      result.fighterBWin = toProb(prices[idxB])
      result.hasWinner = result.fighterAWin !== null && result.fighterBWin !== null
      result.polyWinnerUrl = winnerMkt.slug ? `https://polymarket.com/event/${winnerMkt.slug}` : null
    }
  }

  // Best O/U total market (prefer 2.5)
  const totalMkts = markets
    .filter(m => (m.question || '').startsWith('O/U'))
    .sort((a, b) => {
      const lineA = parseFloat((a.question || '').match(/(\d+\.?\d*)/)?.[1] || '0')
      const lineB = parseFloat((b.question || '').match(/(\d+\.?\d*)/)?.[1] || '0')
      return Math.abs(lineA - 2.5) - Math.abs(lineB - 2.5) // prefer closest to 2.5
    })
  const bestTotal = totalMkts[0]
  if (bestTotal) {
    const line = parseFloat((bestTotal.question || '').match(/(\d+\.?\d*)/)?.[1] || '0')
    const prices = safeArray<unknown>(bestTotal.outcomePrices)
    const outcomes = safeArray<string>(bestTotal.outcomes)
    const overIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'over')
    result.totalLine = line
    result.overOdds = toProb(prices[overIdx >= 0 ? overIdx : 0])
    result.underOdds = toProb(prices[overIdx === 0 ? 1 : 0])
    result.hasTotal = result.totalLine !== null && result.overOdds !== null && result.underOdds !== null
    result.polyTotalUrl = bestTotal.slug ? `https://polymarket.com/event/${bestTotal.slug}` : null
  }

  // KO/TKO market
  const koMkt = markets.find(m => {
    const q = (m.question || '').toLowerCase()
    return q.includes('ko or tko') && !q.includes('will ') // overall KO/TKO, not per-fighter
  })
  if (koMkt) {
    const outcomes = safeArray<string>(koMkt.outcomes)
    const prices = safeArray<unknown>(koMkt.outcomePrices)
    const yesIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'yes')
    result.koTkoOdds = toProb(prices[yesIdx >= 0 ? yesIdx : 0])
  }

  // Submission market
  const subMkt = markets.find(m => (m.question || '').toLowerCase().includes('by submission'))
  if (subMkt) {
    const outcomes = safeArray<string>(subMkt.outcomes)
    const prices = safeArray<unknown>(subMkt.outcomePrices)
    const yesIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'yes')
    result.submissionOdds = toProb(prices[yesIdx >= 0 ? yesIdx : 0])
  }

  // Go the distance
  const distMkt = markets.find(m => (m.question || '').toLowerCase().includes('go the distance'))
  if (distMkt) {
    const outcomes = safeArray<string>(distMkt.outcomes)
    const prices = safeArray<unknown>(distMkt.outcomePrices)
    const yesIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'yes')
    result.goDistanceOdds = toProb(prices[yesIdx >= 0 ? yesIdx : 0])
  }

  return result
}

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
  status: 'pre' | 'in' | 'post'
  statusDetail: string
  fighterA: UFCFighter
  fighterB: UFCFighter
  moneyLineA: number | null
  moneyLineB: number | null
  polyOdds: UFCPolyOdds
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

function parseEventFromScoreboard(ev: any, rankingsMap: Record<string, number>, polyEvents: any[] = []): UFCEvent {
  const id = String(ev.id || ev.uid || '')
  const name = ev.name || ev.shortName || 'UFC Event'
  const dateRaw = ev.date || ev.competitions?.[0]?.date || ''
  const date = dateRaw ? new Date(dateRaw).toISOString() : ''

  const venue = ev.competitions?.[0]?.venue?.fullName || ev.venue?.fullName || ev.venue?.name || ''
  const city = ev.competitions?.[0]?.venue?.address?.city || ev.venue?.address?.city || ''
  const state = ev.competitions?.[0]?.venue?.address?.state || ev.venue?.address?.state || ''
  const location = [city, state].filter(Boolean).join(', ')

  // Event status must come from event.status. Using competitions[0] is wrong during live cards
  // because early prelims may be final while the event itself is still in progress.
  const stateStr = ev.status?.type?.state || ev.competitions?.[0]?.status?.type?.state || 'pre'
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

    // ESPN orders competitions prelim-first, main event last — reverse for display
    const boutOrder = totalBouts - i   // 1 = main event (last ESPN index)
    const isMainEvent = boutOrder === 1

    const compState = comp?.status?.type?.state || 'pre'
    const fightStatus: UFCFight['status'] = compState === 'in' ? 'in' : compState === 'post' ? 'post' : 'pre'
    const statusDetail = comp?.status?.type?.shortDetail || comp?.status?.type?.detail || comp?.status?.type?.description || ''
    const isCompleted = comp?.status?.type?.completed || fightStatus === 'post'

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

    const polyOdds = getPolyOddsForFight(fighterA.name, fighterB.name, polyEvents)

    fights.push({
      id: String(comp?.id || i),
      boutOrder,
      isMainEvent,
      weightClass: String(weightClass),
      isTitleFight: Boolean(isTitleFight),
      status: fightStatus,
      statusDetail,
      fighterA,
      fighterB,
      moneyLineA,
      moneyLineB,
      polyOdds,
      result,
    })
  }

  // Keep the official card order: main event → co-main → main-card/prelim bouts.
  // Do not promote live/completed prelims above the main event; that makes the card look wrong.
  fights.sort((a, b) => a.boutOrder - b.boutOrder)

  return { id, name, date, venue, location, status, fights }
}

async function fetchUFCEvents(): Promise<UFCEvent[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.events
  }

  const [rankingsMap, polyEvents] = await Promise.all([fetchRankingsMap(), fetchPolyUFCEvents()])

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
      events.push(parseEventFromScoreboard(ev, rankingsMap, polyEvents))
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
        events.push(parseEventFromScoreboard(ev, rankingsMap, polyEvents))
      }
    }
  }

  // Keep live/upcoming cards ahead of completed cards so the UFC panel opens
  // on the next actionable event instead of yesterday's final card.
  const statusRank: Record<UFCEvent['status'], number> = { in: 0, pre: 1, post: 2 }
  events.sort((a, b) => (statusRank[a.status] - statusRank[b.status]) || (new Date(a.date).getTime() - new Date(b.date).getTime()))

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
