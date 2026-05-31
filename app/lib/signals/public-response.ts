type PublicSignalLike = {
  whyCare?: string[]
  reasons?: string[]
  player?: string
  label?: string
  metric?: string
  hits?: number
  games?: number
  avg?: number
  flags?: string[]
  metadata?: any
  [key: string]: any
}

type PublicSignalsResponseLike = {
  signals: PublicSignalLike[]
  summary?: { a: number; b: number; watch: number; avgEdge: number; bestEdge: number }
  [key: string]: any
}

export function stripPublicJargon(text: string): string {
  return String(text || '')
    .replace(/\bask\b/gi, 'market chance')
    .replace(/\bfair(?: value)?\b/gi, 'model')
    .replace(/\bedge\b/gi, 'value gap')
    .replace(/\bmisprice(?:d)?\b/gi, 'pricing gap')
    .replace(/\bcushion\b/gi, 'room before it stops being attractive')
    .replace(/\bmax[-\s]?buy\b/gi, 'do-not-chase line')
    .replace(/\bladder\b/gi, 'alternate line')
    .replace(/\bentry\b/gi, 'look')
    .replace(/\b\d+(?:\.\d+)?c\b/gi, '')
    .replace(/\d+(?:\.\d+)?\s*¢/g, '')
    .replace(/¢/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function containsPublicJargon(text: string): boolean {
  return /\b(ask|fair|edge|misprice|cushion|max[-\s]?buy|ladder|liquidity|prediction[-\s]?market|market math|\d+(?:\.\d+)?c)\b|¢/i.test(text)
}

export function publicBullets(signal: Pick<PublicSignalLike, 'whyCare' | 'reasons' | 'player' | 'label' | 'metric' | 'hits' | 'games' | 'avg'>): string[] {
  const source = Array.isArray(signal.whyCare) && signal.whyCare.length ? signal.whyCare : (signal.reasons || [])
  const cleaned = source
    .map(item => stripPublicJargon(String(item || '')))
    .filter(Boolean)
    .filter(item => !containsPublicJargon(item))
    .slice(0, 3)
  if (cleaned.length) return cleaned
  const line = signal.label || `${signal.metric} line`
  return [
    `${signal.player} has cleared ${line} in ${signal.hits}/${signal.games} recently, averaging ${Number(signal.avg || 0).toFixed(1)}.`,
    'Simple read: use this only if his role and minutes look normal before the game starts.',
    'Do not chase it if the line moves against you.',
  ]
}

export function publicLineOptions(signal: Pick<PublicSignalLike, 'metadata'>): Array<{ id?: string; label: string; line?: number; tier?: string | null; hits?: number; games?: number; avg?: number }> | undefined {
  const options = Array.isArray(signal.metadata?.lineOptions) ? signal.metadata.lineOptions : []
  if (!options.length) return undefined
  return options.slice(0, 3).map((option: any) => ({
    id: option.id,
    label: option.label,
    line: option.line,
    tier: option.tier,
    hits: option.hits,
    games: option.games,
    avg: option.avg,
  }))
}

function cleanContextRows(rows?: string[]) {
  return rows?.map(stripPublicJargon).filter(item => item && !containsPublicJargon(item)).slice(0, 3)
}

export function publicSignal(signal: PublicSignalLike): Partial<PublicSignalLike> {
  const recentGames = Array.isArray(signal.metadata?.recentGames) ? signal.metadata.recentGames : undefined
  const todayIntel = signal.metadata?.todayIntel
  const judgmentContext = signal.metadata?.judgmentContext
  const lineOptions = publicLineOptions(signal)
  return {
    id: signal.id,
    sport: signal.sport,
    gameId: signal.gameId,
    matchup: signal.matchup,
    gameTime: signal.gameTime,
    player: signal.player,
    team: signal.team,
    metric: signal.metric,
    label: signal.label,
    tier: signal.tier,
    projectedHitPct: signal.projectedHitPct,
    hits: signal.hits,
    games: signal.games,
    avg: signal.avg,
    risk: signal.risk,
    reasons: publicBullets(signal),
    flags: (signal.flags || []).map(stripPublicJargon).filter(Boolean).filter(flag => !containsPublicJargon(flag)).slice(0, 2),
    createdAt: signal.createdAt,
    whyCare: publicBullets(signal),
    metadata: {
      ...(recentGames ? { recentGames } : {}),
      ...(todayIntel ? { todayIntel: {
        summary: todayIntel.summary && !containsPublicJargon(stripPublicJargon(todayIntel.summary)) ? stripPublicJargon(todayIntel.summary) : undefined,
        lineup: todayIntel.lineup,
        injuryContext: cleanContextRows(todayIntel.injuryContext),
        usageContext: cleanContextRows(todayIntel.usageContext),
        riskFactors: cleanContextRows(todayIntel.riskFactors),
        whatCouldKillIt: cleanContextRows(todayIntel.whatCouldKillIt),
        displayBullets: publicBullets(signal),
        sources: todayIntel.sources?.slice(0, 4),
        generatedAt: todayIntel.generatedAt,
        unavailable: todayIntel.unavailable,
      } } : {}),
      ...(lineOptions ? { lineOptions } : {}),
      ...(judgmentContext ? { judgmentContext: {
        lastGame: judgmentContext.lastGame,
        trend: judgmentContext.trend,
        volume: judgmentContext.volume,
        minutes: judgmentContext.minutes,
        matchupNotes: cleanContextRows(judgmentContext.matchupNotes),
        injuryNotes: cleanContextRows(judgmentContext.injuryNotes),
        riskNotes: cleanContextRows(judgmentContext.riskNotes),
        playableNumber: stripPublicJargon(judgmentContext.playableNumber || ''),
        summaryBullets: cleanContextRows(judgmentContext.summaryBullets),
        recentRows: cleanContextRows(judgmentContext.recentRows),
      } } : {}),
    },
  }
}

export function publicResponse<T extends PublicSignalsResponseLike>(response: T): T {
  const publicSignals = response.signals.map(signal => publicSignal(signal))
  return {
    ...response,
    signals: publicSignals,
    contractsScored: publicSignals.length,
    changeSinceRefresh: undefined,
    summary: {
      a: publicSignals.filter(s => s.tier === 'A').length,
      b: publicSignals.filter(s => s.tier === 'B').length,
      watch: publicSignals.filter(s => s.tier === 'WATCH').length,
      avgEdge: 0,
      bestEdge: 0,
    },
  }
}
