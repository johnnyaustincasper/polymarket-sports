export type WatchItem = {
  key: string
  id?: string
  gameId?: string
  player?: string
  label?: string
  ticker?: string
  active: boolean
  addedAt?: string
  askTarget?: number
  edgeTarget?: number
  tier?: string
  minLiquidity?: number
}

export type WatchAction =
  | { type: 'add'; item: Partial<Omit<WatchItem, 'key' | 'active'>> & { key?: string; active?: boolean } }
  | { type: 'remove'; key: string }
  | { type: 'toggle'; key: string; active?: boolean }

export type WatchSnapshot = {
  key: string
  label?: string
  ask?: number | null
  edge?: number | null
  tier?: string | null
  liquidity?: number | null
  lastAlerts?: Record<string, string | number | Date>
}

export type AlertRule = {
  key?: string
  type: 'ask-target' | 'edge-target' | 'tier-upgrade' | 'liquidity-min'
  target?: number
  min?: number
  cooldownMs?: number
}

export type AlertEvent = {
  key: string
  type: AlertRule['type']
  label: string
  detail: string
  at: string
  value?: number | string
  threshold?: number | string
  severity: 'info' | 'watch' | 'danger'
}

export type WatchSignalThresholdSource = {
  ask?: number | null
  maxBuy?: number | null
  edge?: number | null
  askSize?: number | null
  liquidity?: number | null
}

export function buildAlertRulesForWatchItem(item: Pick<WatchItem, 'key' | 'askTarget' | 'edgeTarget' | 'minLiquidity'>, _signal: WatchSignalThresholdSource, cooldownMs?: number): AlertRule[] {
  const askTarget = finiteNumber(item.askTarget)
  const edgeTarget = finiteNumber(item.edgeTarget)
  const minLiquidity = finiteNumber(item.minLiquidity)

  return [
    ...(askTarget == null ? [] : [{ key: item.key, type: 'ask-target' as const, target: askTarget, cooldownMs }]),
    ...(edgeTarget == null ? [] : [{ key: item.key, type: 'edge-target' as const, target: edgeTarget, cooldownMs }]),
    { key: item.key, type: 'tier-upgrade' as const, cooldownMs },
    ...(minLiquidity == null ? [] : [{ key: item.key, type: 'liquidity-min' as const, min: Math.max(5, minLiquidity), cooldownMs }]),
  ]
}

export function buildWatchKey(item: { id?: string; gameId?: string; player?: string; label?: string; ticker?: string }): string {
  if (item.id?.trim()) return `id:${item.id.trim()}`
  if (item.ticker?.trim()) return `ticker:${item.ticker.trim().toUpperCase()}`

  const gameId = slug(item.gameId) || 'global'
  const player = slug(item.player) || 'unknown'
  const label = slug(item.label) || 'prop'
  return `prop:${gameId}:${player}:${label}`
}

export function watchlistReducer(state: WatchItem[], action: WatchAction): WatchItem[] {
  switch (action.type) {
    case 'add': {
      const key = action.item.key ?? buildWatchKey(action.item)
      const item: WatchItem = {
        ...action.item,
        key,
        active: action.item.active ?? true,
        addedAt: action.item.addedAt ?? new Date(0).toISOString(),
      }
      const existingIndex = state.findIndex((watchItem) => watchItem.key === key)

      if (existingIndex === -1) return [...state, item]

      return state.map((watchItem, index) => index === existingIndex
        ? { ...watchItem, ...item, key, active: item.active }
        : watchItem)
    }

    case 'remove':
      return state.filter((watchItem) => watchItem.key !== action.key)

    case 'toggle':
      return state.map((watchItem) => {
        if (watchItem.key !== action.key) return watchItem
        return { ...watchItem, active: action.active ?? !watchItem.active }
      })
  }
}

export function evaluateAlerts(input: { previous?: WatchSnapshot | null; current: WatchSnapshot; rules: AlertRule[]; now?: Date }): AlertEvent[] {
  const now = input.now ?? new Date()
  const at = now.toISOString()
  const events: AlertEvent[] = []

  for (const rule of input.rules) {
    if (rule.key && rule.key !== input.current.key) continue
    if (isCoolingDown(input.previous, rule, now)) continue

    const event = evaluateRule(input.previous ?? null, input.current, rule, at)
    if (event) events.push(event)
  }

  return events
}

function evaluateRule(previous: WatchSnapshot | null, current: WatchSnapshot, rule: AlertRule, at: string): AlertEvent | null {
  switch (rule.type) {
    case 'ask-target': {
      const target = rule.target
      if (target == null || current.ask == null) return null
      const crossed = current.ask <= target && (previous?.ask == null || previous.ask > target)
      if (!crossed) return null
      return {
        key: current.key,
        type: rule.type,
        label: 'Price target hit',
        detail: `${displayLabel(current)} is at ${current.ask}, at or below target ${target}.`,
        at,
        value: current.ask,
        threshold: target,
        severity: 'watch',
      }
    }

    case 'edge-target': {
      const target = rule.target
      if (target == null || current.edge == null) return null
      const crossed = current.edge >= target && (previous?.edge == null || previous.edge < target)
      if (!crossed) return null
      return {
        key: current.key,
        type: rule.type,
        label: 'Edge target hit',
        detail: `${displayLabel(current)} edge is ${current.edge}, at or above target ${target}.`,
        at,
        value: current.edge,
        threshold: target,
        severity: 'danger',
      }
    }

    case 'tier-upgrade': {
      if (!current.tier || !previous?.tier) return null
      const previousRank = tierRank(previous.tier)
      const currentRank = tierRank(current.tier)
      if (currentRank <= previousRank) return null
      return {
        key: current.key,
        type: rule.type,
        label: 'Tier upgraded',
        detail: `${displayLabel(current)} moved from ${previous.tier} to ${current.tier}.`,
        at,
        value: current.tier,
        threshold: previous.tier,
        severity: 'watch',
      }
    }

    case 'liquidity-min': {
      const min = rule.min ?? rule.target
      if (min == null || current.liquidity == null) return null
      const crossed = current.liquidity >= min && (previous?.liquidity == null || previous.liquidity < min)
      if (!crossed) return null
      return {
        key: current.key,
        type: rule.type,
        label: 'Liquidity minimum met',
        detail: `${displayLabel(current)} liquidity is ${current.liquidity}, at or above minimum ${min}.`,
        at,
        value: current.liquidity,
        threshold: min,
        severity: 'info',
      }
    }
  }
}

function isCoolingDown(previous: WatchSnapshot | null | undefined, rule: AlertRule, now: Date) {
  if (!rule.cooldownMs || rule.cooldownMs <= 0) return false

  const lastAlert = previous?.lastAlerts?.[alertSignature(rule)]
  if (lastAlert == null) return false

  const lastAlertTime = lastAlert instanceof Date ? lastAlert.getTime() : new Date(lastAlert).getTime()
  if (!Number.isFinite(lastAlertTime)) return false

  return now.getTime() - lastAlertTime < rule.cooldownMs
}

function alertSignature(rule: AlertRule) {
  const threshold = rule.target ?? rule.min ?? ''
  return `${rule.type}:${threshold}`
}

function tierRank(tier: string) {
  const normalized = tier.trim().toUpperCase()
  const ranks: Record<string, number> = {
    KILL: 0,
    F: 0,
    D: 1,
    C: 2,
    WATCH: 2,
    B: 3,
    A: 4,
    S: 5,
    ELITE: 6,
  }

  if (normalized in ranks) return ranks[normalized]

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function displayLabel(snapshot: WatchSnapshot) {
  return snapshot.label ?? snapshot.key
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function slug(value?: string) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
