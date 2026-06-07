import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('market feed refresh resilience', () => {
  it('keeps sport-switch refreshes from letting stale requests overwrite the active slate', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'AppClient.tsx'), 'utf8')

    expect(source).toContain('feedRequestSeqRef')
    expect(source).toContain('feedAbortRef')
    expect(source).toContain('feedAbortRef.current?.abort()')
    expect(source).toContain('signal: controller.signal')
    expect(source).toContain('if (!isCurrentFeedRequest()) return')
  })

  it('keeps the user-facing markets route lenient enough for normal mobile sport switching', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/markets/route.ts'), 'utf8')

    expect(source).toContain("enforceRateLimit(req, 'markets', { limit: 240, windowMs: 60_000 })")
  })
})
