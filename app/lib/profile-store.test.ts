import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountProfile, PROFILE_COOKIE, saveAccountProfile } from './profile-store'

const savedEnv = { ...process.env }

function forceCookieProfileStore() {
  process.env = { ...savedEnv, VERCEL: '1' }
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  delete process.env.PROFILE_STORE_FILE
}

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('profile store cookie persistence', () => {
  it('writes profile updates to the response cookie in cookie storage mode', async () => {
    forceCookieProfileStore()
    const req = new NextRequest('https://athleteintelligence.xyz/api/profile')
    const res = NextResponse.json({ ok: true })

    const profile = await saveAccountProfile(
      { id: 'guest-1', email: 'guest-1@guest.local', name: 'Guest', guest: true },
      req,
      { displayName: 'Johnny', avatarUrl: 'https://example.com/avatar.png', preferences: { sport: 'nba', nested: { nope: true } } },
      res,
    )

    const setCookie = res.headers.get('set-cookie') || ''
    expect(profile.name).toBe('Johnny')
    expect(profile.preferences).toEqual({ sport: 'nba' })
    expect(setCookie).toContain(`${PROFILE_COOKIE}=`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=lax')
  })

  it('reads a profile written by PATCH from the cookie on the next request', async () => {
    forceCookieProfileStore()
    const session = { id: 'guest-2', email: 'guest-2@guest.local', name: 'Guest', guest: true }
    const writeReq = new NextRequest('https://athleteintelligence.xyz/api/profile')
    const writeRes = NextResponse.json({ ok: true })

    await saveAccountProfile(session, writeReq, { name: 'Signal King', preferences: { market: 'props' } }, writeRes)
    const cookie = writeRes.cookies.get(PROFILE_COOKIE)?.value
    expect(cookie).toBeTruthy()

    const readReq = new NextRequest('https://athleteintelligence.xyz/api/profile', {
      headers: { cookie: `${PROFILE_COOKIE}=${cookie}` },
    })
    const profile = await getAccountProfile(session, readReq)

    expect(profile.name).toBe('Signal King')
    expect(profile.preferences).toEqual({ market: 'props' })
    expect(profile.storage).toBe('cookie')
  })
})
