import { describe, expect, it } from 'vitest'
import { buildUFCFightResearchPrompt, classifyFightThesis, parseUFCResearchJson } from './deep-analysis-ai'
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

  it('prompt requires unique market thesis fields', () => {
    const prompt = buildUFCFightResearchPrompt(fight, event, { market: 'test' }).toLowerCase()
    for (const term of ['thesistype', 'why the market might be wrong', 'profilelayer', 'matchuplayer', 'marketedgelayer', 'marketread', 'whymarketmaybewrong', 'killswitch', 'chalk_tax', 'grappling_path', 'early_ko_chaos']) {
      expect(prompt).toContain(term)
    }
  })

  it('classifies live underdog power as early_ko_chaos', () => {
    const dogFight = {
      ...fight,
      polyOdds: { ...fight.polyOdds, hasWinner: true, fighterAWin: 0.72, fighterBWin: 0.28 },
    }
    const thesis = classifyFightThesis(
      dogFight,
      'Ben Cruz',
      'Alex Silva',
      { fightingStyle: 'boxing power', lastFive: [{ result: 'win', method: 'KO/TKO', notes: 'knockout power' }] as any },
      { fightingStyle: 'kickboxing' },
    )
    expect(thesis.thesisType).toBe('early_ko_chaos')
    expect(thesis.whyMarketMayBeWrong.join(' ').toLowerCase()).toContain('first-round')
    expect(thesis.killSwitch.length).toBeGreaterThan(0)
  })

  it('classifies expensive favorite risk as chalk_tax', () => {
    const chalkFight = {
      ...fight,
      polyOdds: { ...fight.polyOdds, hasWinner: true, fighterAWin: 0.3, fighterBWin: 0.7 },
    }
    const thesis = classifyFightThesis(
      chalkFight,
      'Alex Silva',
      'Ben Cruz',
      { fightingStyle: 'well-rounded' },
      { fightingStyle: 'boxing' },
    )
    expect(thesis.thesisType).toBe('chalk_tax')
    expect(thesis.marketEdgeLayer.toLowerCase()).toContain('chalk')
  })
})
