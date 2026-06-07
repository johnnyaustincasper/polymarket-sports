import { NextRequest, NextResponse } from 'next/server'
import { fetchUFCEvents } from '@/app/lib/ufc/events'
import { buildUFCEventDeepAnalysis, getNextUFCEventForAnalysis } from '@/app/lib/ufc/deep-analysis-service'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.UFC_ANALYSIS_ADMIN_SECRET || process.env.ADMIN_SECRET || process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('x-admin-secret') === secret || req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const eventId = typeof body?.eventId === 'string' ? body.eventId : ''
    const force = body?.force !== false
    const events = await fetchUFCEvents()
    const event = eventId ? events.find(e => e.id === eventId) : await getNextUFCEventForAnalysis(events)
    if (!event) return NextResponse.json({ error: 'No UFC event available to analyze' }, { status: 404 })

    const analysis = await buildUFCEventDeepAnalysis(event, { force, save: true })
    return NextResponse.json({ ok: true, eventId: event.id, status: analysis.status, fights: analysis.fights.length, analysis })
  } catch (err) {
    console.error('UFC analysis rebuild error:', err)
    return NextResponse.json({ error: 'Failed to rebuild UFC analysis' }, { status: 500 })
  }
}
