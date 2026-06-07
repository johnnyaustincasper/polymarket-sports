import { describe, expect, it } from 'vitest'
import { buildFallbackFightAnalysis, getFightAnalysisQuality, sanitizeFightAnalysis, summarizeFinishingProfile, type UFCFighterRecentFight } from './deep-analysis'
import type { UFCEvent, UFCFight } from './events'

const fight: UFCFight = {
  id: 'fight1',
  boutOrder: 1,
  isMainEvent: true,
  weightClass: 'Welterweight',
  isTitleFight: false,
  status: 'pre',
  statusDetail: 'Scheduled',
  fighterA: { id: 'a', name: 'Alex Silva', record: '12-1', ranking: null, country: '🇺🇸', age: 30, height: '6\'0"', reach: '74"', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
  fighterB: { id: 'b', name: 'Ben Cruz', record: '10-2', ranking: 8, country: '🇧🇷', age: 28, height: '5\'10"', reach: '70"', strikingAccuracy: null, takedownAccuracy: null, recentForm: [] },
  moneyLineA: -140,
  moneyLineB: 120,
  polyOdds: { fighterAWin: 0.58, fighterBWin: 0.42, hasWinner: true, totalLine: null, overOdds: null, underOdds: null, hasTotal: false, koTkoOdds: null, submissionOdds: null, goDistanceOdds: null, polyWinnerUrl: null, polyTotalUrl: null },
}
const event: UFCEvent = { id: 'event1', name: 'UFC Test', date: '2026-07-01T00:00:00Z', venue: '', location: '', status: 'pre', fights: [fight] }

describe('UFC deep analysis reducer', () => {
  it('counts last-five finishing methods', () => {
    const profile = summarizeFinishingProfile([
      { method: 'KO/TKO', result: 'win' },
      { method: 'Submission', result: 'win' },
      { method: 'Unanimous Decision', result: 'loss' },
      { method: 'Split Decision', result: 'win' },
      { method: 'unknown', result: 'unknown' },
    ] as UFCFighterRecentFight[])

    expect(profile).toMatchObject({ koTko: 1, submission: 1, decision: 2, unknown: 1 })
    expect(profile.summary).toContain('1 KO/TKO')
  })

  it('fallback is honest and never stronger than lean', () => {
    const analysis = buildFallbackFightAnalysis(fight, {
      primaryLean: 'Alex Silva 66%',
      marketRead: 'Alex Silva is the market lean.',
      finishRead: 'No clean finish/distance lean yet.',
      redFlags: ['Thin size'],
      recommendedLooks: [],
    }, event)

    expect(['pass', 'lean']).toContain(analysis.ai.confidence)
    expect(analysis.fighterA.lastFive).toEqual([])
    expect(analysis.ai.thesis).toContain('fallback')
  })

  it('sanitizer trims bullets/angles and preserves actual fighter names', () => {
    const raw = {
      fighterA: { name: 'Wrong A', lastFive: [{ method: 'KO/TKO' }, { method: 'Decision' }, { method: 'Submission' }, { method: 'Decision' }, { method: 'Other' }, { method: 'Extra' }] },
      fighterB: { name: 'Wrong B' },
      ai: { confidence: 'strong', why: ['1', '2', '3', '4', '5'], risks: ['a', 'b', 'c', 'd', 'e'], watchouts: ['w1', 'w2', 'w3', 'w4', 'w5'] },
      bettingAngles: [
        { label: 'a', marketType: 'moneyline', side: 'A', rationale: 'r', maxRisk: 'small' },
        { label: 'b', marketType: 'method', side: 'B', rationale: 'r', maxRisk: 'normal' },
        { label: 'c', marketType: 'distance', side: 'C', rationale: 'r', maxRisk: 'avoid' },
        { label: 'd', marketType: 'rounds', side: 'D', rationale: 'r', maxRisk: 'small' },
      ],
    }

    const analysis = sanitizeFightAnalysis(raw as any, fight, event)
    expect(analysis.fighterA.name).toBe('Alex Silva')
    expect(analysis.fighterB.name).toBe('Ben Cruz')
    expect(analysis.eventId).toBe('event1')
    expect(analysis.eventName).toBe('UFC Test')
    expect(analysis.eventDate).toBe('2026-07-01T00:00:00Z')
    expect(analysis.ai.why).toHaveLength(4)
    expect(analysis.ai.risks).toHaveLength(4)
    expect(analysis.bettingAngles).toHaveLength(3)
    expect(analysis.fighterA.lastFive).toHaveLength(5)
  })

  it('sanitizer ignores AI-supplied event metadata when trusted event is provided', () => {
    const analysis = sanitizeFightAnalysis({ eventId: 'wrong', eventName: 'Wrong Card', eventDate: '2030-01-01T00:00:00Z' } as any, fight, event)
    expect(analysis.eventId).toBe(event.id)
    expect(analysis.eventName).toBe(event.name)
    expect(analysis.eventDate).toBe(event.date)
  })

  it('flags parseable but sourceless/empty AI output as incomplete', () => {
    const analysis = sanitizeFightAnalysis({
      ai: { confidence: 'strong', pick: 'Alex Silva', thesis: '', why: [], risks: [] },
      sources: [],
      bettingAngles: [],
    } as any, fight, event)
    const quality = getFightAnalysisQuality(analysis)
    expect(quality.complete).toBe(false)
    expect(quality.reasons.join(' ')).toContain('sources')
    expect(quality.reasons.join(' ')).toContain('high confidence')
  })
})
