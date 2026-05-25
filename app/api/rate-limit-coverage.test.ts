import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const routeLimits = [
  { route: 'bot/fullscan', bucket: 'bot:fullscan', limit: 5 },
  { route: 'bot/scan', bucket: 'bot:scan', limit: 10 },
  { route: 'bot/signals', bucket: 'bot:signals', limit: 10 },
  { route: 'team-intel', bucket: 'team-intel', limit: 20 },
  { route: 'ufc', bucket: 'ufc', limit: 30 },
  { route: 'ufc-kalshi', bucket: 'ufc-kalshi', limit: 10 },
  { route: 'fighters', bucket: 'fighters', limit: 40 },
  { route: 'markets', bucket: 'markets', limit: 30 },
  { route: 'game-live', bucket: 'game-live', limit: 60 },
  { route: 'lineups', bucket: 'lineups', limit: 60 },
  { route: 'streaks', bucket: 'streaks', limit: 20 },
]

describe('expensive route rate-limit coverage', () => {
  it.each(routeLimits)('$route enforces its conservative rate-limit bucket', ({ route, bucket, limit }) => {
    const source = readFileSync(join(process.cwd(), 'app/api', route, 'route.ts'), 'utf8')

    expect(source).toContain("import { enforceRateLimit } from '@/app/lib/rate-limit'")
    expect(source).toContain(`enforceRateLimit(req, '${bucket}', { limit: ${limit}, windowMs: 60_000 })`)
    expect(source).toContain('if (rateLimited) return rateLimited')
  })
})
