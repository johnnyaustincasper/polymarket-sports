export type ParsedNbaGameLogStats = {
  minutes: number
  points: number
  rebounds: number
  assists: number
  blocks: number
  steals: number
  threes: number
  turnovers: number
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
  return {
    minutes: parseEspnStat(names, rowStats, ['minutes']),
    points: parseEspnStat(names, rowStats, ['points']),
    rebounds: parseEspnStat(names, rowStats, ['totalRebounds', 'rebounds']),
    assists: parseEspnStat(names, rowStats, ['assists']),
    blocks: parseEspnStat(names, rowStats, ['blocks']),
    steals: parseEspnStat(names, rowStats, ['steals']),
    threes: parseEspnStat(names, rowStats, [
      'threePointFieldGoalsMade',
      'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
      'threePointFieldGoals',
      'threePointersMade',
      'threePointers',
      '3PM',
    ]),
    turnovers: parseEspnStat(names, rowStats, ['turnovers']),
  }
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
