import type { SupportedSport } from './sports-utils'

export const STARTUP_SPORT_FALLBACK_ORDER = ['nba', 'mlb', 'nfl'] as const satisfies readonly SupportedSport[]

type StartupSport = (typeof STARTUP_SPORT_FALLBACK_ORDER)[number]

type LoadGamesResult<TGame> = TGame[] | { date?: string; games: TGame[] }

export interface ResolveStartupSportOptions<TGame> {
  initialDate: string
  loadGames: (sport: StartupSport, date: string) => Promise<LoadGamesResult<TGame>>
}

export interface ResolveStartupSportResult<TGame> {
  sport: StartupSport
  date: string
  games: TGame[]
}

function normalizeLoadGamesResult<TGame>(initialDate: string, result: LoadGamesResult<TGame>): { date: string; games: TGame[] } {
  if (Array.isArray(result)) return { date: initialDate, games: result }
  return { date: result.date || initialDate, games: result.games }
}

export async function resolveStartupSport<TGame>({ initialDate, loadGames }: ResolveStartupSportOptions<TGame>): Promise<ResolveStartupSportResult<TGame>> {
  let nbaEmpty: ResolveStartupSportResult<TGame> | null = null

  for (const sport of STARTUP_SPORT_FALLBACK_ORDER) {
    const loaded = normalizeLoadGamesResult(initialDate, await loadGames(sport, initialDate))
    const result = { sport, date: loaded.date, games: loaded.games }

    if (sport === 'nba') nbaEmpty = result
    if (loaded.games.length > 0) return result
  }

  return nbaEmpty || { sport: 'nba', date: initialDate, games: [] }
}
