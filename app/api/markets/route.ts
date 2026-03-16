import { NextResponse } from 'next/server'

const GAMMA_API = 'https://gamma-api.polymarket.com'

const ESPN_TO_POLY: Record<string, string[]> = {
  ATL: ['hawks', 'atlanta'], BOS: ['celtics', 'boston'], BKN: ['nets', 'brooklyn'],
  CHA: ['hornets', 'charlotte'], CHI: ['bulls', 'chicago'], CLE: ['cavaliers', 'cleveland'],
  DAL: ['mavericks', 'dallas'], DEN: ['nuggets', 'denver'], DET: ['pistons', 'detroit'],
  GSW: ['warriors', 'golden state'], HOU: ['rockets', 'houston'], IND: ['pacers', 'indiana'],
  LAC: ['clippers', 'clippers'], LAL: ['lakers', 'los angeles lakers', 'lakers'],
  MEM: ['grizzlies', 'memphis'], MIA: ['heat', 'miami'], MIL: ['bucks', 'milwaukee'],
  MIN: ['timberwolves', 'minnesota'], NOP: ['pelicans', 'new orleans'],
  NYK: ['knicks', 'new york'], OKC: ['thunder', 'oklahoma city'],
  ORL: ['magic', 'orlando'], PHI: ['76ers', 'philadelphia'],
  PHX: ['suns', 'phoenix'], POR: ['trail blazers', 'portland'],
  SAC: ['kings', 'sacramento'], SAS: ['spurs', 'san antonio'],
  TOR: ['raptors', 'toronto'], UTA: ['jazz', 'utah'], WAS: ['wizards', 'washington'],
}

interface PolyOdds {
  homeWinOdds: number
  awayWinOdds: number
  hasWinnerOdds: boolean
  spreadLine: number
  spreadHomeOdds: number
  spreadAwayOdds: number
  spreadFavoriteTeam: string
  hasSpreadOdds: boolean
  totalLine: number
  overOdds: number
  underOdds: number
  hasTotalOdds: boolean
}

function teamMatchesKeywords(teamName: string, abbr: string, title: string): boolean {
  const t = title.toLowerCase()
  const keywords = ESPN_TO_POLY[abbr] || [teamName.split(' ').pop()!.toLowerCase()]
  return keywords.some(k => t.includes(k))
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
): Promise<PolyOdds> {
  const defaultOdds: PolyOdds = {
    homeWinOdds: 0.5, awayWinOdds: 0.5, hasWinnerOdds: false,
    spreadLine: 0, spreadHomeOdds: 0.5, spreadAwayOdds: 0.5, spreadFavoriteTeam: '', hasSpreadOdds: false,
    totalLine: 0, overOdds: 0.5, underOdds: 0.5, hasTotalOdds: false,
  }

  try {
    const res = await fetch(`${GAMMA_API}/events?active=true&closed=false&tag_slug=nba&limit=200`, {
      next: { revalidate: 60 }
    })
    if (!res.ok) return defaultOdds
    const events: any[] = await res.json()

    // Find matching event
    const event = events.find(e => {
      const title = (e.title || '').toLowerCase()
      return teamMatchesKeywords(awayName, awayAbbr, title) &&
             teamMatchesKeywords(homeName, homeAbbr, title)
    })
    if (!event) return defaultOdds

    const markets: any[] = event.markets || []

    // Winner market: just "TeamA vs. TeamB" or "TeamA vs TeamB" with no colon
    const winnerMarket = markets
      .filter(m => {
        const q = (m.question || '').toLowerCase()
        return !q.includes(':') && !q.includes('o/u') &&
               teamMatchesKeywords(awayName, awayAbbr, q) &&
               teamMatchesKeywords(homeName, homeAbbr, q)
      })
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    // Spread market: "Spread: TeamX (-N.5)"
    const spreadMarket = markets
      .filter(m => (m.question || '').toLowerCase().startsWith('spread:'))
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    // Total market: "TeamA vs TeamB: O/U N.5"
    const totalMarket = markets
      .filter(m => (m.question || '').toLowerCase().includes('o/u'))
      .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0]

    const result = { ...defaultOdds }

    if (winnerMarket) {
      const outcomes: string[] = JSON.parse(winnerMarket.outcomes || '[]')
      const prices: string[] = JSON.parse(winnerMarket.outcomePrices || '[]')
      if (outcomes.length === 2 && prices.length === 2) {
        const homeKeywords = ESPN_TO_POLY[homeAbbr] || [homeName.split(' ').pop()!.toLowerCase()]
        const homeIdx = outcomes.findIndex(o => homeKeywords.some(k => o.toLowerCase().includes(k)))
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
        // Favorite team is the one in the spread (the one with negative line)
        const favTeamName = (outcomes[0] || '').toLowerCase()
        const homeKeywords = ESPN_TO_POLY[homeAbbr] || [homeName.split(' ').pop()!.toLowerCase()]
        const favIsHome = homeKeywords.some(k => favTeamName.includes(k))
        result.spreadLine = favIsHome ? line : -line  // from home perspective
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

    return result
  } catch {
    return defaultOdds
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get('date') || new Date().toISOString().slice(0, 10).replace(/-/g, '')

    // Use date param for historical; omit for today (gets live scores)
    const isToday = dateParam === new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const espnUrl = isToday
      ? 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
      : `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateParam}`
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

      const odds = await getPolyOdds(awayAbbr, homeAbbr, awayName, homeName)

      return {
        id: event.id,
        homeTeam: {
          name: homeName,
          abbr: homeAbbr,
          record: home?.records?.[0]?.summary || '',
          score: home?.score || '',
          logo: home?.team?.logo || '',
          color: home?.team?.color || '334155',
          alternateColor: home?.team?.alternateColor || '94a3b8',
        },
        awayTeam: {
          name: awayName,
          abbr: awayAbbr,
          record: away?.records?.[0]?.summary || '',
          score: away?.score || '',
          logo: away?.team?.logo || '',
          color: away?.team?.color || '334155',
          alternateColor: away?.team?.alternateColor || '94a3b8',
        },
        gameTime,
        gameDate: event.date,
        status: event.status?.type?.state || 'pre',
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
