import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Sport = 'nba' | 'mlb' | 'nfl' | 'nhl'

function parseSport(value: string | null): Sport {
  return value === 'mlb' || value === 'nfl' || value === 'nhl' ? value : 'nba'
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

function formatDigest(results: any[]): string {
  const lines = ['Athlete Intelligence daily board']
  for (const row of results) {
    if (row.skipped) {
      lines.push('', `${String(row.sport || '').toUpperCase()}: no slate found`)
      continue
    }
    lines.push('', `${String(row.sport || '').toUpperCase()}: ${row.signals || 0} curated signals`)
    for (const signal of row.preview || []) {
      lines.push(`• ${signal.player} — ${signal.label} (${signal.matchup || 'today'})`)
      for (const bullet of signal.whyCare || []) lines.push(`  - ${bullet}`)
    }
    if (row.signals > (row.preview?.length || 0)) lines.push(`  + ${row.signals - row.preview.length} more on the board`)
  }
  lines.push('', 'Open board: https://athleteintelligence.xyz')
  return lines.join('\n').trim()
}

async function sendTelegramDigest(text: string): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.AI_TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.AI_TELEGRAM_CHAT_ID
  if (!token || !chatId) return { sent: false, reason: 'telegram env not configured' }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  if (!response.ok) return { sent: false, reason: `telegram HTTP ${response.status}` }
  return { sent: true }
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
      preview: Array.isArray(payload?.signals) ? payload.signals.slice(0, 3).map((signal: any) => ({
        player: signal.player,
        label: signal.label,
        matchup: signal.matchup,
        whyCare: Array.isArray(signal.whyCare) ? signal.whyCare.slice(0, 2) : [],
      })) : [],
      error: payload?.error,
    })
  }

  const ok = results.every(row => row.ok || row.skipped)
  const digest = formatDigest(results)
  const notify = req.nextUrl.searchParams.get('notify') === '1' || req.nextUrl.searchParams.get('telegram') === '1'
  const telegram = notify ? await sendTelegramDigest(digest) : { sent: false, reason: 'notification not requested' }
  return NextResponse.json({ ok, generatedAt: new Date().toISOString(), results, digest, telegram }, { status: ok ? 200 : 500 })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
