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


const OUTDOOR_COLD_HINTS = ['green bay', 'buffalo', 'cleveland', 'chicago', 'pittsburgh', 'philadelphia', 'new york', 'foxborough', 'baltimore', 'cincinnati']
const OUTDOOR_HEAT_HINTS = ['miami', 'tampa', 'jacksonville', 'arizona', 'phoenix', 'houston', 'dallas']

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function favoriteRead(home: string, away: string, homeOdds: number, awayOdds: number) {
  if (homeOdds >= awayOdds + 0.08) return `${home || 'Home'} is priced as the clearer winner (${pct(homeOdds)}). Make the case from QB health and pressure rate before trusting it.`
  if (awayOdds >= homeOdds + 0.08) return `${away || 'Away'} is priced as the clearer winner (${pct(awayOdds)}). Road context and injury status need confirmation.`
  return `Winner market is tight (${away || 'Away'} ${pct(awayOdds)} / ${home || 'Home'} ${pct(homeOdds)}), so matchup specifics matter more than brand names.`
}

function totalEnvironment(totalLine: number, dome: boolean, venueText: string) {
  if (!totalLine) return dome ? 'Controlled venue helps scoring stability, but no usable total is posted yet.' : 'No usable total is posted yet; wait for weather and injury reports.'
  if (!dome && OUTDOOR_COLD_HINTS.some(h => venueText.includes(h))) return `Outdoor/cold-market venue with ${totalLine.toFixed(1)} total: wind and field conditions can matter more than season averages.`
  if (!dome && OUTDOOR_HEAT_HINTS.some(h => venueText.includes(h))) return `Warm outdoor setup with ${totalLine.toFixed(1)} total: conditioning, pace, and late defensive fatigue belong in the read.`
  if (dome) return `Controlled environment with ${totalLine.toFixed(1)} total: less weather noise, better for pure pace/efficiency reads.`
  return `Outdoor game with ${totalLine.toFixed(1)} total: do the wind/weather check before trusting overs or pass-volume props.`
}

function scriptRead(spreadLine: number, home: string, away: string) {
  if (Math.abs(spreadLine) < 1) return 'Near pick’em script: prioritize QB pressure, turnover profile, and late-game coaching over simple favorite/dog labels.'
  const favorite = spreadLine < 0 ? home : away
  const dog = spreadLine < 0 ? away : home
  const line = Math.abs(spreadLine).toFixed(1)
  if (Math.abs(spreadLine) >= 7) return `${favorite || 'Favorite'} is laying ${line}: favorite run-volume/clock-control props can work, but late garbage-time risk helps ${dog || 'dog'} receiving volume.`
  return `${favorite || 'Favorite'} favored by ${line}: build the board around whether ${dog || 'the dog'} can keep game script neutral into the second half.`
}

function focusLane(hasSpread: boolean, hasTotal: boolean, hasWinner: boolean, spreadGap: number, ttlGap: number) {
  if (spreadGap >= 1.5) return 'Spread discrepancy first'
  if (ttlGap >= 2) return 'Total/weather discrepancy first'
  if (hasWinner && hasSpread && hasTotal) return 'Full game board ready'
  if (hasWinner || hasSpread || hasTotal) return 'Partial board; prep only'
  return 'Schedule intelligence only'
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
  const hasSpreadOdds = Boolean(game.hasSpreadOdds)
  const hasTotalOdds = Boolean(game.hasTotalOdds)
  const hasWinnerOdds = Boolean(game.hasWinnerOdds)
  const homeWinOdds = Number.isFinite(game.homeWinOdds) ? Number(game.homeWinOdds) : 0.5
  const awayWinOdds = Number.isFinite(game.awayWinOdds) ? Number(game.awayWinOdds) : 0.5
  const spreadLine = Number.isFinite(game.spreadLine) ? Number(game.spreadLine) : 0
  const totalLine = Number.isFinite(game.totalLine) ? Number(game.totalLine) : 0
  const kickoff = new Date(date)
  const daysOut = Math.max(0, Math.ceil((kickoff.getTime() - Date.now()) / 86400000))
  const venueText = `${venue} ${location}`.toLowerCase()
  const dome = DOME_HINTS.some(h => venueText.includes(h))
  const divisional = Boolean(away && home && DIVISIONS[away] && DIVISIONS[away] === DIVISIONS[home])

  const warnings = [...readiness.warnings]
  if (!dome) warnings.push('Weather/wind check needed before totals')
  if (divisional) warnings.push('Divisional game: rematch volatility')
  if (daysOut >= 4) warnings.push('Early-week board: QB/injury status can move hard')

  const gameSetup = `${away || 'Away'} @ ${home || 'Home'}${venue ? ` · ${venue}` : ''}${location ? ` · ${location}` : ''}`
  const marketPressure = readiness.matched
    ? `${readiness.matchLabel}; compare winner, spread, and total before treating the board as playable.`
    : 'No clean matched market yet; use this as schedule/prep context until links firm up.'
  const risk = warnings[0] || 'Football context can move late from QB status, injuries, weather, and inactive reports.'
  const watchPoint = spreadGap >= 1.5 || ttlGap >= 2
    ? `Reference line gap is live: spread ${spreadGap.toFixed(1)}, total ${ttlGap.toFixed(1)}.`
    : dome
      ? 'Controlled venue lowers weather noise; still wait for final injury and inactive reports.'
      : 'Outdoor setup: check wind/weather before trusting total reads.'
  const intelligenceLane = focusLane(hasSpreadOdds, hasTotalOdds, hasWinnerOdds, spreadGap, ttlGap)
  const favorite = favoriteRead(home, away, homeWinOdds, awayWinOdds)
  const environment = totalEnvironment(totalLine, dome, venueText)
  const script = scriptRead(spreadLine, home, away)
  const footballRead = [favorite, script, environment]
  const propFocus = Math.abs(spreadLine) >= 7
    ? ['Favorite rushing volume', 'Underdog passing/reception volume', 'Late-game receiving ladder risk']
    : totalLine >= 47
      ? ['QB/pass catchers', 'Anytime TD context', 'Live total movement']
      : ['RB workload', 'Kicker/defensive field position', 'Avoid chasing thin overs']
  const dataGaps = [
    'Confirmed QB status',
    'Practice report/inactives',
    dome ? '' : 'Wind/weather confirmation',
    readiness.matchQuality < 55 ? 'Cleaner market match' : '',
  ].filter(Boolean)

  const prepScore = Math.min(100, Math.round(
    35 + readiness.matchQuality * 0.35 + (Boolean(game.hasDkOdds) ? 12 : 0) + Math.min(14, spreadGap * 4 + ttlGap * 2) + (dome ? 5 : 0) + (divisional ? 4 : 0)
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
    brief: {
      gameSetup,
      marketPressure,
      risk,
      watchPoint,
    },
    intelligence: {
      lane: intelligenceLane,
      read: footballRead,
      propFocus,
      dataGaps,
    },
    checklist: [
      { label: 'Market match quality', value: readiness.matchLabel, status: readiness.matchQuality >= 55 ? 'ready' : 'watch' },
      { label: 'Line gap scan', value: spreadGap || ttlGap ? `Spread ${spreadGap.toFixed(1)} / Total ${ttlGap.toFixed(1)}` : 'No line gap yet', status: spreadGap >= 1.5 || ttlGap >= 2 ? 'edge' : 'watch' },
      { label: 'Venue/weather', value: dome ? 'Dome/controlled environment' : 'Outdoor weather check required', status: dome ? 'ready' : 'watch' },
      { label: 'Game context', value: divisional ? 'Divisional matchup' : 'Non-division spot', status: divisional ? 'watch' : 'ready' },
      { label: 'Injury/QB timing', value: daysOut >= 4 ? 'Wait for practice reports' : 'Game-week reports closer', status: 'watch' },
    ],
    warnings,
  })
}
