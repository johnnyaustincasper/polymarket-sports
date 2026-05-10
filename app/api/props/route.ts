import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { ESPN_ABBR } from '@/app/lib/nba-api'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KALSHI_API = 'https://external-api.kalshi.com/trade-api/v2'
const XAI_MODEL = process.env.XAI_MODEL || 'grok-3-mini'
const BRAVE_KEY = process.env.BRAVE_API_KEY || ''

type Sport = 'nba' | 'nfl'
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
  yesAsk: number
  yesAskSize: number
  yesBid: number
  yesBidSize: number
  isCombo: boolean
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
  recommendations: PropRecommendation[]
  bestBet: PropRecommendation | null
}

export interface PropsResponse {
  home: PlayerPropLine[]
  away: PlayerPropLine[]
  homeTeam: string
  awayTeam: string
  sport: Sport
  available: boolean
}

const NFL_ABBR: Record<string, string> = {
  ARI: 'ari', ATL: 'atl', BAL: 'bal', BUF: 'buf', CAR: 'car', CHI: 'chi', CIN: 'cin', CLE: 'cle', DAL: 'dal', DEN: 'den', DET: 'det', GB: 'gb',
  HOU: 'hou', IND: 'ind', JAX: 'jax', KC: 'kc', LAC: 'lac', LAR: 'lar', LV: 'lv', MIA: 'mia', MIN: 'min', NE: 'ne', NO: 'no', NYG: 'nyg', NYJ: 'nyj',
  PHI: 'phi', PIT: 'pit', SEA: 'sea', SF: 'sf', TB: 'tb', TEN: 'ten', WAS: 'wsh', WSH: 'wsh',
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

function pct(n: number): number {
  return Math.round(n * 100)
}


function minimumPlayableLine(avgValue: number, metricLabel: string): number {
  if (metricLabel === 'points') return avgValue >= 27 ? 20 : avgValue >= 20 ? 15 : avgValue >= 14 ? 10 : 0
  if (metricLabel === 'rebounds') return avgValue >= 11 ? 10 : avgValue >= 8 ? 8 : avgValue >= 6 ? 6 : 0
  if (metricLabel === 'assists') return avgValue >= 9 ? 8 : avgValue >= 6 ? 6 : avgValue >= 4 ? 4 : 0
  if (metricLabel === 'PTS+REB+AST') return avgValue >= 42 ? 35 : avgValue >= 34 ? 30 : avgValue >= 26 ? 25 : 0
  if (metricLabel === 'passing yards') return avgValue >= 275 ? 250 : avgValue >= 240 ? 225 : avgValue >= 205 ? 200 : 0
  if (metricLabel === 'passing TDs') return avgValue >= 2.2 ? 2 : 1
  if (metricLabel === 'rushing yards') return avgValue >= 80 ? 60 : avgValue >= 55 ? 40 : avgValue >= 35 ? 30 : 0
  if (metricLabel === 'receiving yards') return avgValue >= 80 ? 60 : avgValue >= 55 ? 40 : avgValue >= 35 ? 30 : 0
  if (metricLabel === 'receptions') return avgValue >= 7 ? 6 : avgValue >= 5 ? 4 : avgValue >= 3 ? 3 : 0
  return 0
}

function findBestThreshold(values: number[], thresholds: number[], metricLabel: string): PropRecommendation | null {
  if (values.length < 4) return null
  const last12Avg = avg(values)
  const minPlayableLine = minimumPlayableLine(last12Avg, metricLabel)
  const volatility = Math.sqrt(avg(values.map(v => Math.pow(v - last12Avg, 2))))
  const candidates = thresholds
    // keep realistic plus-money / playable alt lines; avoid junk lines far below average unless consistency is elite
    .filter(line => line >= minPlayableLine && last12Avg >= line * 0.75 && line <= last12Avg + Math.max(3, volatility * 0.35))
    .map(line => {
      const hits = values.filter(v => v >= line).length
      const hitRate = hits / values.length
      const margin = last12Avg - line
      const cushion = volatility ? margin / volatility : margin
      const fairProbability = Math.max(0.05, Math.min(0.92, hitRate * 0.72 + (last12Avg >= line ? 0.10 : -0.06) + Math.max(-0.08, Math.min(0.08, cushion * 0.05))))
      const maxYesPrice = Math.max(5, Math.min(88, Math.round(fairProbability * 100 - 6)))
      const confidence = Math.max(0, Math.min(95, Math.round(hitRate * 64 + Math.max(0, cushion) * 8 + Math.min(values.length, 12))))
      const quality: PropQuality = hitRate >= 0.67 && margin >= 0 ? 'bet' : hitRate >= 0.58 && margin >= -0.5 ? 'lean' : hitRate >= 0.5 ? 'watch' : 'skip'
      const risk: PropRecommendation['risk'] = volatility <= Math.max(3, last12Avg * 0.22) ? 'low' : volatility <= Math.max(6, last12Avg * 0.38) ? 'medium' : 'high'
      // Value score favors playable thresholds, not just the safest tiny line.
      const thresholdAmbition = last12Avg > 0 ? Math.min(20, (line / last12Avg) * 22) : 0
      const consistency = hitRate * 55
      const cushionScore = Math.max(-8, Math.min(12, cushion * 6))
      const riskPenalty = risk === 'high' ? 8 : risk === 'medium' ? 3 : 0
      const valueScore = Math.round(consistency + thresholdAmbition + cushionScore - riskPenalty)
      return { line, hits, hitRate, margin, confidence, quality, valueScore, maxYesPrice, fairProbability, risk }
    })
    .filter(c => c.quality !== 'skip')
    .sort((a, b) => {
      const rank = (q: PropQuality) => q === 'bet' ? 3 : q === 'lean' ? 2 : q === 'watch' ? 1 : 0
      return rank(b.quality) - rank(a.quality) || b.valueScore - a.valueScore || b.line - a.line
    })

  const best = candidates[0]
  if (!best) return null
  const label = `${best.line}+ ${metricLabel}`
  const priceText = `I would only bet YES at ${best.maxYesPrice}¢ or better`
  return {
    metric: metricLabel,
    label,
    line: best.line,
    avg: Number(last12Avg.toFixed(1)),
    last12Avg: Number(last12Avg.toFixed(1)),
    hitRate: pct(best.hitRate),
    hits: best.hits,
    games: values.length,
    quality: best.quality,
    confidence: best.confidence,
    valueScore: best.valueScore,
    maxYesPrice: best.maxYesPrice,
    fairProbability: pct(best.fairProbability),
    risk: best.risk,
    kalshi: null,
    xaiBacked: false,
    socialContext: [],
    explanation: `${label} is the best value threshold: hit ${best.hits}/${values.length}, ${last12Avg.toFixed(1)} last-12 avg, ${best.margin >= 0 ? `${best.margin.toFixed(1)} cushion` : `${Math.abs(best.margin).toFixed(1)} below average`}. ${priceText}. Risk: ${best.risk}.`,
  }
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
    return []
  }
  if (metric === 'passing yards') return ['KXNFLPASSYDS', 'KXNFLPASSYD', 'KXNFLPYDS']
  if (metric === 'passing TDs') return ['KXNFLPASSTD', 'KXNFLPTD']
  if (metric === 'rushing yards') return ['KXNFLRUSHYDS', 'KXNFLRUSHYD', 'KXNFLRYDS']
  if (metric === 'receptions') return ['KXNFLREC']
  if (metric === 'receiving yards') return ['KXNFLRECYDS', 'KXNFLRECYD']
  return []
}


function kalshiTeamCode(abbr: string, sport: Sport): string {
  const upper = abbr.toUpperCase()
  if (sport === 'nba') {
    const map: Record<string, string> = { NY: 'NYK', SA: 'SAS', GS: 'GSW', PHX: 'PHX', NO: 'NOP', BKN: 'BKN' }
    return map[upper] || upper
  }
  return upper
}

function marketContainsGame(market: any, home: string, away: string): boolean {
  const hay = `${market.title || ''} ${JSON.stringify(market.custom_strike || {})} ${JSON.stringify(market.mve_selected_legs || [])}`.toUpperCase()
  return (hay.includes(`${away}${home}`) || hay.includes(`${home}${away}`) || (hay.includes(home) && hay.includes(away)))
}

async function fetchKalshiPropMarkets(sport: Sport, home: string, away: string): Promise<any[]> {
  const homeCode = kalshiTeamCode(home, sport)
  const awayCode = kalshiTeamCode(away, sport)
  try {
    const res = await fetch(`${KALSHI_API}/markets?status=open&limit=200`, { signal: AbortSignal.timeout(20000), next: { revalidate: 30 } })
    if (!res.ok) return []
    const data = await res.json()
    const prefix = sport === 'nba' ? 'KXNBA' : 'KXNFL'
    return (data.markets || []).filter((m: any) => {
      const ask = dollarsToCents(m.yes_ask_dollars)
      const askSize = sizeToNum(m.yes_ask_size_fp)
      if (ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(m.status))) return false
      const legs = m.mve_selected_legs || []
      const hasSportLeg = legs.some((l: any) => String(l.market_ticker || l.event_ticker || '').startsWith(prefix))
      return hasSportLeg && marketContainsGame(m, homeCode, awayCode)
    })
  } catch { return [] }
}

function findKalshiMatch(player: string, rec: PropRecommendation, sport: Sport, markets: any[]): KalshiMarketMatch | null {
  const prefixes = metricPrefixes(rec.metric, sport)
  if (!prefixes.length) return null
  const playerPattern = new RegExp(`${player.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${rec.line}\\+`, 'i')
  const matches = markets
    .map((m: any) => {
      const legs = m.mve_selected_legs || []
      const leg = legs.find((l: any) => prefixes.some(p => String(l.market_ticker || '').startsWith(p)) && playerPattern.test(m.title || m.yes_sub_title || ''))
      if (!leg) return null
      return {
        ticker: String(m.ticker),
        title: String(m.title || m.yes_sub_title || ''),
        url: `https://kalshi.com/markets/${m.ticker}`,
        legTicker: String(leg.market_ticker || ''),
        yesAsk: dollarsToCents(m.yes_ask_dollars),
        yesAskSize: sizeToNum(m.yes_ask_size_fp),
        yesBid: dollarsToCents(m.yes_bid_dollars),
        yesBidSize: sizeToNum(m.yes_bid_size_fp),
        isCombo: (legs.length || 0) > 1,
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

async function applyXaiPropIntel(players: PlayerPropLine[]): Promise<PlayerPropLine[]> {
  if (!process.env.XAI_API_KEY) return players
  const targets = players.filter(p => p.bestBet?.kalshi).slice(0, 6)
  if (!targets.length) return players
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
    })
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
}

function gateToKalshi(players: PlayerPropLine[], sport: Sport, markets: any[]): PlayerPropLine[] {
  return players.map(p => {
    const recommendations = p.recommendations
      .map(r => ({ ...r, kalshi: findKalshiMatch(p.player, r, sport, markets) }))
      .filter(r => r.kalshi && r.kalshi.yesAsk <= r.maxYesPrice)
      .sort((a, b) => (b.valueScore - a.valueScore) || ((a.kalshi?.yesAsk || 99) - (b.kalshi?.yesAsk || 99)))
    const bestBet = recommendations[0] || null
    return { ...p, recommendations, bestBet }
  }).filter(p => p.bestBet) as PlayerPropLine[]
}

function recommendNBA(logs: GameLogEntry[]): PropRecommendation[] {
  const pts = logs.map(g => g.stats.points)
  const reb = logs.map(g => g.stats.rebounds)
  const ast = logs.map(g => g.stats.assists)
  const pra = logs.map(g => g.stats.points + g.stats.rebounds + g.stats.assists)
  return [
    findBestThreshold(pts, [10, 15, 20, 25, 30, 35], 'points'),
    findBestThreshold(reb, [4, 6, 8, 10, 12, 15], 'rebounds'),
    findBestThreshold(ast, [3, 4, 5, 6, 8, 10, 12], 'assists'),
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
          minutes: stat('minutes'), points: stat('points'), rebounds: stat('totalRebounds'), assists: stat('assists'), blocks: stat('blocks'), steals: stat('steals'), turnovers: stat('turnovers'),
        }
      : {
          passingYards: stat('passingYards'), passingTouchdowns: stat('passingTouchdowns'), interceptions: stat('interceptions'), rushingYards: stat('rushingYards'), rushingTouchdowns: stat('rushingTouchdowns'), receptions: stat('receptions'), receivingTargets: stat('receivingTargets'), receivingYards: stat('receivingYards'), receivingTouchdowns: stat('receivingTouchdowns'),
        }
    logs.push({
      eventId,
      date: meta.date || '',
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
  const leaguePath = sport === 'nba' ? 'basketball/nba' : 'football/nfl'
  const season = sport === 'nba' ? '2026' : '2025'
  const data = await safeJson(`https://site.web.api.espn.com/apis/common/v3/sports/${leaguePath}/athletes/${athleteId}/gamelog?season=${season}`)
  return parseGameLogs(data, sport)
}

function flattenRoster(rawAthletes: any[], sport: Sport): any[] {
  if (sport === 'nba') return rawAthletes
  const offense = rawAthletes.find(g => String(g.position).toLowerCase() === 'offense')
  return (offense?.items || rawAthletes.flatMap(g => g.items || [])).filter((p: any) => ['QB', 'RB', 'WR', 'TE'].includes(p.position?.abbreviation || ''))
}

function teamSlug(abbr: string, sport: Sport): string {
  const upper = abbr.toUpperCase()
  return sport === 'nba' ? (ESPN_ABBR[upper] || upper.toLowerCase()) : (NFL_ABBR[upper] || upper.toLowerCase())
}

async function fetchTeamProps(abbr: string, sport: Sport): Promise<PlayerPropLine[]> {
  const leaguePath = sport === 'nba' ? 'basketball/nba' : 'football/nfl'
  const rosterData = await safeJson(`https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/teams/${teamSlug(abbr, sport)}/roster`)
  const roster = flattenRoster(rosterData?.athletes || [], sport).slice(0, sport === 'nba' ? 14 : 22)

  const results = await Promise.all(roster.map(async (player: any) => {
    const logs = await fetchPlayerGameLogs(String(player.id), sport)
    if (logs.length < 4) return null
    const recommendations = sport === 'nba' ? recommendNBA(logs) : recommendNFL(logs)
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
        position: player.position?.abbreviation || '?',
        headshot: player.headshot?.href || undefined,
        sport,
        gamesPlayed: logs.length,
        pts: { line: roundLine(ptsAvg), avg: Number(ptsAvg.toFixed(1)), trend: calcTrend(avg(logs.slice(0, 5).map(g => g.stats.points)), roundLine(ptsAvg)) },
        reb: { line: roundLine(rebAvg), avg: Number(rebAvg.toFixed(1)), trend: calcTrend(avg(logs.slice(0, 5).map(g => g.stats.rebounds)), roundLine(rebAvg)) },
        ast: { line: roundLine(astAvg), avg: Number(astAvg.toFixed(1)), trend: calcTrend(avg(logs.slice(0, 5).map(g => g.stats.assists)), roundLine(astAvg)) },
        lastFive: logs.slice(0, 5).map(g => ({ pts: g.stats.points, reb: g.stats.rebounds, ast: g.stats.assists })),
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
      position: player.position?.abbreviation || '?',
      headshot: player.headshot?.href || undefined,
      sport,
      gamesPlayed: logs.length,
      last12: logs,
      recommendations,
      bestBet,
    } as PlayerPropLine
  }))

  return (results.filter(Boolean) as PlayerPropLine[])
    .sort((a, b) => (b.bestBet?.confidence || 0) - (a.bestBet?.confidence || 0))
    .slice(0, sport === 'nba' ? 8 : 10)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const home = searchParams.get('home')?.toUpperCase()
  const away = searchParams.get('away')?.toUpperCase()
  const sport = ((searchParams.get('sport') || 'nba').toLowerCase() === 'nfl' ? 'nfl' : 'nba') as Sport

  if (!home || !away) return NextResponse.json({ error: 'Missing home or away param' }, { status: 400 })

  try {
    const [homeRaw, awayRaw, kalshiMarkets] = await Promise.all([fetchTeamProps(home, sport), fetchTeamProps(away, sport), fetchKalshiPropMarkets(sport, home, away)])
    const gatedHome = gateToKalshi(homeRaw, sport, kalshiMarkets)
    const gatedAway = gateToKalshi(awayRaw, sport, kalshiMarkets)
    const withXai = await applyXaiPropIntel([...gatedAway, ...gatedHome])
    const byPlayer = new Map(withXai.map(p => [`${p.team}|${p.player}`, p]))
    const homeProps = gatedHome.map(p => byPlayer.get(`${p.team}|${p.player}`) || p).slice(0, sport === 'nba' ? 8 : 10)
    const awayProps = gatedAway.map(p => byPlayer.get(`${p.team}|${p.player}`) || p).slice(0, sport === 'nba' ? 8 : 10)
    return NextResponse.json({ home: homeProps, away: awayProps, homeTeam: home, awayTeam: away, sport, available: homeProps.length > 0 || awayProps.length > 0 } satisfies PropsResponse)
  } catch (err) {
    console.error('Props error:', err)
    return NextResponse.json({ error: 'Failed to fetch props' }, { status: 500 })
  }
}
