import { NextRequest, NextResponse } from 'next/server'
import { getJsonCache, getJsonList, prependJsonList, setJsonCache } from '@/app/lib/durable-cache'
import { finishRouteTiming, startRouteTiming } from '@/app/lib/route-observability'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Sport = 'nba' | 'nfl' | 'mlb'
type SignalTier = 'A' | 'B' | 'WATCH' | 'KILL'

type SignalGame = {
  id: string
  gameTime?: string
  gameDate?: string
  status?: string
  homeTeam: { abbr: string; name?: string }
  awayTeam: { abbr: string; name?: string }
}

type ModelSignal = {
  id: string
  sport: Sport
  gameId: string
  matchup: string
  gameTime: string
  player: string
  team: string
  metric: string
  label: string
  tier: SignalTier
  projectedHitPct: number
  fairPrice: number
  ask: number
  maxBuy: number
  edge: number
  confidence: number
  hits: number
  games: number
  avg: number
  risk: string
  liquidity: number
  ticker: string
  url: string
  reasons: string[]
  flags: string[]
  createdAt: string
}

type SignalsResponse = {
  sport: Sport
  generatedAt: string
  gamesScanned: number
  contractsScored: number
  signals: ModelSignal[]
  summary: {
    a: number
    b: number
    watch: number
    avgEdge: number
    bestEdge: number
  }
}

type SignalLedgerEntry = ModelSignal & {
  ledgerId: string
  status: 'pending' | 'graded'
  result: 'hit' | 'miss' | null
  roiPct: number | null
  wouldBuy: boolean
  recordedAt: string
}

type SignalPerformanceResponse = {
  generatedAt: string
  total: number
  pending: number
  graded: number
  wins: number
  losses: number
  winRate: number | null
  avgEdge: number
  aSignals: number
  bSignals: number
  watchSignals: number
  ledger: SignalLedgerEntry[]
}

function parseSport(value: unknown): Sport {
  const sport = String(value || 'nba').toLowerCase()
  return sport === 'mlb' || sport === 'nfl' ? sport : 'nba'
}

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function cleanId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160)
}

function todayKey() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function riskPenalty(risk: string): number {
  return risk === 'high' ? 10 : risk === 'medium' ? 4 : 0
}

function tierFor(edge: number, confidence: number, hits: number, games: number, ask: number, liquidity: number, risk: string): SignalTier {
  if (liquidity <= 0 || ask <= 0) return 'KILL'
  if (games >= 12 && hits >= 10 && edge >= 8 && confidence >= 74 && risk !== 'high') return 'A'
  if (games >= 12 && hits >= 9 && edge >= 5 && confidence >= 66) return 'B'
  if (games >= 10 && hits >= 7 && edge >= 2) return 'WATCH'
  return 'KILL'
}

function reasonsFor(input: {
  tier: SignalTier
  edge: number
  hits: number
  games: number
  avg: number
  line: number
  ask: number
  fairPrice: number
  liquidity: number
  risk: string
}) {
  const reasons = [
    `Model fair ${input.fairPrice}c vs live ask ${input.ask}c: ${input.edge >= 0 ? '+' : ''}${input.edge}c edge.`,
    `Recent form: hit ${input.hits}/${input.games} with ${input.avg.toFixed(1)} average vs ${input.line}+ line.`,
    `Liquidity: ${input.liquidity} YES ask size.`,
  ]
  const flags: string[] = []
  if (input.risk === 'high') flags.push('High volatility profile')
  if (input.edge < 5) flags.push('Small price edge')
  if (input.liquidity < 50) flags.push('Thin liquidity')
  if (input.ask > input.fairPrice) flags.push('Ask above fair price')
  if (input.tier === 'WATCH') flags.push('Watch price/news before buying')
  return { reasons, flags }
}

async function fetchProps(origin: string, sport: Sport, game: SignalGame, cookieHeader: string) {
  const url = new URL('/api/props', origin)
  url.searchParams.set('sport', sport)
  url.searchParams.set('home', game.homeTeam.abbr)
  url.searchParams.set('away', game.awayTeam.abbr)
  const res = await fetch(url, { headers: cookieHeader ? { cookie: cookieHeader } : undefined, cache: 'no-store', signal: AbortSignal.timeout(45_000) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `props failed ${res.status}`)
  return data
}

function scoreProps(sport: Sport, game: SignalGame, data: any, createdAt: string): { contracts: number; signals: ModelSignal[] } {
  const matchup = `${game.awayTeam.abbr} @ ${game.homeTeam.abbr}`
  const players = [...(data?.away || []), ...(data?.home || [])]
  let contracts = 0
  const signals: ModelSignal[] = []

  for (const player of players) {
    for (const bet of player.recommendations || []) {
      const kalshi = bet.kalshi
      if (!kalshi?.ticker && !kalshi?.legTicker) continue
      contracts += 1
      const ask = toNum(kalshi.yesAsk)
      const liquidity = toNum(kalshi.yesAskSize)
      const fairPrice = Math.round(toNum(bet.fairProbability))
      const maxBuy = Math.round(toNum(bet.maxYesPrice))
      const hits = toNum(bet.hits)
      const games = toNum(bet.games)
      const avg = toNum(bet.avg ?? bet.last12Avg)
      const edge = fairPrice - ask
      const confidence = Math.max(0, Math.min(99, Math.round(toNum(bet.confidence) + Math.max(-10, Math.min(12, edge)) - riskPenalty(String(bet.risk || 'medium')))))
      const tier = tierFor(edge, confidence, hits, games, ask, liquidity, String(bet.risk || 'medium'))
      if (tier === 'KILL') continue
      const read = reasonsFor({ tier, edge, hits, games, avg, line: toNum(bet.line), ask, fairPrice, liquidity, risk: String(bet.risk || 'medium') })
      const ticker = kalshi.legTicker || kalshi.ticker
      signals.push({
        id: cleanId(`${sport}-${game.id}-${player.player}-${bet.metric}-${bet.line}-${ticker}`),
        sport,
        gameId: game.id,
        matchup,
        gameTime: game.gameTime || game.gameDate || '',
        player: player.player,
        team: player.team,
        metric: bet.metric,
        label: bet.label,
        tier,
        projectedHitPct: fairPrice,
        fairPrice,
        ask,
        maxBuy,
        edge,
        confidence,
        hits,
        games,
        avg,
        risk: bet.risk || 'medium',
        liquidity,
        ticker,
        url: kalshi.url || '',
        reasons: read.reasons,
        flags: read.flags,
        createdAt,
      })
    }
  }

  return { contracts, signals }
}

function toLedgerEntries(signals: ModelSignal[], generatedAt: string): SignalLedgerEntry[] {
  return signals.map(signal => ({
    ...signal,
    ledgerId: cleanId(signal.id + '-' + generatedAt),
    status: 'pending',
    result: null,
    roiPct: null,
    wouldBuy: (signal.tier === 'A' || signal.tier === 'B') && signal.ask > 0 && signal.ask <= signal.maxBuy,
    recordedAt: generatedAt,
  }))
}

function performanceFromLedger(ledger: SignalLedgerEntry[]): SignalPerformanceResponse {
  const graded = ledger.filter(row => row.status === 'graded')
  const wins = graded.filter(row => row.result === 'hit').length
  const losses = graded.filter(row => row.result === 'miss').length
  const edges = ledger.map(row => row.edge).filter(Number.isFinite)
  return {
    generatedAt: new Date().toISOString(),
    total: ledger.length,
    pending: ledger.filter(row => row.status === 'pending').length,
    graded: graded.length,
    wins,
    losses,
    winRate: graded.length ? Math.round((wins / graded.length) * 100) : null,
    avgEdge: edges.length ? Math.round(edges.reduce((sum, n) => sum + n, 0) / edges.length) : 0,
    aSignals: ledger.filter(row => row.tier === 'A').length,
    bSignals: ledger.filter(row => row.tier === 'B').length,
    watchSignals: ledger.filter(row => row.tier === 'WATCH').length,
    ledger: ledger.slice(0, 50),
  }
}

export async function GET(req: NextRequest) {
  const timing = startRouteTiming('/api/signals')
  try {
    const sport = parseSport(req.nextUrl.searchParams.get('sport'))
    const limit = Math.max(25, Math.min(500, Number(req.nextUrl.searchParams.get('limit') || 200)))
    const ledger = await getJsonList<SignalLedgerEntry>('signals:ledger:' + sport, limit)
    return finishRouteTiming(timing, NextResponse.json(performanceFromLedger(ledger)))
  } catch (err) {
    console.error('Signals ledger error:', err)
    return finishRouteTiming(timing, NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load signal ledger' }, { status: 500 }))
  }
}

export async function POST(req: NextRequest) {
  const timing = startRouteTiming('/api/signals')
  try {
    const body = await req.json().catch(() => ({}))
    const sport = parseSport(body.sport)
    const games = Array.isArray(body.games) ? body.games as SignalGame[] : []
    const activeGames = games.filter(g => g?.homeTeam?.abbr && g?.awayTeam?.abbr && g.status !== 'post').slice(0, sport === 'mlb' ? 15 : 8)
    const cacheKey = `signals:latest:${sport}:${activeGames.map(g => g.id).join('|')}`
    const force = body.force === true

    if (!activeGames.length) {
      const empty: SignalsResponse = { sport, generatedAt: new Date().toISOString(), gamesScanned: 0, contractsScored: 0, signals: [], summary: { a: 0, b: 0, watch: 0, avgEdge: 0, bestEdge: 0 } }
      return finishRouteTiming(timing, NextResponse.json(empty))
    }

    if (!force) {
      const cached = await getJsonCache<SignalsResponse>(cacheKey)
      if (cached) return finishRouteTiming(timing, NextResponse.json(cached))
    }

    const origin = req.nextUrl.origin
    const cookieHeader = req.headers.get('cookie') || ''
    const generatedAt = new Date().toISOString()
    const allSignals: ModelSignal[] = []
    let contractsScored = 0

    for (let i = 0; i < activeGames.length; i += 3) {
      const batch = activeGames.slice(i, i + 3)
      const scored = await Promise.all(batch.map(async game => {
        const data = await fetchProps(origin, sport, game, cookieHeader)
        return scoreProps(sport, game, data, generatedAt)
      }))
      for (const item of scored) {
        contractsScored += item.contracts
        allSignals.push(...item.signals)
      }
    }

    const signals = allSignals
      .sort((a, b) => {
        const rank = (tier: SignalTier) => tier === 'A' ? 3 : tier === 'B' ? 2 : tier === 'WATCH' ? 1 : 0
        return rank(b.tier) - rank(a.tier) || b.edge - a.edge || b.confidence - a.confidence
      })
      .slice(0, 40)

    const edges = signals.map(s => s.edge)
    const response: SignalsResponse = {
      sport,
      generatedAt,
      gamesScanned: activeGames.length,
      contractsScored,
      signals,
      summary: {
        a: signals.filter(s => s.tier === 'A').length,
        b: signals.filter(s => s.tier === 'B').length,
        watch: signals.filter(s => s.tier === 'WATCH').length,
        avgEdge: edges.length ? Math.round(edges.reduce((sum, n) => sum + n, 0) / edges.length) : 0,
        bestEdge: edges.length ? Math.max(...edges) : 0,
      },
    }

    await setJsonCache(cacheKey, response, 5 * 60_000)
    await setJsonCache(`signals:last:${sport}`, response, 24 * 60 * 60_000)
    const ledgerEntries = toLedgerEntries(signals, generatedAt)
    await prependJsonList('signals:ledger:' + sport, ledgerEntries, 1000, 60 * 24 * 60 * 60_000)
    await prependJsonList('signals:ledger:' + sport + ':' + todayKey(), ledgerEntries, 1000, 60 * 24 * 60 * 60_000)

    return finishRouteTiming(timing, NextResponse.json(response))
  } catch (err) {
    console.error('Signals error:', err)
    return finishRouteTiming(timing, NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate signals' }, { status: 500 }))
  }
}
