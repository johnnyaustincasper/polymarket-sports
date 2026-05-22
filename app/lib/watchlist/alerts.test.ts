import { describe, expect, it } from 'vitest'
import {
  buildAlertRulesForWatchItem,
  buildWatchKey,
  evaluateAlerts,
  watchlistReducer,
  type AlertRule,
  type WatchSnapshot,
} from './alerts'

describe('watchlistReducer', () => {
  it('builds stable keys from id, ticker, or fallback fields', () => {
    expect(buildWatchKey({ id: 'abc' })).toBe('id:abc')
    expect(buildWatchKey({ ticker: 'KXNBAPTS-NYKIND-JBRUNSON-20' })).toBe('ticker:KXNBAPTS-NYKIND-JBRUNSON-20')
    expect(buildWatchKey({ gameId: 'nyk-ind', player: 'Jalen Brunson', label: '20+ Points' })).toBe('prop:nyk-ind:jalen-brunson:20-points')
  })

  it('adds items idempotently and removes them idempotently', () => {
    const item = { ticker: 'KXNBAPTS-NYKIND-JBRUNSON-20', player: 'Jalen Brunson', label: '20+ Points' }
    const added = watchlistReducer([], { type: 'add', item })
    const addedAgain = watchlistReducer(added, { type: 'add', item })
    const removed = watchlistReducer(addedAgain, { type: 'remove', key: buildWatchKey(item) })
    const removedAgain = watchlistReducer(removed, { type: 'remove', key: buildWatchKey(item) })

    expect(addedAgain).toHaveLength(1)
    expect(addedAgain[0]).toMatchObject({ active: true, key: 'ticker:KXNBAPTS-NYKIND-JBRUNSON-20' })
    expect(removed).toEqual([])
    expect(removedAgain).toEqual([])
  })

  it('toggles watch items without duplicating them', () => {
    const state = watchlistReducer([], { type: 'add', item: { id: 'leg-1', label: 'Leg 1' } })
    const off = watchlistReducer(state, { type: 'toggle', key: 'id:leg-1' })
    const on = watchlistReducer(off, { type: 'toggle', key: 'id:leg-1', active: true })

    expect(off).toEqual([expect.objectContaining({ key: 'id:leg-1', active: false })])
    expect(on).toEqual([expect.objectContaining({ key: 'id:leg-1', active: true })])
  })

  it('builds alert rules from stored watch thresholds instead of moving live signal values', () => {
    const rules = buildAlertRulesForWatchItem(
      { key: 'leg-1', askTarget: 47, edgeTarget: 9, minLiquidity: 25 },
      { ask: 55, maxBuy: 55, edge: 4, askSize: 8, liquidity: 8 },
      60_000,
    )

    expect(rules).toEqual([
      { key: 'leg-1', type: 'ask-target', target: 47, cooldownMs: 60_000 },
      { key: 'leg-1', type: 'edge-target', target: 9, cooldownMs: 60_000 },
      { key: 'leg-1', type: 'tier-upgrade', cooldownMs: 60_000 },
      { key: 'leg-1', type: 'liquidity-min', min: 25, cooldownMs: 60_000 },
    ])
  })

  it('does not create moving-target alert rules when stored watch thresholds are missing', () => {
    const rules = buildAlertRulesForWatchItem(
      { key: 'leg-1' },
      { ask: 55, maxBuy: 55, edge: 4, askSize: 8, liquidity: 8 },
      60_000,
    )

    expect(rules).toEqual([
      { key: 'leg-1', type: 'tier-upgrade', cooldownMs: 60_000 },
    ])
  })
})

describe('evaluateAlerts', () => {
  const now = new Date('2026-05-22T12:00:00.000Z')
  const previous: WatchSnapshot = { key: 'leg-1', label: 'Jalen Brunson 20+ points', ask: 54, edge: 3, tier: 'B', liquidity: 4 }
  const current: WatchSnapshot = { key: 'leg-1', label: 'Jalen Brunson 20+ points', ask: 49, edge: 7, tier: 'A', liquidity: 12 }
  const rules: AlertRule[] = [
    { type: 'ask-target', target: 50 },
    { type: 'edge-target', target: 5 },
    { type: 'tier-upgrade' },
    { type: 'liquidity-min', min: 10 },
  ]

  it('emits alerts for ask target, edge target, tier upgrade, and liquidity minimum crossings', () => {
    const alerts = evaluateAlerts({ previous, current, rules, now })

    expect(alerts.map((alert) => alert.type)).toEqual(['ask-target', 'edge-target', 'tier-upgrade', 'liquidity-min'])
    expect(alerts[0]).toMatchObject({ key: 'leg-1', label: 'Ask target hit', value: 49, threshold: 50 })
    expect(alerts.every((alert) => alert.at === now.toISOString())).toBe(true)
  })

  it('does not re-emit unchanged alerts until they cross again', () => {
    const alerts = evaluateAlerts({ previous: current, current: { ...current, ask: 48, edge: 8, tier: 'A', liquidity: 15 }, rules, now })

    expect(alerts).toEqual([])
  })

  it('honors per-rule cooldowns using previous alert timestamps', () => {
    const alerts = evaluateAlerts({
      previous: {
        ...previous,
        lastAlerts: { 'ask-target:50': '2026-05-22T11:59:30.000Z' },
      },
      current,
      rules: [{ type: 'ask-target', target: 50, cooldownMs: 60_000 }],
      now,
    })

    expect(alerts).toEqual([])
  })

  it('treats KILL, WATCH, B, and A as ordered signal tiers', () => {
    const tierRules: AlertRule[] = [{ type: 'tier-upgrade' }]

    expect(evaluateAlerts({
      previous: { key: 'leg-1', tier: 'KILL' },
      current: { key: 'leg-1', tier: 'WATCH' },
      rules: tierRules,
      now,
    })).toHaveLength(1)

    expect(evaluateAlerts({
      previous: { key: 'leg-1', tier: 'WATCH' },
      current: { key: 'leg-1', tier: 'B' },
      rules: tierRules,
      now,
    })).toHaveLength(1)

    expect(evaluateAlerts({
      previous: { key: 'leg-1', tier: 'WATCH' },
      current: { key: 'leg-1', tier: 'A' },
      rules: tierRules,
      now,
    })).toHaveLength(1)
  })
})
