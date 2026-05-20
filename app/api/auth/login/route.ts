import { NextRequest, NextResponse } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  findAuthorizedUser,
  getAuthConfigStatus,
  validateAccessCode,
} from '@/app/lib/auth'
import { enforceRateLimit } from '@/app/lib/rate-limit'

export async function POST(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'auth:login', { limit: 5, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  const { email, code, name } = await req.json().catch(() => ({}))
  const cleanEmail = String(email || '').trim().toLowerCase()
  const accessCode = String(code || '').trim()
  const displayName = String(name || '').trim()

  if (!cleanEmail || !accessCode) {
    return NextResponse.json({ error: 'Email and access code are required.' }, { status: 400 })
  }

  const config = getAuthConfigStatus()
  if (!config.hasSecret || !config.hasGlobalInviteCode) {
    return NextResponse.json({ error: 'Auth is not configured yet.' }, { status: 503 })
  }

  const authorizedUser = findAuthorizedUser(cleanEmail)
  const bootstrapUser = config.bootstrapMode ? { email: cleanEmail, name: displayName || undefined } : null
  const user = authorizedUser || bootstrapUser

  if (!user || !validateAccessCode(user, accessCode)) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 401 })
  }

  const token = await createSessionToken(cleanEmail, displayName || user.name)
  const res = NextResponse.json({ ok: true, email: cleanEmail })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  })

  // Retire legacy shared-password cookie if it exists.
  res.cookies.set('session', '', { maxAge: 0, path: '/' })
  return res
}
