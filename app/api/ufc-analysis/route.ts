import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { fetchUFCEvents } from '@/app/lib/ufc/events'
import { buildBaselineUFCEventAnalysis, getCachedUFCEventAnalysis, getNextUFCEventForAnalysis } from '@/app/lib/ufc/deep-analysis-service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'ufc-analysis', { limit: 30, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  try {
    const requestedEventId = req.nextUrl.searchParams.get('eventId') || ''
    const events = await fetchUFCEvents()
    const event = requestedEventId
      ? events.find(e => e.id === requestedEventId) || null
      : await getNextUFCEventForAnalysis(events)

    if (!event) {
      return NextResponse.json({
        available: false,
        status: 'missing',
        message: 'No UFC event is available for deep analysis yet.',
      })
    }

    const cached = await getCachedUFCEventAnalysis(event.id, event)
    if (!cached || cached.status === 'stale') {
      const status = cached?.status || 'missing'
      return NextResponse.json({
        available: true,
        status: 'partial',
        sourceStatus: status,
        eventId: event.id,
        eventName: event.name,
        eventDate: event.date,
        analysis: buildBaselineUFCEventAnalysis(event, status),
        message: cached?.status === 'stale'
          ? 'Deep UFC analysis cache is stale; serving ESPN-backed baseline until regenerated.'
          : 'Deep UFC analysis cache is missing; serving ESPN-backed baseline until regenerated.',
      })
    }

    return NextResponse.json({
      available: true,
      status: cached.status,
      analysis: cached,
    })
  } catch (err) {
    console.error('UFC analysis read error:', err)
    return NextResponse.json({ available: false, status: 'missing', message: 'Failed to load UFC deep analysis.' }, { status: 500 })
  }
}
