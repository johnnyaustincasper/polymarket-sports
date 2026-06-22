import { describe, expect, it, vi } from 'vitest'
import { resolveStartupSport } from './startup-sport'

type TestGame = { id: string; status: 'pre' | 'in' | 'post' }

describe('resolveStartupSport', () => {
  it('starts on MLB when MLB has games', async () => {
    const mlbGames: TestGame[] = [{ id: 'mlb-1', status: 'pre' }]
    const loadGames = vi.fn(async (sport: string) => sport === 'mlb' ? mlbGames : [])

    const result = await resolveStartupSport({ initialDate: '20260520', loadGames })

    expect(result).toEqual({ sport: 'mlb', date: '20260520', games: mlbGames })
    expect(loadGames).toHaveBeenCalledTimes(1)
    expect(loadGames).toHaveBeenCalledWith('mlb', '20260520')
  })

  it('falls back from MLB to NFL when MLB has no games', async () => {
    const nflGames: TestGame[] = [{ id: 'nfl-1', status: 'pre' }]
    const loadGames = vi.fn(async (sport: string) => sport === 'nfl' ? nflGames : [])

    const result = await resolveStartupSport({ initialDate: '20260520', loadGames })

    expect(result).toEqual({ sport: 'nfl', date: '20260520', games: nflGames })
    expect(loadGames).toHaveBeenNthCalledWith(1, 'mlb', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(2, 'nfl', '20260520')
  })

  it('falls back from MLB to NFL to NHL when only NHL has games', async () => {
    const nhlGames: TestGame[] = [{ id: 'nhl-1', status: 'pre' }]
    const loadGames = vi.fn(async (sport: string) => sport === 'nhl' ? nhlGames : [])

    const result = await resolveStartupSport({ initialDate: '20260520', loadGames })

    expect(result).toEqual({ sport: 'nhl', date: '20260520', games: nhlGames })
    expect(loadGames).toHaveBeenNthCalledWith(1, 'mlb', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(2, 'nfl', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(3, 'nhl', '20260520')
  })

  it('falls through to NBA only after MLB, NFL, NHL, and Soccer have no games', async () => {
    const nbaGames: TestGame[] = [{ id: 'nba-1', status: 'pre' }]
    const loadGames = vi.fn(async (sport: string) => sport === 'nba' ? nbaGames : [])

    const result = await resolveStartupSport({ initialDate: '20260520', loadGames })

    expect(result).toEqual({ sport: 'nba', date: '20260520', games: nbaGames })
    expect(loadGames).toHaveBeenNthCalledWith(1, 'mlb', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(2, 'nfl', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(3, 'nhl', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(4, 'soccer', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(5, 'nba', '20260520')
  })

  it('uses Soccer before NBA when only Soccer has games', async () => {
    const soccerGames: TestGame[] = [{ id: 'soccer-1', status: 'pre' }]
    const loadGames = vi.fn(async (sport: string) => sport === 'soccer' ? soccerGames : [])

    const result = await resolveStartupSport({ initialDate: '20260520', loadGames })

    expect(result).toEqual({ sport: 'soccer', date: '20260520', games: soccerGames })
    expect(loadGames).toHaveBeenNthCalledWith(1, 'mlb', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(2, 'nfl', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(3, 'nhl', '20260520')
    expect(loadGames).toHaveBeenNthCalledWith(4, 'soccer', '20260520')
  })

  it('keeps NBA selected with an empty slate when no fallback sport has games', async () => {
    const loadGames = vi.fn(async () => [])

    const result = await resolveStartupSport({ initialDate: '20260520', loadGames })

    expect(result).toEqual({ sport: 'nba', date: '20260520', games: [] })
    expect(loadGames).toHaveBeenCalledTimes(5)
  })
})
