import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { fetchUFCEvents } from '@/app/lib/ufc/events'
import { buildRuntimeBaselineUFCEventAnalysis, getCachedUFCEventAnalysis, getNextUFCEventForAnalysis } from '@/app/lib/ufc/deep-analysis-service'
import { getOrCreateSharedUfcSignalBoard } from '@/app/lib/ufc/shared-signal-board'
import { loadUfcKalshiPayload } from '../ufc-kalshi/route'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'ufc-signals', { limit: 30, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  try {
    const requestedEventId = req.nextUrl.searchParams.get('eventId') || ''
    const events = await fetchUFCEvents()
    const event = requestedEventId
      ? events.find(e => e.id === requestedEventId) || null
      : await getNextUFCEventForAnalysis(events)

    if (!event) {
      return NextResponse.json({ available: false, status: 'missing', message: 'No UFC event is available for shared signals yet.' })
    }

    const [cachedAnalysis, kalshi] = await Promise.all([
      getCachedUFCEventAnalysis(event.id, event),
      loadUfcKalshiPayload(),
    ])
    const analysis = !cachedAnalysis || cachedAnalysis.status === 'stale'
      ? await buildRuntimeBaselineUFCEventAnalysis(event, cachedAnalysis?.status || 'missing')
      : cachedAnalysis

    const board = await getOrCreateSharedUfcSignalBoard(event, {
      kalshiFights: kalshi?.fights || [],
      analysisFights: analysis.fights || [],
    })

    return NextResponse.json({
      available: board.cards.length > 0,
      status: board.status,
      eventId: board.eventId,
      eventName: board.eventName,
      eventDate: board.eventDate,
      capturedAt: board.capturedAt,
      updatedAt: board.updatedAt,
      cards: board.cards,
      history: board.history,
      message: board.cards.length
        ? 'Shared UFC Signals board loaded from the captured cache. Everyone sees the same board until the card settles.'
        : 'No UFC fight-card combinations qualify yet.',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('UFC shared signals error:', err)
    return NextResponse.json({ available: false, status: 'missing', message: 'Failed to load shared UFC signals.' }, { status: 500 })
  }
}
