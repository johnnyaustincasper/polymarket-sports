import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, getAuthConfigStatus } from '@/app/lib/auth'
import { buildAccessCodeGuestSession } from '@/app/lib/access-code-guest-session'
import { enforceRateLimit } from '@/app/lib/rate-limit'

export async function POST(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'auth:guest-access-code', { limit: 10, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  const { code } = await req.json().catch(() => ({}))
  const accessCode = String(code || '').trim()
  if (!accessCode) {
    return NextResponse.json({ error: 'Access code is required.' }, { status: 400 })
  }

  const config = getAuthConfigStatus()
  if (!config.hasSecret) {
    return NextResponse.json({ error: 'Guest access is not configured yet.' }, { status: 503 })
  }

  const guestSession = buildAccessCodeGuestSession(accessCode)
  if (!guestSession) {
    return NextResponse.json({ error: 'Invalid or expired access code.' }, { status: 400 })
  }

  const token = await createSessionToken(guestSession.email, guestSession.name, {
    guest: true,
    id: 'guest-access-code',
    subscriptionStatus: guestSession.subscriptionStatus,
    accessSource: guestSession.accessSource,
    accessCodeLabel: guestSession.accessCodeLabel,
  })

  const res = NextResponse.json({
    ok: true,
    guest: true,
    status: guestSession.subscriptionStatus,
    label: guestSession.accessCodeLabel,
  })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  })
  res.cookies.set('session', '', { maxAge: 0, path: '/' })
  return res
}
