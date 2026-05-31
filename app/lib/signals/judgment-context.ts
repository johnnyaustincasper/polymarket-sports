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

export type SignalJudgmentContext = {
  lastGame: ShootingSnapshot
  trend: {
    last3Avg?: number
    last5Avg?: number
    last12Avg?: number
    last5HitRate?: number
    last5Games?: number
    last12HitRate?: number
    last12Games?: number
    range?: { min: number; max: number }
  }
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

function playable(line?: number): string {
  if (line == null) return 'Playable only if the number stays close to the listed prop. Pass if it moves against you.'
  return `Playable at ${fmt(line)}. Pass if the line moves past ${fmt(line + 1)}.`
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
    last5Avg != null ? `Trend: ${fmt(last5Avg)} ${input.metric} over the last 5; cleared ${fmt(line)} in ${trend.last5HitRate ?? '—'} of ${last5.length}.` : '',
    volume.shotAttemptsLast5Avg != null ? `Volume: ${fmtAvg(volume.shotAttemptsLast5Avg)} shots, ${fmtAvg(volume.threesAttemptedLast5Avg)} threes, and ${fmtAvg(volume.freeThrowsAttemptedLast5Avg)} free throws per game over the last 5.` : '',
    minutes.lastGame != null ? `Minutes: ${fmt(minutes.lastGame)} last game / ${fmt(minutes.last5Avg)} last 5${minutes.stable ? '; role looks stable.' : '; verify role before tipoff.'}` : '',
  ].filter(Boolean)

  return {
    lastGame,
    trend,
    volume,
    minutes,
    matchupNotes,
    injuryNotes,
    riskNotes,
    playableNumber: playable(line),
    summaryBullets,
    recentRows,
  }
}
