import { NextRequest, NextResponse } from 'next/server'
import { fetchUFCEvents } from '@/app/lib/ufc/events'
import { buildUFCEventDeepAnalysis, getCachedUFCEventAnalysis } from '@/app/lib/ufc/deep-analysis-service'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

const WINDOW_MIN_MS = 12 * 60 * 60_000
const WINDOW_MAX_MS = 36 * 60 * 60_000

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.UFC_ANALYSIS_ADMIN_SECRET || process.env.ADMIN_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}` || req.headers.get('x-admin-secret') === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const now = Date.now()
    const events = await fetchUFCEvents()
    let generated = 0
    let skipped = 0
    const results: Array<{ eventId: string; eventName: string; action: string; status?: string }> = []

    for (const event of events.filter(e => e.status !== 'post')) {
      const startsAt = new Date(event.date).getTime()
      const until = startsAt - now
      if (!Number.isFinite(startsAt) || until < WINDOW_MIN_MS || until > WINDOW_MAX_MS) {
        skipped += 1
        results.push({ eventId: event.id, eventName: event.name, action: 'outside-window' })
        continue
      }
      const cached = await getCachedUFCEventAnalysis(event.id, event)
      if (cached && cached.status !== 'stale') {
        skipped += 1
        results.push({ eventId: event.id, eventName: event.name, action: 'cached', status: cached.status })
        continue
      }
      const analysis = await buildUFCEventDeepAnalysis(event, { force: true, save: true })
      generated += 1
      results.push({ eventId: event.id, eventName: event.name, action: 'generated', status: analysis.status })
    }

    return NextResponse.json({ ok: true, generated, skipped, results })
  } catch (err) {
    console.error('UFC analysis cron error:', err)
    return NextResponse.json({ error: 'Failed to run UFC analysis cron' }, { status: 500 })
  }
}
