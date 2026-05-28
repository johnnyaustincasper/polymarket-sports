import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Sport = 'nba' | 'mlb' | 'nfl'

function parseSport(value: string | null): Sport {
  return value === 'mlb' || value === 'nfl' ? value : 'nba'
}

function yyyymmdd(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization') || ''
  const querySecret = req.nextUrl.searchParams.get('secret') || ''
  return auth === `Bearer ${secret}` || querySecret === secret
}

async function readJson(response: Response) {
  const text = await response.text()
  try { return JSON.parse(text) } catch { return { raw: text } }
}

async function findSlate(origin: string, sport: Sport) {
  const now = new Date()
  const offsets = sport === 'nfl' ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2]
  for (const offset of offsets) {
    const date = new Date(now.getTime() + offset * 24 * 60 * 60_000)
    const key = yyyymmdd(date)
    const url = `${origin}/api/markets?sport=${sport}&date=${key}&displayDate=${key}&t=${Date.now()}`
    const response = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'AthleteIntelligenceCron/1.0' } })
    if (!response.ok) continue
    const games = await readJson(response)
    if (Array.isArray(games) && games.length) return { date: key, games }
  }
  return { date: null, games: [] as any[] }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const origin = req.nextUrl.origin
  const sportsParam = req.nextUrl.searchParams.get('sports')
  const sports = sportsParam
    ? sportsParam.split(',').map(part => parseSport(part.trim())).filter((sport, idx, arr) => arr.indexOf(sport) === idx)
    : [parseSport(req.nextUrl.searchParams.get('sport'))]
  const results: any[] = []

  for (const sport of sports) {
    const slate = await findSlate(origin, sport)
    if (!slate.games.length) {
      results.push({ sport, skipped: true, reason: 'no upcoming games found', date: slate.date })
      continue
    }
    const response = await fetch(`${origin}/api/signals`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'AthleteIntelligenceCron/1.0' },
      body: JSON.stringify({ sport, games: slate.games, daily: true, force: true }),
    })
    const payload = await readJson(response)
    results.push({
      sport,
      date: slate.date,
      status: response.status,
      ok: response.ok,
      games: slate.games.length,
      signals: Array.isArray(payload?.signals) ? payload.signals.length : 0,
      contractsScored: payload?.contractsScored ?? 0,
      generatedAt: payload?.generatedAt,
      firstSignal: payload?.signals?.[0] ? {
        player: payload.signals[0].player,
        label: payload.signals[0].label,
        whyCare: payload.signals[0].whyCare,
        intel: payload.signals[0].metadata?.todayIntel,
      } : null,
      error: payload?.error,
    })
  }

  const ok = results.every(row => row.ok || row.skipped)
  return NextResponse.json({ ok, generatedAt: new Date().toISOString(), results }, { status: ok ? 200 : 500 })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
