export type SupportedSport = 'nba' | 'ncaab' | 'nfl' | 'ncaaf' | 'mlb'

export interface SportsTeamLike {
  name?: string
  abbr: string
  record?: string
}

export interface SportsGameLike {
  id: string
  homeTeam: SportsTeamLike
  awayTeam: SportsTeamLike
  status: 'pre' | 'in' | 'post'
  gameDate: string
  hasWinnerOdds: boolean
  homeWinOdds: number
  awayWinOdds: number
  hasSpreadOdds?: boolean
  spreadLine?: number
  spreadFavoriteTeam?: string
  hasTotalOdds?: boolean
  totalLine?: number
  hasDkOdds?: boolean
  dkSpread?: number | null
  dkTotal?: number | null
  polyMatchScore?: number
  oddsUpdatedAt?: string | null
  polyFetchOk?: boolean
  usedGammaFallback?: boolean
  polyError?: string | null
  sourceStatus?: 'matched' | 'unmatched' | 'no_events' | 'poly_error'
  sport?: SupportedSport
}

export interface GameEdge<TGame extends SportsGameLike = SportsGameLike> {
  game: TGame
  team: string
  ourProb: number
  marketProb: number
  kelly: number
  edgeScore: number
  confidence: number
  quality: 'thin' | 'watch' | 'play' | 'premium'
  matchQuality: number
}

export interface MarketReadiness {
  matched: boolean
  matchQuality: number
  matchLabel: string
  stale: boolean
  staleLabel: string
  warnings: string[]
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function computeKelly(ourProb: number, marketProb: number): number {
  if (marketProb <= 0 || marketProb >= 1) return 0
  const b = (1 - marketProb) / marketProb
  const q = 1 - ourProb
  const f = (b * ourProb - q) / b
  return Math.max(0, f)
}

export function parseRecordWinPct(record?: string): number {
  const parts = String(record || '').split('-').map(Number)
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0.5
  const total = parts[0] + parts[1]
  return total === 0 ? 0.5 : parts[0] / total
}

export function pct(v: number) {
  return Math.round(v * 100)
}

export function getMinutesToStart(gameDate: string, now = Date.now()): number {
  return Math.round((new Date(gameDate).getTime() - now) / 60000)
}

export function getMarketReadiness(game: SportsGameLike, lastUpdated?: Date | null, now = Date.now()): MarketReadiness {
  const matched = Boolean(game.hasWinnerOdds || game.hasSpreadOdds || game.hasTotalOdds)
  const rawMatch = typeof game.polyMatchScore === 'number' ? game.polyMatchScore : matched ? 4 : 0
  const matchQuality = clamp(Math.round((rawMatch / 7) * 100), matched ? 35 : 0, 100)
  const ageSec = lastUpdated ? Math.max(0, Math.round((now - lastUpdated.getTime()) / 1000)) : null
  const stale = ageSec == null ? false : ageSec >= 180
  const warnings: string[] = []

  if (!matched) warnings.push('No Polymarket match yet')
  else if (matchQuality < 55) warnings.push('Low-confidence market match')
  if (!game.hasDkOdds) warnings.push('DraftKings reference missing')
  if (stale) warnings.push(`Feed stale: ${Math.floor((ageSec || 0) / 60)}m old`)

  return {
    matched,
    matchQuality,
    matchLabel: !matched ? 'Unmatched' : matchQuality >= 75 ? 'Strong match' : matchQuality >= 55 ? 'Usable match' : 'Thin match',
    stale,
    staleLabel: ageSec == null ? 'Not synced' : ageSec < 60 ? `${ageSec}s fresh` : `${Math.floor(ageSec / 60)}m old`,
    warnings,
  }
}

export function deriveGameEdge<TGame extends SportsGameLike>(game: TGame): GameEdge<TGame> | null {
  if (!game.hasWinnerOdds) return null

  const homeRecPct = parseRecordWinPct(game.homeTeam.record)
  const awayRecPct = parseRecordWinPct(game.awayTeam.record)
  let homeEdge = (homeRecPct + (1 - awayRecPct)) / 2

  // Blend simple record strength with market prior; small home-field/home-court lean.
  homeEdge = homeEdge * 0.4 + game.homeWinOdds * 0.6
  homeEdge += game.sport === 'nfl' || game.sport === 'ncaaf' ? 0.025 : 0.03
  homeEdge = clamp(homeEdge, 0.12, 0.88)
  const awayEdge = 1 - homeEdge

  const isHome = homeEdge >= awayEdge
  const ourProb = isHome ? homeEdge : awayEdge
  const marketProb = isHome ? game.homeWinOdds : game.awayWinOdds
  const edgeScore = ourProb - marketProb
  if (edgeScore <= 0.02) return null

  const matchQuality = getMarketReadiness(game).matchQuality
  const confidence = clamp(Math.round(50 + edgeScore * 300 + Math.max(0, matchQuality - 50) * 0.35), 50, 92)
  const quality: GameEdge<TGame>['quality'] = confidence >= 78 && edgeScore >= 0.08
    ? 'premium'
    : confidence >= 68 && edgeScore >= 0.05
      ? 'play'
      : confidence >= 58
        ? 'watch'
        : 'thin'

  return {
    game,
    team: isHome ? game.homeTeam.abbr : game.awayTeam.abbr,
    ourProb,
    marketProb,
    kelly: computeKelly(ourProb, marketProb),
    edgeScore,
    confidence,
    quality,
    matchQuality,
  }
}

export function lineGap(game: SportsGameLike): number {
  return game.hasDkOdds && game.hasSpreadOdds && game.dkSpread != null && typeof game.spreadLine === 'number'
    ? Math.abs(game.spreadLine - game.dkSpread)
    : 0
}

export function totalGap(game: SportsGameLike): number {
  return game.hasDkOdds && game.hasTotalOdds && game.dkTotal != null && typeof game.totalLine === 'number'
    ? Math.abs(game.totalLine - game.dkTotal)
    : 0
}
