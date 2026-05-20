import { NextRequest, NextResponse } from 'next/server'

type RateLimitStore = Map<string, number[]>

type RateLimitOptions = { limit?: number; windowMs?: number }
type RateLimitEnv = Record<string, string | undefined>

type CheckRateLimitArgs = {
  key: string
  limit: number
  windowMs: number
  now?: number
  store?: RateLimitStore
}

type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

const defaultStore: RateLimitStore = new Map()

export function checkRateLimit({ key, limit, windowMs, now = Date.now(), store = defaultStore }: CheckRateLimitArgs): RateLimitResult {
  const cutoff = now - windowMs
  const hits = (store.get(key) || []).filter(hit => hit > cutoff)
  const allowed = hits.length < limit

  if (allowed) hits.push(now)
  store.set(key, hits)

  const oldest = hits[0] || now
  const resetAt = oldest + windowMs
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - hits.length),
    resetAt,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  }
}

export function getRateLimitKey(req: Pick<NextRequest, 'headers'>, bucket: string): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = req.headers.get('x-real-ip')?.trim()
  return `${bucket}:${forwarded || realIp || 'unknown'}`
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: 'Too many requests', retryAfterSeconds: result.retryAfterSeconds },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  )
}

export function getRateLimitConfig(
  options: RateLimitOptions = {},
  env: RateLimitEnv = process.env,
) {
  return {
    limit: positiveInteger(options.limit) ?? positiveInteger(env.API_RATE_LIMIT_REQUESTS) ?? 60,
    windowMs: positiveInteger(options.windowMs) ?? positiveInteger(env.API_RATE_LIMIT_WINDOW_MS) ?? 60_000,
  }
}

function positiveInteger(value: number | string | undefined): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

export function enforceRateLimit(req: NextRequest, bucket: string, options: RateLimitOptions = {}) {
  const config = getRateLimitConfig(options)
  const result = checkRateLimit({
    key: getRateLimitKey(req, bucket),
    limit: config.limit,
    windowMs: config.windowMs,
  })
  return result.allowed ? null : rateLimitResponse(result)
}
