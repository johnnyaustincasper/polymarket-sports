type Numeric = number | null | undefined

export type JudgmentGameLog = {
  eventId?: string
  date?: string
  opponent?: string
  stats?: Record<string, Numeric>
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

  return {
    lastGame,
    trend,
    lineCheck,
    roleCheck,
    consistency,
    gameEnvironment,
    sportSpecificNotes,
    decisionSections,
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
