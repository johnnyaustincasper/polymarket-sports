import { describe, expect, it, vi } from 'vitest'
import { buildXIntelQuery, fetchXIntelForSignal, summarizeXPosts } from './x-intel'

const signal = {
  id: 'sig-1',
  sport: 'nba',
  player: 'Tyrese Maxey',
  team: 'PHI',
  matchup: 'BOS @ PHI',
  metric: 'points',
  label: '22.5+ points',
}

describe('x-intel', () => {
  it('builds player and context heavy X search queries without retweets', () => {
    const query = buildXIntelQuery(signal)
    expect(query).toContain('"Tyrese Maxey"')
    expect(query).toContain('PHI')
    expect(query).toContain('starter')
    expect(query).toContain('-is:retweet')
    expect(query).toContain('lang:en')
  })

  it('returns unavailable context when no bearer token is configured', async () => {
    const context = await fetchXIntelForSignal(signal, { env: {} })
    expect(context.unavailable).toBe('missing_x_bearer_token')
    expect(context.posts).toEqual([])
    expect(context.summary).toMatch(/not configured/i)
  })

  it('normalizes X API search results into posts and source URLs', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: '123', text: 'Maxey expected to start and play normal minutes.', author_id: 'u1', created_at: '2026-07-01T00:00:00Z' },
      ],
      includes: { users: [{ id: 'u1', username: 'beatwriter' }] },
    }), { status: 200 })) as any

    const context = await fetchXIntelForSignal(signal, { env: { X_API_BEARER_TOKEN: 'token' }, fetchImpl, maxPosts: 1 })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(context.posts).toHaveLength(1)
    expect(context.posts[0].author).toBe('beatwriter')
    expect(context.sources[0]).toBe('https://x.com/beatwriter/status/123')
    expect(context.summary).toContain('@beatwriter')
  })

  it('summarizes empty post sets as quiet', () => {
    expect(summarizeXPosts([])).toMatch(/No recent X posts/i)
  })
})
