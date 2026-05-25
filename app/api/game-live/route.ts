import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/app/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Sport = 'mlb' | 'nba' | 'nfl'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

const SPORT_PATH: Record<Sport, string> = {
  mlb: 'baseball/mlb',
  nba: 'basketball/nba',
  nfl: 'football/nfl',
}

function parseSport(value: string | null): Sport {
  const sport = String(value || 'mlb').toLowerCase()
  return sport === 'nba' || sport === 'nfl' ? sport : 'mlb'
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

function statAt(labels: string[], stats: any[], label: string) {
  const idx = labels.findIndex(x => x === label.toUpperCase())
  return idx >= 0 ? String(stats?.[idx] ?? '') : ''
}

function statNum(labels: string[], stats: any[], label: string) {
  const n = Number(statAt(labels, stats, label))
  return Number.isFinite(n) ? n : 0
}

function normalizeNameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function parsePlayerStats(summary: any) {
  const players: any[] = []
  const byId: Record<string, any> = {}
  const byName: Record<string, any> = {}

  for (const group of (summary.boxscore?.players || [])) {
    const team = String(group.team?.abbreviation || '').toUpperCase()
    for (const statGroup of (group.statistics || [])) {
      const labels = (statGroup.labels || []).map((x: string) => String(x).toUpperCase())
      const isBatting = labels.includes('H-AB') || String(statGroup.type || statGroup.name || '').toLowerCase().includes('bat')
      const isPitching = labels.includes('IP') && labels.includes('ERA')
      const isBasketball = labels.includes('PTS') && labels.includes('REB') && labels.includes('AST')
      if (!isBatting && !isPitching && !isBasketball) continue

      for (const entry of (statGroup.athletes || [])) {
        const athlete = entry.athlete || {}
        const id = String(athlete.id || '')
        const name = athlete.displayName || athlete.shortName || 'Unknown'
        const row = {
          id,
          name,
          team,
          position: athlete.position?.abbreviation || '',
          starter: Boolean(entry.starter),
          active: Boolean(entry.active),
          batOrder: Number(entry.batOrder || 0),
          kind: isPitching ? 'pitching' : isBasketball ? 'basketball' : 'batting',
          decision: (entry.notes || []).find((note: any) => note?.type === 'pitchingDecision')?.text || '',
          stats: isPitching ? {
            innings: statAt(labels, entry.stats || [], 'IP'),
            hitsAllowed: statNum(labels, entry.stats || [], 'H'),
            runs: statNum(labels, entry.stats || [], 'R'),
            earnedRuns: statNum(labels, entry.stats || [], 'ER'),
            walks: statNum(labels, entry.stats || [], 'BB'),
            strikeouts: statNum(labels, entry.stats || [], 'K'),
            homeRunsAllowed: statNum(labels, entry.stats || [], 'HR'),
            pitchCount: statAt(labels, entry.stats || [], 'PC') || statAt(labels, entry.stats || [], 'PC-ST'),
            era: statAt(labels, entry.stats || [], 'ERA'),
          } : isBasketball ? {
            minutes: statAt(labels, entry.stats || [], 'MIN'),
            points: statNum(labels, entry.stats || [], 'PTS'),
            rebounds: statNum(labels, entry.stats || [], 'REB'),
            assists: statNum(labels, entry.stats || [], 'AST'),
            turnovers: statNum(labels, entry.stats || [], 'TO'),
            steals: statNum(labels, entry.stats || [], 'STL'),
            blocks: statNum(labels, entry.stats || [], 'BLK'),
            offensiveRebounds: statNum(labels, entry.stats || [], 'OREB'),
            defensiveRebounds: statNum(labels, entry.stats || [], 'DREB'),
            threes: statAt(labels, entry.stats || [], '3PT'),
            fieldGoals: statAt(labels, entry.stats || [], 'FG'),
            freeThrows: statAt(labels, entry.stats || [], 'FT'),
            fouls: statNum(labels, entry.stats || [], 'PF'),
            plusMinus: statAt(labels, entry.stats || [], '+/-'),
          } : {
            atBats: statNum(labels, entry.stats || [], 'AB'),
            runs: statNum(labels, entry.stats || [], 'R'),
            hits: statNum(labels, entry.stats || [], 'H'),
            RBIs: statNum(labels, entry.stats || [], 'RBI'),
            homeRuns: statNum(labels, entry.stats || [], 'HR'),
            totalBases: statNum(labels, entry.stats || [], 'TB'),
            walks: statNum(labels, entry.stats || [], 'BB'),
            strikeouts: statNum(labels, entry.stats || [], 'K'),
            pitches: statNum(labels, entry.stats || [], '#P'),
            avg: statAt(labels, entry.stats || [], 'AVG'),
            obp: statAt(labels, entry.stats || [], 'OBP'),
            slg: statAt(labels, entry.stats || [], 'SLG'),
          },
        }
        players.push(row)
        if (id) byId[id] = row
        byName[normalizeNameKey(name)] = row
      }
    }
  }

  return { players, byId, byName }
}

function playerIdFrom(value: any): string {
  return String(value?.playerId || value?.athlete?.id || value?.id || value?.player?.id || '')
}

function playerNameFrom(value: any): string {
  return String(value?.athlete?.displayName || value?.athlete?.shortName || value?.player?.displayName || value?.player?.shortName || value?.displayName || value?.name || '')
}

function resolvePlayer(value: any, byId: Record<string, any>) {
  const id = playerIdFrom(value)
  const name = byId[id]?.name || playerNameFrom(value)
  return {
    occupied: Boolean(value),
    id,
    name,
    team: byId[id]?.team || '',
  }
}

function latestPlayWithParticipants(summary: any) {
  return [...(summary.plays || [])].reverse().find((play: any) => play?.participants?.length) || null
}

function participantId(play: any, type: string) {
  return String((play?.participants || []).find((p: any) => p.type === type)?.athlete?.id || '')
}

function parsePlays(summary: any, byId: Record<string, any>) {
  return (summary.plays || []).slice(-24).reverse().map((play: any) => {
    const batterId = participantId(play, 'batter')
    const pitcherId = participantId(play, 'pitcher')
    return {
      id: String(play.id || ''),
      text: play.text || play.type?.text || '',
      type: play.type?.text || play.type?.abbreviation || '',
      inning: play.period?.displayValue || '',
      half: play.period?.type || '',
      scoringPlay: Boolean(play.scoringPlay),
      scoreValue: Number(play.scoreValue || 0),
      awayScore: play.awayScore,
      homeScore: play.homeScore,
      wallclock: play.wallclock || '',
      outs: play.outs,
      balls: play.resultCount?.balls ?? play.pitchCount?.balls,
      strikes: play.resultCount?.strikes ?? play.pitchCount?.strikes,
      pitchType: play.pitchType?.abbreviation || play.pitchType?.text || '',
      pitchVelocity: play.pitchVelocity || null,
      batterId,
      batter: byId[batterId]?.name || '',
      pitcherId,
      pitcher: byId[pitcherId]?.name || '',
    }
  })
}

function nextBatters(players: any[], batterId: string, batterTeam: string) {
  if (!batterTeam) return []
  const battingOrder = players
    .filter(p => p.kind === 'batting' && p.team === batterTeam && Number(p.batOrder) > 0)
    .sort((a, b) => Number(a.batOrder) - Number(b.batOrder))
  if (!battingOrder.length) return []

  const currentIndex = battingOrder.findIndex(p => String(p.id) === String(batterId))
  if (currentIndex < 0) return []
  return [1, 2].map(offset => {
    const row = battingOrder[(currentIndex + offset) % battingOrder.length]
    return row ? { id: row.id, name: row.name, position: row.position, batOrder: row.batOrder, team: row.team } : null
  }).filter(Boolean)
}

function parseCompetitor(comp: any, homeAway: 'home' | 'away') {
  const c = (comp?.competitors || []).find((x: any) => x.homeAway === homeAway)
  return {
    id: String(c?.team?.id || ''),
    name: c?.team?.displayName || '',
    abbr: String(c?.team?.abbreviation || '').toUpperCase(),
    score: String(c?.score ?? ''),
    logo: '',
    linescores: (c?.linescores || []).map((x: any) => String(x.value ?? x.displayValue ?? '')),
  }
}

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'game-live', { limit: 60, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  const { searchParams } = req.nextUrl
  const eventId = searchParams.get('eventId')
  const sport = parseSport(searchParams.get('sport'))
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400, headers: NO_STORE_HEADERS })

  try {
    const summary = await fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH[sport]}/summary?event=${encodeURIComponent(eventId)}`)
    if (!summary) return NextResponse.json({ available: false, source: 'ESPN', updatedAt: new Date().toISOString() }, { headers: NO_STORE_HEADERS })

    const comp = summary.header?.competitions?.[0] || {}
    const status = comp.status || {}
    const situation = summary.situation || comp.situation || {}
    const parsedStats = parsePlayerStats(summary)
    const plays = parsePlays(summary, parsedStats.byId)
    const latestPlay = latestPlayWithParticipants(summary)
    const gameInProgress = status.type?.state === 'in'
    const fallbackPlay = gameInProgress ? latestPlay : null
    const currentBatterId = playerIdFrom(situation.batter) || participantId(fallbackPlay, 'batter')
    const currentPitcherId = playerIdFrom(situation.pitcher) || participantId(fallbackPlay, 'pitcher')
    const batterTeam = parsedStats.byId[currentBatterId]?.team || ''
    const currentPitcher = parsedStats.byId[currentPitcherId] || null
    const baseRunners = {
      first: resolvePlayer(situation.onFirst || fallbackPlay?.onFirst || fallbackPlay?.participants?.find((p: any) => p.type === 'onFirst'), parsedStats.byId),
      second: resolvePlayer(situation.onSecond || fallbackPlay?.onSecond || fallbackPlay?.participants?.find((p: any) => p.type === 'onSecond'), parsedStats.byId),
      third: resolvePlayer(situation.onThird || fallbackPlay?.onThird || fallbackPlay?.participants?.find((p: any) => p.type === 'onThird'), parsedStats.byId),
    }
    const awayTeam = parseCompetitor(comp, 'away')
    const homeTeam = parseCompetitor(comp, 'home')
    const statusDetail = status.type?.shortDetail || status.type?.detail || ''

    return NextResponse.json({
      available: true,
      source: 'ESPN',
      updatedAt: new Date().toISOString(),
      eventId,
      sport,
      statusLabel: statusDetail,
      inning: status.displayPeriod || status.period || '',
      inningHalf: status.periodPrefix || '',
      period: status.period || null,
      clock: status.displayClock || '',
      awayScore: awayTeam.score,
      homeScore: homeTeam.score,
      score: { away: awayTeam.score, home: homeTeam.score },
      status: {
        state: status.type?.state || '',
        detail: status.type?.detail || '',
        shortDetail: status.type?.shortDetail || '',
        period: status.period || null,
        displayPeriod: status.displayPeriod || '',
        periodPrefix: status.periodPrefix || '',
        completed: Boolean(status.type?.completed),
      },
      teams: {
        away: awayTeam,
        home: homeTeam,
      },
      situation: {
        balls: situation.balls ?? fallbackPlay?.resultCount?.balls ?? fallbackPlay?.pitchCount?.balls ?? null,
        strikes: situation.strikes ?? fallbackPlay?.resultCount?.strikes ?? fallbackPlay?.pitchCount?.strikes ?? null,
        outs: situation.outs ?? fallbackPlay?.outs ?? null,
        inning: status.displayPeriod || status.period || '',
        inningHalf: status.periodPrefix || fallbackPlay?.period?.type || '',
        onFirst: baseRunners.first.occupied,
        onSecond: baseRunners.second.occupied,
        onThird: baseRunners.third.occupied,
        bases: baseRunners,
        batterId: currentBatterId,
        batter: parsedStats.byId[currentBatterId]?.name || '',
        pitcherId: currentPitcherId,
        pitcher: currentPitcher?.name || '',
        pitcherRecord: currentPitcher?.decision || '',
        pitcherLine: currentPitcher?.stats || null,
        nextBatters: nextBatters(parsedStats.players, currentBatterId, batterTeam),
      },
      plays,
      boxScore: {
        away: parsedStats.players.filter(p => p.team === awayTeam.abbr),
        home: parsedStats.players.filter(p => p.team === homeTeam.abbr),
      },
      players: parsedStats.players,
      playerStatsById: parsedStats.byId,
      playerStatsByName: parsedStats.byName,
    }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('Game live error:', err)
    return NextResponse.json({ available: false, source: 'ESPN', updatedAt: new Date().toISOString(), error: 'Failed to fetch live game data' }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
