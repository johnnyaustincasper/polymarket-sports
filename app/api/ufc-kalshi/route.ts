import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/app/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KALSHI_API = 'https://external-api.kalshi.com/trade-api/v2'

const UFC_SERIES = [
  { ticker: 'KXUFCFIGHT', category: 'Winner', priority: 1 },
  { ticker: 'KXUFCDISTANCE', category: 'Distance', priority: 2 },
  { ticker: 'KXUFCMOF', category: 'Finish Method', priority: 3 },
  { ticker: 'KXUFCMOV', category: 'Victory Method', priority: 4 },
  { ticker: 'KXUFCROUNDS', category: 'Total Rounds', priority: 5 },
  { ticker: 'KXUFCVICROUND', category: 'Victory Round', priority: 6 },
] as const

function dollarsToCents(v: unknown): number {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function sizeToNum(v: unknown): number {
  const n = Number(v || 0)
  return Number.isFinite(n) ? n : 0
}

function eventKey(eventTicker: string): string {
  const parts = String(eventTicker || '').split('-')
  return parts.slice(1).join('-') || eventTicker
}

function kalshiMarketUrl(ticker: string): string {
  const eventTicker = ticker.split('-').slice(0, 2).join('-')
  const encoded = encodeURIComponent(ticker)
  return `https://kalshi.com/markets/kxufcfight/ufc-fight/${eventTicker.toLowerCase()}?market=${encoded}&market_ticker=${encoded}#${encoded}`
}

function parseFightTitle(title: string): { fighterA: string; fighterB: string; dateLabel: string } {
  const clean = String(title || '').replace(/\s+/g, ' ').trim()
  const scheduled = clean.match(/scheduled for (.+?)\?/i)?.[1] || ''
  const patterns = [
    /win the (.+?) professional MMA fight/i,
    /(?:win|end) the (.+?) UFC fight/i,
    /fight between (.+?) and (.+?) (?:end|go)/i,
    /(.+?) vs\.\s*(.+?) UFC fight/i,
    /(.+?) vs\.?\s*(.+?) fight/i,
  ]
  for (const pattern of patterns) {
    const m = clean.match(pattern)
    if (!m) continue
    if (m.length >= 3 && !m[1].includes(' vs')) return { fighterA: m[1].trim(), fighterB: m[2].trim(), dateLabel: scheduled }
    const pair = m[1].split(/\s+scheduled\s+for\s+/i)[0]
    const [fighterA, fighterB] = pair.split(/\s+vs\.?\s+/i).map(s => s.trim())
    if (fighterA && fighterB) return { fighterA, fighterB, dateLabel: scheduled }
  }
  return { fighterA: 'Fighter A', fighterB: 'Fighter B', dateLabel: scheduled }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function kalshiFetch(url: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 30 },
    })
    if (res.status !== 429) return res
    const retryAfter = Number(res.headers.get('retry-after') || 0)
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 900 + attempt * 700)
  }
  return fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
    next: { revalidate: 30 },
  })
}

async function fetchSeries(seriesTicker: string) {
  const markets: any[] = []
  let cursor = ''
  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({ status: 'open', limit: '200', series_ticker: seriesTicker })
    if (cursor) params.set('cursor', cursor)
    const res = await kalshiFetch(`${KALSHI_API}/markets?${params.toString()}`)
    if (!res.ok) break
    const data = await res.json()
    markets.push(...(data.markets || []))
    cursor = String(data.cursor || '')
    if (!cursor) break
    await sleep(350)
  }
  return markets
}

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'ufc-kalshi', { limit: 10, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  try {
    const byFight = new Map<string, any>()
    const scannedBySeries: Record<string, number> = {}

    for (const series of UFC_SERIES) {
      await sleep(650)
      const markets = await fetchSeries(series.ticker)
      scannedBySeries[series.ticker] = markets.length
      for (const m of markets) {
        const ticker = String(m.ticker || '')
        const eventTicker = String(m.event_ticker || ticker.split('-').slice(0, 2).join('-'))
        const key = eventKey(eventTicker)
        if (!key) continue
        const title = String(m.title || '')
        const parsed = parseFightTitle(title)
        const existing = byFight.get(key) || {
          id: key,
          eventKey: key,
          eventTickers: [],
          fighterA: parsed.fighterA,
          fighterB: parsed.fighterB,
          dateLabel: parsed.dateLabel,
          markets: [],
        }
        if (!existing.eventTickers.includes(eventTicker)) existing.eventTickers.push(eventTicker)
        if (existing.fighterA === 'Fighter A' && parsed.fighterA !== 'Fighter A') {
          existing.fighterA = parsed.fighterA
          existing.fighterB = parsed.fighterB
        }
        if (!existing.dateLabel && parsed.dateLabel) existing.dateLabel = parsed.dateLabel
        existing.markets.push({
          ticker,
          eventTicker,
          series: series.ticker,
          category: series.category,
          categoryPriority: series.priority,
          fighter: String(m.yes_sub_title || title.match(/^Will (.+?) win/i)?.[1] || '').replace(/\s+/g, ' ').trim(),
          title: title.replace(/\s+/g, ' ').trim(),
          yesAsk: dollarsToCents(m.yes_ask_dollars),
          yesAskSize: sizeToNum(m.yes_ask_size_fp),
          yesBid: dollarsToCents(m.yes_bid_dollars),
          yesBidSize: sizeToNum(m.yes_bid_size_fp),
          status: String(m.status || ''),
          url: kalshiMarketUrl(ticker),
        })
        byFight.set(key, existing)
      }
    }

    const fights = Array.from(byFight.values())
      .map(f => ({
        ...f,
        markets: f.markets.sort((a: any, b: any) => a.categoryPriority - b.categoryPriority || b.yesAskSize - a.yesAskSize || a.yesAsk - b.yesAsk),
      }))
      .sort((a, b) => {
        const aWinner = a.markets.some((m: any) => m.series === 'KXUFCFIGHT') ? 1 : 0
        const bWinner = b.markets.some((m: any) => m.series === 'KXUFCFIGHT') ? 1 : 0
        if (aWinner !== bWinner) return bWinner - aWinner
        return b.markets.length - a.markets.length
      })

    return NextResponse.json({
      available: fights.length > 0,
      series: UFC_SERIES.map(s => s.ticker),
      scanned: Object.values(scannedBySeries).reduce((a, b) => a + b, 0),
      scannedBySeries,
      fights,
    })
  } catch (err) {
    console.error('UFC Kalshi error:', err)
    return NextResponse.json({ available: false, series: UFC_SERIES.map(s => s.ticker), scanned: 0, scannedBySeries: {}, fights: [], error: 'Failed to fetch Kalshi UFC markets' }, { status: 500 })
  }
}
