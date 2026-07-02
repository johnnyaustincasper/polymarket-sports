import { describe, expect, it, vi } from 'vitest'
import { fetchNewsIntelForSignal, summarizeNewsArticles } from './news-intel'

const signal = {
  id: 'sig-news-1',
  sport: 'mlb',
  player: 'Aaron Judge',
  team: 'NYY',
  matchup: 'BOS @ NYY',
  metric: 'hits',
  label: '1+ hits',
}

describe('news-intel', () => {
  it('returns unavailable context when Brave/Search is not configured', async () => {
    const context = await fetchNewsIntelForSignal(signal, { env: {} })
    expect(context.unavailable).toBe('missing_brave_search_token')
    expect(context.articles).toEqual([])
    expect(context.summary).toMatch(/not configured/i)
  })

  it('normalizes Brave web results into non-X receipt articles', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      web: {
        results: [
          {
            title: 'Yankees lineup notes: Judge starts in right field',
            url: 'https://example.com/judge-lineup',
            description: 'Judge remains in the two-hole against Boston.',
            profile: { name: 'Example Sports' },
            age: '2 hours ago',
          },
        ],
      },
    }), { status: 200 })) as any

    const context = await fetchNewsIntelForSignal(signal, { env: { BRAVE_API_KEY: 'brave-token' }, fetchImpl, maxArticles: 1 })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(context.articles).toHaveLength(1)
    expect(context.articles[0]).toMatchObject({
      title: 'Yankees lineup notes: Judge starts in right field',
      source: 'Example Sports',
      url: 'https://example.com/judge-lineup',
    })
    expect(context.sources).toEqual(['https://example.com/judge-lineup'])
    expect(context.summary).toContain('Example Sports')
  })

  it('summarizes empty article sets as quiet', () => {
    expect(summarizeNewsArticles([])).toMatch(/No fresh non-X news receipt/i)
  })
})
