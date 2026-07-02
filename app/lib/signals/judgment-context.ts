type Numeric = number | null | undefined

export type JudgmentGameLog = {
  eventId?: string
  date?: string
  opponent?: string
  stats?: Record<string, Numeric>
}

export type MlbGameContext = {
  playerTeam?: string
  homeTeam?: string
  awayTeam?: string
  homePitcher?: { name?: string; era?: Numeric; difficulty?: Numeric; label?: string }
  awayPitcher?: { name?: string; era?: Numeric; difficulty?: Numeric; label?: string }
  totalLine?: Numeric
  venueName?: string
}

export type JudgmentContextInput = {
  player: string
  metric: string
  label?: string
  line?: Numeric
  last12?: JudgmentGameLog[]
  lastGameMinutes?: Numeric
  risk?: string | null
  teamIntel?: any
  todayIntel?: any
  mlbGameContext?: MlbGameContext
}

export type ShootingSnapshot = {
  opponent?: string
  date?: string
  value: number
  minutes?: number
  points?: number
  fgMade?: number
  fgAttempted?: number
  fgPct?: number
  threeMade?: number
  threeAttempted?: number
  threePct?: number
  ftMade?: number
  ftAttempted?: number
  ftPct?: number
}

export type SignalDecisionSection = {
  title: 'ROLE CHECK' | 'PROP NUMBER' | 'RISK CHECK'
  rows: string[]
}

export type MlbPropFit = {
  hits?: number
  totalBases?: number
  homeRuns?: number
  runsRbis?: number
  strikeouts?: number
}

export type MlbVideoGameSubRating = {
  label: string
  score: number
  detail?: string
}

export type MlbMatchupRating = {
  ratingTitle: string
  playerLabel: string
  opponentLabel: string
  playerRating: number
  opponentRating: number
  matchupGap: number
  bestFit: string
  propFit: MlbPropFit
  subRatings: MlbVideoGameSubRating[]
  read: string
  rows: string[]
}

export type MlbMisreadSignal = {
  kind: 'pitcher_k' | 'hitter_contact' | 'hitter_power' | 'run_environment'
  label: string
  severity: 'strong' | 'watch'
  playerRating: number
  opponentRating: number
  matchupGap: number
  summary: string
  reason: string
  ratingTitle?: string
  bestFit?: string
  subRatings?: MlbVideoGameSubRating[]
}

export type MlbConvictionLayer = {
  verdict: 'Strong look' | 'Small lean' | 'Price watch' | 'Needs better setup'
  read: string
  whyLive: string[]
  path: string
  killSwitch: string[]
  numberDiscipline: string
  matchupRating?: MlbMatchupRating
  misreadSignal?: MlbMisreadSignal
}

export type SignalOverallRatings = {
  player: { score: number; label: string; detail: string }
  team: { score: number; label: string; detail: string }
  matchup: { score: number; label: string; detail: string }
}

export type SignalJudgmentContext = {
  lastGame: ShootingSnapshot
  trend: {
    last3Avg?: number
    last5Avg?: number
    last12Avg?: number
    median?: number
    last5HitRate?: number
    last5Games?: number
    last12HitRate?: number
    last12Games?: number
    range?: { min: number; max: number }
  }
  overallRatings: SignalOverallRatings
  lineCheck: {
    line?: number
    median?: number
    range: { min: number; max: number }
    hitRateLabel: string
    verdict: string
  }
  roleCheck: {
    status: 'stable' | 'volatile' | 'unknown'
    label: string
    details: string[]
  }
  consistency: {
    grade: 'strong' | 'solid' | 'volatile' | 'thin'
    label: string
  }
  gameEnvironment: string[]
  sportSpecificNotes: string[]
  decisionSections: SignalDecisionSection[]
  mlbConviction?: MlbConvictionLayer
  volume: {
    shotAttemptsLast5Avg?: number
    threesAttemptedLast5Avg?: number
    freeThrowsAttemptedLast5Avg?: number
  }
  minutes: {
    lastGame?: number
    last5Avg?: number
    stable: boolean
  }
  matchupNotes: string[]
  injuryNotes: string[]
  riskNotes: string[]
  playableNumber: string
  summaryBullets: string[]
  whyPlayerBullets: string[]
  recentRows: string[]
}

function num(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function round(value: number | undefined, places = 1): number | undefined {
  if (!Number.isFinite(value)) return undefined
  const factor = 10 ** places
  return Math.round((value as number) * factor) / factor
}

function avg(values: Array<number | undefined>): number | undefined {
  const clean = values.filter((value): value is number => Number.isFinite(value))
  if (!clean.length) return undefined
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length)
}

function median(values: Array<number | undefined>): number | undefined {
  const clean = values.filter((value): value is number => Number.isFinite(value)).sort((a, b) => a - b)
  if (!clean.length) return undefined
  const mid = Math.floor(clean.length / 2)
  if (clean.length % 2) return round(clean[mid])
  return round((clean[mid - 1] + clean[mid]) / 2)
}

function fmt(value: Numeric, fallback = '—') {
  const n = num(value)
  if (n == null) return fallback
  const rounded = round(n)
  return Number.isInteger(rounded) ? String(rounded) : rounded?.toFixed(1) ?? fallback
}

function fmtAvg(value: Numeric, fallback = '—') {
  const n = num(value)
  if (n == null) return fallback
  return (round(n) ?? n).toFixed(1)
}

function pct(made?: number, attempted?: number, provided?: number) {
  if (provided != null && Number.isFinite(provided)) return round(provided)
  if (made != null && attempted && attempted > 0) return round((made / attempted) * 100)
  return undefined
}

function statsOf(game?: JudgmentGameLog): Record<string, Numeric> {
  return game?.stats || {}
}

function stat(stats: Record<string, Numeric>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = num(stats[key])
    if (value != null) return value
  }
  return undefined
}

export function statValueForMetric(gameLog: JudgmentGameLog, metric: string): number | null {
  const stats = statsOf(gameLog)
  const key = metric.toLowerCase()
  const value = (keys: string[]) => stat(stats, keys) ?? null
  if (key === 'points') return value(['points', 'pts'])
  if (key === 'rebounds') return value(['rebounds', 'reb', 'totalRebounds'])
  if (key === 'assists') return value(['assists', 'ast'])
  if (key === 'threes') return value(['threes', 'threePointersMade', 'threePointFieldGoalsMade', '3pt'])
  if (key === 'steals') return value(['steals', 'stl'])
  if (key === 'blocks') return value(['blocks', 'blk'])
  if (key === 'goals') return value(['goals', 'goal'])
  if (key === 'pts+reb+ast') {
    const pts = value(['points', 'pts']) || 0
    const reb = value(['rebounds', 'reb', 'totalRebounds']) || 0
    const ast = value(['assists', 'ast']) || 0
    return pts + reb + ast
  }
  if (key === 'hits') return value(['hits', 'hit'])
  if (key === 'runs') return value(['runs', 'r'])
  if (key === 'rbis' || key === 'rbi') return value(['RBIs', 'rbi', 'runsBattedIn'])
  if (key === 'hits + runs + rbis' || key === 'hits+runs+rbis' || key === 'h+r+rbi') {
    return (value(['hits', 'hit']) || 0) + (value(['runs', 'r']) || 0) + (value(['RBIs', 'rbi', 'runsBattedIn']) || 0)
  }
  if (key === 'home runs') return value(['homeRuns', 'hr'])
  if (key === 'total bases') return value(['totalBases', 'tb'])
  if (key === 'strikeouts') return value(['strikeouts', 'so', 'k'])
  if (key === 'passing yards') return value(['passingYards'])
  if (key === 'passing tds') return value(['passingTouchdowns', 'passingTDs'])
  if (key === 'rushing yards') return value(['rushingYards'])
  if (key === 'receiving yards') return value(['receivingYards'])
  if (key === 'receptions') return value(['receptions'])
  return null
}

function snapshotFor(game: JudgmentGameLog, metric: string): ShootingSnapshot | null {
  const stats = statsOf(game)
  const value = statValueForMetric(game, metric)
  if (value == null || !Number.isFinite(value)) return null
  const fgMade = stat(stats, ['fieldGoalsMade', 'fgm'])
  const fgAttempted = stat(stats, ['fieldGoalsAttempted', 'fga'])
  const threeMade = stat(stats, ['threePointersMade', 'threePointFieldGoalsMade', 'threes'])
  const threeAttempted = stat(stats, ['threePointersAttempted', 'threePointFieldGoalsAttempted', 'threePointAttempts'])
  const ftMade = stat(stats, ['freeThrowsMade', 'ftm'])
  const ftAttempted = stat(stats, ['freeThrowsAttempted', 'fta'])
  return {
    opponent: game.opponent,
    date: game.date,
    value,
    minutes: stat(stats, ['minutes', 'min']),
    points: stat(stats, ['points', 'pts']),
    fgMade,
    fgAttempted,
    fgPct: pct(fgMade, fgAttempted, stat(stats, ['fieldGoalPct', 'fgPct'])),
    threeMade,
    threeAttempted,
    threePct: pct(threeMade, threeAttempted, stat(stats, ['threePointPct', 'threePct'])),
    ftMade,
    ftAttempted,
    ftPct: pct(ftMade, ftAttempted, stat(stats, ['freeThrowPct', 'ftPct'])),
  }
}

function lineFrom(input: JudgmentContextInput): number | undefined {
  const explicit = num(input.line)
  if (explicit != null) return explicit
  const match = String(input.label || '').match(/([0-9]+(?:\.[0-9]+)?)/)
  return match ? num(match[1]) : undefined
}

function notesFromTeamIntel(teamIntel: any): string[] {
  const notes = [
    teamIntel?.pace?.implication,
    teamIntel?.pace?.edgeLabel ? `Pace note: ${teamIntel.pace.edgeLabel}` : '',
    ...(Array.isArray(teamIntel?.injuryImpact?.homeNotes) ? teamIntel.injuryImpact.homeNotes : []),
    ...(Array.isArray(teamIntel?.injuryImpact?.awayNotes) ? teamIntel.injuryImpact.awayNotes : []),
    teamIntel?.edgeRead,
  ]
  return notes.map(note => String(note || '').trim()).filter(Boolean).slice(0, 3)
}

function propText(line?: number, metric?: string): string {
  return line == null ? 'this prop' : `${fmt(line)}+${metric ? ` ${metric.toLowerCase()}` : ''}`
}

function nextPropText(line?: number, metric?: string): string {
  return line == null ? 'a higher number' : `${fmt(line + 1)}+${metric ? ` ${metric.toLowerCase()}` : ''}`
}

function skipPropText(line?: number, metric?: string): string {
  return line == null ? 'a much higher number' : `${fmt(line + 2)}+${metric ? ` ${metric.toLowerCase()}` : ''}`
}

function playable(line?: number, metric?: string): string {
  if (line == null) return 'Only play this if the app shows a clear, reasonable prop number. If the number is missing or confusing, skip it.'
  return `Green light is ${propText(line, metric)}. If it jumps to ${nextPropText(line, metric)}, be picky. If it reaches ${skipPropText(line, metric)}, skip it.`
}

function metricSport(metric: string): 'nba' | 'mlb' | 'nfl' | 'nhl' | 'generic' {
  const key = metric.toLowerCase()
  if (['hits', 'runs', 'rbis', 'rbi', 'hits + runs + rbis', 'hits+runs+rbis', 'home runs', 'total bases', 'strikeouts'].includes(key)) return 'mlb'
  if (key.includes('passing') || key.includes('rushing') || key.includes('receiving') || key === 'receptions') return 'nfl'
  if (['goals'].includes(key)) return 'nhl'
  if (['points', 'rebounds', 'assists', 'threes', 'steals', 'blocks', 'pts+reb+ast'].includes(key)) return 'nba'
  return 'generic'
}

function consistencyGrade(hit5?: number, games5?: number, hit12?: number, games12?: number): SignalJudgmentContext['consistency'] {
  const rate5 = games5 ? hit5 ?? 0 : 0
  const rate12 = games12 ? hit12 ?? 0 : 0
  if (games5 && rate5 >= Math.ceil(games5 * 0.8)) return { grade: 'strong', label: `Strong: hit in ${rate5} of last ${games5}.` }
  if (games5 && rate5 >= Math.ceil(games5 * 0.6)) return { grade: 'solid', label: `Solid: hit in ${rate5} of last ${games5}.` }
  if (games12 && rate12 <= Math.floor(games12 * 0.35)) return { grade: 'thin', label: `Thin: only hit in ${rate12} of last ${games12}.` }
  return { grade: 'volatile', label: `Volatile: recent hit rate is mixed.` }
}

function roleStatus(minutes: { lastGame?: number; last5Avg?: number; stable: boolean }): SignalJudgmentContext['roleCheck'] {
  if (minutes.stable) return { status: 'stable', label: 'Stable role', details: [`${fmt(minutes.lastGame)} min last game · ${fmt(minutes.last5Avg)} avg last 5`] }
  if (minutes.lastGame != null || minutes.last5Avg != null) return { status: 'volatile', label: 'Verify role', details: [`${fmt(minutes.lastGame)} min last game · ${fmt(minutes.last5Avg)} avg last 5`] }
  return { status: 'unknown', label: 'Role data limited', details: ['Minutes/role data is limited for this feed.'] }
}

function environmentNotes(input: JudgmentContextInput): string[] {
  return [
    input.teamIntel?.pace?.implication,
    input.teamIntel?.pace?.edgeLabel ? `Game pace: ${input.teamIntel.pace.edgeLabel}.` : '',
    input.teamIntel?.edgeRead,
  ].map(note => String(note || '').trim()).filter(Boolean).slice(0, 2)
}

function sportNotes(metric: string): string[] {
  const sport = metricSport(metric)
  if (sport === 'mlb') return ['baseball context: watch batting order, pitcher handedness, park/weather, and bullpen quality before locking it in.']
  if (sport === 'nba') return ['Basketball context: minutes, usage, shot volume, pace, and late injury news matter most.']
  if (sport === 'nfl') return ['Football context: snap share, targets/routes, matchup coverage, and game script matter most.']
  if (sport === 'nhl') return ['Hockey context: lines, ice time, power-play role, goalie matchup, and shot volume matter most.']
  return []
}

function metricNoun(metric: string): string {
  const key = metric.toLowerCase()
  if (key === 'points') return 'scoring'
  if (key === 'assists') return 'passing/creation'
  if (key === 'goals') return 'goal scoring'
  if (key === 'rebounds') return 'rebounding'
  if (key === 'threes') return 'shooting volume'
  if (key.includes('hits') || key === 'total bases') return 'batting form'
  if (key.includes('strikeout')) return 'strikeout profile'
  if (key.includes('receiving') || key === 'receptions') return 'receiving role'
  if (key.includes('rushing')) return 'rushing role'
  if (key.includes('passing')) return 'passing role'
  return `${metric.toLowerCase()} profile`
}

function mlbMetricKind(metric: string): 'contact' | 'offense' | 'power' | 'strikeouts' | 'generic' {
  const key = metric.toLowerCase()
  if (key === 'strikeouts') return 'strikeouts'
  if (key === 'home runs') return 'power'
  if (key === 'hits' || key === 'total bases') return 'contact'
  if (key === 'runs' || key === 'rbis' || key === 'rbi' || key === 'hits + runs + rbis' || key === 'hits+runs+rbis' || key === 'h+r+rbi') return 'offense'
  return metricSport(metric) === 'mlb' ? 'generic' : 'generic'
}

function mlbVerdict(input: { line?: number; median?: number; hit5?: number; games5: number; games12: number }): MlbConvictionLayer['verdict'] {
  if (!input.games12 || input.games12 < 3) return 'Needs better setup'
  if (input.line == null || input.median == null) return 'Price watch'
  const hits = input.hit5 ?? 0
  if (input.median >= input.line && input.games5 >= 5 && hits >= 4) return 'Strong look'
  if (input.median >= input.line && hits >= 3) return 'Small lean'
  return 'Price watch'
}

function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(35, Math.min(99, Math.round(value)))
}

function ratingLabel(score: number): string {
  if (score >= 88) return 'Elite'
  if (score >= 78) return 'Strong'
  if (score >= 68) return 'Solid'
  if (score >= 56) return 'Volatile'
  return 'Thin'
}

function subRating(label: string, score: number, detail?: string): MlbVideoGameSubRating {
  return { label, score: clampRating(score), ...(detail ? { detail } : {}) }
}

function buildOverallRatings(input: {
  line?: number
  median?: number
  last5Avg?: number
  min: number
  max: number
  hit5?: number
  games5: number
  hit12?: number
  games12: number
  minutes: { lastGame?: number; last5Avg?: number; stable: boolean }
  teamIntel?: any
  riskNotes: string[]
}): SignalOverallRatings {
  const hit5Score = hitRateScore(input.hit5, input.games5)
  const hit12Score = hitRateScore(input.hit12, input.games12)
  const formScore = lineFitScore({ line: input.line, median: input.median, last5Avg: input.last5Avg, max: input.max })
  const roleScore = input.minutes.stable ? 84 : input.minutes.last5Avg != null && input.minutes.last5Avg >= 24 ? 70 : input.minutes.last5Avg != null ? 58 : 52
  const floorScore = input.line == null ? 58 : input.min >= input.line ? 90 : input.median != null && input.median >= input.line ? 74 : 56
  const playerScore = clampRating(formScore * 0.36 + hit5Score * 0.24 + hit12Score * 0.16 + roleScore * 0.14 + floorScore * 0.10)

  const paceText = String(input.teamIntel?.pace?.edgeLabel || input.teamIntel?.pace?.implication || '').toLowerCase()
  const edgeText = String(input.teamIntel?.edgeRead || '').toLowerCase()
  const injuryNotes = [
    ...(Array.isArray(input.teamIntel?.injuryImpact?.homeNotes) ? input.teamIntel.injuryImpact.homeNotes : []),
    ...(Array.isArray(input.teamIntel?.injuryImpact?.awayNotes) ? input.teamIntel.injuryImpact.awayNotes : []),
  ].join(' ').toLowerCase()
  let teamBase = 62
  if (/fast|pace|over|more possessions|up/.test(paceText)) teamBase += 8
  if (/slow|under|down|fewer possessions/.test(paceText)) teamBase -= 6
  if (/edge|advantage|boost|favorable|missing|out/.test(edgeText + ' ' + injuryNotes)) teamBase += 5
  if (/questionable|limit|cap|fatigue|back-to-back|rest/.test(edgeText + ' ' + injuryNotes)) teamBase -= 4
  const teamScore = clampRating(teamBase)

  const riskPenalty = input.riskNotes.length ? Math.min(12, input.riskNotes.length * 4) : 0
  const matchupScore = clampRating(playerScore * 0.62 + teamScore * 0.30 + floorScore * 0.08 - riskPenalty)
  const lineDetail = input.line == null
    ? 'No clean prop number found yet.'
    : input.median != null && input.median >= input.line
      ? `Normal recent game clears ${fmt(input.line)}; range ${fmt(input.min)}-${fmt(input.max)}.`
      : `Needs better-than-normal result; range ${fmt(input.min)}-${fmt(input.max)}.`
  return {
    player: { score: playerScore, label: ratingLabel(playerScore), detail: `${input.hit5 ?? '—'} of last ${input.games5} cleared; ${fmtAvg(input.last5Avg)} recent avg.` },
    team: { score: teamScore, label: ratingLabel(teamScore), detail: input.teamIntel ? 'Team setup includes pace, injury, and matchup context.' : 'Team setup is mostly neutral until lineup/news context fills in.' },
    matchup: { score: matchupScore, label: ratingLabel(matchupScore), detail: lineDetail },
  }
}

function hitRateScore(hit?: number, games?: number): number {
  if (!games) return 50
  return ((hit ?? 0) / games) * 100
}

function lineFitScore(input: { line?: number; median?: number; last5Avg?: number; max: number }): number {
  if (input.line == null) return 58
  const medianGap = input.median == null ? 0 : ((input.median - input.line) / Math.max(1, input.line)) * 26
  const avgGap = input.last5Avg == null ? 0 : ((input.last5Avg - input.line) / Math.max(1, input.line)) * 22
  const ceiling = ((input.max - input.line) / Math.max(1, input.line)) * 10
  return 62 + medianGap + avgGap + ceiling
}

function pitcherDifficulty(context?: MlbGameContext): { value?: number; pitcherName?: string; source: 'opposing starter' | 'starter baseline' | 'feed baseline' } {
  if (!context) return { source: 'feed baseline' }
  const playerTeam = String(context.playerTeam || '').toUpperCase()
  const homeTeam = String(context.homeTeam || '').toUpperCase()
  const awayTeam = String(context.awayTeam || '').toUpperCase()
  const homeDifficulty = num(context.homePitcher?.difficulty)
  const awayDifficulty = num(context.awayPitcher?.difficulty)
  if (playerTeam && homeTeam && playerTeam === homeTeam && awayDifficulty != null) {
    return { value: awayDifficulty, pitcherName: context.awayPitcher?.name, source: 'opposing starter' }
  }
  if (playerTeam && awayTeam && playerTeam === awayTeam && homeDifficulty != null) {
    return { value: homeDifficulty, pitcherName: context.homePitcher?.name, source: 'opposing starter' }
  }
  const values = [homeDifficulty, awayDifficulty].filter((value): value is number => value != null)
  if (values.length) return { value: avg(values), source: 'starter baseline' }
  return { source: 'feed baseline' }
}

function pitcherVulnerabilityRating(context?: MlbGameContext): number | undefined {
  const difficulty = pitcherDifficulty(context).value
  if (difficulty == null) return undefined
  return clampRating(difficulty)
}

function pitcherContextLabel(context?: MlbGameContext): string {
  const info = pitcherDifficulty(context)
  if (info.source === 'opposing starter' && info.pitcherName && info.value != null) return `${info.pitcherName} starter difficulty ${fmt(info.value)}/100`
  if (info.value != null) return `starter difficulty ${fmt(info.value)}/100`
  return 'opponent context still filling in'
}

function runEnvironmentBump(context?: MlbGameContext): number {
  const total = num(context?.totalLine)
  if (total == null) return 0
  if (total >= 10.5) return 6
  if (total >= 9) return 3
  if (total <= 7.5) return -5
  return 0
}

function buildMlbMatchupRating(input: {
  player: string
  metric: string
  line?: number
  lastGame: ShootingSnapshot
  last5Avg?: number
  median?: number
  min: number
  max: number
  hit5?: number
  games5: number
  hit12?: number
  games12: number
  mlbGameContext?: MlbGameContext
}): MlbMatchupRating | undefined {
  if (metricSport(input.metric) !== 'mlb') return undefined
  const kind = mlbMetricKind(input.metric)
  const hit5Score = hitRateScore(input.hit5, input.games5)
  const hit12Score = hitRateScore(input.hit12, input.games12)
  const formScore = lineFitScore(input)
  const stabilityScore = input.min >= (input.line ?? Number.POSITIVE_INFINITY) ? 92 : input.median != null && input.line != null && input.median >= input.line ? 76 : 58
  const sampleScore = input.games12 >= 10 ? 88 : input.games12 >= 5 ? 76 : 58
  const base = clampRating(formScore * 0.42 + hit5Score * 0.24 + hit12Score * 0.16 + stabilityScore * 0.10 + sampleScore * 0.08)
  const volatility = input.max - input.min
  const pitcherVulnerability = pitcherVulnerabilityRating(input.mlbGameContext)
  const environmentBump = runEnvironmentBump(input.mlbGameContext)
  const opponentBaseline = pitcherVulnerability != null
    ? clampRating(pitcherVulnerability + environmentBump)
    : clampRating(74 - Math.max(-10, Math.min(12, (base - 75) * 0.35)) + (volatility > Math.max(2, (input.line ?? 1) * 1.5) ? 3 : 0))
  const opponentContext = pitcherContextLabel(input.mlbGameContext)

  if (kind === 'strikeouts') {
    const strikeouts = clampRating(base + 4)
    const lineupContactRisk = clampRating(100 - Math.max(35, Math.min(90, hit12Score)) * 0.28 + (num(input.mlbGameContext?.totalLine) != null && Number(input.mlbGameContext?.totalLine) <= 7.5 ? -3 : 2))
    return {
      ratingTitle: 'Pitcher K Overall',
      playerLabel: 'Pitcher K rating',
      opponentLabel: 'Lineup contact risk',
      playerRating: strikeouts,
      opponentRating: lineupContactRisk,
      matchupGap: strikeouts - lineupContactRisk,
      bestFit: 'Strikeouts',
      propFit: { strikeouts },
      subRatings: [
        subRating('Stuff', base + 6, 'Recent strikeout production and K pace.'),
        subRating('Recent form', formScore, `${fmtAvg(input.last5Avg)} Ks over last ${input.games5}.`),
        subRating('Leash', sampleScore * 0.55 + stabilityScore * 0.45, 'Sample size plus line stability as a pitch-count proxy.'),
        subRating('Opponent whiff', 100 - lineupContactRisk + 72, 'Lower contact resistance creates a better K matchup.'),
        subRating('Line fit', stabilityScore, `${propText(input.line, 'strikeouts')} versus recent band.`),
      ],
      read: `${input.player} grades like a ${strikeouts}/100 strikeout profile against a ${lineupContactRisk}/100 lineup-contact risk check from current form and game setup.`,
      rows: [
        `K form: ${fmtAvg(input.last5Avg)} over the last ${input.games5}, ${input.hit5 ?? '—'} of ${input.games5} cleared ${propText(input.line, 'strikeouts')}.`,
        `Rating gap: ${strikeouts - lineupContactRisk >= 10 ? '+' : ''}${strikeouts - lineupContactRisk}; this is a watch only unless opponent K-rate, pitch count, and umpire zone agree.`,
        `${opponentContext}; use that as context, not a blind K-over trigger.`,
      ],
    }
  }

  const contact = clampRating(base + (kind === 'contact' ? 5 : 0) - (kind === 'power' ? 8 : 0) + environmentBump)
  const totalBases = clampRating(base + (kind === 'contact' ? 2 : kind === 'power' ? 5 : 0) + environmentBump)
  const homeRuns = clampRating(base - 16 + (kind === 'power' ? 18 : 0) + (input.max >= 1 && input.metric.toLowerCase() === 'home runs' ? 4 : 0) + Math.max(0, environmentBump))
  const runsRbis = clampRating(base + (kind === 'offense' ? 7 : -3) + environmentBump)
  const fits = [
    ['Hits', contact],
    ['Total bases', totalBases],
    ['Home runs', homeRuns],
    ['Runs/RBIs', runsRbis],
  ].sort((a, b) => {
    const scoreDiff = Number(b[1]) - Number(a[1])
    if (scoreDiff !== 0) return scoreDiff
    if (kind === 'power') {
      if (a[0] === 'Home runs') return -1
      if (b[0] === 'Home runs') return 1
    }
    if (kind === 'contact') {
      if (a[0] === 'Hits') return -1
      if (b[0] === 'Hits') return 1
    }
    if (kind === 'offense') {
      if (a[0] === 'Runs/RBIs') return -1
      if (b[0] === 'Runs/RBIs') return 1
    }
    return 0
  }) as Array<[string, number]>

  const hitterAdvantageGap = fits[0][1] + opponentBaseline - 150
  const ratingTitle = kind === 'power' ? 'Power Overall' : kind === 'offense' ? 'Run Production Overall' : 'Contact Overall'
  return {
    ratingTitle,
    playerLabel: kind === 'power' ? 'Hitter power rating' : kind === 'offense' ? 'Run-production rating' : 'Hitter contact rating',
    opponentLabel: pitcherVulnerability != null ? 'Pitcher vulnerability rating' : 'Pitcher context rating',
    playerRating: fits[0][1],
    opponentRating: opponentBaseline,
    matchupGap: hitterAdvantageGap,
    bestFit: fits[0][0],
    propFit: { hits: contact, totalBases, homeRuns, runsRbis },
    subRatings: [
      subRating(kind === 'power' ? 'Power' : kind === 'offense' ? 'Run path' : 'Contact', fits[0][1], `${fits[0][0]} is the best prop fit.`),
      subRating('Recent form', formScore, `${fmtAvg(input.last5Avg)} over last ${input.games5}.`),
      subRating('Pitcher matchup', opponentBaseline, opponentContext),
      subRating('Run environment', 72 + environmentBump * 3, 'Game total / run context adjustment.'),
      subRating('Line fit', stabilityScore, `${propText(input.line, input.metric.toLowerCase())} versus recent band.`),
    ],
    read: `${input.player} grades ${fits[0][1]}/100 for ${fits[0][0].toLowerCase()} against ${opponentContext}.`,
    rows: [
      `Recent form: ${fmtAvg(input.last5Avg)} ${input.metric.toLowerCase()} over the last ${input.games5}, ${input.hit5 ?? '—'} of ${input.games5} cleared ${propText(input.line, input.metric.toLowerCase())}.`,
      `Best prop fit: ${fits[0][0]} (${fits[0][1]}/100); HR only deserves attention when the power score beats the contact score, not just because the hitter is good.`,
      `${opponentContext}; upgrade with confirmed lineup spot, handedness/pitch mix, and park/weather, downgrade if those do not support the score.`,
    ],
  }
}

function buildMlbMisreadSignal(metric: string, rating?: MlbMatchupRating): MlbMisreadSignal | undefined {
  if (!rating) return undefined
  const gap = rating.matchupGap
  const kind = mlbMetricKind(metric)
  const strongGap = gap >= 18
  const watchGap = gap >= 12
  const hasRequiredRatings = kind === 'strikeouts'
    ? rating.playerRating >= 82 && rating.opponentRating <= 82
    : rating.playerRating >= 82 && rating.opponentRating >= 64
  if (!watchGap || !hasRequiredRatings) return undefined

  const severity: MlbMisreadSignal['severity'] = strongGap && rating.playerRating >= 88 ? 'strong' : 'watch'
  if (kind === 'strikeouts') {
    return {
      kind: 'pitcher_k',
      label: 'Pitcher K misread',
      severity,
      playerRating: rating.playerRating,
      opponentRating: rating.opponentRating,
      matchupGap: gap,
      summary: `${rating.ratingTitle}: ${rating.playerRating} vs ${rating.opponentRating} lineup contact resistance`,
      reason: `The scan is flagging a swing-miss watch: ${rating.playerLabel.toLowerCase()} clears the lineup contact-risk check, but still needs pitch count and umpire support.`,
      ratingTitle: rating.ratingTitle,
      bestFit: rating.bestFit,
      subRatings: rating.subRatings,
    }
  }
  if (kind === 'power') {
    return {
      kind: 'hitter_power',
      label: 'Power misread',
      severity,
      playerRating: rating.playerRating,
      opponentRating: rating.opponentRating,
      matchupGap: gap,
      summary: `${rating.ratingTitle}: ${rating.playerRating} vs ${rating.opponentRating} pitcher vulnerability`,
      reason: 'The scan is flagging a power-path gap; HR only upgrades when this power rating leads the contact paths and the opposing starter/park setup is vulnerable.',
      ratingTitle: rating.ratingTitle,
      bestFit: rating.bestFit,
      subRatings: rating.subRatings,
    }
  }
  if (kind === 'offense') {
    return {
      kind: 'run_environment',
      label: 'Run-path misread',
      severity,
      playerRating: rating.playerRating,
      opponentRating: rating.opponentRating,
      matchupGap: gap,
      summary: `${rating.ratingTitle}: ${rating.playerRating} vs ${rating.opponentRating} pitcher vulnerability`,
      reason: 'The scan is flagging a run-environment gap: lineup role plus a vulnerable opposing starter/park setup looks better than the surface read.',
      ratingTitle: rating.ratingTitle,
      bestFit: rating.bestFit,
      subRatings: rating.subRatings,
    }
  }
  return {
    kind: 'hitter_contact',
    label: 'Contact misread',
    severity,
    playerRating: rating.playerRating,
    opponentRating: rating.opponentRating,
    matchupGap: gap,
    summary: `${rating.ratingTitle}: ${rating.playerRating} vs ${rating.opponentRating} pitcher vulnerability`,
    reason: 'The scan is flagging a contact-path gap: the hitter profile and opposing starter vulnerability are both strong enough to matter.',
    ratingTitle: rating.ratingTitle,
    bestFit: rating.bestFit,
    subRatings: rating.subRatings,
  }
}

function buildMlbConviction(input: {
  player: string
  metric: string
  line?: number
  lastGame: ShootingSnapshot
  last5Avg?: number
  median?: number
  min: number
  max: number
  hit5?: number
  games5: number
  hit12?: number
  games12: number
  mlbGameContext?: MlbGameContext
}): MlbConvictionLayer | undefined {
  if (metricSport(input.metric) !== 'mlb') return undefined
  const metricLabel = input.metric.toLowerCase()
  const currentProp = propText(input.line, metricLabel)
  const verdict = mlbVerdict(input)
  const recentBand = `${fmt(input.min)}-${fmt(input.max)} ${metricLabel} across the sample`
  const hitLine = input.line != null
    ? `${input.hit5 ?? '—'} of last ${input.games5} and ${input.hit12 ?? '—'} of last ${input.games12} cleared ${currentProp}`
    : `${fmtAvg(input.last5Avg)} ${metricLabel} over the last ${input.games5}`
  const kind = mlbMetricKind(input.metric)
  const matchupRating = buildMlbMatchupRating(input)
  const misreadSignal = buildMlbMisreadSignal(input.metric, matchupRating)

  if (kind === 'strikeouts') {
    return {
      verdict,
      read: `${input.player} is a pitcher-K read, not a box-score auto-play: ${fmt(input.lastGame.value)} Ks last start, ${fmtAvg(input.last5Avg)} over the last ${input.games5}, with a ${recentBand} band.`,
      whyLive: [
        `${hitLine}; the number only gets interesting if the opposing lineup brings real swing-and-miss.`,
        `The path is pitch-count leash plus whiffs: he needs enough innings for the slider/secondary stuff to pile up Ks.`,
        `Umpire zone and opponent contact rate matter more here than a generic recent trend.`,
      ],
      path: `Work ahead in counts, get chase on two-strike pitches, and stay efficient enough to face the order a third time.`,
      killSwitch: [
        `Downgrade if beat reports hint at a short leash or recent pitch-count cap.`,
        `Downgrade if the opponent lineup is contact-heavy or the umpire zone projects tight.`,
      ],
      numberDiscipline: input.line == null ? 'Needs a clear K number before it belongs on the board.' : `${currentProp} is the clean lane; one K higher is picky, two higher needs a perfect matchup.`,
      matchupRating,
      misreadSignal,
    }
  }

  if (kind === 'power') {
    return {
      verdict,
      read: `${input.player} is a power-variance read: ${fmt(input.lastGame.value)} HR last game, ${fmtAvg(input.last5Avg)} over the last ${input.games5}, and a ${recentBand} band that says the ceiling exists but the floor is real.`,
      whyLive: [
        `${hitLine}; this needs barrel quality, not just a warm bat.`,
        `The setup has to include a pitcher who gives up lift/pull damage or a park-weather combo that lets the ball carry.`,
        `If those power conditions are missing, this is a watch instead of a force.`,
      ],
      path: `One mistake pitch in his damage zone — preferably with pull-side carry — is the whole path.`,
      killSwitch: [
        `Kill it if park/weather suppresses carry.`,
        `Downgrade if the starter keeps the ball on the ground or avoids his hot zone.`,
      ],
      numberDiscipline: 'HR looks are naturally thin; do not turn a hitter-form read into a power-only chase unless the matchup supports it.',
      matchupRating,
      misreadSignal,
    }
  }

  if (kind === 'offense') {
    return {
      verdict,
      read: `${input.player} is a run-environment read: ${fmt(input.lastGame.value)} ${metricLabel} last game, ${fmtAvg(input.last5Avg)} over the last ${input.games5}, and ${hitLine}.`,
      whyLive: [
        `This prop needs lineup spot and traffic: top/middle-order plate appearances matter more than one recent box score.`,
        `The best version is team pressure — hitters around him creating RBI/run paths, not him needing to do everything alone.`,
        `Handedness and opposing starter traffic allowed decide whether the recent form actually travels into today.`,
      ],
      path: `Reach base or drive traffic once, then let the lineup context do the rest.`,
      killSwitch: [
        `Downgrade if he drops in the order.`,
        `Downgrade if the team total, weather, or opposing starter profile turns pitcher-friendly.`,
      ],
      numberDiscipline: `${currentProp} is only playable when the lineup card confirms the role; do not chase a bigger offensive ladder without a strong team run setup.`,
      matchupRating,
      misreadSignal,
    }
  }

  return {
    verdict,
    read: `${input.player} is a contact-path read: ${fmt(input.lastGame.value)} ${metricLabel} last game, ${fmtAvg(input.last5Avg)} over the last ${input.games5}, and ${hitLine}.`,
    whyLive: [
      `The case is plate appearances plus balls in play: batting-order slot and opposing starter handedness have to line up.`,
      `For ${metricLabel}, the clean path is contact quality and traffic, not forcing a homer outcome.`,
      `Park/weather should not be working against carry or gaps if this is going to feel strong.`,
    ],
    path: kind === 'contact' ? `Put the ball in play early, avoid the strikeout-heavy matchup, and let one clean single or gap ball clear the number.` : `Get enough plate appearances in a friendly run environment for the recent form to matter.`,
    killSwitch: [
      `Downgrade if he bats lower than expected or sits against the handedness matchup.`,
      `Downgrade if park/weather suppresses offense or the starter's contact profile is tougher than the surface line suggests.`,
    ],
    numberDiscipline: `${currentProp} is the clean lane; if the app asks for a bigger night, require a confirmed lineup and better matchup support.`,
    matchupRating,
    misreadSignal,
  }
}

function whyPlayerRows(input: {
  player: string
  metric: string
  line?: number
  lastGame: ShootingSnapshot
  last5Avg?: number
  median?: number
  min: number
  max: number
  hit5?: number
  games5: number
  hit12?: number
  games12: number
  minutes: { lastGame?: number; last5Avg?: number; stable: boolean }
  volume: SignalJudgmentContext['volume']
  riskNotes: string[]
}): string[] {
  const metricLabel = input.metric.toLowerCase()
  const metricKey = metricLabel
  const currentProp = propText(input.line, metricLabel)
  const nextProp = nextPropText(input.line, metricLabel)
  const skipProp = skipPropText(input.line, metricLabel)
  const hitText = input.line != null ? `${input.hit5 ?? '—'} of ${input.games5}` : `${fmt(input.last5Avg)} avg last 5`
  const numberRead = input.line != null
    ? `Today's prop is ${currentProp}; his normal recent game is around ${fmt(input.median)}, with recent results from ${fmt(input.min)} to ${fmt(input.max)}. That means ${input.median != null && input.median >= input.line ? `${currentProp} is reasonable, ${nextProp} is where you get pickier, and ${skipProp} is probably too rich.` : `he needs one of his better games, so do not chase a higher number.`}`
    : `His normal recent game is around ${fmt(input.median)}, with recent results from ${fmt(input.min)} to ${fmt(input.max)}. Only play it if the app shows a clear number.`

  if (metricKey === 'rebounds') {
    const floorText = input.min >= (input.line ?? Number.POSITIVE_INFINITY)
      ? `even his low game in this sample was ${fmt(input.min)}`
      : `his low game is ${fmt(input.min)}, so role/minutes still matter`
    return [
      `${input.player}'s case is rebounding-specific, not scoring-dependent: ${fmt(input.lastGame.value)} boards last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} hit ${currentProp}.`,
      `${numberRead} For a boards prop, that matters because one cold shooting night does not kill it the same way it can kill points.`,
      `Workload/floor check: ${fmt(input.minutes.lastGame)} min last game, ${fmt(input.minutes.last5Avg)} avg last 5, and ${floorText}.`,
    ].filter(Boolean).slice(0, 3)
  }

  if (metricKey === 'assists') {
    return [
      `${input.player}'s case is creation-driven: ${fmt(input.lastGame.value)} assists last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} hit ${currentProp}.`,
      `${numberRead} This is about normal on-ball reps and teammates finishing shots, not him needing a scoring spike.`,
      `Role check for assists: ${fmt(input.minutes.lastGame)} min last game and ${fmt(input.minutes.last5Avg)} avg last 5${input.minutes.stable ? ', enough workload for passing volume to show up.' : '; verify the ball-handling role before locking it.'}`,
    ].filter(Boolean).slice(0, 3)
  }

  if (metricKey === 'points') {
    const shotText = input.volume.shotAttemptsLast5Avg != null
      ? `${fmtAvg(input.volume.shotAttemptsLast5Avg)} shots, ${fmtAvg(input.volume.threesAttemptedLast5Avg)} threes, ${fmtAvg(input.volume.freeThrowsAttemptedLast5Avg)} free throws per game lately`
      : `${fmt(input.minutes.lastGame)} min last game and ${fmt(input.minutes.last5Avg)} avg last 5`
    return [
      `${input.player}'s case is scoring-volume driven: ${fmt(input.lastGame.value)} points last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} hit ${currentProp}.`,
      `${numberRead} The read is strongest when his attempts stay normal, not just because the hit rate looks clean.`,
      `Volume check: ${shotText}.`,
    ].filter(Boolean).slice(0, 3)
  }

  if (metricKey === 'threes') {
    return [
      `${input.player}'s case is perimeter-volume driven: ${fmt(input.lastGame.value)} threes last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} hit ${currentProp}.`,
      `${numberRead} This needs shot attempts from deep, so check role and matchup before chasing a higher number.`,
      `Three-point volume: ${fmtAvg(input.volume.threesAttemptedLast5Avg)} 3PA per game lately with ${fmt(input.minutes.lastGame)} min last game.`,
    ].filter(Boolean).slice(0, 3)
  }

  if (metricKey === 'hits' || metricKey === 'total bases') {
    const statLabel = metricKey === 'hits' ? 'hits' : 'total bases'
    return [
      `${input.player}'s case is contact/quality-of-contact driven: ${fmt(input.lastGame.value)} ${statLabel} last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} cleared ${currentProp}.`,
      `${numberRead} For MLB, this is not just recent form — confirm batting-order slot, opposing starter handedness, and whether the park/weather helps balls carry.`,
      `Baseball risk check: if he drops in the order, sits against the handedness matchup, or weather suppresses offense, downgrade the read.`,
    ].filter(Boolean).slice(0, 3)
  }

  if (metricKey === 'hits + runs + rbis' || metricKey === 'hits+runs+rbis' || metricKey === 'h+r+rbi') {
    return [
      `${input.player}'s case is full-offense involvement: ${fmt(input.lastGame.value)} hits+runs+RBIs last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} cleared ${currentProp}.`,
      `${numberRead} This needs either table-setting, run production, or both — lineup spot and team run environment matter more than the surface number.`,
      `Baseball risk check: downgrade if he bats lower than expected, faces a tough same-handed starter, or the game total/park/weather turns pitcher-friendly.`,
    ].filter(Boolean).slice(0, 3)
  }

  if (metricKey === 'rbis' || metricKey === 'rbi' || metricKey === 'runs') {
    const role = metricKey === 'runs' ? 'table-setting/run-scoring' : 'run-production'
    return [
      `${input.player}'s case is ${role} driven: ${fmt(input.lastGame.value)} ${metricLabel} last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} cleared ${currentProp}.`,
      `${numberRead} For this MLB prop, the deeper read is lineup context: who hits around him, starter handedness, and team scoring environment.`,
      `Baseball risk check: if the lineup around him is weak or the opposing starter profile suppresses traffic, treat it as only a lean.`,
    ].filter(Boolean).slice(0, 3)
  }

  if (metricKey === 'home runs') {
    return [
      `${input.player}'s case is power/outlier driven: ${fmt(input.lastGame.value)} HR last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} cleared ${currentProp}.`,
      `${numberRead} Home-run looks need more than price: check barrel/power form, pitcher fly-ball weakness, handedness, park, and weather carry.`,
      `Baseball risk check: this is naturally volatile; downgrade hard if the park/weather or pitcher profile suppresses power.`,
    ].filter(Boolean).slice(0, 3)
  }

  if (metricKey === 'strikeouts') {
    return [
      `${input.player}'s case is pitcher workload/swing-miss driven: ${fmt(input.lastGame.value)} strikeouts last game, ${fmtAvg(input.last5Avg)} over the last 5, and ${hitText} cleared ${currentProp}.`,
      `${numberRead} The deeper MLB read is pitch count, opponent K-rate, handedness splits, umpire zone, and whether he is likely to work deep enough.`,
      `Baseball risk check: quick hooks, low pitch count, contact-heavy opponent, or bad weather can turn this into a thin lean.`,
    ].filter(Boolean).slice(0, 3)
  }

  const profile = metricNoun(input.metric)
  return [
    input.line != null
      ? `${input.player} fits this ${profile} look: ${fmt(input.last5Avg)} ${metricLabel} over the last 5 and ${hitText} hit ${currentProp}.`
      : `${input.player} fits this ${profile} look: ${fmt(input.last5Avg)} ${metricLabel} over the last 5 with a recent range of ${fmt(input.min)}-${fmt(input.max)}.`,
    numberRead,
    input.riskNotes[0] ? `Main thing to monitor: ${input.riskNotes[0]}` : '',
  ].filter(Boolean).slice(0, 3)
}

function propNumberRows(input: { metric: string; line?: number; median?: number; min: number; max: number; hit5?: number; games5: number; hit12?: number; games12: number }): string[] {
  const metricLabel = input.metric.toLowerCase()
  const currentProp = propText(input.line, metricLabel)
  const nextProp = nextPropText(input.line, metricLabel)
  const skipProp = skipPropText(input.line, metricLabel)
  const listed = input.line == null
    ? `Today's prop: no clear number was found for ${metricLabel}.`
    : `Today's prop: ${currentProp}. His normal recent game is around ${fmt(input.median)}; recent results went from ${fmt(input.min)} to ${fmt(input.max)}.`
  const history = input.line == null
    ? ''
    : `Recent hit rate: he hit ${currentProp} in ${input.hit5 ?? '—'} of the last ${input.games5} games and ${input.hit12 ?? '—'} of the last ${input.games12}.`
  const read = input.line == null
    ? 'Plain read: skip if the prop number is unclear.'
    : input.median != null && input.median >= input.line
      ? `Plain read: ${currentProp} is the comfortable number. If it becomes ${nextProp}, be picky. If it becomes ${skipProp}, skip it.`
      : `Plain read: ${currentProp} already needs a better-than-normal game, so do not chase a higher number.`
  return [listed, history, read].filter(Boolean)
}

function lastGameBullet(lastGame: ShootingSnapshot, metric: string): string {
  const isPointsMetric = metric.toLowerCase() === 'points' || metric.toLowerCase() === 'pts+reb+ast'
  const shooting = lastGame.fgAttempted
    ? `${fmt(lastGame.fgMade)}/${fmt(lastGame.fgAttempted)} FG${lastGame.fgPct != null ? ` (${fmt(lastGame.fgPct)}%)` : ''}`
    : ''
  const threes = lastGame.threeAttempted
    ? `${fmt(lastGame.threeMade)}/${fmt(lastGame.threeAttempted)} 3PT${lastGame.threePct != null ? ` (${fmt(lastGame.threePct)}%)` : ''}`
    : ''
  const freeThrows = lastGame.ftAttempted ? `${fmt(lastGame.ftMade)}/${fmt(lastGame.ftAttempted)} FT` : ''
  const parts = [shooting, threes, freeThrows].filter(Boolean).join(', ')
  const headline = isPointsMetric
    ? `${fmt(lastGame.points ?? lastGame.value)} pts`
    : `${fmt(lastGame.value)} ${metric}`
  return `Last game: ${headline}${parts ? `, ${parts}` : ''}${lastGame.minutes != null ? ` in ${fmt(lastGame.minutes)} min` : ''}.`
}

export function buildJudgmentContext(input: JudgmentContextInput): SignalJudgmentContext | null {
  const games = (Array.isArray(input.last12) ? input.last12 : [])
    .map(game => snapshotFor(game, input.metric))
    .filter((game): game is ShootingSnapshot => Boolean(game))
    .slice(0, 12)
  if (!games.length) return null

  const line = lineFrom(input)
  const values = games.map(game => game.value)
  const last3 = games.slice(0, 3)
  const last5 = games.slice(0, 5)
  const hit = (game: ShootingSnapshot) => line != null && game.value >= line
  const lastGame = games[0]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const last5Avg = avg(last5.map(game => game.value))
  const medianValue = median(values)
  const minutesLast5Avg = avg(last5.map(game => game.minutes))
  const volume = {
    shotAttemptsLast5Avg: avg(last5.map(game => game.fgAttempted)),
    threesAttemptedLast5Avg: avg(last5.map(game => game.threeAttempted)),
    freeThrowsAttemptedLast5Avg: avg(last5.map(game => game.ftAttempted)),
  }
  const minutes = {
    lastGame: lastGame.minutes ?? num(input.lastGameMinutes),
    last5Avg: minutesLast5Avg,
    stable: Boolean(minutesLast5Avg && minutesLast5Avg >= 28),
  }
  const trend = {
    last3Avg: avg(last3.map(game => game.value)),
    last5Avg,
    last12Avg: avg(games.map(game => game.value)),
    median: medianValue,
    last5HitRate: line != null ? last5.filter(hit).length : undefined,
    last5Games: last5.length,
    last12HitRate: line != null ? games.filter(hit).length : undefined,
    last12Games: games.length,
    range: { min, max },
  }
  const matchupNotes = notesFromTeamIntel(input.teamIntel)
  const injuryNotes = [
    ...(Array.isArray(input.todayIntel?.injuryContext) ? input.todayIntel.injuryContext : []),
    input.todayIntel?.lineup?.reason,
  ].map(note => String(note || '').trim()).filter(Boolean).slice(0, 3)
  const riskNotes = [
    ...(Array.isArray(input.todayIntel?.whatCouldKillIt) ? input.todayIntel.whatCouldKillIt : []),
    ...(Array.isArray(input.todayIntel?.riskFactors) ? input.todayIntel.riskFactors : []),
    input.risk === 'high' ? 'High-volatility profile; do not force it if role/news gets worse.' : '',
  ].map(note => String(note || '').trim()).filter(Boolean).slice(0, 3)
  const recentRows = games.slice(0, 5).map(game => `${game.date || game.opponent || 'Recent'}: ${fmt(game.value)} ${input.metric}, ${fmt(game.fgAttempted)} FGA, ${fmt(game.minutes)} min`)
  const summaryBullets = [
    lastGameBullet(lastGame, input.metric),
    last5Avg != null ? `Trend: ${fmt(last5Avg)} ${input.metric} over the last 5; hit ${propText(line, input.metric)} in ${trend.last5HitRate ?? '—'} of ${last5.length}.` : '',
    volume.shotAttemptsLast5Avg != null ? `Volume: ${fmtAvg(volume.shotAttemptsLast5Avg)} shots, ${fmtAvg(volume.threesAttemptedLast5Avg)} threes, and ${fmtAvg(volume.freeThrowsAttemptedLast5Avg)} free throws per game over the last 5.` : '',
    minutes.lastGame != null ? `Minutes: ${fmt(minutes.lastGame)} last game / ${fmt(minutes.last5Avg)} last 5${minutes.stable ? '; role looks stable.' : '; verify role before tipoff.'}` : '',
  ].filter(Boolean)
  const mlbConviction = buildMlbConviction({
    player: input.player,
    metric: input.metric,
    line,
    lastGame,
    last5Avg,
    median: medianValue,
    min,
    max,
    hit5: trend.last5HitRate,
    games5: last5.length,
    hit12: trend.last12HitRate,
    games12: games.length,
    mlbGameContext: input.mlbGameContext,
  })
  const whyPlayerBullets = whyPlayerRows({
    player: input.player,
    metric: input.metric,
    line,
    lastGame,
    last5Avg,
    median: medianValue,
    min,
    max,
    hit5: trend.last5HitRate,
    games5: last5.length,
    hit12: trend.last12HitRate,
    games12: games.length,
    minutes,
    volume,
    riskNotes,
  })
  const lineCheck = {
    line,
    median: medianValue,
    range: { min, max },
    hitRateLabel: `${trend.last5HitRate ?? '—'} of ${last5.length} last 5 · ${trend.last12HitRate ?? '—'} of ${games.length} last 12`,
    verdict: line == null
      ? 'No clear prop number available.'
      : medianValue != null && medianValue >= line
        ? `${propText(line, input.metric)} is below his normal recent game, so that number is playable. Be careful one step higher; skip two steps higher.`
        : `${propText(line, input.metric)} needs a better-than-normal result. Do not chase if the app asks for more.`,
  }
  const roleCheck = roleStatus(minutes)
  const consistency = consistencyGrade(trend.last5HitRate, trend.last5Games, trend.last12HitRate, trend.last12Games)
  const gameEnvironment = environmentNotes(input)
  const sportSpecificNotes = sportNotes(input.metric)
  const decisionSections: SignalDecisionSection[] = [
    { title: 'ROLE CHECK', rows: [roleCheck.label, ...roleCheck.details].filter(Boolean).slice(0, 3) },
    { title: 'PROP NUMBER', rows: propNumberRows({ metric: input.metric, line, median: medianValue, min, max, hit5: trend.last5HitRate, games5: last5.length, hit12: trend.last12HitRate, games12: games.length }).slice(0, 3) },
    { title: 'RISK CHECK', rows: [...riskNotes, playable(line, input.metric), consistency.label].filter(Boolean).slice(0, 3) },
  ]
  const overallRatings = buildOverallRatings({
    line,
    median: medianValue,
    last5Avg,
    min,
    max,
    hit5: trend.last5HitRate,
    games5: last5.length,
    hit12: trend.last12HitRate,
    games12: games.length,
    minutes,
    teamIntel: input.teamIntel,
    riskNotes,
  })

  return {
    lastGame,
    trend,
    overallRatings,
    lineCheck,
    roleCheck,
    consistency,
    gameEnvironment,
    sportSpecificNotes,
    decisionSections,
    mlbConviction,
    volume,
    minutes,
    matchupNotes,
    injuryNotes,
    riskNotes,
    playableNumber: playable(line, input.metric),
    summaryBullets,
    whyPlayerBullets,
    recentRows,
  }
}
