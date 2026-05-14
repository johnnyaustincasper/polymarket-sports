import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/app/lib/auth'
import { clearProfileCookie } from '@/app/lib/profile-store'

const COOKIES_TO_CLEAR = [SESSION_COOKIE, 'session', 'ai_profile']

function clearAuthCookies(res: NextResponse) {
  for (const name of COOKIES_TO_CLEAR) {
    res.cookies.set(name, '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expires: new Date(0),
      maxAge: 0,
      path: '/',
    })
    // Also emit a plain deletion for older/non-secure local cookies that may
    // have been set before the auth rewrite.
    res.cookies.set(name, '', { expires: new Date(0), maxAge: 0, path: '/' })
  }
  clearProfileCookie(res)
  return res
}

export async function POST() {
  const res = NextResponse.json({ ok: true, loggedOut: true })
  return clearAuthCookies(res)
}

export async function GET(req: NextRequest) {
  const url = new URL('/login', req.url)
  const res = NextResponse.redirect(url)
  return clearAuthCookies(res)
}
