export type LivePropProgress = {
  value: number
  line: number
  hit: boolean
  label: string
}

type StatRow = Record<string, unknown>

export function getLivePropProgress(live: unknown, playerName: string, metric: string, line?: number | null): LivePropProgress | null {
  const expectedPlayer = normalizeName(playerName)
  const rows = collectRows(live)
  const matchingRows = rows.filter((row) => rowMatchesPlayer(row, expectedPlayer))

  if (metricIsHrr(metric)) {
    let total = 0
    let found = false

    for (const row of matchingRows) {
      const value = readMetricValue(row, 'HRR') ?? readHrr(row)
      if (value == null) continue
      total += value
      found = true
    }

    if (found) {
      const targetLine = line ?? 0
      return {
        value: total,
        line: targetLine,
        hit: total >= targetLine,
        label: `${formatNumber(total)} / ${formatNumber(targetLine)} ${metric}`,
      }
    }
  }

  for (const row of matchingRows) {
    const value = readMetricValue(row, metric)
    if (value == null) continue

    const targetLine = line ?? 0
    return {
      value,
      line: targetLine,
      hit: value >= targetLine,
      label: `${formatNumber(value)} / ${formatNumber(targetLine)} ${metric}`,
    }
  }

  return null
}

function collectRows(value: unknown, depth = 0): StatRow[] {
  if (depth > 8) return []

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectRows(entry, depth + 1))
  }

  if (!isRecord(value)) return []

  const rows: StatRow[] = []
  if (looksLikeStatRow(value)) rows.push(value)

  for (const [key, child] of Object.entries(value)) {
    if (!shouldTraverse(key, child)) continue
    rows.push(...collectRows(child, depth + 1))
  }

  return rows
}

function looksLikeStatRow(row: StatRow) {
  return Boolean(readPlayerName(row))
    || (typeof row.name === 'string' && Object.prototype.hasOwnProperty.call(row, 'value'))
    || (typeof row.stat === 'string' && Object.prototype.hasOwnProperty.call(row, 'value'))
}

function shouldTraverse(key: string, child: unknown) {
  if (Array.isArray(child)) return true
  if (!isRecord(child)) return false

  const normalized = key.toLowerCase()
  return ['stats', 'statistics', 'splits', 'leaders', 'athletes', 'players', 'boxscore', 'competitors', 'teams', 'items'].includes(normalized)
}

function rowMatchesPlayer(row: StatRow, expectedPlayer: string) {
  const actual = normalizeName(readPlayerName(row))
  return Boolean(actual) && actual === expectedPlayer
}

function readPlayerName(row: StatRow): string | undefined {
  return asString(row.playerName)
    ?? asString(row.player_name)
    ?? asString(row.player)
    ?? readNameObject(row.player)
    ?? readNameObject(row.athlete)
    ?? readNameObject(row.participant)
    ?? readNameObject(row.competitor)
    ?? readStandaloneName(row)
}

function readStandaloneName(row: StatRow) {
  if (Object.prototype.hasOwnProperty.call(row, 'value') || Object.prototype.hasOwnProperty.call(row, 'stat')) {
    return undefined
  }

  return asString(row.name)
}

function readNameObject(value: unknown) {
  if (!isRecord(value)) return undefined
  return asString(value.displayName)
    ?? asString(value.fullName)
    ?? asString(value.name)
    ?? asString(value.shortName)
}

function readMetricValue(row: StatRow, metric: string): number | null {
  const metricKeys = metricAliases(metric)

  const directValue = readDirectValue(row, metricKeys)
  if (directValue != null) return directValue

  const statistics = row.statistics ?? row.stats
  const nestedValue = readStatisticsValue(statistics, metricKeys)
  if (nestedValue != null) return nestedValue

  for (const key of metricKeys) {
    const value = toNumber(row[key])
    if (value != null) return value
  }

  return null
}

function readDirectValue(row: StatRow, metricKeys: string[]) {
  const statName = normalizeKey(asString(row.stat) ?? asString(row.name) ?? asString(row.displayName) ?? asString(row.abbreviation))
  const normalizedMetricKeys = metricKeys.map(normalizeKey)
  if (!statName || !normalizedMetricKeys.includes(statName)) return null
  return toNumber(row.value) ?? toNumber(row.displayValue)
}

function readStatisticsValue(statistics: unknown, metricKeys: string[]): number | null {
  if (Array.isArray(statistics)) {
    for (const entry of statistics) {
      if (!isRecord(entry)) continue
      const value = readDirectValue(entry, metricKeys)
      if (value != null) return value
    }
    return null
  }

  if (!isRecord(statistics)) return null

  for (const key of metricKeys) {
    const value = toNumber(statistics[key])
    if (value != null) return value
  }

  return null
}

function readHrr(row: StatRow): number | null {
  const hits = readMetricValue(row, 'hits')
  const runs = readMetricValue(row, 'runs')
  const rbis = readMetricValue(row, 'RBIs')

  if (hits == null && runs == null && rbis == null) return null
  return (hits ?? 0) + (runs ?? 0) + (rbis ?? 0)
}

function metricIsHrr(metric: string) {
  const normalized = normalizeKey(metric)
  return normalized === 'hrr' || normalized === 'hits-runs-rbis' || normalized === 'hits-runs-rbi'
}

function metricAliases(metric: string) {
  const normalized = normalizeKey(metric)

  if (['points', 'point', 'pts'].includes(normalized)) return ['points', 'point', 'pts']
  if (['rebounds', 'rebound', 'reb', 'rebs'].includes(normalized)) return ['rebounds', 'rebound', 'reb', 'rebs']
  if (['assists', 'assist', 'ast', 'asts'].includes(normalized)) return ['assists', 'assist', 'ast', 'asts']
  if (['threes', 'three', 'three-pointers', 'three-pointer', 'three-point-field-goals-made', 'three-point-field-goals', 'three-pointers-made', '3pm', '3pt', 'fg3m'].includes(normalized)) return ['threes', 'three', 'three-pointers', 'three-pointer', 'threePointFieldGoalsMade', 'threePointFieldGoals', 'threePointersMade', '3PM', '3PT', 'fg3m']
  if (['strikeouts', 'strikeout', 'k', 'ks'].includes(normalized)) return ['strikeouts', 'strikeout', 'k', 'ks']
  if (['home-runs', 'home-run', 'hr'].includes(normalized)) return ['home-runs', 'home-run', 'homeRuns', 'homeRun', 'hr']
  if (['hits', 'hit', 'h'].includes(normalized)) return ['hits', 'hit', 'h']
  if (['runs', 'run', 'r'].includes(normalized)) return ['runs', 'run', 'r']
  if (['rbis', 'rbi'].includes(normalized)) return ['rbis', 'rbi', 'RBI']
  if (['hrr', 'hits-runs-rbis', 'hits-runs-rbi'].includes(normalized)) return ['hrr', 'hits-runs-rbis', 'hits-runs-rbi']

  return [normalized]
}

function normalizeName(value?: string) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeKey(value?: string) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value)
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isRecord(value: unknown): value is StatRow {
  return typeof value === 'object' && value !== null
}
