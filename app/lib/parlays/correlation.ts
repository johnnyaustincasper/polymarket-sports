export type CorrelationInputItem = {
  player?: string
  team?: string
  gameId?: string
  metric?: string
  label?: string
  ticker?: string
  askSize?: number | null
}

export type CorrelationWarning = {
  severity: 'info' | 'watch' | 'danger'
  label: string
  detail: string
}

const THIN_LIQUIDITY_SIZE = 5

export function detectCorrelationWarnings(items: CorrelationInputItem[]): CorrelationWarning[] {
  const warnings: CorrelationWarning[] = []

  addDuplicateTickerWarnings(items, warnings)
  addDuplicatePlayerPropWarnings(items, warnings)
  addSameGameClusterWarnings(items, warnings)
  addSameTeamStackWarnings(items, warnings)
  addPitcherVsHitterWarnings(items, warnings)
  addThinLiquidityWarnings(items, warnings)

  return warnings
}

function addDuplicateTickerWarnings(items: CorrelationInputItem[], warnings: CorrelationWarning[]) {
  const groups = groupBy(items, (item) => normalizeTicker(item.ticker))

  groups.forEach((group, ticker) => {
    if (!ticker || group.length < 2) return

    warnings.push({
      severity: 'danger',
      label: 'Duplicate ticker',
      detail: `${describeCount(group.length, 'leg')} use ticker ${ticker}. Remove duplicate exposure before building a parlay.`,
    })
  })
}

function addDuplicatePlayerPropWarnings(items: CorrelationInputItem[], warnings: CorrelationWarning[]) {
  const groups = groupBy(items, (item) => {
    const player = normalizeText(item.player)
    const metric = normalizeMetric(item.metric ?? item.label)
    if (!player || !metric) return ''
    return `${normalizeText(item.gameId)}:${player}:${metric}`
  })

  groups.forEach((group) => {
    if (group.length < 2) return

    const sample = group[0]
    warnings.push({
      severity: 'danger',
      label: 'Duplicate player prop',
      detail: `${describePlayer(sample)} appears ${group.length} times for ${sample.metric ?? 'the same metric'}. Keep only one copy of that leg.`,
    })
  })
}

function addSameGameClusterWarnings(items: CorrelationInputItem[], warnings: CorrelationWarning[]) {
  const groups = groupBy(items, (item) => normalizeText(item.gameId))

  groups.forEach((group, gameId) => {
    if (!gameId || group.length < 3) return

    warnings.push({
      severity: 'watch',
      label: 'Same-game cluster',
      detail: `${describeCount(group.length, 'leg')} come from game ${group[0].gameId}. Same-game props can move together and reduce diversification.`,
    })
  })
}

function addSameTeamStackWarnings(items: CorrelationInputItem[], warnings: CorrelationWarning[]) {
  const groups = groupBy(items, (item) => {
    const team = normalizeText(item.team)
    if (!team) return ''
    return `${normalizeText(item.gameId)}:${team}`
  })

  groups.forEach((group) => {
    if (group.length < 2) return

    warnings.push({
      severity: 'watch',
      label: 'Same-team stack',
      detail: `${describeCount(group.length, 'leg')} are tied to ${group[0].team}. Team environment, pace, weather, and lineup news may correlate these legs.`,
    })
  })
}

function addPitcherVsHitterWarnings(items: CorrelationInputItem[], warnings: CorrelationWarning[]) {
  const gameGroups = groupBy(items, (item) => normalizeText(item.gameId))

  gameGroups.forEach((gameItems) => {
    const pitchers = gameItems.filter(isPitcherProp)
    const hitters = gameItems.filter((item) => isHitterProp(item) && !isPitcherProp(item))

    for (const pitcher of pitchers) {
      const pitcherTeam = normalizeText(pitcher.team)
      const opponent = hitters.find((hitter) => {
        const hitterTeam = normalizeText(hitter.team)
        return !pitcherTeam || !hitterTeam || hitterTeam !== pitcherTeam
      })
      if (!opponent) return

      warnings.push({
        severity: 'danger',
        label: 'Pitcher vs hitter',
        detail: `${describePlayer(pitcher)} and ${describePlayer(opponent)} oppose each other in the same game; pitcher success can directly suppress hitter props.`,
      })
      break
    }
  })
}

function addThinLiquidityWarnings(items: CorrelationInputItem[], warnings: CorrelationWarning[]) {
  for (const item of items) {
    if (!Object.prototype.hasOwnProperty.call(item, 'askSize')) continue
    if (typeof item.askSize === 'number' && item.askSize >= THIN_LIQUIDITY_SIZE) continue

    const size = item.askSize == null ? 'missing' : String(item.askSize)
    warnings.push({
      severity: 'info',
      label: 'Thin liquidity',
      detail: `${describePlayer(item)} has ask size ${size}; fills may slip or be unavailable below ${THIN_LIQUIDITY_SIZE} contracts.`,
    })
  }
}

function isPitcherProp(item: CorrelationInputItem) {
  const text = `${item.metric ?? ''} ${item.label ?? ''} ${item.ticker ?? ''}`.toLowerCase()
  return /\b(strikeouts?|ks?|pitcher|earned runs?|outs recorded|innings pitched|walks allowed|hits allowed)\b/.test(text)
}

function isHitterProp(item: CorrelationInputItem) {
  const text = `${item.metric ?? ''} ${item.label ?? ''} ${item.ticker ?? ''}`.toLowerCase()
  return /\b(hits?|runs?|rbis?|hrr|hits \+ runs \+ rbis?|home runs?|total bases|singles?|doubles?)\b/.test(text)
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const key = keyFor(item)
    if (!key) continue
    const group = groups.get(key)
    if (group) {
      group.push(item)
    } else {
      groups.set(key, [item])
    }
  }

  return groups
}

function describePlayer(item: CorrelationInputItem) {
  return item.player ?? item.label ?? item.ticker ?? 'Unknown leg'
}

function describeCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function normalizeTicker(value?: string) {
  return value?.trim().toUpperCase() ?? ''
}

function normalizeMetric(value?: string) {
  const normalized = normalizeText(value)
  if (!normalized) return ''

  if (/\b(points?|pts)\b/.test(normalized)) return 'points'
  if (/\b(rebounds?|rebs?)\b/.test(normalized)) return 'rebounds'
  if (/\b(assists?|asts?)\b/.test(normalized)) return 'assists'
  if (/\b(strikeouts?|ks?)\b/.test(normalized)) return 'strikeouts'
  if (/\b(hrr|hits-runs-rbis|hits-runs-rbi|hits-runs-rbis?)\b/.test(normalized)) return 'hrr'

  return normalized
}

function normalizeText(value?: string) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
