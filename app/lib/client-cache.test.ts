import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheKey, clearJsonClientCache, fetchJsonCached } from './client-cache'

describe('client cache helpers', () => {
  beforeEach(() => {
    clearJsonClientCache()
    vi.restoreAllMocks()
  })

  it('builds stable query keys and omits empty values', () => {
    expect(cacheKey('/api/props', { home: 'LAL', away: 'BOS', sport: 'nba', eventId: '', page: 0 })).toBe('/api/props?home=LAL&away=BOS&sport=nba&page=0')
    expect(cacheKey('/api/markets')).toBe('/api/markets')
  })

  it('dedupes inflight requests and reuses fresh cached JSON', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, n: fetchMock.mock.calls.length }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([
      fetchJsonCached<{ ok: boolean; n: number }>('/api/test', 30_000),
      fetchJsonCached<{ ok: boolean; n: number }>('/api/test', 30_000),
    ])
    const c = await fetchJsonCached<{ ok: boolean; n: number }>('/api/test', 30_000)

    expect(a).toEqual({ ok: true, n: 1 })
    expect(b).toEqual(a)
    expect(c).toEqual(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws API error messages from non-OK responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'props unavailable' }),
    })))

    await expect(fetchJsonCached('/api/test', 30_000)).rejects.toThrow('props unavailable')
  })
})
