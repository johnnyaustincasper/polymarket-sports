import { describe, expect, it } from 'vitest'
import { buildUFCEventDeepAnalysis, getCachedUFCEventAnalysis, getUFCAnalysisCacheKey, setCachedUFCEventAnalysis } from './deep-analysis-service'
import type { UFCEvent, UFCFight } from './events'
import type { UFCEventDeepAnalysis } from './deep-analysis'
import { buildFallbackFightAnalysis } from './deep-analysis'

const fight: UFCFight = {
  id: 'fight1', boutOrder: 1, isMainEvent: true, weightClass: 'Welterweight', isTitleFight: false, status: 'pre', statusDetail: '',
  fighterA: { id: 'a', name: 'Alex Silva', record: '12-1', ranking: null, country: '', age: 30, height: '', reach: '', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
  fighterB: { id: 'b', name: 'Ben Cruz', record: '10-2', ranking: null, country: '', age: 28, height: '', reach: '', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
  moneyLineA: -150, moneyLineB: 130,
  polyOdds: { fighterAWin: null, fighterBWin: null, hasWinner: false, totalLine: null, overOdds: null, underOdds: null, hasTotal: false, koTkoOdds: null, submissionOdds: null, goDistanceOdds: null, polyWinnerUrl: null, polyTotalUrl: null },
}
const event: UFCEvent = { id: `event-${Date.now()}`, name: 'UFC Test', date: '2026-07-01T00:00:00Z', venue: '', location: '', status: 'pre', fights: [fight] }

function cached(id: string, cachedEvent?: UFCEvent): UFCEventDeepAnalysis {
  const sourceEvent = cachedEvent || { ...event, id, name: 'Cached', date: '2026-01-01T00:00:00Z' }
  return {
    schemaVersion: 2,
    eventId: id,
    eventName: sourceEvent.name,
    eventDate: sourceEvent.date,
    generatedAt: new Date().toISOString(),
    status: 'complete',
    fights: sourceEvent.fights.map(sourceFight => buildFallbackFightAnalysis(sourceFight, undefined, sourceEvent)),
    cardSummary: { headline: 'cached', bestLooks: [], fadeTheHype: [], passFights: [] },
  }
}

describe('UFC deep analysis service', () => {
  it('cache key includes schema version', () => {
    expect(getUFCAnalysisCacheKey('abc')).toBe('ufc:deep-analysis:v2:abc')
  })

  it('writes and reads cached analysis', async () => {
    const analysis = cached(`${event.id}-cache`)
    await setCachedUFCEventAnalysis(analysis.eventId, analysis)
    await expect(getCachedUFCEventAnalysis(analysis.eventId)).resolves.toMatchObject({ eventId: analysis.eventId, status: 'complete' })
  })

  it('marks cached analysis stale when event metadata/fight ids or staleAfter do not match current card', async () => {
    const currentEvent = { ...event, id: `${event.id}-validate` }
    const stale = cached(currentEvent.id, currentEvent)
    stale.fights[0].staleAfter = '2020-01-01T00:00:00Z'
    await setCachedUFCEventAnalysis(stale.eventId, stale)
    await expect(getCachedUFCEventAnalysis(stale.eventId, currentEvent)).resolves.toMatchObject({ status: 'stale' })

    const wrongCard = cached(`${event.id}-wrong-card`, { ...currentEvent, id: `${event.id}-wrong-card` })
    await setCachedUFCEventAnalysis(wrongCard.eventId, wrongCard)
    await expect(getCachedUFCEventAnalysis(wrongCard.eventId, { ...currentEvent, id: wrongCard.eventId, date: '2026-08-01T00:00:00Z' })).resolves.toMatchObject({ status: 'stale' })
  })

  it('returns existing fresh cache unless force=true', async () => {
    const cachedEvent = { ...event, id: `${event.id}-existing` }
    const analysis = cached(cachedEvent.id, cachedEvent)
    await setCachedUFCEventAnalysis(analysis.eventId, analysis)
    const fromCache = await buildUFCEventDeepAnalysis(cachedEvent, { researchFight: async () => { throw new Error('should not run') } })
    expect(fromCache.cardSummary.headline).toBe('cached')

    const rebuilt = await buildUFCEventDeepAnalysis(cachedEvent, {
      force: true,
      save: false,
      researchFight: async () => ({ available: false, data: null, error: 'ai failed' }),
    })
    expect(rebuilt.eventName).toBe('UFC Test')
    expect(rebuilt.status).toBe('partial')
  })

  it('downgrades parseable but unsupported AI research and marks card partial', async () => {
    const analysis = await buildUFCEventDeepAnalysis({ ...event, id: `${event.id}-unsupported-ai` }, {
      force: true,
      save: false,
      researchFight: async () => ({
        available: true,
        provider: 'anthropic',
        model: 'claude-test',
        data: { ai: { pick: 'Alex Silva', method: 'unknown', roundOrTiming: 'unknown', confidence: 'strong', thesisType: 'market_too_thin', thesis: '', profileLayer: '', matchupLayer: '', marketEdgeLayer: '', marketRead: '', whyMarketMayBeWrong: [], killSwitch: [], why: [], risks: [], watchouts: [] }, sources: [], bettingAngles: [] },
      }),
    })
    expect(analysis.status).toBe('partial')
    expect(analysis.fights[0].ai.confidence).toBe('lean')
    expect(analysis.fights[0].ai.pick).not.toBe('pass')
    expect(analysis.fights[0].ai.thesis).toContain('Validation downgrade')
  })
})
