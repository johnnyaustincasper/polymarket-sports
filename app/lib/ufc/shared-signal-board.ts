import { getJsonCache, setJsonCache } from '../durable-cache'
import { buildUfcComboCards, type UfcComboCard, type UfcComboLeg } from './fight-combo-cards'
import type { UFCEvent, UFCFight } from './events'

const SHARED_UFC_SIGNAL_TTL_MS = 60 * 24 * 60 * 60_000
const SHARED_UFC_SIGNAL_SCHEMA_VERSION = 1

export type UfcSignalLegOutcome = 'pending' | 'won' | 'lost' | 'unknown'

export interface UfcSettledSignalLeg extends UfcComboLeg {
  outcome: UfcSignalLegOutcome
  settledAt?: string
  resultLabel?: string
  winner?: string
}

export interface UfcSettledSignalCard extends Omit<UfcComboCard, 'legs'> {
  legs: UfcSettledSignalLeg[]
  record: {
    won: number
    lost: number
    pending: number
    unknown: number
  }
  outcome: UfcSignalLegOutcome
}

export interface UfcSignalHistoryEntry {
  id: string
  cardId: string
  cardLabel: string
  legNumber: number
  fightId: string
  matchup: string
  fighter: string
  ticker: string
  capturedAt: string
  outcome: UfcSignalLegOutcome
  updatedAt: string
  resultLabel: string
  winner?: string
}

export interface UfcSharedSignalBoard {
  schemaVersion: typeof SHARED_UFC_SIGNAL_SCHEMA_VERSION
  eventId: string
  eventName: string
  eventDate: string
  capturedAt: string
  updatedAt: string
  status: 'captured' | 'settled'
  source: 'shared-cache'
  cards: UfcSettledSignalCard[]
  history: UfcSignalHistoryEntry[]
}

function normalize(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function nameMatches(shortName: string, fullName: string) {
  const short = normalize(shortName)
  const full = normalize(fullName)
  if (!short || !full) return false
  if (full === short || full.includes(short) || short.includes(full)) return true
  const weak = new Set(['de', 'da', 'dos', 'do', 'del', 'la', 'le', 'the', 'jr', 'sr', 'fighter', 'fight', 'ufc'])
  const shortParts = short.split(' ').filter(Boolean)
  const fullParts = full.split(' ').filter(Boolean)
  const fullLast = fullParts[fullParts.length - 1]
  const shortLast = shortParts[shortParts.length - 1]
  if (fullLast && !weak.has(fullLast) && (short === fullLast || shortParts.includes(fullLast))) return true
  if (shortLast && !weak.has(shortLast) && (full === shortLast || fullParts.includes(shortLast))) return true
  const shortStrong = shortParts.filter(part => part.length >= 4 && !weak.has(part))
  const fullStrong = new Set(fullParts.filter(part => part.length >= 4 && !weak.has(part)))
  return shortStrong.some(part => fullStrong.has(part))
}

export function getSharedUfcSignalBoardCacheKey(eventId: string): string {
  return `ufc:shared-signal-board:v${SHARED_UFC_SIGNAL_SCHEMA_VERSION}:${eventId}`
}

function matchFight(event: UFCEvent, leg: UfcComboLeg): UFCFight | null {
  const byId = event.fights.find(fight => String(fight.id) === String(leg.fightId))
  if (byId) return byId
  return event.fights.find(fight => {
    const matchup = `${fight.fighterA.name} ${fight.fighterB.name}`
    return nameMatches(leg.fighter, fight.fighterA.name)
      || nameMatches(leg.fighter, fight.fighterB.name)
      || leg.matchup.split(/\s+vs\.?\s+/i).every(name => matchup.toLowerCase().includes(name.toLowerCase().split(' ').slice(-1)[0] || ''))
  }) || null
}

function resultLabelForFight(fight: UFCFight, outcome: UfcSignalLegOutcome): string {
  if (outcome === 'pending') return fight.statusDetail || 'Fight pending'
  if (!fight.result?.winner) return 'Final result unavailable'
  const method = fight.result.method ? ` · ${fight.result.method}` : ''
  const round = fight.result.round ? ` · R${fight.result.round}${fight.result.time ? ` ${fight.result.time}` : ''}` : ''
  return `${outcome === 'won' ? 'WIN' : 'LOSS'} · Winner: ${fight.result.winner}${method}${round}`
}

function resolveLegOutcome(leg: UfcComboLeg, event: UFCEvent, nowIso: string): UfcSettledSignalLeg {
  const fight = matchFight(event, leg)
  if (!fight || fight.status !== 'post') {
    return { ...leg, outcome: 'pending', resultLabel: fight?.statusDetail || 'Awaiting fight result' }
  }
  if (!fight.result?.winner) {
    return { ...leg, outcome: 'unknown', settledAt: nowIso, resultLabel: resultLabelForFight(fight, 'unknown') }
  }
  const won = nameMatches(leg.fighter, fight.result.winner)
  const outcome: UfcSignalLegOutcome = won ? 'won' : 'lost'
  return {
    ...leg,
    outcome,
    settledAt: nowIso,
    resultLabel: resultLabelForFight(fight, outcome),
    winner: fight.result.winner,
  }
}

function scoreCardOutcome(legs: UfcSettledSignalLeg[]): UfcSettledSignalCard['outcome'] {
  if (legs.some(leg => leg.outcome === 'lost')) return 'lost'
  if (legs.some(leg => leg.outcome === 'pending')) return 'pending'
  if (legs.some(leg => leg.outcome === 'unknown')) return 'unknown'
  return 'won'
}

function settleCards(cards: UfcComboCard[] | UfcSettledSignalCard[], event: UFCEvent, nowIso: string): UfcSettledSignalCard[] {
  return cards.map(card => {
    const legs = card.legs.map(leg => resolveLegOutcome(leg, event, nowIso))
    const record = legs.reduce((acc, leg) => {
      acc[leg.outcome] += 1
      return acc
    }, { won: 0, lost: 0, pending: 0, unknown: 0 })
    return {
      ...card,
      legs,
      record,
      outcome: scoreCardOutcome(legs),
    }
  })
}

function buildHistory(cards: UfcSettledSignalCard[], previous: UfcSignalHistoryEntry[], capturedAt: string, nowIso: string): UfcSignalHistoryEntry[] {
  const previousById = new Map(previous.map(row => [row.id, row]))
  return cards.flatMap(card => card.legs.map((leg, index) => {
    const id = `${card.id}:${leg.ticker}`
    const prior = previousById.get(id)
    const resultLabel = leg.resultLabel || prior?.resultLabel || 'Awaiting fight result'
    return {
      id,
      cardId: card.id,
      cardLabel: card.label,
      legNumber: index + 1,
      fightId: leg.fightId,
      matchup: leg.matchup,
      fighter: leg.fighter,
      ticker: leg.ticker,
      capturedAt: prior?.capturedAt || capturedAt,
      outcome: leg.outcome,
      updatedAt: leg.outcome !== prior?.outcome || resultLabel !== prior?.resultLabel ? nowIso : prior?.updatedAt || nowIso,
      resultLabel,
      winner: leg.winner || prior?.winner,
    }
  }))
}

export function updateSharedUfcSignalBoardOutcomes(board: UfcSharedSignalBoard, event: UFCEvent, now = new Date()): UfcSharedSignalBoard {
  const nowIso = now.toISOString()
  const cards = settleCards(board.cards, event, nowIso)
  const history = buildHistory(cards, board.history || [], board.capturedAt, nowIso)
  const allSettled = cards.length > 0 && cards.every(card => card.legs.every(leg => leg.outcome !== 'pending'))
  return {
    ...board,
    eventName: event.name,
    eventDate: event.date,
    updatedAt: nowIso,
    status: allSettled || event.status === 'post' ? 'settled' : 'captured',
    cards,
    history,
  }
}

export function createSharedUfcSignalBoard(event: UFCEvent, cards: UfcComboCard[], now = new Date()): UfcSharedSignalBoard {
  const nowIso = now.toISOString()
  const settledCards = settleCards(cards, event, nowIso)
  const board: UfcSharedSignalBoard = {
    schemaVersion: SHARED_UFC_SIGNAL_SCHEMA_VERSION,
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    capturedAt: nowIso,
    updatedAt: nowIso,
    status: 'captured',
    source: 'shared-cache',
    cards: settledCards,
    history: [],
  }
  return updateSharedUfcSignalBoardOutcomes(board, event, now)
}

export async function getOrCreateSharedUfcSignalBoard(event: UFCEvent, inputs: { kalshiFights: Parameters<typeof buildUfcComboCards>[0]; analysisFights: Parameters<typeof buildUfcComboCards>[1] }): Promise<UfcSharedSignalBoard> {
  const key = getSharedUfcSignalBoardCacheKey(event.id)
  const cached = await getJsonCache<UfcSharedSignalBoard>(key)
  if (cached?.schemaVersion === SHARED_UFC_SIGNAL_SCHEMA_VERSION && cached.eventId === event.id) {
    const updated = updateSharedUfcSignalBoardOutcomes(cached, event)
    await setJsonCache(key, updated, SHARED_UFC_SIGNAL_TTL_MS)
    return updated
  }

  const cards = buildUfcComboCards(inputs.kalshiFights, inputs.analysisFights)
  const board = createSharedUfcSignalBoard(event, cards)
  await setJsonCache(key, board, SHARED_UFC_SIGNAL_TTL_MS)
  return board
}
