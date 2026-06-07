import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/app/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const GAMMA_API = 'https://gamma-api.polymarket.com'

type SportKey = 'nba' | 'ncaab' | 'nfl' | 'ncaaf' | 'mlb' | 'nhl'

const SPORTS: Record<SportKey, {
  leaguePath: string
  polyTags: string[]
  label: string
  eventWords: string[]
}> = {
  nba:   { leaguePath: 'basketball/nba', label: 'NBA', eventWords: ['nba', 'basketball'] , polyTags: ['nba'] },
  ncaab: { leaguePath: 'basketball/mens-college-basketball', label: 'NCAAB', eventWords: ['college basketball', 'march madness', 'ncaab'], polyTags: ['march-madness', 'ncaa-basketball', 'ncaab'] },
  nfl:   { leaguePath: 'football/nfl', label: 'NFL', eventWords: ['nfl', 'football'], polyTags: ['nfl', 'football'] },
  ncaaf: { leaguePath: 'football/college-football', label: 'NCAAF', eventWords: ['college football', 'ncaaf'], polyTags: ['college-football', 'ncaaf'] },
  mlb:   { leaguePath: 'baseball/mlb', label: 'MLB', eventWords: ['mlb', 'baseball', 'major league baseball'], polyTags: ['mlb', 'baseball'] },
  nhl:   { leaguePath: 'hockey/nhl', label: 'NHL', eventWords: ['nhl', 'hockey', 'stanley cup'], polyTags: ['nhl', 'hockey'] },
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

// ESPN abbreviation/name → Polymarket-friendly terms. Keep team nicknames first.
const PRO_TEAM_KEYWORDS: Record<string, string[]> = {
  CBJ: ['blue jackets', 'columbus blue jackets', 'columbus'], MTL: ['canadiens', 'montreal canadiens', 'montreal'],
  ANA: ['ducks', 'anaheim ducks', 'anaheim'], CGY: ['flames', 'calgary flames', 'calgary'], EDM: ['oilers', 'edmonton oilers', 'edmonton'],
  FLA: ['panthers', 'florida panthers', 'florida'], LAK: ['kings', 'los angeles kings'], NSH: ['predators', 'nashville predators', 'nashville'],
  NJD: ['devils', 'new jersey devils'], NYI: ['islanders', 'new york islanders'], NYR: ['rangers', 'new york rangers'],
  OTT: ['senators', 'ottawa senators', 'ottawa'], SEA_NHL: ['kraken', 'seattle kraken'], SJS: ['sharks', 'san jose sharks'], SJ: ['sharks', 'san jose sharks'],
  TBL: ['lightning', 'tampa bay lightning'], VAN: ['canucks', 'vancouver canucks', 'vancouver'], VGK: ['golden knights', 'vegas golden knights', 'las vegas golden knights'],
  WPG: ['jets', 'winnipeg jets', 'winnipeg'], UTAHHC: ['utah hockey club', 'utah mammoth', 'mammoth'],
  // MLB: include ESPN abbreviations plus common aliases so baseball does not collide with NBA/NFL city-only matches.
  ARI: ['diamondbacks', 'd backs', 'dbacks', 'arizona'], AZ: ['diamondbacks', 'd backs', 'dbacks', 'arizona'],
  ATH: ['athletics', 'a s', 'athletics baseball'], OAK: ['athletics', 'oakland athletics', 'a s'],
  CHC: ['cubs', 'chicago cubs'], CWS: ['white sox', 'chicago white sox'], CHW: ['white sox', 'chicago white sox'],
  COL: ['avalanche', 'colorado avalanche', 'rockies', 'colorado rockies'], KCR: ['royals', 'kansas city royals'], KCMLB: ['royals', 'kansas city royals'],
  LAA: ['angels', 'los angeles angels'], LAD: ['dodgers', 'los angeles dodgers'],
  NYM: ['mets', 'new york mets'], NYY: ['yankees', 'new york yankees'],
  SDP: ['padres', 'san diego padres'], SD: ['padres', 'san diego padres'], SFG: ['giants', 'san francisco giants'],
  STL: ['blues', 'st louis blues', 'cardinals', 'st louis cardinals'], TBR: ['rays', 'tampa bay rays'], WSN: ['nationals', 'washington nationals'],
  ATL: ['braves', 'atlanta braves', 'hawks', 'falcons'], BOS: ['bruins', 'boston bruins', 'red sox', 'boston red sox', 'celtics'], BKN: ['nets', 'brooklyn'],
  CHA: ['hornets', 'charlotte', 'panthers'], CHI: ['blackhawks', 'chicago blackhawks', 'bulls', 'chicago', 'bears'], CLE: ['guardians', 'cleveland guardians', 'cavaliers', 'browns', 'cleveland'],
  DAL: ['stars', 'dallas stars', 'mavericks', 'dallas', 'cowboys'], DEN: ['nuggets', 'denver', 'broncos'], DET: ['red wings', 'detroit red wings', 'tigers', 'detroit tigers', 'pistons', 'lions', 'detroit'],
  GSW: ['warriors', 'golden state'], GS: ['warriors', 'golden state'], HOU: ['astros', 'houston astros', 'rockets', 'texans', 'houston'], IND: ['pacers', 'indiana', 'colts'],
  LAC: ['clippers', 'chargers', 'los angeles chargers'], LAL: ['lakers', 'los angeles lakers'], LAR: ['rams', 'los angeles rams'],
  LV: ['raiders', 'las vegas'], LA: ['rams', 'chargers', 'los angeles'],
  MEM: ['grizzlies', 'memphis'], MIA: ['marlins', 'miami marlins', 'heat', 'dolphins', 'miami'], MIL: ['brewers', 'milwaukee brewers', 'bucks', 'milwaukee'], MIN: ['wild', 'minnesota wild', 'twins', 'minnesota twins', 'timberwolves', 'vikings', 'minnesota'],
  NOP: ['pelicans', 'new orleans'], NO: ['pelicans', 'saints', 'new orleans'], NYK: ['knicks', 'new york'], NY: ['knicks', 'giants', 'jets', 'new york'],
  NYG: ['giants', 'new york giants'], NYJ: ['jets', 'new york jets'], OKC: ['thunder', 'oklahoma city'], ORL: ['magic', 'orlando'],
  PHI: ['flyers', 'philadelphia flyers', 'phillies', 'philadelphia phillies', '76ers', 'sixers', 'eagles', 'philadelphia'], PHX: ['suns', 'phoenix'], POR: ['trail blazers', 'portland'],
  SAC: ['kings', 'sacramento'], SAS: ['spurs', 'san antonio'], SA: ['spurs', 'san antonio'],
  UTA: ['jazz', 'utah'], UTAH: ['jazz', 'utah'], WAS: ['capitals', 'washington capitals', 'nationals', 'washington nationals', 'wizards', 'commanders', 'washington'], WSH: ['capitals', 'washington capitals', 'nationals', 'washington nationals', 'wizards', 'commanders', 'washington'],
  BAL: ['orioles', 'baltimore orioles', 'ravens', 'baltimore'], BUF: ['sabres', 'buffalo sabres', 'bills', 'buffalo'], CAR: ['hurricanes', 'carolina hurricanes', 'panthers', 'carolina'], CIN: ['reds', 'cincinnati reds', 'bengals', 'cincinnati'],
  GB: ['packers', 'green bay'], JAX: ['jaguars', 'jacksonville'], KC: ['royals', 'kansas city royals', 'chiefs', 'kansas city'], NE: ['patriots', 'new england'],
  PIT: ['penguins', 'pittsburgh penguins', 'pirates', 'pittsburgh pirates', 'steelers', 'pittsburgh'], SEA: ['kraken', 'seattle kraken', 'mariners', 'seattle mariners', 'seahawks', 'seattle'], SF: ['giants', 'san francisco giants', '49ers', 'niners', 'san francisco'], TB: ['lightning', 'tampa bay lightning', 'rays', 'tampa bay rays', 'buccaneers', 'bucs', 'tampa bay'],
  TEX: ['rangers', 'texas rangers'], TOR: ['maple leafs', 'leafs', 'toronto maple leafs', 'blue jays', 'toronto blue jays', 'raptors', 'toronto'],
  TEN: ['titans', 'tennessee'],
}

const COLLEGE_KEYWORDS: Record<string, string[]> = {
  DUKE: ['duke'], UK: ['kentucky'], KU: ['kansas'], UNC: ['north carolina', 'unc'], GONZ: ['gonzaga'], HOU: ['houston'],
  MARQ: ['marquette'], ARIZ: ['arizona'], PURD: ['purdue'], CREI: ['creighton'], TENN: ['tennessee'], AUB: ['auburn'],
  IOWA: ['iowa', 'iowa hawkeyes'], ISU: ['iowa state', 'iowa st'], MSST: ['michigan st', 'michigan state'],
  BAMA: ['alabama'], UCLA: ['ucla'], MEM: ['memphis'], ARK: ['arkansas'], KSU: ['kansas st', 'kansas state'],
  ILL: ['illinois'], TCU: ['tcu'], MICH: ['michigan'], IND: ['indiana'], OSU: ['ohio st', 'ohio state'],
  VCU: ['vcu'], SDST: ['san diego st', 'san diego state'], CONN: ['uconn', 'connecticut'], FAU: ['fau', 'florida atlantic'],
  MIAMI: ['miami fl', 'miami (fl)', 'miami'], NW: ['northwestern'], USC: ['usc', 'southern california'], PITT: ['pittsburgh', 'pitt'],
  LSU: ['lsu', 'louisiana state'], MIZ: ['missouri'], WVU: ['west virginia'], VT: ['virginia tech'], UVA: ['virginia'],
  ND: ['notre dame'], CLEM: ['clemson'], GT: ['georgia tech'], SYR: ['syracuse'], LOU: ['louisville'], WAKE: ['wake forest'],
  BC: ['boston college'], NCST: ['nc state'], MD: ['maryland'], RUT: ['rutgers'], NEB: ['nebraska'], PSU: ['penn st', 'penn state'],
  MINN: ['minnesota'], WIS: ['wisconsin'], BAYLOR: ['baylor'], TTU: ['texas tech'], WYO: ['wyoming'], UTAH: ['utah'],
  COL: ['colorado'], ASU: ['arizona st', 'arizona state'], ORE: ['oregon'], WASH: ['washington'], CAL: ['california'], STAN: ['stanford'],
  UF: ['florida'], UGA: ['georgia'], FSU: ['florida state'], OKST: ['oklahoma st', 'oklahoma state'], OU: ['oklahoma'],
  TEX: ['texas'], TAMU: ['texas a&m'], BYU: ['byu', 'brigham young'], UNLV: ['unlv'], SDSU: ['san diego st', 'san diego state'],
}

interface PolyOdds {
  homeWinOdds: number; awayWinOdds: number; hasWinnerOdds: boolean
  spreadLine: number; spreadHomeOdds: number; spreadAwayOdds: number
  spreadFavoriteTeam: string; hasSpreadOdds: boolean
  totalLine: number; overOdds: number; underOdds: number; hasTotalOdds: boolean
  polyWinnerUrl: string | null; polySpreadUrl: string | null; polyTotalUrl: string | null
  polyEventTitle: string | null; polyMatchScore: number
  oddsUpdatedAt: string | null; polyFetchOk: boolean; usedGammaFallback: boolean
  polyError: string | null; sourceStatus: 'matched' | 'unmatched' | 'no_events' | 'poly_error'
}

function pitcherStat(probable: any, names: string[]) {
  const stats = Array.isArray(probable?.statistics) ? probable.statistics : (probable?.statistics?.splits?.categories || [])
  for (const name of names) {
    const found = stats.find((x: any) => String(x.name || '').toLowerCase() === name.toLowerCase() || String(x.abbreviation || '').toLowerCase() === name.toLowerCase())
    const n = Number(found?.value ?? found?.displayValue)
    if (Number.isFinite(n)) return n
  }
  return null
}

function normalizeMlbPitcher(probable: any) {
  const athlete = probable?.athlete
  if (!athlete?.displayName) return null
  const era = pitcherStat(probable, ['ERA'])
  const whip = pitcherStat(probable, ['WHIP'])
  const hits = pitcherStat(probable, ['hits', 'H'])
  const innings = Number(pitcherStat(probable, ['fullInnings', 'IP']) || 0) + Number(pitcherStat(probable, ['partInnings']) || 0) / 3
  const hitsPerInning = hits != null && innings > 0 ? hits / innings : null
  const difficultyRaw =
    (era == null ? 50 : Math.max(0, Math.min(100, (era / 6) * 45))) +
    (whip == null ? 25 : Math.max(0, Math.min(45, (whip / 1.7) * 35))) +
    (hitsPerInning == null ? 10 : Math.max(0, Math.min(20, hitsPerInning * 16)))
  const difficulty = Math.max(0, Math.min(100, Math.round(difficultyRaw)))
  return {
    name: athlete.displayName,
    throws: athlete.throws?.abbreviation || athlete.throws?.type,
    era: era == null ? undefined : Number(era.toFixed ? era.toFixed(2) : era),
    whip: whip == null ? undefined : Number(whip.toFixed ? whip.toFixed(2) : whip),
    hitsPerInning: hitsPerInning == null ? undefined : Number(hitsPerInning.toFixed(2)),
    difficulty,
    label: difficulty >= 72 ? 'pitcher target' : difficulty >= 52 ? 'playable pitcher' : 'tough starter',
  }
}

interface PolyEventsFetch {
  events: any[]
  fetchedAt: string
  fetchOk: boolean
  error: string | null
}

function normalize(s: string) {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}

function getKeywords(teamName: string, abbr: string, sport: SportKey): string[] {
  const map = sport === 'ncaab' || sport === 'ncaaf' ? COLLEGE_KEYWORDS : PRO_TEAM_KEYWORDS
  const direct = map[abbr]
  const name = normalize(teamName)
  const skip = new Set(['state', 'university', 'college', 'the', 'of', 'at', 'and', 'fc'])
  const words = name.split(/\s+/).filter(w => w.length > 2 && !skip.has(w))
  const fallback = words.length ? [words[0], words.at(-1)!, name] : [name]
  return Array.from(new Set([...(direct || []), ...fallback].map(normalize).filter(Boolean)))
}

function keywordScore(teamName: string, abbr: string, title: string, sport: SportKey): number {
  const t = normalize(title)
  let best = 0
  for (const k of getKeywords(teamName, abbr, sport)) {
    if (!k) continue
    if (t === k) best = Math.max(best, 4)
    else if (t.includes(k)) best = Math.max(best, k.length >= 6 ? 3 : 2)
  }
  return best
}

function teamMatchesKeywords(teamName: string, abbr: string, title: string, sport: SportKey): boolean {
  return keywordScore(teamName, abbr, title, sport) >= 2
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

function parseSpreadLine(question: string): number {
  const m = question.match(/\(([+-]?\d+\.?\d*)\)/)
  return m ? parseFloat(m[1]) : 0
}

function parseTotalLine(question: string): number {
  const m = question.match(/(?:O\/U|over\/under|total)\s*(\d+\.?\d*)/i)
  return m ? parseFloat(m[1]) : 0
}

function validProbability(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null
}

function isWinnerQuestion(q: string): boolean {
  const n = normalize(q)
  const derivativeWords = ['spread', 'total', 'over under', 'o u', '1h', 'first half', 'quarter', 'period', 'race to', 'score first', 'margin', 'player', 'points', 'rebounds', 'assists', 'combo']
  return !q.includes(':') && !derivativeWords.some(w => n.includes(w))
}

function isSpreadQuestion(q: string): boolean {
  return hasSpreadLanguage(q) && /\([+-]?\d+\.?\d*\)/.test(q)
}

function isTotalQuestion(q: string): boolean {
  const n = normalize(q)
  return (n.includes('o u') || n.includes('over under') || n.includes('total')) && !n.includes('player')
}

async function fetchPolyEvents(sport: SportKey): Promise<PolyEventsFetch> {
  const seen = new Set<string>()
  const events: any[] = []
  const errors: string[] = []
  for (const slug of SPORTS[sport].polyTags) {
    try {
      const res = await fetch(`${GAMMA_API}/events?active=true&closed=false&tag_slug=${slug}&limit=200`, { next: { revalidate: 60 } })
      if (!res.ok) {
        errors.push(`${slug}: ${res.status}`)
        continue
      }
      const data: any[] = await res.json()
      for (const event of data) {
        const id = String(event.id || event.slug || event.title || '')
        if (!id || seen.has(id)) continue
        seen.add(id)
        events.push(event)
      }
    } catch (err) {
      errors.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return {
    events,
    fetchedAt: new Date().toISOString(),
    fetchOk: errors.length === 0,
    error: errors.length ? errors.slice(0, 3).join('; ') : null,
  }
}

function latestPolyUpdatedAt(event: any, markets: any[], fetchedAt: string): string {
  const candidates = [event?.updatedAt, event?.updated_at, event?.createdAt, ...markets.flatMap(m => [m?.updatedAt, m?.updated_at, m?.createdAt])]
  const timestamps = candidates
    .map(v => (v ? new Date(v).getTime() : NaN))
    .filter(v => Number.isFinite(v))
  if (!timestamps.length) return fetchedAt
  return new Date(Math.max(...timestamps)).toISOString()
}

function hasSpreadLanguage(question: string): boolean {
  return /\b(spread|handicap|point\s+spread|against\s+the\s+spread|ats|run\s+line)\b/i.test(question)
}

function findBestPolyEvent(events: any[], awayAbbr: string, homeAbbr: string, awayName: string, homeName: string, sport: SportKey) {
  let best: any = null
  let bestScore = 0
  for (const event of events) {
    const title = `${event.title || ''} ${event.slug || ''}`
    const awayScore = keywordScore(awayName, awayAbbr, title, sport)
    const homeScore = keywordScore(homeName, homeAbbr, title, sport)
    const score = awayScore + homeScore + (SPORTS[sport].eventWords.some(w => normalize(title).includes(normalize(w))) ? 0.5 : 0)
    if (awayScore >= 2 && homeScore >= 2 && score > bestScore) {
      best = event
      bestScore = score
    }
  }
  return { event: best, score: bestScore }
}

async function getPolyOdds(
  awayAbbr: string, homeAbbr: string,
  awayName: string, homeName: string,
  sport: SportKey,
  polyFetch?: PolyEventsFetch,
): Promise<PolyOdds> {
  const defaultOdds: PolyOdds = {
    homeWinOdds: 0.5, awayWinOdds: 0.5, hasWinnerOdds: false,
    spreadLine: 0, spreadHomeOdds: 0.5, spreadAwayOdds: 0.5, spreadFavoriteTeam: '', hasSpreadOdds: false,
    totalLine: 0, overOdds: 0.5, underOdds: 0.5, hasTotalOdds: false,
    polyWinnerUrl: null, polySpreadUrl: null, polyTotalUrl: null,
    polyEventTitle: null, polyMatchScore: 0,
    oddsUpdatedAt: null, polyFetchOk: false, usedGammaFallback: true,
    polyError: null, sourceStatus: 'poly_error',
  }

  try {
    const poly = polyFetch || await fetchPolyEvents(sport)
    const baseOdds: PolyOdds = {
      ...defaultOdds,
      oddsUpdatedAt: poly.fetchedAt,
      polyFetchOk: poly.fetchOk,
      polyError: poly.error,
      sourceStatus: poly.fetchOk ? 'no_events' : 'poly_error',
    }
    if (!poly.events.length) return baseOdds

    const { event, score } = findBestPolyEvent(poly.events, awayAbbr, homeAbbr, awayName, homeName, sport)
    if (!event) return { ...baseOdds, sourceStatus: 'unmatched' }

    const markets: any[] = event.markets || []

    const winnerMarket = markets
      .filter(m => {
        const q = String(m.question || m.title || '')
        return isWinnerQuestion(q) &&
               teamMatchesKeywords(awayName, awayAbbr, q, sport) &&
               teamMatchesKeywords(homeName, homeAbbr, q, sport)
      })
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    const spreadMarket = markets
      .filter(m => {
        const q = `${m.question || ''} ${m.title || ''}`
        const outcomes = safeJson<string[]>(m.outcomes, [])
        const hasTeamOutcome = outcomes.some(o => teamMatchesKeywords(awayName, awayAbbr, o, sport) || teamMatchesKeywords(homeName, homeAbbr, o, sport))
        return hasSpreadLanguage(q) && isSpreadQuestion(q) && hasTeamOutcome
      })
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    const totalMarket = markets
      .filter(m => {
        const q = String(m.question || '')
        const outcomes = safeJson<string[]>(m.outcomes, [])
        return isTotalQuestion(q) && outcomes.some(o => /^over$/i.test(o)) && outcomes.some(o => /^under$/i.test(o))
      })
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    const polySlug = (m: any) => m?.slug ? `https://polymarket.com/event/${m.slug}` : event?.slug ? `https://polymarket.com/event/${event.slug}` : null
    const result: PolyOdds = {
      ...baseOdds,
      polyEventTitle: event.title || null,
      polyMatchScore: score,
      oddsUpdatedAt: latestPolyUpdatedAt(event, markets, poly.fetchedAt),
      sourceStatus: 'matched',
    }

    if (winnerMarket) {
      const outcomes = safeJson<string[]>(winnerMarket.outcomes, [])
      const prices = safeJson<string[]>(winnerMarket.outcomePrices, [])
      if (outcomes.length === 2 && prices.length === 2) {
        const homeKw = getKeywords(homeName, homeAbbr, sport)
        const awayKw = getKeywords(awayName, awayAbbr, sport)
        let homeIdx = outcomes.findIndex(o => homeKw.some(k => normalize(o).includes(k)))
        let awayIdx = outcomes.findIndex(o => awayKw.some(k => normalize(o).includes(k)))
        if (homeIdx < 0 && awayIdx >= 0) homeIdx = awayIdx === 0 ? 1 : 0
        if (awayIdx < 0 && homeIdx >= 0) awayIdx = homeIdx === 0 ? 1 : 0
        if (homeIdx >= 0 && awayIdx >= 0) {
          const homePrice = validProbability(prices[homeIdx])
          const awayPrice = validProbability(prices[awayIdx])
          if (homePrice !== null && awayPrice !== null) {
            result.homeWinOdds = homePrice
            result.awayWinOdds = awayPrice
            result.hasWinnerOdds = true
          }
        }
      }
    }

    if (spreadMarket) {
      const outcomes = safeJson<string[]>(spreadMarket.outcomes, [])
      const prices = safeJson<string[]>(spreadMarket.outcomePrices, [])
      const line = parseSpreadLine(spreadMarket.question || '')
      if (outcomes.length === 2 && prices.length === 2 && line !== 0) {
        const favTeamName = normalize(outcomes[0] || '')
        const homeKw = getKeywords(homeName, homeAbbr, sport)
        const favIsHome = homeKw.some(k => favTeamName.includes(k))
        result.spreadLine = favIsHome ? line : -line
        const homePrice = validProbability(prices[favIsHome ? 0 : 1])
        const awayPrice = validProbability(prices[favIsHome ? 1 : 0])
        if (homePrice !== null && awayPrice !== null) {
          result.spreadHomeOdds = homePrice
          result.spreadAwayOdds = awayPrice
          result.spreadFavoriteTeam = favIsHome ? homeAbbr : awayAbbr
          result.hasSpreadOdds = true
        }
      }
    }

    if (totalMarket) {
      const outcomes = safeJson<string[]>(totalMarket.outcomes, [])
      const prices = safeJson<string[]>(totalMarket.outcomePrices, [])
      const line = parseTotalLine(totalMarket.question || '')
      if (outcomes.length === 2 && prices.length === 2 && line > 0) {
        const overIdx = outcomes.findIndex(o => o.toLowerCase() === 'over')
        const underIdx = overIdx === 0 ? 1 : 0
        result.totalLine = line
        const overPrice = validProbability(prices[overIdx >= 0 ? overIdx : 0])
        const underPrice = validProbability(prices[underIdx])
        if (overPrice !== null && underPrice !== null) {
          result.overOdds = overPrice
          result.underOdds = underPrice
          result.hasTotalOdds = true
        }
      }
    }

    result.polyWinnerUrl = polySlug(winnerMarket)
    result.polySpreadUrl = polySlug(spreadMarket)
    result.polyTotalUrl  = polySlug(totalMarket)
    result.usedGammaFallback = !(result.hasWinnerOdds || result.hasSpreadOdds || result.hasTotalOdds)
    if (result.usedGammaFallback) result.sourceStatus = 'unmatched'

    return result
  } catch (err) {
    return { ...defaultOdds, polyError: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'markets', { limit: 240, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = new URL(req.url)
    const requestedSport = (searchParams.get('sport') || 'nba').toLowerCase() as SportKey
    const sport: SportKey = requestedSport in SPORTS ? requestedSport : 'nba'
    const toCST = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).replace(/-/g, '')
    const dateParam = searchParams.get('date') || toCST(new Date())
    const displayDate = searchParams.get('displayDate') || (dateParam.includes('-') ? dateParam.split('-')[1] : dateParam)

    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/${SPORTS[sport].leaguePath}/scoreboard?dates=${dateParam}`
    const [espnRes, polyFetch] = await Promise.all([
      fetch(espnUrl, { cache: 'no-store' }),
      fetchPolyEvents(sport),
    ])
    if (!espnRes.ok) return NextResponse.json([], { headers: NO_STORE_HEADERS })
    const espnData = await espnRes.json()
    const events = (espnData?.events || []).filter((event: any) => toCST(new Date(event.date)) === displayDate)
    if (!events.length) return NextResponse.json([], { headers: NO_STORE_HEADERS })
    const sourceHealth = {
      espn: { ok: true, events: events.length, date: dateParam },
      polymarket: { ok: polyFetch.fetchOk, events: polyFetch.events.length, tags: SPORTS[sport].polyTags, error: polyFetch.error },
      stale: !polyFetch.fetchOk || polyFetch.events.length === 0,
      checkedAt: polyFetch.fetchedAt,
    }

    const games = await Promise.all(events.map(async (event: any) => {
      const comp = event.competitions?.[0]
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')

      const homeName = home?.team?.displayName || ''
      const awayName = away?.team?.displayName || ''
      const homeAbbr = home?.team?.abbreviation || ''
      const awayAbbr = away?.team?.abbreviation || ''
      const isLive = event.status?.type?.state === 'in'
      const isPost = event.status?.type?.state === 'post'
      const statusDetail = event.status?.type?.shortDetail || ''
      const gameDate = new Date(event.date)
      const startTime = gameDate.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
      })

      let gameTime = startTime
      if (isLive) gameTime = statusDetail
      else if (isPost) gameTime = 'Final'

      const odds = await getPolyOdds(awayAbbr, homeAbbr, awayName, homeName, sport, polyFetch)

      const oddsArr: any[] = comp?.odds || []
      const referenceOdds = oddsArr[0]
      const dkSpread: number | null = referenceOdds?.spread ?? null
      const dkTotal: number | null = referenceOdds?.overUnder ?? null
      const dkDetails: string = referenceOdds?.details ?? ''

      const isCollege = sport === 'ncaab' || sport === 'ncaaf'
      const homeDisplayAbbr = isCollege ? (home?.team?.shortDisplayName || homeAbbr) : homeAbbr
      const awayDisplayAbbr = isCollege ? (away?.team?.shortDisplayName || awayAbbr) : awayAbbr

      const homeRank = home?.curatedRank?.current || null
      const awayRank = away?.curatedRank?.current || null
      const mlbMatchup = sport === 'mlb' ? {
        awayPitcher: normalizeMlbPitcher(away?.probables?.[0]),
        homePitcher: normalizeMlbPitcher(home?.probables?.[0]),
      } : undefined

      return {
        id: event.id,
        sport,
        leagueLabel: SPORTS[sport].label,
        homeTeam: {
          name: homeName,
          abbr: homeDisplayAbbr,
          record: home?.records?.[0]?.summary || '',
          score: home?.score || '',
          logo: '',
          color: home?.team?.color || '334155',
          alternateColor: home?.team?.alternateColor || '94a3b8',
          rank: homeRank && homeRank <= 25 ? homeRank : null,
        },
        awayTeam: {
          name: awayName,
          abbr: awayDisplayAbbr,
          record: away?.records?.[0]?.summary || '',
          score: away?.score || '',
          logo: '',
          color: away?.team?.color || '334155',
          alternateColor: away?.team?.alternateColor || '94a3b8',
          rank: awayRank && awayRank <= 25 ? awayRank : null,
        },
        gameTime,
        gameDate: event.date,
        mlbMatchup,
        venue: (() => {
          const v = comp?.venue
          if (!v) return null
          const city = v.address?.city || ''
          const state = v.address?.state || ''
          return { name: v.fullName || '', location: [city, state].filter(Boolean).join(', ') }
        })(),
        status: event.status?.type?.state || 'pre',
        dkSpread, dkTotal, dkDetails,
        hasDkOdds: referenceOdds != null,
        sourceHealth: {
          ...sourceHealth,
          polymarket: { ...sourceHealth.polymarket, matched: odds.polyEventTitle != null, matchScore: odds.polyMatchScore },
          stale: sourceHealth.stale || odds.polyEventTitle == null,
        },
        ...odds,
      }
    }))

    games.sort((a: any, b: any) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())
    return NextResponse.json(games, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error(err)
    return NextResponse.json([], { status: 500, headers: NO_STORE_HEADERS })
  }
}
