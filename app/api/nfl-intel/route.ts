import { NextResponse } from 'next/server'
import { getMarketReadiness, lineGap, totalGap, type SportsGameLike } from '@/app/lib/sports-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DOME_HINTS = ['dome', 'ford field', 'at&t stadium', 'caesars superdome', 'sofi stadium', 'allegiant stadium', 'state farm stadium', 'lucas oil stadium', 'u.s. bank stadium', 'mercedes-benz stadium']
const DIVISIONS: Record<string, string> = {
  BUF: 'AFC East', MIA: 'AFC East', NE: 'AFC East', NYJ: 'AFC East',
  BAL: 'AFC North', CIN: 'AFC North', CLE: 'AFC North', PIT: 'AFC North',
  HOU: 'AFC South', IND: 'AFC South', JAX: 'AFC South', TEN: 'AFC South',
  DEN: 'AFC West', KC: 'AFC West', LV: 'AFC West', LAC: 'AFC West',
  DAL: 'NFC East', NYG: 'NFC East', PHI: 'NFC East', WAS: 'NFC East', WSH: 'NFC East',
  CHI: 'NFC North', DET: 'NFC North', GB: 'NFC North', MIN: 'NFC North',
  ATL: 'NFC South', CAR: 'NFC South', NO: 'NFC South', TB: 'NFC South',
  ARI: 'NFC West', LAR: 'NFC West', SEA: 'NFC West', SF: 'NFC West',
}

function cleanAbbr(v: string | null) {
  return (v || '').trim().toUpperCase()
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const away = cleanAbbr(searchParams.get('away'))
  const home = cleanAbbr(searchParams.get('home'))
  const venue = searchParams.get('venue') || ''
  const location = searchParams.get('location') || ''
  const date = searchParams.get('date') || new Date().toISOString()
  const sport = (searchParams.get('sport') || 'nfl') as 'nfl' | 'ncaaf'

  const game: SportsGameLike = {
    id: `${away}-${home}-${date}`,
    awayTeam: { abbr: away },
    homeTeam: { abbr: home },
    status: 'pre',
    gameDate: date,
    sport,
    hasWinnerOdds: searchParams.get('hasWinnerOdds') === 'true',
    homeWinOdds: Number(searchParams.get('homeWinOdds') || 0.5),
    awayWinOdds: Number(searchParams.get('awayWinOdds') || 0.5),
    hasSpreadOdds: searchParams.get('hasSpreadOdds') === 'true',
    spreadLine: Number(searchParams.get('spreadLine') || 0),
    hasTotalOdds: searchParams.get('hasTotalOdds') === 'true',
    totalLine: Number(searchParams.get('totalLine') || 0),
    hasDkOdds: searchParams.get('hasDkOdds') === 'true',
    dkSpread: searchParams.get('dkSpread') ? Number(searchParams.get('dkSpread')) : null,
    dkTotal: searchParams.get('dkTotal') ? Number(searchParams.get('dkTotal')) : null,
    polyMatchScore: searchParams.get('polyMatchScore') ? Number(searchParams.get('polyMatchScore')) : undefined,
  }

  const readiness = getMarketReadiness(game)
  const spreadGap = lineGap(game)
  const ttlGap = totalGap(game)
  const kickoff = new Date(date)
  const daysOut = Math.max(0, Math.ceil((kickoff.getTime() - Date.now()) / 86400000))
  const venueText = `${venue} ${location}`.toLowerCase()
  const dome = DOME_HINTS.some(h => venueText.includes(h))
  const divisional = Boolean(away && home && DIVISIONS[away] && DIVISIONS[away] === DIVISIONS[home])

  const warnings = [...readiness.warnings]
  if (!dome) warnings.push('Weather/wind check needed before totals')
  if (divisional) warnings.push('Divisional game: rematch volatility')
  if (daysOut >= 4) warnings.push('Early-week board: QB/injury status can move hard')

  const prepScore = Math.min(100, Math.round(
    35 + readiness.matchQuality * 0.35 + (game.hasDkOdds ? 12 : 0) + Math.min(14, spreadGap * 4 + ttlGap * 2) + (dome ? 5 : 0) + (divisional ? 4 : 0)
  ))

  return NextResponse.json({
    matchup: `${away} @ ${home}`,
    sport,
    prepScore,
    readiness,
    flags: {
      dome,
      divisional,
      daysOut,
      spreadGap,
      totalGap: ttlGap,
    },
    checklist: [
      { label: 'Market match quality', value: readiness.matchLabel, status: readiness.matchQuality >= 55 ? 'ready' : 'watch' },
      { label: 'Line gap scan', value: spreadGap || ttlGap ? `Spread ${spreadGap.toFixed(1)} / Total ${ttlGap.toFixed(1)}` : 'No DK/poly gap yet', status: spreadGap >= 1.5 || ttlGap >= 2 ? 'edge' : 'watch' },
      { label: 'Venue/weather', value: dome ? 'Dome/controlled environment' : 'Outdoor weather check required', status: dome ? 'ready' : 'watch' },
      { label: 'Game context', value: divisional ? 'Divisional matchup' : 'Non-division spot', status: divisional ? 'watch' : 'ready' },
      { label: 'Injury/QB timing', value: daysOut >= 4 ? 'Wait for practice reports' : 'Game-week reports closer', status: 'watch' },
    ],
    warnings,
  })
}
