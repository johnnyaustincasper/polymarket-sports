import { describe, expect, it } from 'vitest'
import { buildUFCFightResearchPrompt, parseUFCResearchJson } from './deep-analysis-ai'
import type { UFCEvent, UFCFight } from './events'

const fight: UFCFight = {
  id: 'fight1', boutOrder: 1, isMainEvent: true, weightClass: 'Featherweight', isTitleFight: false, status: 'pre', statusDetail: '',
  fighterA: { id: 'a', name: 'Alex Silva', record: '12-1', ranking: null, country: '', age: 30, height: '', reach: '', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
  fighterB: { id: 'b', name: 'Ben Cruz', record: '10-2', ranking: null, country: '', age: 28, height: '', reach: '', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
  moneyLineA: null, moneyLineB: null,
  polyOdds: { fighterAWin: null, fighterBWin: null, hasWinner: false, totalLine: null, overOdds: null, underOdds: null, hasTotal: false, koTkoOdds: null, submissionOdds: null, goDistanceOdds: null, polyWinnerUrl: null, polyTotalUrl: null },
}
const event: UFCEvent = { id: 'event1', name: 'UFC Test', date: '2026-07-01T00:00:00Z', venue: '', location: '', status: 'pre', fights: [fight] }

describe('UFC deep analysis AI helpers', () => {
  it('parses clean JSON', () => {
    const parsed = parseUFCResearchJson('{"ai":{"pick":"Alex Silva"}}')
    expect(parsed.available).toBe(true)
    if (parsed.available) expect(parsed.data.ai?.pick).toBe('Alex Silva')
  })

  it('parses fenced JSON', () => {
    const parsed = parseUFCResearchJson('```json\n{"sources":["espn"]}\n```')
    expect(parsed.available).toBe(true)
    if (parsed.available) expect(parsed.data.sources).toEqual(['espn'])
  })

  it('returns unavailable fallback for malformed output', () => {
    const parsed = parseUFCResearchJson('not json')
    expect(parsed.available).toBe(false)
    if (!parsed.available) expect(parsed.error).toBeTruthy()
  })

  it('prompt includes both names and required research terms', () => {
    const prompt = buildUFCFightResearchPrompt(fight, event, { market: 'test' }).toLowerCase()
    for (const term of ['alex silva', 'ben cruz', 'last 5', 'hype', 'beef', 'last fight', 'expected winner', 'method', 'unknown']) {
      expect(prompt).toContain(term)
    }
  })
})
