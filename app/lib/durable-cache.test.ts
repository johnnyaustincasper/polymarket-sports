import { describe, expect, it } from 'vitest'
import { getDurableCacheStatus } from './durable-cache'

describe('durable cache status', () => {
  it('reports memory mode when no Redis REST config is present', () => {
    const status = getDurableCacheStatus({})

    expect(status.mode).toBe('memory')
    expect(status.remoteConfigured).toBe(false)
    expect(status.prefix).toBe('athlete-intel')
  })

  it('reports redis mode when REST URL and token are present', () => {
    const status = getDurableCacheStatus({ KV_REST_API_URL: 'https://redis.example', KV_REST_API_TOKEN: 'secret', DURABLE_CACHE_PREFIX: 'ai-prod' })

    expect(status.mode).toBe('redis')
    expect(status.remoteConfigured).toBe(true)
    expect(status.prefix).toBe('ai-prod')
    expect(status.recommendedForProduction).toBe(true)
    expect(status.warning).toBeUndefined()
  })

  it('flags production memory fallback as not production safe', () => {
    const status = getDurableCacheStatus({ NODE_ENV: 'production', VERCEL: '1' })

    expect(status.mode).toBe('memory')
    expect(status.remoteConfigured).toBe(false)
    expect(status.recommendedForProduction).toBe(false)
    expect(status.warning).toContain('Redis')
  })
})
