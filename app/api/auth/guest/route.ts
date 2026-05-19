import { NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from '@/app/lib/auth'
import { isGuestAccessEnabled } from '@/app/lib/guest-access'

export async function POST() {
  if (!isGuestAccessEnabled()) {
    return NextResponse.json({ ok: false, error: 'Guest access is disabled' }, { status: 403 })
  }

  const guestId = crypto.randomUUID().slice(0, 8)
  const token = await createSessionToken(`guest-${guestId}@guest.local`, 'Guest', { guest: true, id: `guest-${guestId}` })
  const res = NextResponse.json({ ok: true, guest: true })
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
