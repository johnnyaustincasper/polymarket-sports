import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { ESPN_ABBR } from '@/app/lib/nba-api'
import { finishRouteTiming, startRouteTiming } from '@/app/lib/route-observability'
import { getJsonCache, setJsonCache } from '@/app/lib/durable-cache'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KALSHI_API = 'https://external-api.kalshi.com/trade-api/v2'
const XAI_MODEL = process.env.XAI_MODEL || 'grok-3-mini'
const BRAVE_KEY = process.env.BRAVE_API_KEY || ''

type Sport = 'nba' | 'nfl' | 'mlb'
type Trend = 'over' | 'under' | 'push'
type PropQuality = 'bet' | 'lean' | 'watch' | 'skip'

interface GameLogEntry {
  eventId: string
  date: string
  opponent: string
  isHome: boolean
  result: string
  stats: Record<string, number>
}

interface KalshiMarketMatch {
  ticker: string
  title: string
  url: string
  legTicker: string
  eventTicker?: string
  yesAsk: number
  yesAskSize: number
  yesBid: number
  yesBidSize: number
  isCombo: boolean
}

interface PropsMarketSummary {
  scanned: number
  gameMatched: number
  candidateProps: number
  executableMatched: number
  playableMatched: number
  priceRejected: number
  status: 'no_markets' | 'no_candidates' | 'no_executable' | 'priced_out' | 'playable'
  statusLabel: string
  pages: number
  stale: boolean
}

interface KalshiMarketScan {
  markets: any[]
  scanned: number
  pages: number
}

type KalshiRawScan = KalshiMarketScan & { fetchedAt: number }

const KALSHI_RAW_TTL_MS = 120_000
const ESPN_TEAM_PROPS_TTL_MS = 5 * 60_000
const ESPN_PLAYER_GAMELOG_TTL_MS = 15 * 60_000
const ESPN_INJURY_TTL_MS = 2 * 60_000
const XAI_PROP_INTEL_TTL_MS = 10 * 60_000
const XAI_PROP_INTEL_TIMEOUT_MS = 10_000
const ESPN_GAMELOG_CONCURRENCY = 7
const kalshiRawCache = new Map<Sport, KalshiRawScan>()
const kalshiRawInflight = new Map<Sport, Promise<KalshiRawScan>>()
const kalshiMarketByTickerCache = new Map<string, Promise<any | null>>()

type TimedCache<T> = { value: T; fetchedAt: number }
const teamPropsCache = new Map<string, TimedCache<PlayerPropLine[]>>()
const teamPropsInflight = new Map<string, Promise<PlayerPropLine[]>>()
const playerGameLogCache = new Map<string, TimedCache<GameLogEntry[]>>()
const playerGameLogInflight = new Map<string, Promise<GameLogEntry[]>>()
const xaiPropIntelCache = new Map<string, TimedCache<PlayerPropLine[]>>()
const injuryReportCache = new Map<string, TimedCache<PlayerInjuryReport[]>>()

function isFullBoardSport(sport: Sport): boolean {
  return sport === 'nba' || sport === 'mlb'
}

function getFreshCache<T>(cache: Map<string, TimedCache<T>>, key: string, ttlMs: number): T | null {
  const cached = cache.get(key)
  return cached && Date.now() - cached.fetchedAt < ttlMs ? cached.value : null
}

function isTruthyParam(value: string | null): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>(resolve => { timeout = setTimeout(() => resolve(fallback), timeoutMs) }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function kalshiSupportedEventPrefixes(sport: Sport): string[] {
  return sport === 'nba'
    ? ['KXNBAPTS', 'KXNBAREB', 'KXNBAAST', 'KXNBASTL', 'KXNBABLK', 'KXNBA3PT']
    : sport === 'mlb'
      ? ['KXMLBHIT', 'KXMLBHR', 'KXMLBHRR', 'KXMLBTB', 'KXMLBKS']
      : ['KXNFLPASSYDS', 'KXNFLPASSYD', 'KXNFLPYDS', 'KXNFLPASSTD', 'KXNFLPTD', 'KXNFLRUSHYDS', 'KXNFLRUSHYD', 'KXNFLRYDS', 'KXNFLREC', 'KXNFLRECYDS', 'KXNFLRECYD']
}

interface PropRecommendation {
  metric: string
  label: string
  line: number
  avg: number
  last12Avg: number
  hitRate: number
  hits: number
  games: number
  quality: PropQuality
  confidence: number
  valueScore: number
  maxYesPrice: number
  fairProbability: number
  risk: 'low' | 'medium' | 'high'
  kalshi: KalshiMarketMatch | null
  xaiBacked: boolean
  socialContext: string[]
  explanation: string
}

export interface PlayerPropLine {
  player: string
  team: string
  position: string
  headshot?: string
  sport: Sport
  gamesPlayed: number
  pts?: { line: number; avg: number; trend: Trend }
  reb?: { line: number; avg: number; trend: Trend }
  ast?: { line: number; avg: number; trend: Trend }
  lastFive?: { pts: number; reb: number; ast: number }[]
  last12: GameLogEntry[]
  lastGameMinutes?: number
  recommendations: PropRecommendation[]
  bestBet: PropRecommendation | null
  injuryStatus?: string
  injuryDetail?: string
}

interface PlayerInjuryReport {
  name: string
  team: string
  position: string
  status: string
  detail: string
  updatedAt?: string
}

export interface PropsResponse {
  home: PlayerPropLine[]
  away: PlayerPropLine[]
  homeTeam: string
  awayTeam: string
  sport: Sport
  available: boolean
  marketSummary: PropsMarketSummary
}

const NFL_ABBR: Record<string, string> = {
  ARI: 'ari', ATL: 'atl', BAL: 'bal', BUF: 'buf', CAR: 'car', CHI: 'chi', CIN: 'cin', CLE: 'cle', DAL: 'dal', DEN: 'den', DET: 'det', GB: 'gb',
  HOU: 'hou', IND: 'ind', JAX: 'jax', KC: 'kc', LAC: 'lac', LAR: 'lar', LV: 'lv', MIA: 'mia', MIN: 'min', NE: 'ne', NO: 'no', NYG: 'nyg', NYJ: 'nyj',
  PHI: 'phi', PIT: 'pit', SEA: 'sea', SF: 'sf', TB: 'tb', TEN: 'ten', WAS: 'wsh', WSH: 'wsh',
}

const MLB_ABBR: Record<string, string> = {
  ARI: 'ari', AZ: 'ari', ATL: 'atl', BAL: 'bal', BOS: 'bos', CHC: 'chc', CHW: 'chw', CWS: 'chw', CIN: 'cin', CLE: 'cle', COL: 'col', DET: 'det', HOU: 'hou', KC: 'kc', KCR: 'kc', LAA: 'laa', LAD: 'lad', MIA: 'mia', MIL: 'mil', MIN: 'min', NYM: 'nym', NYY: 'nyy', ATH: 'ath', OAK: 'ath', PHI: 'phi', PIT: 'pit', SD: 'sd', SDP: 'sd', SEA: 'sea', SF: 'sf', SFG: 'sf', STL: 'stl', TB: 'tb', TBR: 'tb', TEX: 'tex', TOR: 'tor', WSH: 'wsh', WAS: 'wsh',
}

const MLB_TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Diamondbacks', AZ: 'Arizona Diamondbacks', ATL: 'Atlanta Braves', BAL: 'Baltimore Orioles', BOS: 'Boston Red Sox',
  CHC: 'Chicago Cubs', CHW: 'Chicago White Sox', CWS: 'Chicago White Sox', CIN: 'Cincinnati Reds', CLE: 'Cleveland Guardians',
  COL: 'Colorado Rockies', DET: 'Detroit Tigers', HOU: 'Houston Astros', KC: 'Kansas City Royals', KCR: 'Kansas City Royals',
  LAA: 'Los Angeles Angels', LAD: 'Los Angeles Dodgers', MIA: 'Miami Marlins', MIL: 'Milwaukee Brewers', MIN: 'Minnesota Twins',
  NYM: 'New York Mets', NYY: 'New York Yankees', ATH: 'Athletics', OAK: 'Athletics', PHI: 'Philadelphia Phillies',
  PIT: 'Pittsburgh Pirates', SD: 'San Diego Padres', SDP: 'San Diego Padres', SEA: 'Seattle Mariners',
  SF: 'San Francisco Giants', SFG: 'San Francisco Giants', STL: 'St. Louis Cardinals', TB: 'Tampa Bay Rays',
  TBR: 'Tampa Bay Rays', TEX: 'Texas Rangers', TOR: 'Toronto Blue Jays', WSH: 'Washington Nationals', WAS: 'Washington Nationals',
}

function toNum(v: unknown): number {
  if (v === '-' || v == null) return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function roundLine(avg: number): number {
  return Math.round(avg * 2) / 2
}

function calcTrend(avg: number, line: number): Trend {
  if (avg > line + 0.25) return 'over'
  if (avg < line - 0.25) return 'under'
  return 'push'
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0
}

function latestMinutes(logs: GameLogEntry[]): number | undefined {
  const minutes = Number(logs[0]?.stats?.minutes)
  return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined
}

function withLastGameMinutes(player: PlayerPropLine): PlayerPropLine {
  return player.lastGameMinutes ? player : { ...player, lastGameMinutes: latestMinutes(player.last12 || []) }
}

function pct(n: number): number {
  return Math.round(n * 100)
}


function minimumPlayableLine(avgValue: number, metricLabel: string): number {
  if (metricLabel === 'points') return avgValue >= 27 ? 20 : avgValue >= 20 ? 15 : avgValue >= 14 ? 10 : 0
  if (metricLabel === 'rebounds') return avgValue >= 11 ? 10 : avgValue >= 8 ? 8 : avgValue >= 6 ? 6 : 0
  if (metricLabel === 'assists') return avgValue >= 9 ? 8 : avgValue >= 6 ? 6 : avgValue >= 4 ? 4 : 0
  if (metricLabel === 'PTS+REB+AST') return avgValue >= 42 ? 35 : avgValue >= 34 ? 30 : avgValue >= 26 ? 25 : 0
  if (metricLabel === 'steals') return avgValue >= 1.2 ? 1 : 0
  if (metricLabel === 'blocks') return avgValue >= 1.2 ? 1 : 0
  if (metricLabel === 'threes') return avgValue >= 3 ? 2 : avgValue >= 1.5 ? 1 : 0
  if (metricLabel === 'passing yards') return avgValue >= 275 ? 250 : avgValue >= 240 ? 225 : avgValue >= 205 ? 200 : 0
  if (metricLabel === 'passing TDs') return avgValue >= 2.2 ? 2 : 1
  if (metricLabel === 'rushing yards') return avgValue >= 80 ? 60 : avgValue >= 55 ? 40 : avgValue >= 35 ? 30 : 0
  if (metricLabel === 'receiving yards') return avgValue >= 80 ? 60 : avgValue >= 55 ? 40 : avgValue >= 35 ? 30 : 0
  if (metricLabel === 'receptions') return avgValue >= 7 ? 6 : avgValue >= 5 ? 4 : avgValue >= 3 ? 3 : 0
  if (metricLabel === 'hits') return avgValue >= 1.7 ? 2 : 1
  if (metricLabel === 'total bases') return avgValue >= 3.2 ? 3 : avgValue >= 2.2 ? 2 : 0
  if (metricLabel === 'strikeouts') return avgValue >= 8 ? 7 : avgValue >= 6 ? 5 : avgValue >= 4 ? 3 : 0
  return 0
}

function findBinaryThreshold(values: number[], metricLabel: string): PropRecommendation | null {
  if (values.length < 4) return null
  const last12Avg = avg(values)
  const hits = values.filter(v => v >= 1).length
  const hitRate = hits / values.length
  if (hitRate < 0.18) return null
  const fairProbability = Math.max(0.05, Math.min(0.82, hitRate * 0.82 + (last12Avg >= 0.35 ? 0.04 : -0.03)))
  const maxYesPrice = Math.max(5, Math.min(76, Math.round(fairProbability * 100 - 7)))
  const confidence = Math.max(0, Math.min(88, Math.round(hitRate * 70 + Math.min(values.length, 12))))
  const quality: PropQuality = hitRate >= 0.42 ? 'lean' : hitRate >= 0.25 ? 'watch' : 'skip'
  if (quality === 'skip') return null
  const risk: PropRecommendation['risk'] = hitRate >= 0.4 ? 'medium' : 'high'
  const label = `1+ ${metricLabel}`
  return {
    metric: metricLabel,
    label,
    line: 1,
    avg: Number(last12Avg.toFixed(1)),
    last12Avg: Number(last12Avg.toFixed(1)),
    hitRate: pct(hitRate),
    hits,
    games: values.length,
    quality,
    confidence,
    valueScore: Math.round(hitRate * 70 + last12Avg * 8 - (risk === 'high' ? 8 : 0)),
    maxYesPrice,
    fairProbability: pct(fairProbability),
    risk,
    kalshi: null,
    xaiBacked: false,
    socialContext: [],
    explanation: `${label} hit ${hits}/${values.length} with a ${last12Avg.toFixed(1)} last-12 avg. I would only bet YES at ${maxYesPrice}¢ or better. Risk: ${risk}.`,
  }
}

function buildThresholdRecommendation(values: number[], line: number, metricLabel: string): PropRecommendation | null {
  if (values.length < 4) return null
  const last12Avg = avg(values)
  const minPlayableLine = minimumPlayableLine(last12Avg, metricLabel)
  const volatility = Math.sqrt(avg(values.map(v => Math.pow(v - last12Avg, 2))))
  if (line < minPlayableLine || last12Avg < line * 0.75 || line > last12Avg + Math.max(3, volatility * 0.35)) return null
  const hits = values.filter(v => v >= line).length
  const hitRate = hits / values.length
  const margin = last12Avg - line
  const cushion = volatility ? margin / volatility : margin
  const fairProbability = Math.max(0.05, Math.min(0.92, hitRate * 0.72 + (last12Avg >= line ? 0.10 : -0.06) + Math.max(-0.08, Math.min(0.08, cushion * 0.05))))
  const maxYesPrice = Math.max(5, Math.min(88, Math.round(fairProbability * 100 - 6)))
  const confidence = Math.max(0, Math.min(95, Math.round(hitRate * 64 + Math.max(0, cushion) * 8 + Math.min(values.length, 12))))
  const quality: PropQuality = hitRate >= 0.67 && margin >= 0 ? 'bet' : hitRate >= 0.58 && margin >= -0.5 ? 'lean' : hitRate >= 0.5 ? 'watch' : 'skip'
  if (quality === 'skip') return null
  const risk: PropRecommendation['risk'] = volatility <= Math.max(3, last12Avg * 0.22) ? 'low' : volatility <= Math.max(6, last12Avg * 0.38) ? 'medium' : 'high'
  const thresholdAmbition = last12Avg > 0 ? Math.min(20, (line / last12Avg) * 22) : 0
  const consistency = hitRate * 55
  const cushionScore = Math.max(-8, Math.min(12, cushion * 6))
  const riskPenalty = risk === 'high' ? 8 : risk === 'medium' ? 3 : 0
  const valueScore = Math.round(consistency + thresholdAmbition + cushionScore - riskPenalty)
  const label = `${line}+ ${metricLabel}`
  const priceText = `I would only bet YES at ${maxYesPrice}¢ or better`
  return {
    metric: metricLabel,
    label,
    line,
    avg: Number(last12Avg.toFixed(1)),
    last12Avg: Number(last12Avg.toFixed(1)),
    hitRate: pct(hitRate),
    hits,
    games: values.length,
    quality,
    confidence,
    valueScore,
    maxYesPrice,
    fairProbability: pct(fairProbability),
    risk,
    kalshi: null,
    xaiBacked: false,
    socialContext: [],
    explanation: `${label} is live on Kalshi and passed the signal gate: hit ${hits}/${values.length}, ${last12Avg.toFixed(1)} last-12 avg, ${margin >= 0 ? `${margin.toFixed(1)} cushion` : `${Math.abs(margin).toFixed(1)} below average`}. ${priceText}. Risk: ${risk}.`,
  }
}

function buildMarketRecommendation(values: number[], line: number, metricLabel: string, sport?: Sport): PropRecommendation | null {
  if (values.length < 4) return null
  const last12Avg = avg(values)
  const hits = values.filter(v => v >= line).length
  const hitRate = hits / values.length
  const margin = last12Avg - line
  const volatility = Math.sqrt(avg(values.map(v => Math.pow(v - last12Avg, 2))))
  const cushion = volatility ? margin / volatility : margin
  const fairProbability = Math.max(0.05, Math.min(0.92, hitRate * 0.72 + (last12Avg >= line ? 0.10 : -0.06) + Math.max(-0.08, Math.min(0.08, cushion * 0.05))))
  const maxYesPrice = Math.max(5, Math.min(88, Math.round(fairProbability * 100 - 6)))
  const confidence = Math.max(0, Math.min(95, Math.round(hitRate * 64 + Math.max(0, cushion) * 8 + Math.min(values.length, 12))))
  const quality: PropQuality = hitRate >= 0.67 && margin >= 0 ? 'bet' : hitRate >= 0.58 && margin >= -0.5 ? 'lean' : hitRate >= 0.5 ? 'watch' : 'skip'
  if (quality === 'skip' && (!sport || !isFullBoardSport(sport))) return null
  const risk: PropRecommendation['risk'] = volatility <= Math.max(3, last12Avg * 0.22) ? 'low' : volatility <= Math.max(6, last12Avg * 0.38) ? 'medium' : 'high'
  const valueScore = Math.round(hitRate * 55 + Math.max(-8, Math.min(12, cushion * 6)) - (risk === 'high' ? 8 : risk === 'medium' ? 3 : 0))
  const label = `${line}+ ${metricLabel}`
  return {
    metric: metricLabel,
    label,
    line,
    avg: Number(last12Avg.toFixed(1)),
    last12Avg: Number(last12Avg.toFixed(1)),
    hitRate: pct(hitRate),
    hits,
    games: values.length,
    quality,
    confidence,
    valueScore,
    maxYesPrice,
    fairProbability: pct(fairProbability),
    risk,
    kalshi: null,
    xaiBacked: false,
    socialContext: [],
    explanation: `${label}: hit ${hits}/${values.length}, ${last12Avg.toFixed(1)} last-12 avg, ${margin >= 0 ? `${margin.toFixed(1)} cushion` : `${Math.abs(margin).toFixed(1)} below line`}. Model max YES ${maxYesPrice}¢. Risk: ${risk}.`,
  }
}

function shouldSurfaceKalshiRecommendation(rec: PropRecommendation, sport: Sport): boolean {
  if (!rec.kalshi) return false
  // Full-board sports need every executable Kalshi contract visible. The price edge is still
  // shown in-card via ask/max, but hiding above-max asks made the slate look empty.
  if (isFullBoardSport(sport)) return true
  return Number(rec.kalshi.yesAsk) <= Number(rec.maxYesPrice)
}

function findBestThreshold(values: number[], thresholds: number[], metricLabel: string): PropRecommendation | null {
  const candidates = (thresholds
    .map(line => buildThresholdRecommendation(values, line, metricLabel))
    .filter(Boolean) as PropRecommendation[])
    .sort((a, b) => {
      const rank = (q: PropQuality) => q === 'bet' ? 3 : q === 'lean' ? 2 : q === 'watch' ? 1 : 0
      return rank(b.quality) - rank(a.quality) || b.valueScore - a.valueScore || b.line - a.line
    })
  return candidates[0] || null
}


function dollarsToCents(v: unknown): number {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function sizeToNum(v: unknown): number {
  const n = Number(v || 0)
  return Number.isFinite(n) ? n : 0
}

function metricPrefixes(metric: string, sport: Sport): string[] {
  if (sport === 'nba') {
    if (metric === 'points') return ['KXNBAPTS']
    if (metric === 'rebounds') return ['KXNBAREB']
    if (metric === 'assists') return ['KXNBAAST']
    if (metric === 'steals') return ['KXNBASTL']
    if (metric === 'blocks') return ['KXNBABLK']
    if (metric === 'threes') return ['KXNBA3PT']
    return []
  }
  if (sport === 'mlb') {
    if (metric === 'hits') return ['KXMLBHIT']
    if (metric === 'home runs') return ['KXMLBHR']
    if (metric === 'hits + runs + RBIs') return ['KXMLBHRR']
    if (metric === 'total bases') return ['KXMLBTB']
    if (metric === 'strikeouts') return ['KXMLBKS']
    // No live RBI-only Kalshi player-prop prefix was observed during implementation;
    // do not guess one and accidentally match the wrong market family.
    return []
  }
  if (metric === 'passing yards') return ['KXNFLPASSYDS', 'KXNFLPASSYD', 'KXNFLPYDS']
  if (metric === 'passing TDs') return ['KXNFLPASSTD', 'KXNFLPTD']
  if (metric === 'rushing yards') return ['KXNFLRUSHYDS', 'KXNFLRUSHYD', 'KXNFLRYDS']
  if (metric === 'receptions') return ['KXNFLREC']
  if (metric === 'receiving yards') return ['KXNFLRECYDS', 'KXNFLRECYD']
  return []
}


function sportPropMetrics(sport: Sport): string[] {
  if (sport === 'nba') return ['points', 'rebounds', 'assists', 'threes', 'steals', 'blocks', 'PTS+REB+AST']
  if (sport === 'mlb') return ['hits', 'home runs', 'hits + runs + RBIs', 'total bases', 'strikeouts']
  return ['passing yards', 'passing TDs', 'rushing yards', 'receiving yards', 'receptions']
}

function kalshiTeamCode(abbr: string, sport: Sport): string {
  const upper = abbr.toUpperCase()
  if (sport === 'nba') {
    const map: Record<string, string> = { NY: 'NYK', SA: 'SAS', GS: 'GSW', PHX: 'PHX', NO: 'NOP', BKN: 'BKN' }
    return map[upper] || upper
  }
  if (sport === 'mlb') {
    const map: Record<string, string> = {
      AZ: 'ARI', ARI: 'ARI',
      ATH: 'ATH', OAK: 'ATH',
      // ESPN labels the White Sox as CHW; Kalshi MLB player-prop tickers use CWS.
      CWS: 'CWS', CHW: 'CWS',
      WSH: 'WSH', WAS: 'WSH',
      SD: 'SD', SF: 'SF', TB: 'TB',
    }
    return map[upper] || upper
  }
  return upper
}

function marketContainsGame(market: any, home: string, away: string): boolean {
  const hay = `${market.title || ''} ${JSON.stringify(market.custom_strike || {})} ${JSON.stringify(market.mve_selected_legs || [])}`.toUpperCase()
  return (hay.includes(`${away}${home}`) || hay.includes(`${home}${away}`) || (hay.includes(home) && hay.includes(away)))
}

async function fetchKalshiRawMarkets(sport: Sport): Promise<KalshiRawScan> {
  const cached = kalshiRawCache.get(sport)
  if (cached && Date.now() - cached.fetchedAt < KALSHI_RAW_TTL_MS) return cached

  const inflight = kalshiRawInflight.get(sport)
  if (inflight) return inflight

  const durableKey = `kalshi:raw:v2:${sport}`
  const durableCached = await getJsonCache<KalshiRawScan>(durableKey)
  if (durableCached && Date.now() - durableCached.fetchedAt < KALSHI_RAW_TTL_MS) {
    kalshiRawCache.set(sport, durableCached)
    return durableCached
  }

  const promise = (async (): Promise<KalshiRawScan> => {
    try {
      const markets: any[] = []
      let cursor = ''
      let pages = 0
      // Player props can sit outside the generic open-market pagination. Pull
      // the broad book for combos, then pull each supported player-prop series
      // directly so standalone Kalshi props (KXNBAPTS/KXNBAREB/etc.) are not
      // missed just because they are past the first ~1200 generic markets.
      for (let page = 0; page < 20; page++) {
        const params = new URLSearchParams({ status: 'open', limit: '200' })
        if (cursor) params.set('cursor', cursor)
        const res = await fetch(`${KALSHI_API}/markets?${params.toString()}`, { signal: AbortSignal.timeout(12000), next: { revalidate: 30 } })
        if (!res.ok) break
        const data = await res.json()
        markets.push(...(data.markets || []))
        pages += 1
        cursor = String(data.cursor || '')
        if (!cursor) break
      }

      for (const seriesTicker of kalshiSupportedEventPrefixes(sport)) {
        cursor = ''
        for (let page = 0; page < 4; page++) {
          const params = new URLSearchParams({ status: 'open', limit: '200', series_ticker: seriesTicker })
          if (cursor) params.set('cursor', cursor)
          const res = await fetch(`${KALSHI_API}/markets?${params.toString()}`, { signal: AbortSignal.timeout(12000), next: { revalidate: 30 } })
          if (!res.ok) break
          const data = await res.json()
          markets.push(...(data.markets || []))
          pages += 1
          cursor = String(data.cursor || '')
          if (!cursor) break
        }
      }
      const scan = { markets, scanned: markets.length, pages, fetchedAt: Date.now() }
      kalshiRawCache.set(sport, scan)
      await setJsonCache(durableKey, scan, KALSHI_RAW_TTL_MS)
      return scan
    } catch {
      const scan = { markets: [], scanned: 0, pages: 0, fetchedAt: Date.now() }
      kalshiRawCache.set(sport, scan)
      await setJsonCache(durableKey, scan, Math.min(KALSHI_RAW_TTL_MS, 30_000))
      return scan
    } finally {
      kalshiRawInflight.delete(sport)
    }
  })()

  kalshiRawInflight.set(sport, promise)
  return promise
}

async function fetchKalshiEventMarkets(eventTicker: string): Promise<any[]> {
  try {
    const res = await fetch(`${KALSHI_API}/events/${encodeURIComponent(eventTicker)}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 30 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.markets || []
  } catch { return [] }
}

async function fetchKalshiPropMarkets(sport: Sport, home: string, away: string): Promise<KalshiMarketScan> {
  const homeCode = kalshiTeamCode(home, sport)
  const awayCode = kalshiTeamCode(away, sport)
  const prefix = sport === 'nba' ? 'KXNBA' : sport === 'nfl' ? 'KXNFL' : 'KXMLB'
  const raw = await fetchKalshiRawMarkets(sport)
  const supportedEventPrefixes = kalshiSupportedEventPrefixes(sport)
  const comboMarkets = raw.markets.filter((m: any) => isExecutableGamePropMarket(m, prefix, homeCode, awayCode))
  const standaloneMarkets = raw.markets.filter((m: any) => isExecutableStandaloneGamePropMarket(m, supportedEventPrefixes, homeCode, awayCode))
  const discoveredEventTickers = Array.from(new Set([
    ...comboMarkets.flatMap((m: any) => (m.mve_selected_legs || [])
      .map((l: any) => String(l.event_ticker || ''))),
    ...standaloneMarkets.map((m: any) => String(m.event_ticker || String(m.ticker || '').split('-').slice(0, 2).join('-'))),
  ].filter((t: string) => supportedEventPrefixes.some(p => t.startsWith(p)) && marketContainsGame({ title: t }, homeCode, awayCode))))
  const gameSuffix = discoveredEventTickers.map(t => t.split('-')[1]).find(Boolean)
  const eventTickers = Array.from(new Set([
    ...discoveredEventTickers,
    ...(gameSuffix ? supportedEventPrefixes.map(prefix => `${prefix}-${gameSuffix}`) : []),
  ]))
  const eventMarkets: any[] = []
  for (const ticker of eventTickers) eventMarkets.push(...await fetchKalshiEventMarkets(ticker))
  const comboLegMarkets = await expandExecutableComboLegMarkets(comboMarkets, supportedEventPrefixes, homeCode, awayCode)
  const byTicker = new Map<string, any>()
  for (const m of [...comboMarkets, ...standaloneMarkets, ...eventMarkets, ...comboLegMarkets]) byTicker.set(String(m.__syntheticKey || m.ticker), m)
  return {
    markets: Array.from(byTicker.values()),
    scanned: raw.scanned + eventMarkets.length + comboLegMarkets.length,
    pages: raw.pages,
  }
}

function selectedLegMarketTicker(leg: any): string {
  return String(leg?.market_ticker || leg?.market || leg?.ticker || '')
}

async function expandExecutableComboLegMarkets(comboMarkets: any[], supportedEventPrefixes: string[], homeCode: string, awayCode: string): Promise<any[]> {
  const candidates = comboMarkets.flatMap((combo: any) => {
    const ask = dollarsToCents(combo.yes_ask_dollars)
    const askSize = sizeToNum(combo.yes_ask_size_fp)
    if (ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(combo.status))) return []
    return (combo.mve_selected_legs || []).flatMap((leg: any, legIndex: number) => {
      const legTicker = selectedLegMarketTicker(leg)
      if (!supportedEventPrefixes.some(p => legTicker.startsWith(p))) return []
      if (!marketContainsGame({ title: `${leg.event_ticker || ''} ${legTicker}` }, homeCode, awayCode)) return []
      return [{ combo, leg, legTicker, legIndex }]
    })
  })

  const deduped = Array.from(new Map(candidates.map((c: any) => [`${c.combo.ticker}|${c.legTicker}`, c])).values())
  const expanded = await mapLimit(deduped, 8, async ({ combo, leg, legTicker, legIndex }: any) => {
    const legMarket = await fetchKalshiMarketByTicker(legTicker)
    const eventTicker = String(leg.event_ticker || legMarket?.event_ticker || legTicker.split('-').slice(0, 2).join('-'))
    const title = String(legMarket?.title || legMarket?.yes_sub_title || leg?.title || comboLegTitle(combo, legIndex) || legTicker)
    return {
      ...(legMarket || {}),
      ticker: legTicker,
      event_ticker: eventTicker,
      title,
      yes_sub_title: legMarket?.yes_sub_title || title,
      status: combo.status,
      yes_ask_dollars: combo.yes_ask_dollars,
      yes_ask_size_fp: combo.yes_ask_size_fp,
      yes_bid_dollars: combo.yes_bid_dollars,
      yes_bid_size_fp: combo.yes_bid_size_fp,
      __comboTicker: String(combo.ticker || ''),
      __comboTitle: String(combo.title || ''),
      __syntheticKey: `${combo.ticker}|${legTicker}`,
      __isComboLeg: true,
    }
  })
  return expanded.filter((m: any) => metricFromKalshiTicker(String(m.ticker || ''), 'mlb' as Sport) || metricFromKalshiTicker(String(m.ticker || ''), 'nba' as Sport) || metricFromKalshiTicker(String(m.ticker || ''), 'nfl' as Sport))
}

function comboLegTitle(combo: any, legIndex: number): string {
  const title = String(combo?.title || '')
  const parts = title
    .replace(/^Will\s+/i, '')
    .split(/(?:,\s*|\s+and\s+)(?=yes\s+)/i)
    .map(s => s.trim())
    .filter(Boolean)
  return parts[legIndex] || ''
}

function isExecutableGamePropMarket(m: any, prefix: string, homeCode: string, awayCode: string): boolean {
  const ask = dollarsToCents(m.yes_ask_dollars)
  const askSize = sizeToNum(m.yes_ask_size_fp)
  // A positive YES ask with size is executable for buying. Kalshi combo props
  // often show no bid even when there is live ask-side liquidity.
  if (ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(m.status))) return false
  const legs = m.mve_selected_legs || []
  const hasSportLeg = legs.some((l: any) => String(l.market_ticker || l.event_ticker || '').startsWith(prefix))
  return hasSportLeg && marketContainsGame(m, homeCode, awayCode)
}

function isExecutableStandaloneGamePropMarket(m: any, prefixes: string[], homeCode: string, awayCode: string): boolean {
  const ticker = String(m.ticker || '')
  if ((m.mve_selected_legs || []).length) return false
  if (!prefixes.some(p => ticker.startsWith(p))) return false
  const ask = dollarsToCents(m.yes_ask_dollars)
  const askSize = sizeToNum(m.yes_ask_size_fp)
  if (ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(m.status))) return false
  return marketContainsGame(m, homeCode, awayCode) || marketContainsGame({ title: `${m.event_ticker || ''} ${ticker}` }, homeCode, awayCode)
}

function textHaystack(m: any): string {
  return `${m.title || ''} ${m.yes_sub_title || ''} ${m.subtitle || ''} ${m.rules_primary || ''}`
}

function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function playerNameMatches(a: string, b: string): boolean {
  const left = normalizeName(a)
  const right = normalizeName(b)
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)))
}

function injuryEndpointForSport(sport: Sport): string | null {
  if (sport === 'mlb') return 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries'
  if (sport === 'nba') return 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries'
  if (sport === 'nfl') return 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries'
  return null
}

function teamDisplayName(abbr: string, sport: Sport): string | null {
  if (sport === 'mlb') return MLB_TEAM_NAMES[abbr.toUpperCase()] || null
  return null
}

async function fetchSportInjuries(sport: Sport, teamAbbrs: string[]): Promise<Map<string, PlayerInjuryReport>> {
  const endpoint = injuryEndpointForSport(sport)
  if (!endpoint) return new Map()
  const key = `${sport}:injuries`
  let reports: PlayerInjuryReport[] | null = getFreshCache(injuryReportCache, key, ESPN_INJURY_TTL_MS)
  if (!reports) {
    try {
      const data = await safeJson(endpoint)
      reports = (data?.injuries || []).flatMap((team: any) => {
        const teamName = String(team.displayName || '')
        return (team.injuries || []).map((inj: any) => ({
          name: inj.athlete?.displayName || 'Unknown',
          team: teamName,
          position: inj.athlete?.position?.abbreviation || '?',
          status: inj.status || 'Unknown',
          detail: inj.shortComment || String(inj.longComment || '').slice(0, 160),
          updatedAt: inj.date,
        }))
      }).filter((p: PlayerInjuryReport) => p.name !== 'Unknown')
      injuryReportCache.set(key, { value: reports || [], fetchedAt: Date.now() })
    } catch {
      reports = []
    }
  }

  const targetTeamNames = new Set(teamAbbrs.map(abbr => teamDisplayName(abbr, sport)).filter(Boolean) as string[])
  const byPlayer = new Map<string, PlayerInjuryReport>()
  for (const report of reports || []) {
    if (targetTeamNames.size && !targetTeamNames.has(report.team)) continue
    byPlayer.set(normalizeName(report.name), report)
  }
  return byPlayer
}

function applyInjuryFilter(players: PlayerPropLine[], injuries: Map<string, PlayerInjuryReport>): PlayerPropLine[] {
  if (!injuries.size) return players
  return players
    .map(player => {
      const injury = Array.from(injuries.values()).find(report => playerNameMatches(player.player, report.name))
      return injury ? { ...player, injuryStatus: injury.status, injuryDetail: injury.detail } : player
    })
    .filter(player => !player.injuryStatus)
}

function metricAliases(metric: string): string[] {
  if (metric === 'points') return ['points', 'pts']
  if (metric === 'rebounds') return ['rebounds', 'rebs', 'reb']
  if (metric === 'assists') return ['assists', 'asts', 'ast']
  if (metric === 'steals') return ['steals', 'stls', 'stl']
  if (metric === 'blocks') return ['blocks', 'blks', 'blk']
  if (metric === 'threes') return ['3pt', '3 pointer', 'threes', 'three pointers']
  if (metric === 'PTS+REB+AST') return ['pts reb ast', 'points rebounds assists', 'pra']
  if (metric === 'passing yards') return ['passing yards', 'pass yards']
  if (metric === 'passing TDs') return ['passing tds', 'passing touchdowns', 'pass tds', 'pass touchdowns']
  if (metric === 'rushing yards') return ['rushing yards', 'rush yards']
  if (metric === 'receiving yards') return ['receiving yards', 'rec yards']
  if (metric === 'receptions') return ['receptions', 'catches']
  if (metric === 'hits') return ['hits']
  if (metric === 'home runs') return ['home runs', 'homeruns', 'homers', 'hr']
  if (metric === 'hits + runs + RBIs') return ['hits runs rbis', 'hit run rbi', 'hrr']
  if (metric === 'total bases') return ['total bases', 'bases']
  if (metric === 'strikeouts') return ['strikeouts', 'ks', 'k s']
  return [metric]
}

function marketTextMatches(player: string, rec: PropRecommendation, m: any, sport: Sport): boolean {
  const raw = textHaystack(m)
  const hay = normalizeName(raw)
  const name = normalizeName(player)
  const last = name.split(' ').at(-1) || name
  if (!hay.includes(name) && !(last.length >= 5 && hay.includes(last))) return false

  // Kalshi combo/MVE titles can contain many legs. The selected leg ticker is
  // the source of truth for stat family + line, so text only needs to confirm
  // the player name. Keep the old alias guard for non-combo/sparse markets.
  if (sport === 'nba' || sport === 'nfl' || sport === 'mlb') return true

  const aliases = metricAliases(rec.metric).map(normalizeName)
  return aliases.some(alias => hay.includes(alias))
}

function lineFromKalshiTicker(ticker: string): number | null {
  const raw = String(ticker || '')
  const last = raw.split('-').at(-1) || ''
  const n = Number(last.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function kalshiSeriesSlug(series: string): string {
  const s = series.toUpperCase()
  const map: Record<string, string> = {
    KXNBAPTS: 'pro-basketball-player-points',
    KXNBAREB: 'pro-basketball-player-rebounds',
    KXNBAAST: 'pro-basketball-player-assists',
    KXMLBHIT: 'pro-baseball-player-hits',
    KXMLBHR: 'pro-baseball-player-home-runs',
    KXMLBHRR: 'pro-baseball-player-hits-runs-rbis',
    KXMLBTB: 'pro-baseball-player-total-bases',
    KXMLBKS: 'pro-baseball-player-strikeouts',
    KXNFLPASSYDS: 'pro-football-player-passing-yards',
    KXNFLPASSYD: 'pro-football-player-passing-yards',
    KXNFLPYDS: 'pro-football-player-passing-yards',
    KXNFLPASSTD: 'pro-football-player-passing-touchdowns',
    KXNFLPTD: 'pro-football-player-passing-touchdowns',
    KXNFLRUSHYDS: 'pro-football-player-rushing-yards',
    KXNFLRUSHYD: 'pro-football-player-rushing-yards',
    KXNFLRYDS: 'pro-football-player-rushing-yards',
    KXNFLREC: 'pro-football-player-receptions',
    KXNFLRECYDS: 'pro-football-player-receiving-yards',
    KXNFLRECYD: 'pro-football-player-receiving-yards',
  }
  return map[s] || 'markets'
}

function kalshiMarketUrl(ticker: string): string {
  const parts = String(ticker || '').split('-')
  const series = parts[0] || ''
  const eventTicker = parts.length >= 2 ? parts.slice(0, 2).join('-') : ticker
  const base = `https://kalshi.com/markets/${series.toLowerCase()}/${kalshiSeriesSlug(series)}/${eventTicker.toLowerCase()}`
  const encodedTicker = encodeURIComponent(ticker)
  // Kalshi's public app sometimes treats /markets/{marketTicker} as a broad
  // event route and selects the first/default contract. Use the event page plus
  // explicit selectors so supported clients can focus the exact contract; if a
  // selector is ignored, the visible ticker/title still remains exact in our UI.
  return `${base}?market=${encodedTicker}&market_ticker=${encodedTicker}#${encodedTicker}`
}

async function fetchKalshiMarketByTicker(ticker: string): Promise<any | null> {
  if (!ticker) return null
  const cached = kalshiMarketByTickerCache.get(ticker)
  if (cached) return cached
  const promise = (async () => {
    try {
      const res = await fetch(`${KALSHI_API}/markets/${encodeURIComponent(ticker)}`, { signal: AbortSignal.timeout(6000), next: { revalidate: 30 } })
      if (!res.ok) return null
      const data = await res.json()
      return data.market || null
    } catch { return null }
  })()
  kalshiMarketByTickerCache.set(ticker, promise)
  return promise
}

async function findKalshiMatch(player: string, rec: PropRecommendation, sport: Sport, markets: any[]): Promise<KalshiMarketMatch | null> {
  const prefixes = metricPrefixes(rec.metric, sport)
  if (!prefixes.length) return null
  const matches = markets
    .filter((m: any) => {
      const ticker = String(m.ticker || '')
      const legs = m.mve_selected_legs || []
      return legs.length === 0
        && prefixes.some(p => ticker.startsWith(p))
        && lineFromKalshiTicker(ticker) === rec.line
        && marketTextMatches(player, rec, m, sport)
    })
    .map((standalone: any) => {
      const ticker = String(standalone.ticker || '')
      const ask = dollarsToCents(standalone.yes_ask_dollars)
      const askSize = sizeToNum(standalone.yes_ask_size_fp)
      if (ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(standalone.status))) return null
      return {
        ticker,
        title: String(standalone.title || standalone.yes_sub_title || ''),
        url: kalshiMarketUrl(ticker),
        legTicker: ticker,
        eventTicker: String(standalone.event_ticker || ticker.split('-').slice(0, 2).join('-')),
        yesAsk: ask,
        yesAskSize: askSize,
        yesBid: dollarsToCents(standalone.yes_bid_dollars),
        yesBidSize: sizeToNum(standalone.yes_bid_size_fp),
        isCombo: false,
      } satisfies KalshiMarketMatch
    })
    .filter(Boolean) as KalshiMarketMatch[]

  return matches.sort((a, b) => a.yesAsk - b.yesAsk || b.yesAskSize - a.yesAskSize)[0] || null
}

async function searchPlayerSocial(player: string, team: string): Promise<string[]> {
  if (!BRAVE_KEY) return []
  try {
    const q = `site:x.com OR site:twitter.com ${player} ${team} injury minutes usage today`
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=3&freshness=pd`, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.web?.results || []).slice(0, 3).map((r: any) => `${r.title || ''}: ${r.description || r.extra_snippets?.join(' ') || ''}`.slice(0, 240)).filter(Boolean)
  } catch { return [] }
}

function metricFromKalshiTicker(ticker: string, sport: Sport): string | null {
  const t = String(ticker || '').toUpperCase()
  if (sport === 'nba') {
    if (t.startsWith('KXNBAPTS')) return 'points'
    if (t.startsWith('KXNBAREB')) return 'rebounds'
    if (t.startsWith('KXNBAAST')) return 'assists'
    if (t.startsWith('KXNBASTL')) return 'steals'
    if (t.startsWith('KXNBABLK')) return 'blocks'
    if (t.startsWith('KXNBA3PT')) return 'threes'
  }
  if (sport === 'mlb') {
    if (t.startsWith('KXMLBHIT')) return 'hits'
    if (t.startsWith('KXMLBHRR')) return 'hits + runs + RBIs'
    if (t.startsWith('KXMLBHR')) return 'home runs'
    if (t.startsWith('KXMLBTB')) return 'total bases'
    if (t.startsWith('KXMLBKS')) return 'strikeouts'
  }
  if (t.startsWith('KXNFLPASSYDS') || t.startsWith('KXNFLPASSYD') || t.startsWith('KXNFLPYDS')) return 'passing yards'
  if (t.startsWith('KXNFLPASSTD') || t.startsWith('KXNFLPTD')) return 'passing TDs'
  if (t.startsWith('KXNFLRUSHYDS') || t.startsWith('KXNFLRUSHYD') || t.startsWith('KXNFLRYDS')) return 'rushing yards'
  if (t.startsWith('KXNFLRECYDS') || t.startsWith('KXNFLRECYD')) return 'receiving yards'
  if (t.startsWith('KXNFLREC')) return 'receptions'
  return null
}

function playerFromKalshiTitle(title: string): string | null {
  const raw = String(title || '').trim()
  const name = raw.split(':')[0]?.replace(/^(will\s+)?(yes|no)\s+/i, '').trim()
  return name && /[a-z]/i.test(name) ? name : null
}

function teamFromKalshiTicker(ticker: string, home: string, away: string, sport: Sport): string {
  const leg = String(ticker || '').split('-')[2] || ''
  const h = kalshiTeamCode(home, sport)
  const a = kalshiTeamCode(away, sport)
  if (leg.startsWith(h)) return home.toUpperCase()
  if (leg.startsWith(a)) return away.toUpperCase()
  return ''
}

function recommendationFromKalshiMarket(m: any, sport: Sport): PropRecommendation | null {
  const ticker = String(m.ticker || '')
  const comboTicker = String(m.__comboTicker || '')
  const executableTicker = comboTicker || ticker
  const metric = metricFromKalshiTicker(ticker, sport)
  const line = lineFromKalshiTicker(ticker)
  const ask = dollarsToCents(m.yes_ask_dollars)
  const askSize = sizeToNum(m.yes_ask_size_fp)
  if (!metric || !line || ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(m.status))) return null
  const title = String(m.title || m.yes_sub_title || '')
  const label = `${line}+ ${metric}`
  return {
    metric,
    label,
    line,
    avg: 0,
    last12Avg: 0,
    hitRate: 0,
    hits: 0,
    games: 0,
    quality: 'watch',
    confidence: 0,
    valueScore: Math.max(0, 100 - ask),
    maxYesPrice: Math.max(5, Math.min(95, ask)),
    fairProbability: 0,
    risk: 'medium',
    kalshi: {
      ticker: executableTicker,
      title: comboTicker ? `${title} · combo market` : title,
      url: kalshiMarketUrl(executableTicker),
      legTicker: ticker,
      eventTicker: String(m.event_ticker || ticker.split('-').slice(0, 2).join('-')),
      yesAsk: ask,
      yesAskSize: askSize,
      yesBid: dollarsToCents(m.yes_bid_dollars),
      yesBidSize: sizeToNum(m.yes_bid_size_fp),
      isCombo: Boolean(comboTicker),
    },
    xaiBacked: false,
    socialContext: [],
    explanation: comboTicker
      ? `Live Kalshi combo leg found: ${title || label}. Executable through combo market ${comboTicker}.`
      : `Live Kalshi contract found: ${title || label}.`,
  }
}

function addMissingKalshiContracts(players: PlayerPropLine[], kalshiMarkets: any[], sport: Sport, home: string, away: string): PlayerPropLine[] {
  const byKey = new Map(players.map(p => [`${p.team}|${normalizeName(p.player)}`, { ...p, recommendations: [...p.recommendations] }]))
  for (const m of kalshiMarkets) {
    const ticker = String(m.ticker || '')
    if ((m.mve_selected_legs || []).length) continue
    const rec = recommendationFromKalshiMarket(m, sport)
    const player = playerFromKalshiTitle(String(m.title || m.yes_sub_title || ''))
    if (!rec || !player) continue
    const team = teamFromKalshiTicker(ticker, home, away, sport)
    const key = `${team}|${normalizeName(player)}`
    const existing = byKey.get(key)
    if (existing) {
      if (isFullBoardSport(sport) && existing.recommendations.some(r => r.kalshi?.legTicker === rec.kalshi?.legTicker)) continue
      const values = valuesForMetric(existing, rec.metric)
      const statRec = buildMarketRecommendation(values, rec.line, rec.metric, sport)
      if (!statRec || !existing.last12?.length) {
        if (!isFullBoardSport(sport)) continue
        existing.recommendations.push(rec)
        existing.bestBet = existing.bestBet || rec
        byKey.set(key, existing)
        continue
      }
      const enrichedRec: PropRecommendation = {
        ...statRec,
        kalshi: rec.kalshi,
        explanation: `${statRec.explanation} Kalshi ask ${rec.kalshi?.yesAsk ?? '—'}¢; max YES ${statRec.maxYesPrice}¢.`,
      }
      if (!shouldSurfaceKalshiRecommendation(enrichedRec, sport)) continue
      existing.recommendations.push(enrichedRec)
      existing.recommendations.sort((a, b) => metricAliases(a.metric)[0].localeCompare(metricAliases(b.metric)[0]) || a.line - b.line)
      existing.bestBet = existing.bestBet || enrichedRec
      byKey.set(key, existing)
    } else if (isFullBoardSport(sport) && team) {
      byKey.set(key, withLastGameMinutes({
        player,
        team,
        position: '',
        sport,
        gamesPlayed: 0,
        last12: [],
        recommendations: [rec],
        bestBet: rec,
      }))
    } else {
      // Curated sports still require ESPN last-12 history attached. Full-board
      // sports are handled above so raw Kalshi contracts never disappear.
      continue
    }
  }
  return Array.from(byKey.values()).map(withLastGameMinutes)
}

function xaiPropIntelCacheKey(players: PlayerPropLine[]): string {
  return players
    .filter(p => p.bestBet?.kalshi)
    .slice(0, 6)
    .map(p => [
      p.team,
      normalizeName(p.player),
      p.bestBet?.metric,
      p.bestBet?.line,
      p.bestBet?.kalshi?.legTicker,
      p.bestBet?.kalshi?.yesAsk,
      (p.last12 || []).slice(0, 3).map(g => g.eventId).join(','),
    ].join(':'))
    .join('|')
}

async function applyXaiPropIntel(players: PlayerPropLine[], enabled = false): Promise<PlayerPropLine[]> {
  if (!enabled || !process.env.XAI_API_KEY) return players
  const targets = players.filter(p => p.bestBet?.kalshi).slice(0, 6)
  if (!targets.length) return players

  const cacheKey = xaiPropIntelCacheKey(players)
  const cached = getFreshCache(xaiPropIntelCache, cacheKey, XAI_PROP_INTEL_TTL_MS)
  if (cached) return cached

  const enriched = await withTimeout((async () => {
    const socialPairs = await Promise.all(targets.map(async p => ({ player: p.player, social: await searchPlayerSocial(p.player, p.team) })))
    const socialByPlayer = new Map(socialPairs.map(s => [s.player, s.social]))
    const compact = targets.map(p => ({
      player: p.player, team: p.team, position: p.position, last12: p.last12.map(g => ({ date: g.date, opp: g.opponent, stats: g.stats })),
      bet: p.bestBet, social: socialByPlayer.get(p.player) || [],
    }))
    try {
      const client = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: process.env.XAI_BASE_URL || 'https://api.x.ai/v1' })
      const response = await client.chat.completions.create({
        model: XAI_MODEL,
        temperature: 0.25,
        max_tokens: 1400,
        messages: [{ role: 'user', content: `You are a sharp Kalshi player-props analyst. Use the last-12 logs, Kalshi executable YES ask, and social/X snippets if relevant. Do not invent injuries or news. Return ONLY valid JSON array: [{"player":"","metric":"","line":0,"explanation":"one concise reason to bet or pass; include max YES price and current Kalshi ask","risk":"low|medium|high"}]. Data: ${JSON.stringify(compact)}` }],
      }, { timeout: XAI_PROP_INTEL_TIMEOUT_MS })
      const raw = response.choices?.[0]?.message?.content?.trim() || '[]'
      const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, ''))
      const byKey = new Map((Array.isArray(parsed) ? parsed : []).map((r: any) => [`${r.player}|${r.metric}|${r.line}`, r]))
      return players.map(p => {
        if (!p.bestBet) return p
        const x = byKey.get(`${p.player}|${p.bestBet.metric}|${p.bestBet.line}`)
        if (!x) return p
        const bestBet = { ...p.bestBet, explanation: String(x.explanation || p.bestBet.explanation), risk: x.risk || p.bestBet.risk, xaiBacked: true, socialContext: socialByPlayer.get(p.player) || [] }
        return { ...p, bestBet, recommendations: p.recommendations.map(r => r.metric === bestBet.metric && r.line === bestBet.line ? bestBet : r) }
      })
    } catch { return players }
  })(), XAI_PROP_INTEL_TIMEOUT_MS + 1000, players)

  xaiPropIntelCache.set(cacheKey, { value: enriched, fetchedAt: Date.now() })
  return enriched
}

function valuesForMetric(p: PlayerPropLine, metric: string): number[] {
  if (metric === 'points') return p.last12.map(g => g.stats.points)
  if (metric === 'rebounds') return p.last12.map(g => g.stats.rebounds)
  if (metric === 'assists') return p.last12.map(g => g.stats.assists)
  if (metric === 'PTS+REB+AST') return p.last12.map(g => g.stats.points + g.stats.rebounds + g.stats.assists)
  if (metric === 'steals') return p.last12.map(g => g.stats.steals)
  if (metric === 'blocks') return p.last12.map(g => g.stats.blocks)
  if (metric === 'threes') return p.last12.map(g => g.stats.threes)
  if (metric === 'passing yards') return p.last12.map(g => g.stats.passingYards)
  if (metric === 'passing TDs') return p.last12.map(g => g.stats.passingTouchdowns)
  if (metric === 'rushing yards') return p.last12.map(g => g.stats.rushingYards)
  if (metric === 'receiving yards') return p.last12.map(g => g.stats.receivingYards)
  if (metric === 'receptions') return p.last12.map(g => g.stats.receptions)
  if (metric === 'hits') return p.last12.map(g => g.stats.hits)
  if (metric === 'home runs') return p.last12.map(g => g.stats.homeRuns)
  if (metric === 'hits + runs + RBIs') return p.last12.map(g => Number(g.stats.hits || 0) + Number(g.stats.runs || 0) + Number(g.stats.RBIs || 0))
  if (metric === 'total bases') return p.last12.map(g => g.stats.totalBases)
  if (metric === 'strikeouts') return p.last12.map(g => g.stats.strikeouts)
  return []
}

type KalshiMatchCache = Map<string, Promise<KalshiMarketMatch | null>>

function kalshiMatchCacheKey(player: string, rec: PropRecommendation, sport: Sport): string {
  return `${sport}:${normalizeName(player)}:${rec.metric}:${rec.line}`
}

function cachedKalshiMatch(cache: KalshiMatchCache, player: string, rec: PropRecommendation, sport: Sport, markets: any[]): Promise<KalshiMarketMatch | null> {
  const key = kalshiMatchCacheKey(player, rec, sport)
  const cached = cache.get(key)
  if (cached) return cached
  const promise = findKalshiMatch(player, rec, sport, markets)
  cache.set(key, promise)
  return promise
}

function kalshiLinesForPlayerMetric(player: string, metric: string, sport: Sport, markets: any[]): number[] {
  const prefixes = metricPrefixes(metric, sport)
  if (!prefixes.length) return []
  const lines = markets.flatMap((m: any) => {
    const ticker = String(m.ticker || '')
    const legs = m.mve_selected_legs || []
    if (legs.length || !prefixes.some(p => ticker.startsWith(p)) || !marketTextMatches(player, { metric, line: lineFromKalshiTicker(ticker) || 0 } as PropRecommendation, m, sport)) return []
    const ask = dollarsToCents(m.yes_ask_dollars)
    const askSize = sizeToNum(m.yes_ask_size_fp)
    const line = lineFromKalshiTicker(ticker)
    return line !== null && ask > 0 && ask < 100 && askSize > 0 && ['open', 'active'].includes(String(m.status)) ? [line] : []
  })
  return Array.from(new Set(lines)).sort((a, b) => a - b)
}

async function gateToKalshi(players: PlayerPropLine[], sport: Sport, markets: any[], matchCache: KalshiMatchCache = new Map()): Promise<PlayerPropLine[]> {
  const gated = await Promise.all(players.map(async p => {
    const metrics = sportPropMetrics(sport)
    const marketDrivenRecommendations = metrics.flatMap(metric => {
      const values = valuesForMetric(p, metric)
      return kalshiLinesForPlayerMetric(p.player, metric, sport, markets)
        .map(line => buildMarketRecommendation(values, line, metric, sport))
        .filter(Boolean) as PropRecommendation[]
    })
    const sourceRecommendations = marketDrivenRecommendations.length ? marketDrivenRecommendations : p.recommendations
    const withMatches = await Promise.all(sourceRecommendations.map(async r => ({ ...r, kalshi: await cachedKalshiMatch(matchCache, p.player, r, sport, markets) })))
    const recommendations = withMatches
      .filter(r => shouldSurfaceKalshiRecommendation(r, sport))
      .sort((a, b) => (b.valueScore - a.valueScore) || ((a.kalshi?.yesAsk || 99) - (b.kalshi?.yesAsk || 99)))
    const bestBet = recommendations[0] || null
    return withLastGameMinutes({ ...p, recommendations, bestBet })
  }))
  return gated.filter(p => p.bestBet) as PlayerPropLine[]
}

async function countKalshiRecommendationMatches(rawPlayers: PlayerPropLine[], sport: Sport, markets: any[], matchCache: KalshiMatchCache = new Map()): Promise<{ executable: number; playable: number }> {
  const counts = await Promise.all(rawPlayers.map(async p => {
    const marketDrivenRecommendations = sportPropMetrics(sport).flatMap(metric => {
      const values = valuesForMetric(p, metric)
      return kalshiLinesForPlayerMetric(p.player, metric, sport, markets)
        .map(line => buildMarketRecommendation(values, line, metric, sport))
        .filter(Boolean) as PropRecommendation[]
    })
    const sourceRecommendations = marketDrivenRecommendations.length ? marketDrivenRecommendations : p.recommendations
    const matches = await Promise.all(sourceRecommendations.map(async r => ({ ...r, kalshi: await cachedKalshiMatch(matchCache, p.player, r, sport, markets) })))
    return {
      executable: matches.filter(r => r.kalshi).length,
      playable: matches.filter(r => r.kalshi && Number(r.kalshi.yesAsk) <= Number(r.maxYesPrice)).length,
    }
  }))
  return counts.reduce((sum, n) => ({ executable: sum.executable + n.executable, playable: sum.playable + n.playable }), { executable: 0, playable: 0 })
}

async function summarizeMarkets(rawPlayers: PlayerPropLine[], gatedPlayers: PlayerPropLine[], sport: Sport, scan: KalshiMarketScan, matchCache: KalshiMatchCache = new Map()): Promise<PropsMarketSummary> {
  const surfacedMatched = gatedPlayers.reduce((sum, p) => sum + p.recommendations.length, 0)
  const candidateProps = rawPlayers.reduce((sum, p) => sum + p.recommendations.length, 0)
  const matchCounts = await countKalshiRecommendationMatches(rawPlayers, sport, scan.markets, matchCache)
  const executableMatched = Math.max(matchCounts.executable, surfacedMatched)
  const playableMatched = isFullBoardSport(sport) ? matchCounts.playable : surfacedMatched
  const priceRejected = Math.max(0, executableMatched - playableMatched)
  const status: PropsMarketSummary['status'] = scan.markets.length === 0
    ? 'no_markets'
    : surfacedMatched > 0
        ? 'playable'
        : candidateProps === 0
          ? 'no_candidates'
          : executableMatched > 0
            ? 'priced_out'
            : 'no_executable'
  const statusLabel = status === 'playable'
    ? (isFullBoardSport(sport) ? 'Executable props live' : 'Playable props live')
    : status === 'priced_out'
      ? 'Executable props priced out'
      : status === 'no_executable'
        ? 'No executable player props found in Kalshi feed yet'
        : status === 'no_candidates'
          ? 'No stat candidates passed model'
          : 'No Kalshi player props found in public feed yet'
  return {
    scanned: scan.scanned,
    gameMatched: scan.markets.length,
    candidateProps,
    executableMatched,
    playableMatched,
    priceRejected,
    status,
    statusLabel,
    pages: scan.pages,
    stale: status === 'no_markets',
  }
}

function recommendNBA(logs: GameLogEntry[]): PropRecommendation[] {
  const pts = logs.map(g => g.stats.points)
  const reb = logs.map(g => g.stats.rebounds)
  const ast = logs.map(g => g.stats.assists)
  const stl = logs.map(g => g.stats.steals)
  const blk = logs.map(g => g.stats.blocks)
  const threes = logs.map(g => g.stats.threes)
  const pra = logs.map(g => g.stats.points + g.stats.rebounds + g.stats.assists)
  return [
    findBestThreshold(pts, [10, 15, 20, 25, 30, 35, 40], 'points'),
    findBestThreshold(reb, [4, 6, 8, 10, 12, 15], 'rebounds'),
    findBestThreshold(ast, [3, 4, 5, 6, 8, 10, 12], 'assists'),
    findBestThreshold(stl, [1, 2, 3], 'steals'),
    findBestThreshold(blk, [1, 2, 3], 'blocks'),
    findBestThreshold(threes, [1, 2, 3, 4, 5], 'threes'),
    findBestThreshold(pra, [20, 25, 30, 35, 40, 45, 50], 'PTS+REB+AST'),
  ].filter(Boolean) as PropRecommendation[]
}

function recommendNFL(logs: GameLogEntry[]): PropRecommendation[] {
  const passYds = logs.map(g => g.stats.passingYards)
  const passTds = logs.map(g => g.stats.passingTouchdowns)
  const rushYds = logs.map(g => g.stats.rushingYards)
  const rec = logs.map(g => g.stats.receptions)
  const recYds = logs.map(g => g.stats.receivingYards)
  return [
    findBestThreshold(passYds, [175, 200, 225, 250, 275, 300], 'passing yards'),
    findBestThreshold(passTds, [1, 2, 3], 'passing TDs'),
    findBestThreshold(rushYds, [20, 30, 40, 50, 60, 70, 80, 100], 'rushing yards'),
    findBestThreshold(rec, [2, 3, 4, 5, 6, 7, 8], 'receptions'),
    findBestThreshold(recYds, [20, 30, 40, 50, 60, 70, 80, 100], 'receiving yards'),
  ].filter(Boolean) as PropRecommendation[]
}

function recommendMLB(logs: GameLogEntry[], position = ''): PropRecommendation[] {
  const hits = logs.map(g => g.stats.hits)
  const homeRuns = logs.map(g => g.stats.homeRuns)
  const hrr = logs.map(g => Number(g.stats.hits || 0) + Number(g.stats.runs || 0) + Number(g.stats.RBIs || 0))
  const totalBases = logs.map(g => g.stats.totalBases)
  const strikeouts = logs.map(g => g.stats.strikeouts)
  const isPitcher = ['P', 'SP', 'RP'].includes(position.toUpperCase()) || logs.some(g => g.stats.innings > 0)
  if (isPitcher) return [findBestThreshold(strikeouts, [3, 4, 5, 6, 7, 8, 9], 'strikeouts')].filter(Boolean) as PropRecommendation[]
  return [
    findBestThreshold(hits, [1, 2, 3], 'hits'),
    findBinaryThreshold(homeRuns, 'home runs'),
    findBestThreshold(hrr, [1, 2, 3, 4, 5], 'hits + runs + RBIs'),
    findBestThreshold(totalBases, [2, 3, 4], 'total bases'),
  ].filter(Boolean) as PropRecommendation[]
}

async function safeJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(9000), next: { revalidate: 900 } })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

function parseGameLogs(data: any, sport: Sport): GameLogEntry[] {
  const names: string[] = data?.names || []
  const eventsById: Record<string, any> = data?.events || {}
  const rows: any[] = []
  for (const seasonType of data?.seasonTypes || []) {
    for (const cat of seasonType.categories || []) {
      for (const ev of cat.events || []) rows.push(ev)
    }
  }

  const seen = new Set<string>()
  const logs: GameLogEntry[] = []
  for (const row of rows) {
    const eventId = String(row.eventId || '')
    if (!eventId || seen.has(eventId)) continue
    seen.add(eventId)
    const meta = eventsById[eventId] || {}
    const statsArr: string[] = row.stats || []
    const stat = (name: string) => {
      const idx = names.indexOf(name)
      return idx >= 0 ? toNum(statsArr[idx]) : 0
    }
    const stats: Record<string, number> = sport === 'nba'
      ? {
          minutes: stat('minutes'), points: stat('points'), rebounds: stat('totalRebounds'), assists: stat('assists'), blocks: stat('blocks'), steals: stat('steals'), threes: stat('threePointFieldGoalsMade') || stat('threePointFieldGoals') || stat('threePointersMade'), turnovers: stat('turnovers'),
        }
      : sport === 'nfl'
        ? {
            passingYards: stat('passingYards'), passingTouchdowns: stat('passingTouchdowns'), interceptions: stat('interceptions'), rushingYards: stat('rushingYards'), rushingTouchdowns: stat('rushingTouchdowns'), receptions: stat('receptions'), receivingTargets: stat('receivingTargets'), receivingYards: stat('receivingYards'), receivingTouchdowns: stat('receivingTouchdowns'),
          }
        : {
            atBats: stat('atBats'), runs: stat('runs'), hits: stat('hits'), doubles: stat('doubles'), triples: stat('triples'), homeRuns: stat('homeRuns'), RBIs: stat('RBIs'), totalBases: stat('hits') + stat('doubles') + stat('triples') * 2 + stat('homeRuns') * 3, innings: stat('innings'), strikeouts: stat('strikeouts'),
          }
    logs.push({
      eventId,
      date: meta.date || meta.gameDate || '',
      opponent: meta.opponent?.abbreviation || meta.opponent?.displayName || '',
      isHome: Boolean(meta.atVs === 'vs' || meta.homeAway === 'home'),
      result: meta.gameResult || meta.score || '',
      stats,
    })
    if (logs.length >= 12) break
  }
  return logs
}

async function fetchPlayerGameLogs(athleteId: string, sport: Sport): Promise<GameLogEntry[]> {
  const key = `${sport}:${athleteId}`
  const cached = getFreshCache(playerGameLogCache, key, ESPN_PLAYER_GAMELOG_TTL_MS)
  if (cached) return cached

  const inflight = playerGameLogInflight.get(key)
  if (inflight) return inflight

  const durableKey = `espn:gamelog:${key}`
  const durableCached = await getJsonCache<TimedCache<GameLogEntry[]>>(durableKey)
  if (durableCached && Date.now() - durableCached.fetchedAt < ESPN_PLAYER_GAMELOG_TTL_MS) {
    playerGameLogCache.set(key, durableCached)
    return durableCached.value
  }

  const promise = (async () => {
    try {
      const leaguePath = sport === 'nba' ? 'basketball/nba' : sport === 'nfl' ? 'football/nfl' : 'baseball/mlb'
      const season = sport === 'nfl' ? '2025' : '2026'
      const data = await safeJson(`https://site.web.api.espn.com/apis/common/v3/sports/${leaguePath}/athletes/${athleteId}/gamelog?season=${season}`)
      const logs = parseGameLogs(data, sport)
      const entry = { value: logs, fetchedAt: Date.now() }
      playerGameLogCache.set(key, entry)
      await setJsonCache(durableKey, entry, ESPN_PLAYER_GAMELOG_TTL_MS)
      return logs
    } finally {
      playerGameLogInflight.delete(key)
    }
  })()

  playerGameLogInflight.set(key, promise)
  return promise
}

function flattenRoster(rawAthletes: any[], sport: Sport): any[] {
  if (sport === 'nba') return rawAthletes
  if (sport === 'mlb') return rawAthletes.flatMap(g => g.items || [g]).filter((p: any) => p.id)
  const offense = rawAthletes.find(g => String(g.position).toLowerCase() === 'offense')
  return (offense?.items || rawAthletes.flatMap(g => g.items || [])).filter((p: any) => ['QB', 'RB', 'WR', 'TE'].includes(p.position?.abbreviation || ''))
}

function teamSlug(abbr: string, sport: Sport): string {
  const upper = abbr.toUpperCase()
  return sport === 'nba' ? (ESPN_ABBR[upper] || upper.toLowerCase()) : sport === 'nfl' ? (NFL_ABBR[upper] || upper.toLowerCase()) : (MLB_ABBR[upper] || upper.toLowerCase())
}

async function fetchTeamPropsUncached(abbr: string, sport: Sport): Promise<PlayerPropLine[]> {
  const leaguePath = sport === 'nba' ? 'basketball/nba' : sport === 'nfl' ? 'football/nfl' : 'baseball/mlb'
  const rosterData = await safeJson(`https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/teams/${teamSlug(abbr, sport)}/roster`)
  const rosterLimit = sport === 'nba' ? 24 : sport === 'nfl' ? 22 : 34
  const roster = flattenRoster(rosterData?.athletes || [], sport).slice(0, rosterLimit)

  const results = await mapLimit(roster, ESPN_GAMELOG_CONCURRENCY, async (player: any) => {
    const logs = await fetchPlayerGameLogs(String(player.id), sport)
    if (logs.length < 4) return null
    const position = player.position?.abbreviation || '?'
    const recommendations = sport === 'nba' ? recommendNBA(logs) : sport === 'nfl' ? recommendNFL(logs) : recommendMLB(logs, position)
    const bestBet = [...recommendations].sort((a, b) => {
      const rank = (q: PropQuality) => q === 'bet' ? 3 : q === 'lean' ? 2 : q === 'watch' ? 1 : 0
      return rank(b.quality) - rank(a.quality) || b.valueScore - a.valueScore || b.confidence - a.confidence
    })[0] || null

    if (sport === 'nba') {
      const ptsAvg = avg(logs.map(g => g.stats.points))
      const rebAvg = avg(logs.map(g => g.stats.rebounds))
      const astAvg = avg(logs.map(g => g.stats.assists))
      if (ptsAvg < 5 && !bestBet) return null
      return {
        player: player.displayName || player.fullName || 'Unknown',
        team: abbr.toUpperCase(),
        position,
        headshot: player.headshot?.href || undefined,
        sport,
        gamesPlayed: logs.length,
        pts: { line: roundLine(ptsAvg), avg: Number(ptsAvg.toFixed(1)), trend: calcTrend(avg(logs.slice(0, 5).map(g => g.stats.points)), roundLine(ptsAvg)) },
        reb: { line: roundLine(rebAvg), avg: Number(rebAvg.toFixed(1)), trend: calcTrend(avg(logs.slice(0, 5).map(g => g.stats.rebounds)), roundLine(rebAvg)) },
        ast: { line: roundLine(astAvg), avg: Number(astAvg.toFixed(1)), trend: calcTrend(avg(logs.slice(0, 5).map(g => g.stats.assists)), roundLine(astAvg)) },
        lastFive: logs.slice(0, 5).map(g => ({ pts: g.stats.points, reb: g.stats.rebounds, ast: g.stats.assists })),
        last12: logs,
        lastGameMinutes: latestMinutes(logs),
        recommendations,
        bestBet,
      } as PlayerPropLine
    }

    if (sport === 'mlb') {
      const offensiveUsage = avg(logs.map(g => g.stats.atBats + g.stats.hits + g.stats.totalBases))
      const pitcherUsage = avg(logs.map(g => g.stats.innings + g.stats.strikeouts))
      if (Math.max(offensiveUsage, pitcherUsage) < 1 && !bestBet) return null
      return {
        player: player.displayName || player.fullName || 'Unknown',
        team: abbr.toUpperCase(),
        position,
        headshot: player.headshot?.href || undefined,
        sport,
        gamesPlayed: logs.length,
        last12: logs,
        recommendations,
        bestBet,
      } as PlayerPropLine
    }

    const usage = avg(logs.map(g => g.stats.passingYards + g.stats.rushingYards + g.stats.receivingYards + g.stats.receptions * 8))
    if (usage < 12 && !bestBet) return null
    return {
      player: player.displayName || player.fullName || 'Unknown',
      team: abbr.toUpperCase(),
      position,
      headshot: player.headshot?.href || undefined,
      sport,
      gamesPlayed: logs.length,
      last12: logs,
      recommendations,
      bestBet,
    } as PlayerPropLine
  })

  return (results.filter(Boolean) as PlayerPropLine[])
    .sort((a, b) => (b.bestBet?.confidence || 0) - (a.bestBet?.confidence || 0))
}

async function fetchTeamProps(abbr: string, sport: Sport): Promise<PlayerPropLine[]> {
  const key = `${sport}:${abbr.toUpperCase()}`
  const cached = getFreshCache(teamPropsCache, key, ESPN_TEAM_PROPS_TTL_MS)
  if (cached) return cached

  const inflight = teamPropsInflight.get(key)
  if (inflight) return inflight

  const durableKey = `espn:team-props:${key}`
  const durableCached = await getJsonCache<TimedCache<PlayerPropLine[]>>(durableKey)
  if (durableCached && Date.now() - durableCached.fetchedAt < ESPN_TEAM_PROPS_TTL_MS) {
    teamPropsCache.set(key, durableCached)
    return durableCached.value
  }

  const promise = (async () => {
    try {
      const props = await fetchTeamPropsUncached(abbr, sport)
      const entry = { value: props, fetchedAt: Date.now() }
      teamPropsCache.set(key, entry)
      await setJsonCache(durableKey, entry, ESPN_TEAM_PROPS_TTL_MS)
      return props
    } finally {
      teamPropsInflight.delete(key)
    }
  })()

  teamPropsInflight.set(key, promise)
  return promise
}

function parseSportParam(value: string | null): Sport {
  const sport = (value || 'nba').toLowerCase()
  return sport === 'nfl' || sport === 'mlb' ? sport : 'nba'
}

export async function GET(req: NextRequest) {
  const timing = startRouteTiming('/api/props')
  const { searchParams } = req.nextUrl
  const home = searchParams.get('home')?.toUpperCase()
  const away = searchParams.get('away')?.toUpperCase()
  const sport = parseSportParam(searchParams.get('sport'))
  const enrich = isTruthyParam(searchParams.get('xai')) || isTruthyParam(searchParams.get('enrich'))

  if (!home || !away) return finishRouteTiming(timing, NextResponse.json({ error: 'Missing home or away param' }, { status: 400 }))

  try {
    const [homeRaw, awayRaw, kalshiScan, injuryMap] = await Promise.all([
      fetchTeamProps(home, sport),
      fetchTeamProps(away, sport),
      fetchKalshiPropMarkets(sport, home, away),
      sport === 'mlb' ? fetchSportInjuries(sport, [home, away]) : Promise.resolve(new Map<string, PlayerInjuryReport>()),
    ])
    const kalshiMarkets = kalshiScan.markets
    const matchCache: KalshiMatchCache = new Map()
    const [gatedHome, gatedAway] = await Promise.all([gateToKalshi(homeRaw, sport, kalshiMarkets, matchCache), gateToKalshi(awayRaw, sport, kalshiMarkets, matchCache)])
    const withMissing = addMissingKalshiContracts([...awayRaw, ...homeRaw, ...gatedAway, ...gatedHome], kalshiMarkets, sport, home, away)
    const withXai = await applyXaiPropIntel(withMissing, enrich)
    const statReady = applyInjuryFilter(withXai, injuryMap)
      .filter(p => isFullBoardSport(sport) || (p.last12 || []).length >= 4)
      .map(p => {
        const recommendations = (p.recommendations || []).filter(r => r.kalshi && (isFullBoardSport(sport) || r.games > 0))
        const bestBet = recommendations.includes(p.bestBet as PropRecommendation) ? p.bestBet : recommendations[0] || null
        return withLastGameMinutes({ ...p, recommendations, bestBet })
      })
      .filter(p => p.bestBet && p.recommendations.length)
    const homeProps = statReady.filter(p => p.team === home)
    const awayProps = statReady.filter(p => p.team === away)
    const marketSummary = await summarizeMarkets([...homeRaw, ...awayRaw], [...homeProps, ...awayProps], sport, kalshiScan, matchCache)
    return finishRouteTiming(timing, NextResponse.json({ home: homeProps, away: awayProps, homeTeam: home, awayTeam: away, sport, available: homeProps.length > 0 || awayProps.length > 0, marketSummary } satisfies PropsResponse))
  } catch (err) {
    console.error('Props error:', err)
    return finishRouteTiming(timing, NextResponse.json({ error: 'Failed to fetch props' }, { status: 500 }))
  }
}
