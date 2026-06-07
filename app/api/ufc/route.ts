import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { fetchUFCEvents } from '@/app/lib/ufc/events'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'ufc', { limit: 30, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  try {
    const events = await fetchUFCEvents()
    return NextResponse.json(events)
  } catch (err) {
    console.error('UFC API error:', err)
    return NextResponse.json([], { status: 200 })
  }
}
