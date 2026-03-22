import { NextResponse } from 'next/server'

const GAMMA_API = 'https://gamma-api.polymarket.com'

// NBA team keyword map
const ESPN_TO_POLY: Record<string, string[]> = {
  ATL: ['hawks', 'atlanta'], BOS: ['celtics', 'boston'], BKN: ['nets', 'brooklyn'],
  CHA: ['hornets', 'charlotte'], CHI: ['bulls', 'chicago'], CLE: ['cavaliers', 'cleveland'],
  DAL: ['mavericks', 'dallas'], DEN: ['nuggets', 'denver'], DET: ['pistons', 'detroit'],
  GSW: ['warriors', 'golden state'], HOU: ['rockets', 'houston'], IND: ['pacers', 'indiana'],
  LAC: ['clippers', 'clippers'], LAL: ['lakers', 'los angeles lakers', 'lakers'],
  MEM: ['grizzlies', 'memphis'], MIA: ['heat', 'miami'], MIL: ['bucks', 'milwaukee'],
  MIN: ['timberwolves', 'minnesota'], NOP: ['pelicans', 'new orleans'],
  NYK: ['knicks', 'new york'], NY: ['knicks', 'new york'], OKC: ['thunder', 'oklahoma city'],
  ORL: ['magic', 'orlando'], PHI: ['76ers', 'philadelphia'],
  PHX: ['suns', 'phoenix'], POR: ['trail blazers', 'portland'],
  SAC: ['kings', 'sacramento'], SAS: ['spurs', 'san antonio'],
  TOR: ['raptors', 'toronto'], UTA: ['jazz', 'utah'], WAS: ['wizards', 'washington'], WSH: ['wizards', 'washington'],
}

// NCAAB: ESPN abbr → Polymarket-friendly keywords (school name first)
const NCAAB_TO_POLY: Record<string, string[]> = {
  DUKE: ['duke'], UK: ['kentucky'], KU: ['kansas'], UNC: ['north carolina', 'unc'],
  GONZ: ['gonzaga'], HOU: ['houston'], MARQ: ['marquette'], ARIZ: ['arizona'],
  PURD: ['purdue'], CREI: ['creighton'], TENN: ['tennessee'], AUB: ['auburn'],
  IOWA: ['iowa', 'iowa hawkeyes'], ISU: ['iowa state', 'iowa st'], MSST: ['michigan st', 'michigan state'],
  BAMA: ['alabama'], UCLA: ['ucla'], MEM: ['memphis'], ARK: ['arkansas'],
  KSU: ['kansas st', 'kansas state'], ILL: ['illinois'], TCU: ['tcu'],
  MICH: ['michigan'], IND: ['indiana'], OSU: ['ohio st', 'ohio state'],
  VCU: ['vcu'], SDST: ['san diego st', 'san diego state'], CONN: ['uconn', 'connecticut'],
  FAU: ['fau', 'florida atlantic'], MIAMI: ['miami fl', 'miami (fl)'],
  NW: ['northwestern'], USC: ['usc', 'southern california'],
  PITT: ['pittsburgh', 'pitt'], LSU: ['lsu', 'louisiana state'],
  MIZ: ['missouri'], WVU: ['west virginia'], VT: ['virginia tech'],
  UVA: ['virginia'], ND: ['notre dame'], CLEM: ['clemson'],
  GT: ['georgia tech'], SYR: ['syracuse'], LOU: ['louisville'],
  WAKE: ['wake forest'], BC: ['boston college'], NCST: ['nc state'],
  MD: ['maryland'], RUT: ['rutgers'], NEB: ['nebraska'], PSU: ['penn st', 'penn state'],
  MINN: ['minnesota'], WIS: ['wisconsin'], NU: ['northwestern'],
  BAYLOR: ['baylor'], TTU: ['texas tech'], WYO: ['wyoming'],
  UTAH: ['utah'], COL: ['colorado'], ASU: ['arizona st', 'arizona state'],
  ORE: ['oregon'], WASH: ['washington'], CAL: ['california'],
  STAN: ['stanford'], UF: ['florida'], UGA: ['georgia'],
  FSU: ['florida state'], OKST: ['oklahoma st', 'oklahoma state'],
  OU: ['oklahoma'], TEX: ['texas'], TAMU: ['texas a&m'],
  TCU2: ['tcu'], BRIG: ['byu', 'brigham young'], UNLV: ['unlv'],
  SDSU: ['san diego st', 'san diego state'],
}

interface PolyOdds {
  homeWinOdds: number; awayWinOdds: number; hasWinnerOdds: boolean
  spreadLine: number; spreadHomeOdds: number; spreadAwayOdds: number
  spreadFavoriteTeam: string; hasSpreadOdds: boolean
  totalLine: number; overOdds: number; underOdds: number; hasTotalOdds: boolean
  polyWinnerUrl: string | null; polySpreadUrl: string | null; polyTotalUrl: string | null
}

function getKeywords(teamName: string, abbr: string, sport: string): string[] {
  const map = sport === 'ncaab' ? NCAAB_TO_POLY : ESPN_TO_POLY
  if (map[abbr]) return map[abbr]
  // Fallback: use significant words from team name (skip common suffixes)
  const skip = new Set(['state', 'university', 'college', 'the', 'of', 'at', 'a&m'])
  const words = teamName.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !skip.has(w))
  return words.length ? [words[0], teamName.toLowerCase()] : [teamName.toLowerCase()]
}

function teamMatchesKeywords(teamName: string, abbr: string, title: string, sport: string): boolean {
  const t = title.toLowerCase()
  return getKeywords(teamName, abbr, sport).some(k => t.includes(k))
}

function parseSpreadLine(question: string): number {
  const m = question.match(/\(([+-]?\d+\.?\d*)\)/)
  return m ? parseFloat(m[1]) : 0
}

function parseTotalLine(question: string): number {
  const m = question.match(/O\/U\s*(\d+\.?\d*)/)
  return m ? parseFloat(m[1]) : 0
}

async function getPolyOdds(
  awayAbbr: string, homeAbbr: string,
  awayName: string, homeName: string,
  sport: string,
): Promise<PolyOdds> {
  const defaultOdds: PolyOdds = {
    homeWinOdds: 0.5, awayWinOdds: 0.5, hasWinnerOdds: false,
    spreadLine: 0, spreadHomeOdds: 0.5, spreadAwayOdds: 0.5, spreadFavoriteTeam: '', hasSpreadOdds: false,
    totalLine: 0, overOdds: 0.5, underOdds: 0.5, hasTotalOdds: false,
    polyWinnerUrl: null, polySpreadUrl: null, polyTotalUrl: null,
  }

  try {
    // For NCAAB try march-madness first, then ncaa-basketball fallback; NBA uses nba
    let events: any[] = []
    if (sport === 'ncaab') {
      for (const slug of ['march-madness', 'ncaa-basketball', 'ncaab']) {
        const res = await fetch(`${GAMMA_API}/events?active=true&closed=false&tag_slug=${slug}&limit=200`, {
          next: { revalidate: 60 }
        })
        if (res.ok) {
          const data: any[] = await res.json()
          if (data.length) { events = data; break }
        }
      }
    } else {
      const res = await fetch(`${GAMMA_API}/events?active=true&closed=false&tag_slug=nba&limit=200`, {
        next: { revalidate: 60 }
      })
      if (!res.ok) return defaultOdds
      events = await res.json()
    }
    if (!events.length) return defaultOdds

    const event = events.find(e => {
      const title = (e.title || '').toLowerCase()
      return teamMatchesKeywords(awayName, awayAbbr, title, sport) &&
             teamMatchesKeywords(homeName, homeAbbr, title, sport)
    })
    if (!event) return defaultOdds

    const markets: any[] = event.markets || []

    const winnerMarket = markets
      .filter(m => {
        const q = (m.question || '').toLowerCase()
        return !q.includes(':') && !q.includes('o/u') &&
               teamMatchesKeywords(awayName, awayAbbr, q, sport) &&
               teamMatchesKeywords(homeName, homeAbbr, q, sport)
      })
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    const spreadMarket = markets
      .filter(m => (m.question || '').toLowerCase().startsWith('spread:'))
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    const totalMarket = markets
      .filter(m => (m.question || '').toLowerCase().includes('o/u'))
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    const polySlug = (m: any) => m?.slug ? `https://polymarket.com/event/${m.slug}` : null
    const result = { ...defaultOdds }

    if (winnerMarket) {
      const outcomes: string[] = JSON.parse(winnerMarket.outcomes || '[]')
      const prices: string[] = JSON.parse(winnerMarket.outcomePrices || '[]')
      if (outcomes.length === 2 && prices.length === 2) {
        const homeKw = getKeywords(homeName, homeAbbr, sport)
        const homeIdx = outcomes.findIndex(o => homeKw.some(k => o.toLowerCase().includes(k)))
        const awayIdx = homeIdx === 0 ? 1 : 0
        result.homeWinOdds = parseFloat(prices[homeIdx >= 0 ? homeIdx : 1] || '0.5')
        result.awayWinOdds = parseFloat(prices[awayIdx] || '0.5')
        result.hasWinnerOdds = true
      }
    }

    if (spreadMarket) {
      const outcomes: string[] = JSON.parse(spreadMarket.outcomes || '[]')
      const prices: string[] = JSON.parse(spreadMarket.outcomePrices || '[]')
      const line = parseSpreadLine(spreadMarket.question || '')
      if (outcomes.length === 2 && prices.length === 2 && line !== 0) {
        const favTeamName = (outcomes[0] || '').toLowerCase()
        const homeKw = getKeywords(homeName, homeAbbr, sport)
        const favIsHome = homeKw.some(k => favTeamName.includes(k))
        result.spreadLine = favIsHome ? line : -line
        result.spreadHomeOdds = parseFloat(prices[favIsHome ? 0 : 1] || '0.5')
        result.spreadAwayOdds = parseFloat(prices[favIsHome ? 1 : 0] || '0.5')
        result.spreadFavoriteTeam = favIsHome ? homeAbbr : awayAbbr
        result.hasSpreadOdds = true
      }
    }

    if (totalMarket) {
      const outcomes: string[] = JSON.parse(totalMarket.outcomes || '[]')
      const prices: string[] = JSON.parse(totalMarket.outcomePrices || '[]')
      const line = parseTotalLine(totalMarket.question || '')
      if (outcomes.length === 2 && prices.length === 2 && line > 0) {
        const overIdx = outcomes.findIndex(o => o.toLowerCase() === 'over')
        const underIdx = overIdx === 0 ? 1 : 0
        result.totalLine = line
        result.overOdds = parseFloat(prices[overIdx >= 0 ? overIdx : 0] || '0.5')
        result.underOdds = parseFloat(prices[underIdx] || '0.5')
        result.hasTotalOdds = true
      }
    }

    result.polyWinnerUrl = polySlug(winnerMarket) || polySlug(event) || null
    result.polySpreadUrl = polySlug(spreadMarket) || polySlug(event) || null
    result.polyTotalUrl  = polySlug(totalMarket)  || polySlug(event) || null

    return result
  } catch {
    return defaultOdds
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const sport = (searchParams.get('sport') || 'nba').toLowerCase()
    const toCST = (d: Date) => {
      const cst = new Date(d.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
      return cst.toISOString().slice(0, 10).replace(/-/g, '')
    }
    const dateParam = searchParams.get('date') || toCST(new Date())

    const espnSport = sport === 'ncaab' ? 'mens-college-basketball' : 'nba'
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/${espnSport}/scoreboard?dates=${dateParam}`
    const espnRes = await fetch(espnUrl, { next: { revalidate: 30 } })
    const espnData = await espnRes.json()
    const events = espnData?.events || []
    if (!events.length) return NextResponse.json([])

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

      const odds = await getPolyOdds(awayAbbr, homeAbbr, awayName, homeName, sport)

      const dk = comp?.odds?.[0]
      const dkSpread: number | null = dk?.spread ?? null
      const dkTotal: number | null = dk?.overUnder ?? null
      const dkDetails: string = dk?.details ?? ''

      // For NCAAB use shortDisplayName (e.g. "Duke") as abbr display
      const homeDisplayAbbr = sport === 'ncaab' ? (home?.team?.shortDisplayName || homeAbbr) : homeAbbr
      const awayDisplayAbbr = sport === 'ncaab' ? (away?.team?.shortDisplayName || awayAbbr) : awayAbbr

      // NCAAB rank
      const homeRank = home?.curatedRank?.current || null
      const awayRank = away?.curatedRank?.current || null

      return {
        id: event.id,
        sport,
        homeTeam: {
          name: homeName,
          abbr: homeDisplayAbbr,
          record: home?.records?.[0]?.summary || '',
          score: home?.score || '',
          logo: home?.team?.logo || '',
          color: home?.team?.color || '334155',
          alternateColor: home?.team?.alternateColor || '94a3b8',
          rank: homeRank && homeRank <= 25 ? homeRank : null,
        },
        awayTeam: {
          name: awayName,
          abbr: awayDisplayAbbr,
          record: away?.records?.[0]?.summary || '',
          score: away?.score || '',
          logo: away?.team?.logo || '',
          color: away?.team?.color || '334155',
          alternateColor: away?.team?.alternateColor || '94a3b8',
          rank: awayRank && awayRank <= 25 ? awayRank : null,
        },
        gameTime,
        gameDate: event.date,
        venue: (() => {
          const v = comp.venue
          if (!v) return null
          const city = v.address?.city || ''
          const state = v.address?.state || ''
          return { name: v.fullName || '', location: [city, state].filter(Boolean).join(', ') }
        })(),
        status: event.status?.type?.state || 'pre',
        dkSpread, dkTotal, dkDetails,
        hasDkOdds: dk != null,
        ...odds,
      }
    }))

    games.sort((a: any, b: any) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())
    return NextResponse.json(games)
  } catch (err) {
    console.error(err)
    return NextResponse.json([], { status: 500 })
  }
}
