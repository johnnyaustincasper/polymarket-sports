import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/sign-up', '/subscribe', '/api/auth', '/api/webhooks/stripe', '/api/stripe']
const SESSION_COOKIE = 'ai_session'
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)

function getSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET || ''
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function hmacSha256(data: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  let binary = ''
  new Uint8Array(signature).forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

async function verifyLegacyToken(token?: string) {
  const secret = getSecret()
  if (!token || !secret || !token.includes('.')) return false
  const [payload, signature] = token.split('.')
  const expectedSignature = await hmacSha256(payload, secret)
  if (!safeEqual(signature || '', expectedSignature)) return false
  try {
    const session = JSON.parse(base64UrlDecode(payload)) as { email?: string; exp?: number }
    return Boolean(session.email && session.exp && session.exp >= Math.floor(Date.now() / 1000))
  } catch {
    return false
  }
}

async function legacyMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next()

  if (!(await verifyLegacyToken(req.cookies.get(SESSION_COOKIE)?.value))) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

const clerkPassThrough = clerkMiddleware(() => NextResponse.next(), {
  signInUrl: '/login',
  signUpUrl: '/sign-up',
})

export function proxy(req: NextRequest, event: any) {
  if (!clerkEnabled) return legacyMiddleware(req)
  return clerkPassThrough(req, event)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|brand/.*).*)'],
}
