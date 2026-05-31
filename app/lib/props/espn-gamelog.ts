export type ParsedNbaGameLogStats = {
  minutes: number
  points: number
  rebounds: number
  assists: number
  blocks: number
  steals: number
  threes: number
  turnovers: number
  fieldGoalsMade: number
  fieldGoalsAttempted: number
  fieldGoalPct: number
  threePointersMade: number
  threePointersAttempted: number
  threePointPct: number
  freeThrowsMade: number
  freeThrowsAttempted: number
  freeThrowPct: number
}

export function parseEspnStat(names: string[], rowStats: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = names.indexOf(alias)
    if (idx < 0) continue
    return parseEspnStatCell(rowStats[idx], alias)
  }
  return 0
}

export function parseNbaGameLogStats(names: string[], rowStats: string[]): ParsedNbaGameLogStats {
  const fieldGoals = parseEspnMadeAttempted(names, rowStats, [
    'fieldGoalsMade-fieldGoalsAttempted',
    'fieldGoals',
    'fieldGoalsMade',
  ])
  const threes = parseEspnMadeAttempted(names, rowStats, [
    'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
    'threePointFieldGoals',
    'threePointersMade',
    'threePointers',
    '3PM',
  ])
  const freeThrows = parseEspnMadeAttempted(names, rowStats, [
    'freeThrowsMade-freeThrowsAttempted',
    'freeThrows',
    'freeThrowsMade',
  ])
  const fieldGoalPct = parseEspnStat(names, rowStats, ['fieldGoalPct', 'fieldGoalPercentage'])
  const threePointPct = parseEspnStat(names, rowStats, ['threePointPct', 'threePointFieldGoalPct', 'threePointPercentage'])
  const freeThrowPct = parseEspnStat(names, rowStats, ['freeThrowPct', 'freeThrowPercentage'])

  return {
    minutes: parseEspnStat(names, rowStats, ['minutes']),
    points: parseEspnStat(names, rowStats, ['points']),
    rebounds: parseEspnStat(names, rowStats, ['totalRebounds', 'rebounds']),
    assists: parseEspnStat(names, rowStats, ['assists']),
    blocks: parseEspnStat(names, rowStats, ['blocks']),
    steals: parseEspnStat(names, rowStats, ['steals']),
    threes: threes.made,
    turnovers: parseEspnStat(names, rowStats, ['turnovers']),
    fieldGoalsMade: fieldGoals.made,
    fieldGoalsAttempted: fieldGoals.attempted,
    fieldGoalPct: fieldGoalPct || pct(fieldGoals.made, fieldGoals.attempted),
    threePointersMade: threes.made,
    threePointersAttempted: threes.attempted,
    threePointPct: threePointPct || pct(threes.made, threes.attempted),
    freeThrowsMade: freeThrows.made,
    freeThrowsAttempted: freeThrows.attempted,
    freeThrowPct: freeThrowPct || pct(freeThrows.made, freeThrows.attempted),
  }
}

type MadeAttempted = { made: number; attempted: number }

function parseEspnMadeAttempted(names: string[], rowStats: string[], aliases: string[]): MadeAttempted {
  for (const alias of aliases) {
    const idx = names.indexOf(alias)
    if (idx < 0) continue
    const raw = String(rowStats[idx] ?? '').trim()
    if (!raw || raw === '-') return { made: 0, attempted: 0 }
    if (raw.includes('-')) {
      const [madeRaw, attemptedRaw] = raw.split('-')
      const made = Number(madeRaw)
      const attempted = Number(attemptedRaw)
      return {
        made: Number.isFinite(made) ? made : 0,
        attempted: Number.isFinite(attempted) ? attempted : 0,
      }
    }
    const made = parseEspnStatCell(raw, alias)
    return { made, attempted: 0 }
  }
  return { made: 0, attempted: 0 }
}

function pct(made: number, attempted: number): number {
  if (!attempted) return 0
  return Math.round((made / attempted) * 1000) / 10
}

function parseEspnStatCell(value: unknown, statName: string): number {
  if (value == null || value === '-') return 0
  const raw = String(value).trim()
  if (!raw) return 0

  if (statName.includes('-')) {
    const made = Number(raw.split('-')[0])
    return Number.isFinite(made) ? made : 0
  }

  const parsed = Number(raw.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
