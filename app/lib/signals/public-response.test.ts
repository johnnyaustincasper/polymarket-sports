import { describe, expect, it } from 'vitest'
import { containsPublicJargon, publicSignal, stripPublicJargon } from './public-response'

describe('public response language', () => {
  it('removes generic AI/betting slop from public copy', () => {
    const cleaned = stripPublicJargon('Model indicates trend supports an edge and signal detected at 12c ask.')
    expect(cleaned).not.toMatch(/model indicates|trend supports|edge|signal detected|ask|12c/i)
    expect(cleaned).toContain('recent games show')
  })

  it('detects banned jargon phrases before exposing bullets', () => {
    expect(containsPublicJargon('historical context suggests value may exist')).toBe(true)
    expect(containsPublicJargon('He needs starter minutes to get there.')).toBe(false)
  })

  it('passes cleaned X and non-X receipts through public metadata', () => {
    const signal = publicSignal({
      id: 'sig-1',
      player: 'Player One',
      label: '10+ points',
      hits: 8,
      games: 10,
      avg: 12.4,
      metadata: {
        xIntel: {
          summary: 'Model indicates X chatter is quiet.',
          sources: ['https://x.com/source/status/1'],
          posts: [{ id: '1', author: 'source', text: 'trend supports normal starter minutes', url: 'https://x.com/source/status/1' }],
        },
        newsIntel: {
          summary: 'Historical context suggests official lineup news is normal.',
          sources: ['https://example.com/lineup'],
          articles: [{ title: 'Model indicates starter is active', description: 'trend supports minutes', source: 'Example', url: 'https://example.com/lineup' }],
        },
      },
    }) as any

    expect(signal.metadata.xIntel.summary).not.toMatch(/model indicates/i)
    expect(signal.metadata.xIntel.posts[0].text).not.toMatch(/trend supports/i)
    expect(signal.metadata.xIntel.sources).toEqual(['https://x.com/source/status/1'])
    expect(signal.metadata.newsIntel.summary).not.toMatch(/historical context suggests/i)
    expect(signal.metadata.newsIntel.articles[0].title).not.toMatch(/model indicates/i)
    expect(signal.metadata.newsIntel.sources).toEqual(['https://example.com/lineup'])
  })
})
