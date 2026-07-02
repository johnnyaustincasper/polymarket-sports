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
    .replace(/\btrend supports\b/gi, 'recent games show')
    .replace(/\bhistorical context suggests\b/gi, 'past games show')
    .replace(/\bmodel indicates\b/gi, 'the read is')
    .replace(/\bprojection leans?\b/gi, 'the read leans')
    .replace(/\bsignal detected\b/gi, 'watch this')
    .replace(/\bvalue may exist\b/gi, 'there may be a playable number')
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
  return /\b(ask|fair|edge|misprice|cushion|max[-\s]?buy|ladder|liquidity|prediction[-\s]?market|market math|trend supports|historical context suggests|model indicates|projection leans?|signal detected|value may exist|\d+(?:\.\d+)?c)\b|¢/i.test(text)
}

export function publicBullets(signal: Pick<PublicSignalLike, 'whyCare' | 'reasons' | 'player' | 'label' | 'metric' | 'hits' | 'games' | 'avg' | 'metadata'>): string[] {
  const playerSpecific = cleanContextRows(signal.metadata?.judgmentContext?.whyPlayerBullets)
  const source = playerSpecific?.length ? playerSpecific : Array.isArray(signal.whyCare) && signal.whyCare.length ? signal.whyCare : (signal.reasons || [])
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

function cleanDecisionSections(sections?: Array<{ title?: string; rows?: string[] }>) {
  return sections?.map(section => ({
    title: section.title,
    rows: cleanContextRows(section.rows) || [],
  })).filter(section => section.title && section.rows.length).slice(0, 5)
}

function cleanMlbConviction(layer?: any) {
  if (!layer) return undefined
  const read = stripPublicJargon(layer.read || '')
  const path = stripPublicJargon(layer.path || '')
  const numberDiscipline = stripPublicJargon(layer.numberDiscipline || '')
  const matchupRating = layer.matchupRating ? {
    playerLabel: layer.matchupRating.playerLabel,
    opponentLabel: layer.matchupRating.opponentLabel,
    ratingTitle: layer.matchupRating.ratingTitle,
    playerRating: layer.matchupRating.playerRating,
    opponentRating: layer.matchupRating.opponentRating,
    matchupGap: layer.matchupRating.matchupGap,
    bestFit: layer.matchupRating.bestFit,
    propFit: layer.matchupRating.propFit,
    subRatings: Array.isArray(layer.matchupRating.subRatings) ? layer.matchupRating.subRatings.map((row: any) => ({ label: row.label, score: row.score, detail: stripPublicJargon(row.detail || '') })).slice(0, 6) : undefined,
    read: stripPublicJargon(layer.matchupRating.read || ''),
    rows: cleanContextRows(layer.matchupRating.rows),
  } : undefined
  const misreadSummary = stripPublicJargon(layer.misreadSignal?.summary || '')
  const misreadReason = stripPublicJargon(layer.misreadSignal?.reason || '')
  const misreadSignal = layer.misreadSignal ? {
    kind: layer.misreadSignal.kind,
    label: layer.misreadSignal.label,
    severity: layer.misreadSignal.severity,
    playerRating: layer.misreadSignal.playerRating,
    opponentRating: layer.misreadSignal.opponentRating,
    matchupGap: layer.misreadSignal.matchupGap,
    summary: misreadSummary && !containsPublicJargon(misreadSummary) ? misreadSummary : undefined,
    reason: misreadReason && !containsPublicJargon(misreadReason) ? misreadReason : undefined,
    ratingTitle: layer.misreadSignal.ratingTitle,
    bestFit: layer.misreadSignal.bestFit,
    subRatings: Array.isArray(layer.misreadSignal.subRatings) ? layer.misreadSignal.subRatings.map((row: any) => ({ label: row.label, score: row.score, detail: stripPublicJargon(row.detail || '') })).slice(0, 6) : undefined,
  } : undefined
  return {
    verdict: layer.verdict,
    read: read && !containsPublicJargon(read) ? read : undefined,
    whyLive: cleanContextRows(layer.whyLive),
    path: path && !containsPublicJargon(path) ? path : undefined,
    killSwitch: cleanContextRows(layer.killSwitch),
    numberDiscipline: numberDiscipline && !containsPublicJargon(numberDiscipline) ? numberDiscipline : undefined,
    ...(matchupRating ? { matchupRating } : {}),
    ...(misreadSignal ? { misreadSignal } : {}),
  }
}

export function publicSignal(signal: PublicSignalLike): Partial<PublicSignalLike> {
  const recentGames = Array.isArray(signal.metadata?.recentGames) ? signal.metadata.recentGames : undefined
  const todayIntel = signal.metadata?.todayIntel
  const judgmentContext = signal.metadata?.judgmentContext
  const xIntel = signal.metadata?.xIntel
  const newsIntel = signal.metadata?.newsIntel
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
      ...(xIntel ? { xIntel: {
        summary: stripPublicJargon(xIntel.summary || ''),
        sources: Array.isArray(xIntel.sources) ? xIntel.sources.slice(0, 4) : [],
        posts: Array.isArray(xIntel.posts) ? xIntel.posts.slice(0, 3).map((post: any) => ({
          id: post.id,
          author: post.author,
          text: stripPublicJargon(post.text || ''),
          url: post.url,
          createdAt: post.createdAt,
        })) : [],
        unavailable: xIntel.unavailable,
      } } : {}),
      ...(newsIntel ? { newsIntel: {
        summary: stripPublicJargon(newsIntel.summary || ''),
        sources: Array.isArray(newsIntel.sources) ? newsIntel.sources.slice(0, 4) : [],
        articles: Array.isArray(newsIntel.articles) ? newsIntel.articles.slice(0, 3).map((article: any) => ({
          title: stripPublicJargon(article.title || ''),
          description: stripPublicJargon(article.description || ''),
          source: article.source,
          url: article.url,
          publishedAt: article.publishedAt,
        })) : [],
        unavailable: newsIntel.unavailable,
      } } : {}),
      ...(lineOptions ? { lineOptions } : {}),
      ...(signal.metadata?.misreadCompanionOnly ? { misreadCompanionOnly: true } : {}),
      ...(judgmentContext ? { judgmentContext: {
        lastGame: judgmentContext.lastGame,
        trend: judgmentContext.trend,
        overallRatings: judgmentContext.overallRatings,
        lineCheck: judgmentContext.lineCheck,
        roleCheck: judgmentContext.roleCheck,
        consistency: judgmentContext.consistency,
        gameEnvironment: cleanContextRows(judgmentContext.gameEnvironment),
        sportSpecificNotes: cleanContextRows(judgmentContext.sportSpecificNotes),
        decisionSections: cleanDecisionSections(judgmentContext.decisionSections),
        mlbConviction: cleanMlbConviction(judgmentContext.mlbConviction),
        volume: judgmentContext.volume,
        minutes: judgmentContext.minutes,
        matchupNotes: cleanContextRows(judgmentContext.matchupNotes),
        injuryNotes: cleanContextRows(judgmentContext.injuryNotes),
        riskNotes: cleanContextRows(judgmentContext.riskNotes),
        playableNumber: stripPublicJargon(judgmentContext.playableNumber || ''),
        summaryBullets: cleanContextRows(judgmentContext.summaryBullets),
        whyPlayerBullets: cleanContextRows(judgmentContext.whyPlayerBullets),
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
