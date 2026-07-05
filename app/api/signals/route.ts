import { NextRequest, NextResponse } from 'next/server'
import { getJsonCache, getJsonList, prependJsonList, setJsonCache, setJsonList, getDurableCacheStatus } from '@/app/lib/durable-cache'
import { finishRouteTiming, startRouteTiming } from '@/app/lib/route-observability'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { computeSignalDeltas, type SignalDelta, type SignalDeltaSnapshot } from '@/app/lib/signals/delta-feed'
import { buildWhyCare, classifySignalDecision, type SignalDecisionResult } from '@/app/lib/signals/insight'
import { gradeLiquidity, type LiquidityGrade } from '@/app/lib/signals/liquidity'
import { completeWithAi } from '@/app/lib/ai-provider'
import { containsPublicJargon, publicResponse, stripPublicJargon } from '@/app/lib/signals/public-response'
import { buildJudgmentContext, statValueForMetric, type SignalJudgmentContext } from '@/app/lib/signals/judgment-context'
import { fetchXIntelForSignals, type XIntelContext } from '@/app/lib/social/x-intel'
import { fetchNewsIntelForSignals, type NewsIntelContext } from '@/app/lib/social/news-intel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SIGNAL_CACHE_SCHEMA = 'v18'
const TODAY_SIGNAL_SCHEMA = 'v16'

type Sport = 'nba' | 'nfl' | 'mlb' | 'nhl'
type SignalTier = 'A' | 'B' | 'WATCH' | 'KILL'

type SignalGame = {
  id: string
  gameTime?: string
  gameDate?: string
  status?: string
  homeTeam: { abbr: string; name?: string }
  awayTeam: { abbr: string; name?: string }
  mlbMatchup?: {
    homePitcher?: { name?: string; era?: number; difficulty?: number; label?: string }
    awayPitcher?: { name?: string; era?: number; difficulty?: number; label?: string }
  }
  totalLine?: number
  dkTotal?: number
  venue?: { name?: string; location?: string }
}

type SignalExecution = {
  side: 'YES'
  ask: number
  askSize: number
  bid?: number
  bidSize?: number
  maxBuy: number
  spread: number | null
  priceOk: boolean
  executable: boolean
  guidance: string
  warnings: string[]
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
  askSize?: number
  bid?: number
  bidSize?: number
  yesBid?: number
  yesBidSize?: number
  ticker: string
  url: string
  reasons: string[]
  flags: string[]
  createdAt: string
  execution?: SignalExecution
  liquidityGrade?: LiquidityGrade
  liquidityLabel?: string
  liquidityWarnings?: string[]
  decision?: SignalDecisionResult
  whyCare?: string[]
  changeSinceRefresh?: SignalDelta[]
  metadata?: {
    recentGames?: Array<{ value: number; opponent?: string; date?: string; eventId?: string }>
    todayIntel?: TodaySignalIntel
    lineOptions?: SignalLineOption[]
    judgmentContext?: SignalJudgmentContext
    teamIntel?: any
    xIntel?: XIntelContext
    newsIntel?: NewsIntelContext
    misreadCompanionOnly?: boolean
  }
}

type SignalLineOption = {
  id: string
  label: string
  line: number
  ask: number
  fairPrice: number
  edge: number
  maxBuy: number
  tier: SignalTier
  hits: number
  games: number
  avg: number
  ticker: string
  url: string
}

type TodaySignalIntel = {
  summary?: string
  lineup?: { status?: string; confidence?: string; reason?: string }
  injuryContext?: string[]
  usageContext?: string[]
  socialContext?: { status?: 'none' | 'monitor' | 'confirmed' | string; summary?: string; confidence?: string; sources?: string[] }
  riskFactors?: string[]
  whatCouldKillIt?: string[]
  displayBullets?: string[]
  sources?: string[]
  provider?: string
  model?: string
  generatedAt?: string
  unavailable?: string
}

type MlbMisreadRow = {
  id: string
  signalId?: string
  sport: 'mlb'
  gameId: string
  matchup: string
  gameTime: string
  player: string
  team: string
  metric: string
  label: string
  kind?: string
  misreadType: 'pitcher' | 'hitter'
  misreadLabel?: string
  severity?: string
  summary?: string
  reason?: string
  ratingTitle?: string
  bestFit?: string
  subRatings?: Array<{ label: string; score: number; detail?: string }>
  opponentProof?: string[]
  playerRating?: number
  opponentRating?: number
  matchupGap?: number
  tier?: SignalTier
  ask?: number
  edge?: number
  ticker?: string
  url?: string
}

type SignalsResponse = {
  sport: Sport
  generatedAt: string
  gamesScanned: number
  activeGameIds?: string[]
  contractsScored: number
  signals: ModelSignal[]
  mlbMisreads?: MlbMisreadRow[]
  changeSinceRefresh?: SignalDelta[]
  summary: {
    a: number
    b: number
    watch: number
    avgEdge: number
    bestEdge: number
  }
  cache?: ReturnType<typeof getDurableCacheStatus>
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
  ledger?: SignalLedgerEntry[]
}

type SettlementResponse = {
  sport: Sport
  checked: number
  graded: number
  remainingPending: number
  ledger: SignalLedgerEntry[]
}

function parseSport(value: unknown): Sport {
  const sport = String(value || 'nba').toLowerCase()
  return sport === 'mlb' || sport === 'nfl' || sport === 'nhl' ? sport : 'nba'
}

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function centsToProbability(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value / 100 : null
}

function optionalPositive(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

function formatCents(value: number): string {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value)}%` : '—'
}

function isAdminRequest(req: NextRequest, body?: any): boolean {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization') || ''
  const querySecret = req.nextUrl.searchParams.get('secret') || ''
  const bodySecret = typeof body?.secret === 'string' ? body.secret : ''
  return auth === `Bearer ${secret}` || querySecret === secret || bodySecret === secret
}

function buildExecution(input: {
  ask: number
  askSize: number
  bid: number
  bidSize: number
  maxBuy: number
  liquidityGrade: LiquidityGrade
  liquidityWarnings: string[]
}): SignalExecution {
  const priceOk = input.ask > 0 && input.maxBuy > 0 && input.ask <= input.maxBuy
  const liquid = input.liquidityGrade === 'real' || input.liquidityGrade === 'deep'
  const executable = priceOk && liquid
  const spread = input.bid > 0 && input.ask > 0 ? Math.round((input.ask - input.bid) * 10) / 10 : null
  const warnings = uniq([
    ...input.liquidityWarnings,
    input.ask <= 0 ? 'missing_ask' : '',
    input.ask > input.maxBuy ? 'above_max_buy' : '',
    input.bid <= 0 ? 'missing_bid' : '',
  ])

  let guidance = 'Buy YES only while the line stays inside the signal plan.'
  if (input.ask <= 0) guidance = 'No executable YES line is available.'
  else if (input.ask > input.maxBuy) guidance = 'Wait for a better YES line before entering.'
  else if (!liquid) guidance = 'Price is inside max-buy, but liquidity is too thin for an actionable entry.'

  return {
    side: 'YES',
    ask: input.ask,
    askSize: input.askSize,
    bid: optionalPositive(input.bid),
    bidSize: optionalPositive(input.bidSize),
    maxBuy: input.maxBuy,
    spread,
    priceOk,
    executable,
    guidance,
    warnings,
  }
}

function enrichSignal(signal: ModelSignal, generatedAt: string): ModelSignal {
  const ask = toNum(signal.ask)
  const askSize = toNum(signal.liquidity)
  const bid = toNum(signal.yesBid)
  const bidSize = toNum(signal.yesBidSize)
  const liquidity = gradeLiquidity({
    ask: centsToProbability(ask),
    askSize,
    bid: centsToProbability(bid),
    bidSize,
  })
  const execution = buildExecution({
    ask,
    askSize,
    bid,
    bidSize,
    maxBuy: toNum(signal.maxBuy),
    liquidityGrade: liquidity.grade,
    liquidityWarnings: liquidity.warnings,
  })
  const decision = classifySignalDecision({
    sport: signal.sport,
    tier: signal.tier,
    edge: centsToProbability(signal.edge),
    ask: centsToProbability(ask),
    maxBuy: centsToProbability(signal.maxBuy),
    liquidityGrade: liquidity.grade,
    flags: [...(signal.flags || []), ...liquidity.warnings],
    generatedAt: signal.createdAt || generatedAt,
  })
  const fallbackWhyCare = buildWhyCare({
    player: signal.player,
    label: signal.label,
    edge: centsToProbability(signal.edge),
    fairPrice: centsToProbability(signal.fairPrice),
    ask: centsToProbability(ask),
    hitRate: signal.games > 0 ? signal.hits / signal.games : null,
    hits: signal.hits,
    games: signal.games,
    reasons: signal.reasons,
    flags: signal.flags,
  })
  const intelBullets = signal.metadata?.todayIntel?.displayBullets
  const judgmentWhyCare = signal.metadata?.judgmentContext?.whyPlayerBullets
  const whyCare = Array.isArray(judgmentWhyCare) && judgmentWhyCare.length
    ? judgmentWhyCare.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : Array.isArray(intelBullets) && intelBullets.length
    ? intelBullets.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : Array.isArray(signal.whyCare) && signal.whyCare.some(item => !/^Recent form:|^Market is underpricing|^Recent form backs|^Price gap/i.test(String(item || '')))
      ? signal.whyCare.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : fallbackWhyCare

  return {
    ...signal,
    askSize,
    bid: optionalPositive(bid),
    bidSize: optionalPositive(bidSize),
    execution,
    liquidityGrade: liquidity.grade,
    liquidityLabel: liquidity.label,
    liquidityWarnings: liquidity.warnings,
    decision,
    whyCare,
  }
}

function signalDeltaSnapshot(signal: ModelSignal): SignalDeltaSnapshot {
  return {
    id: signal.id,
    label: `${signal.player} ${signal.label}`,
    player: signal.player,
    tier: signal.tier,
    edge: centsToProbability(signal.edge),
    ask: centsToProbability(signal.ask),
    fairPrice: centsToProbability(signal.fairPrice),
    liquidityGrade: signal.liquidityGrade ?? null,
  }
}

function attachSignalDeltas(signals: ModelSignal[], deltas: SignalDelta[]): ModelSignal[] {
  if (!deltas.length) return signals
  const byId = new Map<string, SignalDelta[]>()
  for (const delta of deltas) {
    const existing = byId.get(delta.id) || []
    existing.push(delta)
    byId.set(delta.id, existing)
  }
  return signals.map(signal => {
    const changeSinceRefresh = byId.get(signal.id)
    return changeSinceRefresh?.length ? { ...signal, changeSinceRefresh } : signal
  })
}

function enrichResponse(response: SignalsResponse): SignalsResponse {
  return {
    ...response,
    signals: response.signals.map(signal => enrichSignal(signal, response.generatedAt)),
  }
}

function latestCacheKey(sport: Sport, gameIds: string[]): string {
  return `signals:${SIGNAL_CACHE_SCHEMA}:latest:${sport}:${gameIds.join('|')}`
}

function lastCacheKey(sport: Sport): string {
  return `signals:${SIGNAL_CACHE_SCHEMA}:last:${sport}`
}

function normalizeSlateDate(value: unknown): string {
  const raw = String(value || '').trim()
  if (/^\d{8}$/.test(raw)) return raw
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '')
  return todayKey()
}

function slateSignature(gameIds: string[]): string {
  return gameIds.filter(Boolean).sort().join('|') || 'none'
}

function todaySignalsCacheKey(sport: Sport, slateDate: string, gameIds: string[] = []): string {
  return `signals:${TODAY_SIGNAL_SCHEMA}:daily:${sport}:${slateDate}:${slateSignature(gameIds)}`
}

function hasSignalSlateOverlap(response: SignalsResponse | null | undefined, activeGameIds: string[]): boolean {
  if (!response?.signals?.length || !activeGameIds.length) return false
  const active = new Set(activeGameIds)
  const previousIds = response.activeGameIds?.length ? response.activeGameIds : response.signals.map(signal => signal.gameId).filter(Boolean)
  return previousIds.some(id => active.has(id))
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
  const cushion = input.avg - input.line
  const cushionText = cushion >= 0
    ? `${cushion.toFixed(1)} above the ${input.line}+ line`
    : `${Math.abs(cushion).toFixed(1)} below the ${input.line}+ line`
  const reasons = [
    `Recent form: ${input.hits}/${input.games} clears with a ${input.avg.toFixed(1)} average — ${cushionText}.`,
    `Model likes it more than the current market: ${input.fairPrice}% model vs ${input.ask}% market leaves ${input.edge >= 0 ? '+' : ''}${input.edge}% value gap.`,
  ]
  const flags: string[] = []
  if (input.risk === 'high') flags.push('High volatility profile')
  if (input.edge < 5) flags.push('Small value gap')
  if (input.liquidity < 50) flags.push('Thin liquidity')
  if (input.ask > input.fairPrice) flags.push('Line moved against the signal')
  if (input.tier === 'WATCH') flags.push('Watch line/news before buying')
  return { reasons, flags }
}

function recentGamesForMetric(player: any, metric: string) {
  return (Array.isArray(player?.last12) ? player.last12 : [])
    .map((game: any) => {
      const value = statValueForMetric(game, metric)
      if (!Number.isFinite(value)) return null
      return {
        value: Number(value),
        opponent: String(game?.opponent || game?.opponentAbbr || game?.vs || '').trim() || undefined,
        date: String(game?.date || game?.gameDate || game?.shortDate || '').trim() || undefined,
        eventId: String(game?.eventId || game?.id || '').trim() || undefined,
      }
    })
    .filter(Boolean)
    .slice(0, 12) as Array<{ value: number; opponent?: string; date?: string; eventId?: string }>
}

function trustedInternalApiOrigin() {
  const explicitOrigin = process.env.INTERNAL_API_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (explicitOrigin) {
    const url = new URL(explicitOrigin)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid INTERNAL_API_ORIGIN protocol')
    return url.origin
  }

  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`).origin

  return `http://127.0.0.1:${process.env.PORT || 3000}`
}

async function fetchProps(sport: Sport, game: SignalGame, authHeaders?: HeadersInit, origin = trustedInternalApiOrigin()) {
  const url = new URL('/api/props', origin)
  url.searchParams.set('sport', sport)
  url.searchParams.set('home', game.homeTeam.abbr)
  url.searchParams.set('away', game.awayTeam.abbr)
  if (game.id) url.searchParams.set('eventId', game.id)
  const res = await fetch(url, { headers: authHeaders, cache: 'no-store', signal: AbortSignal.timeout(45_000) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `props failed ${res.status}`)
  return data
}

function scoreProps(sport: Sport, game: SignalGame, data: any, createdAt: string): { contracts: number; signals: ModelSignal[]; mlbMisreads: MlbMisreadRow[]; misreadSignals: ModelSignal[] } {
  const matchup = `${game.awayTeam.abbr} @ ${game.homeTeam.abbr}`
  const players = [...(data?.away || []), ...(data?.home || [])]
  const mlbGameContextFor = (team?: string) => sport === 'mlb' ? {
    playerTeam: String(team || '').toUpperCase(),
    homeTeam: game.homeTeam.abbr,
    awayTeam: game.awayTeam.abbr,
    homePitcher: game.mlbMatchup?.homePitcher,
    awayPitcher: game.mlbMatchup?.awayPitcher,
    homeProfile: data?.mlbMatchupContext?.homeProfile,
    awayProfile: data?.mlbMatchupContext?.awayProfile,
    totalLine: game.totalLine ?? game.dkTotal,
    venueName: game.venue?.name,
  } : undefined
  let contracts = 0
  const signals: ModelSignal[] = []
  const mlbMisreads: MlbMisreadRow[] = []
  const misreadSignals: ModelSignal[] = []

  for (const player of players) {
    for (const bet of player.recommendations || []) {
      const kalshi = bet.kalshi
      if (!kalshi?.ticker && !kalshi?.legTicker) continue
      contracts += 1
      const ask = toNum(kalshi.yesAsk)
      const liquidity = toNum(kalshi.yesAskSize)
      const yesBid = toNum(kalshi.yesBid)
      const yesBidSize = toNum(kalshi.yesBidSize)
      const fairPrice = Math.round(toNum(bet.fairProbability))
      const maxBuy = Math.round(toNum(bet.maxYesPrice))
      const hits = toNum(bet.hits)
      const games = toNum(bet.games)
      const avg = toNum(bet.avg ?? bet.last12Avg)
      const edge = fairPrice - ask
      const confidence = Math.max(0, Math.min(99, Math.round(toNum(bet.confidence) + Math.max(-10, Math.min(12, edge)) - riskPenalty(String(bet.risk || 'medium')))))
      const judgmentContext = buildJudgmentContext({
        player: player.player,
        metric: bet.metric,
        label: bet.label,
        line: bet.line,
        last12: player.last12,
        lastGameMinutes: player.lastGameMinutes,
        risk: bet.risk,
        mlbGameContext: mlbGameContextFor(player.team),
        mlbOpponentProof: Array.isArray(bet.opponentProof) ? bet.opponentProof : undefined,
      }) || undefined
      const mlbMisread = sport === 'mlb' ? judgmentContext?.mlbConviction?.misreadSignal : undefined
      let tier = tierFor(edge, confidence, hits, games, ask, liquidity, String(bet.risk || 'medium'))
      if (tier === 'KILL' && mlbMisread && edge >= 1 && ask > 0 && ask <= maxBuy && liquidity > 0) tier = 'WATCH'
      const ticker = kalshi.legTicker || kalshi.ticker
      const signalId = cleanId(`${sport}-${game.id}-${player.player}-${bet.metric}-${bet.line}-${ticker}`)
      if (sport === 'mlb' && mlbMisread) {
        const kind = String(mlbMisread.kind || '')
        const misreadType: 'pitcher' | 'hitter' = kind === 'pitcher_k' || /pitcher|strikeout/i.test(`${mlbMisread.label || ''} ${bet.label || ''}`) ? 'pitcher' : 'hitter'
        mlbMisreads.push({
          id: cleanId(`mlb-misread-${game.id}-${player.player}-${bet.metric}-${bet.line}-${ticker}`),
          signalId,
          sport: 'mlb',
          gameId: game.id,
          matchup,
          gameTime: game.gameTime || game.gameDate || '',
          player: player.player,
          team: player.team,
          metric: bet.metric,
          label: bet.label,
          kind,
          misreadType,
          misreadLabel: mlbMisread.label,
          severity: mlbMisread.severity,
          summary: mlbMisread.summary,
          reason: mlbMisread.reason,
          ratingTitle: mlbMisread.ratingTitle,
          bestFit: mlbMisread.bestFit,
          subRatings: mlbMisread.subRatings,
          opponentProof: mlbMisread.opponentProof,
          playerRating: mlbMisread.playerRating,
          opponentRating: mlbMisread.opponentRating,
          matchupGap: mlbMisread.matchupGap,
          tier,
          ask,
          edge,
          ticker,
          url: kalshi.url || '',
        })
      }
      const includeAsMisreadCompanion = sport === 'mlb' && Boolean(mlbMisread)
      if (tier === 'KILL' && !includeAsMisreadCompanion) continue
      const read = reasonsFor({ tier, edge, hits, games, avg, line: toNum(bet.line), ask, fairPrice, liquidity, risk: String(bet.risk || 'medium') })
      if (mlbMisread) {
        read.reasons.unshift(`${mlbMisread.label}: ${mlbMisread.summary}; gap ${mlbMisread.matchupGap >= 0 ? '+' : ''}${mlbMisread.matchupGap}.`)
        read.flags.push(mlbMisread.severity === 'strong' ? 'mlb_matchup_misread_strong' : 'mlb_matchup_misread_watch')
      }
      const signal: ModelSignal = {
        id: signalId,
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
        yesBid: optionalPositive(yesBid),
        yesBidSize: optionalPositive(yesBidSize),
        ticker,
        url: kalshi.url || '',
        reasons: read.reasons,
        flags: read.flags,
        createdAt,
        metadata: {
          recentGames: recentGamesForMetric(player, bet.metric),
          judgmentContext,
        },
      }
      if (tier !== 'KILL') signals.push(signal)
      if (includeAsMisreadCompanion) misreadSignals.push(signal)
    }
  }

  return { contracts, signals, mlbMisreads: dedupeMlbMisreads(mlbMisreads), misreadSignals }
}


function dedupeMlbMisreads(rows: MlbMisreadRow[]): MlbMisreadRow[] {
  const byKey = new Map<string, MlbMisreadRow>()
  for (const row of rows) {
    const key = [row.gameId, row.player.toLowerCase(), row.misreadType, row.metric.toLowerCase()].join('|')
    const existing = byKey.get(key)
    const rowScore = Math.abs(row.matchupGap ?? 0) * 10 + (row.edge ?? -100)
    const existingScore = existing ? Math.abs(existing.matchupGap ?? 0) * 10 + (existing.edge ?? -100) : -Infinity
    if (!existing || rowScore > existingScore) byKey.set(key, row)
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.misreadType !== b.misreadType) return a.misreadType === 'pitcher' ? -1 : 1
    return Math.abs(b.matchupGap ?? 0) - Math.abs(a.matchupGap ?? 0) || (b.edge ?? 0) - (a.edge ?? 0)
  })
}

function extractJsonObject(text: string): any | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced || trimmed
  try { return JSON.parse(candidate) } catch {}
  const first = candidate.indexOf('{')
  const last = candidate.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try { return JSON.parse(candidate.slice(first, last + 1)) } catch {}
  }
  return null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean).slice(0, 6) : []
}

function sanitizeIntel(raw: any, provider?: string, model?: string): TodaySignalIntel {
  const social = raw?.socialContext || {}
  const socialSummary = String(social.summary || '').trim()
  const normalizedSocialSummary = /say quiet|x\/news\/off-court read/i.test(socialSummary)
    ? 'Quiet: no credible public X/news/off-court signal found.'
    : socialSummary
  return {
    summary: String(raw?.summary || '').trim() || undefined,
    lineup: raw?.lineup ? {
      status: String(raw.lineup.status || '').trim() || undefined,
      confidence: String(raw.lineup.confidence || '').trim() || undefined,
      reason: String(raw.lineup.reason || '').trim() || undefined,
    } : undefined,
    injuryContext: asStringArray(raw?.injuryContext),
    usageContext: asStringArray(raw?.usageContext),
    socialContext: raw?.socialContext ? {
      status: String(social.status || 'none').trim() || 'none',
      summary: normalizedSocialSummary || undefined,
      confidence: String(social.confidence || '').trim() || undefined,
      sources: asStringArray(social.sources),
    } : undefined,
    riskFactors: asStringArray(raw?.riskFactors),
    whatCouldKillIt: asStringArray(raw?.whatCouldKillIt),
    displayBullets: asStringArray(raw?.displayBullets).map(stripPublicJargon).filter(item => item && !containsPublicJargon(item)).slice(0, 3),
    sources: asStringArray(raw?.sources),
    provider,
    model,
    generatedAt: new Date().toISOString(),
  }
}

async function fetchMatchupIntel(origin: string, sport: Sport, signal: ModelSignal): Promise<any | null> {
  if (sport !== 'nba') return null
  const [awayRaw, homeRaw] = signal.matchup.split('@').map(part => part.trim())
  if (!awayRaw || !homeRaw) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4500)
    const response = await fetch(`${origin}/api/team-intel?home=${encodeURIComponent(homeRaw)}&away=${encodeURIComponent(awayRaw)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) return null
    const data = await response.json()
    return {
      home: data.home ? { abbr: data.home.abbr, restDays: data.home.restDays, streakLabel: data.home.streakLabel, fatigue: data.home.fatigue?.summary } : null,
      away: data.away ? { abbr: data.away.abbr, restDays: data.away.restDays, streakLabel: data.away.streakLabel, fatigue: data.away.fatigue?.summary } : null,
      injuryImpact: data.injuryImpact ? {
        home: data.injuryImpact.home,
        away: data.injuryImpact.away,
        homeNotes: data.injuryImpact.homeNotes,
        awayNotes: data.injuryImpact.awayNotes,
      } : null,
      pace: data.pace ? { edgeLabel: data.pace.edgeLabel, implication: data.pace.implication, home: data.pace.home, away: data.pace.away } : null,
      h2h: data.h2h,
      edgeRead: data.edgeRead,
    }
  } catch {
    return null
  }
}

async function attachTodayIntel(signals: ModelSignal[], generatedAt: string, origin: string, sport: Sport): Promise<ModelSignal[]> {
  const candidates = signals.slice(0, 8)
  if (!candidates.length) return signals
  const matchupIntel = new Map<string, any>()
  await Promise.all(candidates.map(async signal => {
    const key = signal.matchup
    if (matchupIntel.has(key)) return
    matchupIntel.set(key, await fetchMatchupIntel(origin, sport, signal))
  }))
  const intelInputs = candidates.map(signal => ({
    id: signal.id,
    sport: signal.sport,
    player: signal.player,
    team: signal.team,
    matchup: signal.matchup,
    metric: signal.metric,
    label: signal.label,
    gameTime: signal.gameTime,
  }))
  const [xIntel, newsIntel] = await Promise.all([
    fetchXIntelForSignals(intelInputs, { maxPosts: 4, timeoutMs: 3500 }),
    fetchNewsIntelForSignals(intelInputs, { maxArticles: 4, timeoutMs: 3500 }),
  ])

  const ai = await completeWithAi({
    maxTokens: 5200,
    temperature: 0.05,
    xaiSearchParameters: {
      mode: 'auto',
      sources: [
        { type: 'x' },
        { type: 'news' },
        { type: 'web' },
      ],
    },
    messages: [
      {
        role: 'system',
        content: [
          'You are Athlete Intelligence, a sharp daily player-props analyst writing for bettors who need actionable context, not generic summaries.',
          'Return strict JSON only. No markdown.',
          'Use live/public search if available. Check X/social, beat writers, injury reports, team news, projected lineups/starters, rotation/minutes notes, rest/travel, and matchup context.',
          'When xIntel is provided, treat it as optional X API context: use it for receipts, but do not overstate weak/old/noisy posts. If X is missing, credit-depleted, or quiet, ignore it and use newsIntel/teamIntel/stats instead.',
          'When newsIntel is provided, treat it as non-X web/news receipts from Brave/Search: prefer official team reports, beat writers, injury pages, and credible preview articles over generic SEO pages.',
          'Use the provided teamIntel/injury/rest/pace context before making any generic claims.',
          'When multiple lineOptions are provided for the same player/category, treat them as one signal ladder, not separate picks.',
          'Do not include prediction-market jargon in user-facing bullets: no ask, fair, edge, misprice, cents, ladder, cushion, max buy, or market math.',
          'Write like a normal sports fan would understand it: recent form, role, matchup, injuries, minutes, and simple risk.',
          'Every display bullet must be concrete and plain English. Bad: "1c ask is extreme misprice vs 83 fair". Better: "He only needs 10 points, and he has been getting there almost every night."',
          'If there are multiple lines, explain them simply as safer line vs bigger-night line; do not say ladder entry.',
          'For private-life/off-court chatter, only report credible public information. If it is just rumor, label it unverified/monitor and do not state it as fact.',
          'Never invent sources, injuries, lineup status, family issues, relationship drama, or social chatter. If nothing credible is found, say social/news is quiet.',
          'If a signal is actually weak despite model edge, say why and include that in risk/kill factors.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'For each candidate, produce a Today Signals analyst card for normal sports fans. Return {"signals":[{"id":"...","summary":"one plain-English sentence with the actual read","lineup":{"status":"confirmed starter|projected starter|bench|questionable|unknown","confidence":"low|medium|high","reason":"specific evidence or why unknown"},"injuryContext":["plain injury/team context that affects role or minutes; empty if none credible"],"usageContext":["plain role, minutes, matchup, teammate impact; no odds jargon"],"socialContext":{"status":"quiet|monitor|confirmed","summary":"X/news/off-court read; say quiet if no credible signal","confidence":"low|medium|high","sources":["source names or URLs if known"]},"riskFactors":["plain downgrade risks"],"whatCouldKillIt":["plain pass/avoid triggers like minutes cap, inactive, blowout"],"displayBullets":["2-3 bullets max for normies: (1) why the player, (2) role/news/matchup, (3) simple risk; absolutely no ask/fair/edge/cents/misprice/ladder/market math"],"sources":["credible source names/URLs if known"]}]}',
          generatedAt,
          signals: candidates.map(signal => ({
            id: signal.id,
            player: signal.player,
            team: signal.team,
            matchup: signal.matchup,
            gameTime: signal.gameTime,
            prop: signal.label,
            metric: signal.metric,
            recent: { hits: signal.hits, games: signal.games, avg: signal.avg },
            judgmentContext: signal.metadata?.judgmentContext || null,
            lastGame: signal.metadata?.judgmentContext?.lastGame || null,
            shootingVolume: signal.metadata?.judgmentContext?.volume || null,
            minutes: signal.metadata?.judgmentContext?.minutes || null,
            trend: signal.metadata?.judgmentContext?.trend || null,
            recentGameRows: signal.metadata?.judgmentContext?.recentRows || [],
            market: { fair: signal.fairPrice, ask: signal.ask, edge: signal.edge, maxBuy: signal.maxBuy },
            lineOptions: signal.metadata?.lineOptions || [{ label: signal.label, ask: signal.ask, fair: signal.fairPrice, edge: signal.edge, maxBuy: signal.maxBuy, hits: signal.hits, games: signal.games, avg: signal.avg }],
            currentReasons: signal.reasons,
            recentGames: signal.metadata?.recentGames || [],
            teamIntel: matchupIntel.get(signal.matchup) || null,
            xIntel: xIntel.get(signal.id) || null,
            newsIntel: newsIntel.get(signal.id) || null,
          })),
        }),
      },
    ],
  })

  if (!ai.available) {
    return signals.map((signal, idx) => idx < candidates.length ? {
      ...signal,
      metadata: { ...(signal.metadata || {}), xIntel: xIntel.get(signal.id), newsIntel: newsIntel.get(signal.id), todayIntel: { unavailable: ai.error, generatedAt: new Date().toISOString() } },
    } : signal)
  }

  const parsed = extractJsonObject(ai.text)
  const byId = new Map<string, TodaySignalIntel>()
  for (const row of Array.isArray(parsed?.signals) ? parsed.signals : []) {
    const id = String(row?.id || '')
    if (id) byId.set(id, sanitizeIntel(row, ai.provider, ai.model))
  }

  return signals.map(signal => {
    const intel = byId.get(signal.id)
    const teamIntel = matchupIntel.get(signal.matchup) || null
    const signalXIntel = xIntel.get(signal.id)
    const signalNewsIntel = newsIntel.get(signal.id)
    const baseJudgmentContext = signal.metadata?.judgmentContext
    const judgmentContext = baseJudgmentContext ? {
      ...baseJudgmentContext,
      matchupNotes: [
        ...baseJudgmentContext.matchupNotes,
        ...(teamIntel?.pace?.implication ? [teamIntel.pace.implication] : []),
        ...(Array.isArray(teamIntel?.injuryImpact?.homeNotes) ? teamIntel.injuryImpact.homeNotes : []),
        ...(Array.isArray(teamIntel?.injuryImpact?.awayNotes) ? teamIntel.injuryImpact.awayNotes : []),
      ].map(note => String(note || '').trim()).filter(Boolean).slice(0, 3),
      injuryNotes: [
        ...baseJudgmentContext.injuryNotes,
        ...(Array.isArray(intel?.injuryContext) ? intel.injuryContext : []),
        intel?.lineup?.reason || '',
      ].map(note => String(note || '').trim()).filter(Boolean).slice(0, 3),
      riskNotes: [
        ...baseJudgmentContext.riskNotes,
        ...(Array.isArray(intel?.whatCouldKillIt) ? intel.whatCouldKillIt : []),
        ...(Array.isArray(intel?.riskFactors) ? intel.riskFactors : []),
      ].map(note => String(note || '').trim()).filter(Boolean).slice(0, 3),
    } : undefined
    if (!intel) return { ...signal, metadata: { ...(signal.metadata || {}), ...(teamIntel ? { teamIntel } : {}), ...(signalXIntel ? { xIntel: signalXIntel } : {}), ...(signalNewsIntel ? { newsIntel: signalNewsIntel } : {}), ...(judgmentContext ? { judgmentContext } : {}) } }
    const intelBullets = (intel.displayBullets || []).filter(Boolean).slice(0, 3)
    return {
      ...signal,
      whyCare: judgmentContext?.whyPlayerBullets?.length ? judgmentContext.whyPlayerBullets.slice(0, 3) : (intelBullets.length ? intelBullets : signal.whyCare),
      metadata: { ...(signal.metadata || {}), ...(teamIntel ? { teamIntel } : {}), ...(signalXIntel ? { xIntel: signalXIntel } : {}), ...(signalNewsIntel ? { newsIntel: signalNewsIntel } : {}), ...(judgmentContext ? { judgmentContext } : {}), todayIntel: intel },
    }
  })
}

function toLedgerEntries(signals: ModelSignal[], generatedAt: string): SignalLedgerEntry[] {
  return signals.map(signal => {
    const { changeSinceRefresh: _changeSinceRefresh, ...ledgerSignal } = signal
    return {
      ...ledgerSignal,
      ledgerId: cleanId(signal.id + '-' + generatedAt),
      status: 'pending',
      result: null,
      roiPct: null,
      wouldBuy: (signal.tier === 'A' || signal.tier === 'B') && (signal.execution?.executable ?? (signal.ask > 0 && signal.ask <= signal.maxBuy)),
      recordedAt: generatedAt,
    }
  })
}

function performanceFromLedger(ledger: SignalLedgerEntry[], includeLedger = false): SignalPerformanceResponse {
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
    ...(includeLedger ? { ledger: ledger.slice(0, 50) } : {}),
  }
}

function lineFromLabel(label: string): number {
  return toNum(label.match(/([0-9]+(?:\.[0-9]+)?)/)?.[1] || 0)
}

function roiForResult(entry: SignalLedgerEntry, hit: boolean): number | null {
  const ask = toNum(entry.ask)
  if (ask <= 0 || ask >= 100) return null
  return hit ? Math.round(((100 - ask) / ask) * 100) : -100
}

function signalLineOption(signal: ModelSignal): SignalLineOption {
  return {
    id: signal.id,
    label: signal.label,
    line: lineFromLabel(signal.label),
    ask: signal.ask,
    fairPrice: signal.fairPrice,
    edge: signal.edge,
    maxBuy: signal.maxBuy,
    tier: signal.tier,
    hits: signal.hits,
    games: signal.games,
    avg: signal.avg,
    ticker: signal.ticker,
    url: signal.url,
  }
}

function combinedLineLabel(options: SignalLineOption[], metric: string): string {
  const cleanMetric = metric.trim()
  const lines = options
    .map(option => option.line)
    .filter(line => Number.isFinite(line) && line > 0)
    .sort((a, b) => a - b)
  const uniqueLines = Array.from(new Set(lines.map(line => Number.isInteger(line) ? `${line.toFixed(0)}+` : `${line}+`)))
  if (!uniqueLines.length) return options[0]?.label || cleanMetric
  return `${uniqueLines.join(' / ')} ${cleanMetric}`.trim()
}

function groupSamePlayerCategorySignals(signals: ModelSignal[]): ModelSignal[] {
  const byKey = new Map<string, ModelSignal[]>()
  for (const signal of signals) {
    const key = [signal.sport, signal.gameId, signal.player.toLowerCase(), signal.team.toLowerCase(), signal.metric.toLowerCase()].join('|')
    const group = byKey.get(key) || []
    group.push(signal)
    byKey.set(key, group)
  }

  const grouped: ModelSignal[] = []
  for (const group of Array.from(byKey.values())) {
    if (group.length === 1) {
      grouped.push(group[0])
      continue
    }
    const sortedGroup = [...group].sort((a, b) => {
      const lineDiff = lineFromLabel(a.label) - lineFromLabel(b.label)
      return lineDiff || b.edge - a.edge || a.ask - b.ask
    })
    const options = sortedGroup.map(signalLineOption)
    const best = [...group].sort((a, b) => {
      const rank = (tier: SignalTier) => tier === 'A' ? 3 : tier === 'B' ? 2 : tier === 'WATCH' ? 1 : 0
      return rank(b.tier) - rank(a.tier) || b.edge - a.edge || a.ask - b.ask
    })[0]
    grouped.push({
      ...best,
      id: cleanId(`${best.sport}-${best.gameId}-${best.player}-${best.metric}-ladder`),
      label: combinedLineLabel(options, best.metric),
      reasons: uniq(group.flatMap(signal => signal.reasons || [])),
      flags: uniq(group.flatMap(signal => signal.flags || [])),
      metadata: {
        ...(best.metadata || {}),
        lineOptions: options,
      },
    })
  }

  return grouped.sort((a, b) => {
    const rank = (tier: SignalTier) => tier === 'A' ? 3 : tier === 'B' ? 2 : tier === 'WATCH' ? 1 : 0
    return rank(b.tier) - rank(a.tier) || b.edge - a.edge || b.confidence - a.confidence
  })
}

function curateSignalBoard(signals: ModelSignal[], max = 7): ModelSignal[] {
  const rank = (tier: SignalTier) => tier === 'A' ? 3 : tier === 'B' ? 2 : tier === 'WATCH' ? 1 : 0
  const sorted = [...signals].sort((a, b) => {
    const aScore = rank(a.tier) * 1000 + a.edge * 8 + a.confidence + Math.min(a.liquidity, 500) / 50
    const bScore = rank(b.tier) * 1000 + b.edge * 8 + b.confidence + Math.min(b.liquidity, 500) / 50
    return bScore - aScore
  })
  const picked: ModelSignal[] = []
  const players = new Set<string>()
  const games = new Map<string, number>()
  for (const signal of sorted) {
    if (picked.length >= max) break
    const playerKey = `${signal.gameId}|${signal.player.toLowerCase()}|${signal.metric.toLowerCase()}`
    if (players.has(playerKey)) continue
    const gameCount = games.get(signal.gameId) || 0
    if (gameCount >= 2 && picked.length >= 3) continue
    players.add(playerKey)
    games.set(signal.gameId, gameCount + 1)
    picked.push(signal)
  }
  for (const signal of sorted) {
    if (picked.length >= max) break
    if (!picked.some(item => item.id === signal.id)) picked.push(signal)
  }
  return picked
}

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'signals', { limit: 30, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  const timing = startRouteTiming('/api/signals')
  try {
    const sport = parseSport(req.nextUrl.searchParams.get('sport'))
    const limit = Math.max(25, Math.min(500, Number(req.nextUrl.searchParams.get('limit') || 200)))
    const includeLedger = req.nextUrl.searchParams.get('internal') === '1' && isAdminRequest(req)
    const ledger = await getJsonList<SignalLedgerEntry>('signals:ledger:' + sport, limit)
    return finishRouteTiming(timing, NextResponse.json(performanceFromLedger(ledger, includeLedger)))
  } catch (err) {
    console.error('Signals ledger error:', err)
    return finishRouteTiming(timing, NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load signal ledger' }, { status: 500 }))
  }
}

async function settleLedger(sport: Sport, limit: number): Promise<SettlementResponse> {
  const ledger = await getJsonList<SignalLedgerEntry>('signals:ledger:' + sport, Math.max(limit, 500))
  const pending = ledger.filter(row => row.status === 'pending').slice(0, limit)
  const propsCache = new Map<string, any>()
  let graded = 0

  for (const entry of pending) {
    const [awayRaw, homeRaw] = entry.matchup.split('@').map(part => part.trim())
    if (!awayRaw || !homeRaw) continue
    const key = awayRaw + '@' + homeRaw
    let data = propsCache.get(key)
    if (!data) {
      data = await fetchProps(sport, { id: entry.gameId, awayTeam: { abbr: awayRaw }, homeTeam: { abbr: homeRaw } })
      propsCache.set(key, data)
    }
    const players = [...(data?.away || []), ...(data?.home || [])]
    const player = players.find((p: any) => String(p.player || '').toLowerCase() === entry.player.toLowerCase())
    const gameLog = (player?.last12 || []).find((g: any) => String(g.eventId || '') === String(entry.gameId))
    if (!gameLog) continue
    const value = statValueForMetric(gameLog, entry.metric)
    if (value == null) continue
    const hit = value >= lineFromLabel(entry.label)
    entry.status = 'graded'
    entry.result = hit ? 'hit' : 'miss'
    entry.roiPct = roiForResult(entry, hit)
    entry.flags = [...(entry.flags || []).filter(flag => !flag.startsWith('Settled:')), 'Settled: ' + value + ' vs ' + entry.label]
    graded += 1
  }

  await setJsonList('signals:ledger:' + sport, ledger, 1000, 60 * 24 * 60 * 60_000)
  return { sport, checked: pending.length, graded, remainingPending: ledger.filter(row => row.status === 'pending').length, ledger: ledger.slice(0, 50) }
}

export async function POST(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'signals-write', { limit: 10, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  const timing = startRouteTiming('/api/signals')
  try {
    const body = await req.json().catch(() => ({}))
    const sport = parseSport(body.sport)
    if (body.action === 'settle') {
      const limit = Math.max(1, Math.min(100, Number(body.limit || 50)))
      return finishRouteTiming(timing, NextResponse.json(await settleLedger(sport, limit)))
    }
    const games = Array.isArray(body.games) ? body.games as SignalGame[] : []
    const activeGames = games.filter(g => g?.homeTeam?.abbr && g?.awayTeam?.abbr && g.status !== 'post').slice(0, sport === 'mlb' ? 15 : sport === 'nhl' ? 10 : 8)
    const activeGameIds = activeGames.map(g => g.id)
    const slateDate = normalizeSlateDate(body.slateDate || body.date)
    const cacheKey = latestCacheKey(sport, activeGameIds)
    const force = body.force === true
    const fast = body.fast === true
    const daily = body.daily === true && !fast
    const dailyCacheKey = todaySignalsCacheKey(sport, slateDate, activeGameIds)

    if (!activeGames.length) {
      const empty: SignalsResponse = {
        sport,
        generatedAt: new Date().toISOString(),
        gamesScanned: 0,
        activeGameIds: [],
        contractsScored: 0,
        signals: [],
        mlbMisreads: [],
        summary: { a: 0, b: 0, watch: 0, avgEdge: 0, bestEdge: 0 },
        cache: getDurableCacheStatus(),
      }
      return finishRouteTiming(timing, NextResponse.json(empty))
    }

    if (daily && !force) {
      const todayBoard = await getJsonCache<SignalsResponse>(dailyCacheKey)
      if (todayBoard?.signals?.length) {
        const cached = enrichResponse(todayBoard)
        return finishRouteTiming(timing, NextResponse.json(isAdminRequest(req, body) && body.internal === true ? cached : publicResponse(cached)))
      }
    }

    let previousLatest = await getJsonCache<SignalsResponse>(daily ? dailyCacheKey : cacheKey)
    if (!force && previousLatest) {
      const cached = enrichResponse(previousLatest)
      return finishRouteTiming(timing, NextResponse.json(isAdminRequest(req, body) && body.internal === true ? cached : publicResponse(cached)))
    }
    if (!previousLatest) {
      const lastResponse = await getJsonCache<SignalsResponse>(lastCacheKey(sport))
      previousLatest = hasSignalSlateOverlap(lastResponse, activeGameIds) ? lastResponse : null
    }

    const generatedAt = new Date().toISOString()
    const allSignals: ModelSignal[] = []
    const allMlbMisreads: MlbMisreadRow[] = []
    const allMisreadSignals: ModelSignal[] = []
    let contractsScored = 0

    const requestCookie = req.headers.get('cookie') || ''
    const requestAuth = req.headers.get('authorization') || ''
    const internalAuthHeaders: HeadersInit = {
      ...(requestCookie ? { cookie: requestCookie } : {}),
      ...(requestAuth ? { authorization: requestAuth } : {}),
    }

    for (let i = 0; i < activeGames.length; i += 3) {
      const batch = activeGames.slice(i, i + 3)
      const scored = await Promise.all(batch.map(async game => {
        const data = await fetchProps(sport, game, internalAuthHeaders, req.nextUrl.origin)
        return scoreProps(sport, game, data, generatedAt)
      }))
      for (const item of scored) {
        contractsScored += item.contracts
        allSignals.push(...item.signals)
        allMlbMisreads.push(...item.mlbMisreads)
        allMisreadSignals.push(...item.misreadSignals)
      }
    }

    const groupedSignals = groupSamePlayerCategorySignals(allSignals
      .sort((a, b) => {
        const rank = (tier: SignalTier) => tier === 'A' ? 3 : tier === 'B' ? 2 : tier === 'WATCH' ? 1 : 0
        return rank(b.tier) - rank(a.tier) || b.edge - a.edge || b.confidence - a.confidence
      })
      .slice(0, 60))
    const baseRankedSignals = (daily ? curateSignalBoard(groupedSignals, 7) : groupedSignals.slice(0, 40))
      .map(signal => enrichSignal(signal, generatedAt))

    const rankedSignals = daily ? await attachTodayIntel(baseRankedSignals, generatedAt, req.nextUrl.origin, sport) : baseRankedSignals

    const previousSignals = previousLatest?.signals?.length ? enrichResponse(previousLatest).signals : []
    const previousBoardSignals = previousSignals.filter(signal => !signal.metadata?.misreadCompanionOnly)
    const changeSinceRefresh = previousBoardSignals.length
      ? computeSignalDeltas(previousBoardSignals.map(signalDeltaSnapshot), rankedSignals.map(signalDeltaSnapshot))
      : []
    const boardSignals = attachSignalDeltas(rankedSignals, changeSinceRefresh)

    const mlbMisreads = sport === 'mlb' ? dedupeMlbMisreads(allMlbMisreads) : undefined
    const signals = (() => {
      if (sport !== 'mlb' || !mlbMisreads?.length) return boardSignals
      const presentIds = new Set(boardSignals.map(signal => signal.id))
      const companionById = new Map(allMisreadSignals.map(signal => [signal.id, signal]))
      const companions: ModelSignal[] = []
      for (const row of mlbMisreads) {
        const companion = row.signalId ? companionById.get(row.signalId) : undefined
        if (!companion || presentIds.has(companion.id) || companions.some(existing => existing.id === companion.id)) continue
        companions.push(enrichSignal({ ...companion, metadata: { ...(companion.metadata || {}), misreadCompanionOnly: true } }, generatedAt))
      }
      return [...boardSignals, ...companions]
    })()

    const edges = boardSignals.map(s => s.edge)
    const response: SignalsResponse = {
      sport,
      generatedAt,
      gamesScanned: activeGames.length,
      activeGameIds,
      contractsScored,
      signals,
      ...(mlbMisreads ? { mlbMisreads } : {}),
      changeSinceRefresh: changeSinceRefresh.length ? changeSinceRefresh : undefined,
      summary: {
        a: signals.filter(s => s.tier === 'A').length,
        b: signals.filter(s => s.tier === 'B').length,
        watch: signals.filter(s => s.tier === 'WATCH').length,
        avgEdge: edges.length ? Math.round(edges.reduce((sum, n) => sum + n, 0) / edges.length) : 0,
        bestEdge: edges.length ? Math.max(...edges) : 0,
      },
      cache: getDurableCacheStatus(),
    }

    await setJsonCache(cacheKey, response, 5 * 60_000)
    if (daily) await setJsonCache(dailyCacheKey, response, 20 * 60 * 60_000)
    await setJsonCache(lastCacheKey(sport), response, 24 * 60 * 60_000)
    const ledgerEntries = toLedgerEntries(signals, generatedAt)
    await prependJsonList('signals:ledger:' + sport, ledgerEntries, 1000, 60 * 24 * 60 * 60_000)
    await prependJsonList('signals:ledger:' + sport + ':' + todayKey(), ledgerEntries, 1000, 60 * 24 * 60 * 60_000)

    const includeInternal = isAdminRequest(req, body) && body.internal === true
    return finishRouteTiming(timing, NextResponse.json(includeInternal ? response : publicResponse(response)))
  } catch (err) {
    console.error('Signals error:', err)
    return finishRouteTiming(timing, NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate signals' }, { status: 500 }))
  }
}
