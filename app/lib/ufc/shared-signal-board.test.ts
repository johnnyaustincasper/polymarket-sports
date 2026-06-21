import { describe, expect, it } from 'vitest'
import { createSharedUfcSignalBoard, updateSharedUfcSignalBoardOutcomes } from './shared-signal-board'
import type { UfcComboCard } from './fight-combo-cards'
import type { UFCEvent } from './events'

const baseCard: UfcComboCard = {
  id: 'smart-two',
  label: 'Smart 2-leg',
  title: 'Shared card',
  payoutLabel: '2.5x est. gross return',
  estimatedReturn: 2.5,
  risk: 'Balanced',
  thesis: 'Captured once.',
  legs: [
    { fightId: 'fight-1', matchup: 'A Fighter vs B Fighter', fighter: 'A Fighter', price: 58, available: 1000, ticker: 'KXUFC-A', confidence: 'solid', statisticalWhy: 'read', risk: 'risk' },
    { fightId: 'fight-2', matchup: 'C Fighter vs D Fighter', fighter: 'D Fighter', price: 62, available: 1000, ticker: 'KXUFC-D', confidence: 'lean', statisticalWhy: 'read', risk: 'risk' },
  ],
}

function event(status: UFCEvent['status'], fightStatuses: Array<'pre' | 'in' | 'post'>, winners: Array<string | undefined>): UFCEvent {
  return {
    id: 'event-1',
    name: 'UFC Test Card',
    date: '2026-06-21T00:00:00.000Z',
    venue: '',
    location: '',
    status,
    fights: [
      {
        id: 'fight-1', boutOrder: 1, isMainEvent: false, weightClass: 'Lightweight', isTitleFight: false,
        status: fightStatuses[0], statusDetail: fightStatuses[0] === 'post' ? 'Final' : 'Scheduled',
        fighterA: { id: 'a', name: 'A Fighter', record: '', ranking: null, country: '', age: null, height: '', reach: '', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
        fighterB: { id: 'b', name: 'B Fighter', record: '', ranking: null, country: '', age: null, height: '', reach: '', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
        moneyLineA: null, moneyLineB: null,
        polyOdds: { fighterAWin: null, fighterBWin: null, hasWinner: false, totalLine: null, overOdds: null, underOdds: null, hasTotal: false, koTkoOdds: null, submissionOdds: null, goDistanceOdds: null, polyWinnerUrl: null, polyTotalUrl: null },
        result: winners[0] ? { winner: winners[0], method: 'Decision', round: 3, time: '5:00' } : undefined,
      },
      {
        id: 'fight-2', boutOrder: 2, isMainEvent: false, weightClass: 'Welterweight', isTitleFight: false,
        status: fightStatuses[1], statusDetail: fightStatuses[1] === 'post' ? 'Final' : 'Scheduled',
        fighterA: { id: 'c', name: 'C Fighter', record: '', ranking: null, country: '', age: null, height: '', reach: '', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
        fighterB: { id: 'd', name: 'D Fighter', record: '', ranking: null, country: '', age: null, height: '', reach: '', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
        moneyLineA: null, moneyLineB: null,
        polyOdds: { fighterAWin: null, fighterBWin: null, hasWinner: false, totalLine: null, overOdds: null, underOdds: null, hasTotal: false, koTkoOdds: null, submissionOdds: null, goDistanceOdds: null, polyWinnerUrl: null, polyTotalUrl: null },
        result: winners[1] ? { winner: winners[1], method: 'KO/TKO', round: 2, time: '1:20' } : undefined,
      },
    ],
  }
}

describe('shared UFC signal board', () => {
  it('captures a single board and keeps pending legs until fights finish', () => {
    const board = createSharedUfcSignalBoard(event('pre', ['pre', 'pre'], [undefined, undefined]), [baseCard], new Date('2026-06-21T12:00:00Z'))
    expect(board.cards[0].record).toEqual({ won: 0, lost: 0, pending: 2, unknown: 0 })
    expect(board.history).toHaveLength(2)
    expect(board.status).toBe('captured')
  })

  it('updates leg win/loss history without rebuilding the captured signal', () => {
    const board = createSharedUfcSignalBoard(event('pre', ['pre', 'pre'], [undefined, undefined]), [baseCard], new Date('2026-06-21T12:00:00Z'))
    const updated = updateSharedUfcSignalBoardOutcomes(board, event('post', ['post', 'post'], ['A Fighter', 'C Fighter']), new Date('2026-06-22T04:00:00Z'))
    expect(updated.cards[0].record).toEqual({ won: 1, lost: 1, pending: 0, unknown: 0 })
    expect(updated.cards[0].outcome).toBe('lost')
    expect(updated.history.map(row => row.outcome)).toEqual(['won', 'lost'])
    expect(updated.history[0].capturedAt).toBe(board.capturedAt)
    expect(updated.status).toBe('settled')
  })
})
