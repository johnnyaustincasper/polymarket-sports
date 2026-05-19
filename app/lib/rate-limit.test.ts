import { describe, expect, it } from 'vitest'
import { checkRateLimit, getRateLimitKey } from './rate-limit'

describe('rate limit helpers', () => {
  it('allows requests up to the configured limit and blocks the next one', () => {
    const store = new Map<string, number[]>()
    const now = 1_000_000

    expect(checkRateLimit({ key: 'ip:1', limit: 2, windowMs: 60_000, now, store }).allowed).toBe(true)
    expect(checkRateLimit({ key: 'ip:1', limit: 2, windowMs: 60_000, now: now + 1, store }).allowed).toBe(true)

    const blocked = checkRateLimit({ key: 'ip:1', limit: 2, windowMs: 60_000, now: now + 2, store })
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBe(60)
  })

  it('expires old hits outside the configured window', () => {
    const store = new Map<string, number[]>([['ip:1', [1_000, 2_000]]])

    const result = checkRateLimit({ key: 'ip:1', limit: 2, windowMs: 60_000, now: 62_001, store })

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)
  })

  it('uses forwarded headers before remote address when building keys', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })

    expect(getRateLimitKey({ headers, ip: '198.51.100.9' }, 'props')).toBe('props:203.0.113.7')
  })
})
