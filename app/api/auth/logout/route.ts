import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/app/lib/auth'
import { clearProfileCookie } from '@/app/lib/profile-store'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  res.cookies.set('session', '', { maxAge: 0, path: '/' })
  clearProfileCookie(res)
  return res
}
