import { getJsonCache, setJsonCache } from '../durable-cache'
import { buildFallbackFightAnalysis, downgradeUnsupportedFightAnalysis, getFightAnalysisQuality, sanitizeFightAnalysis, type UFCEventDeepAnalysis, type UFCFightDeepAnalysis } from './deep-analysis'
import { fetchUFCEvents, type UFCEvent, type UFCFight } from './events'
import { researchUFCFightWithAi } from './deep-analysis-ai'
import type { KalshiUFCFightIntel } from './kalshi-fight-intel'

const UFC_DEEP_ANALYSIS_TTL_MS = 10 * 24 * 60 * 60_000

export function getUFCAnalysisCacheKey(eventId: string): string {
  return `ufc:deep-analysis:v1:${eventId}`
}

function isExpiredIso(value: string | undefined, now = Date.now()): boolean {
  if (!value) return true
  const time = new Date(value).getTime()
  return !Number.isFinite(time) || time <= now
}

function isInvalidIso(value: string | undefined): boolean {
  if (!value) return true
  return !Number.isFinite(new Date(value).getTime())
}

export function validateCachedUFCEventAnalysis(analysis: UFCEventDeepAnalysis, event?: UFCEvent): UFCEventDeepAnalysis {
  const staleReasons: string[] = []
  if (analysis.schemaVersion !== 1) staleReasons.push('schema version mismatch')
  if (isInvalidIso(analysis.generatedAt)) staleReasons.push('invalid generatedAt')
  if (analysis.fights.some(fight => isExpiredIso(fight.staleAfter))) staleReasons.push('fight staleAfter expired/invalid')
  if (event) {
    if (analysis.eventId !== event.id) staleReasons.push('event id mismatch')
    if (analysis.eventName !== event.name) staleReasons.push('event name mismatch')
    if (analysis.eventDate !== event.date) staleReasons.push('event date mismatch')
    const currentFightIds = new Set(event.fights.map(fight => fight.id))
    const cachedFightIds = new Set(analysis.fights.map(fight => fight.fightId))
    if (currentFightIds.size !== cachedFightIds.size) staleReasons.push('fight count mismatch')
    for (const fightId of Array.from(currentFightIds)) if (!cachedFightIds.has(fightId)) staleReasons.push(`missing current fight ${fightId}`)
    for (const fight of analysis.fights) {
      if (fight.eventId !== event.id || fight.eventName !== event.name || fight.eventDate !== event.date) staleReasons.push(`fight metadata mismatch ${fight.fightId}`)
    }
  }
  return staleReasons.length ? { ...analysis, status: 'stale' } : analysis
}

export async function getCachedUFCEventAnalysis(eventId: string, event?: UFCEvent): Promise<UFCEventDeepAnalysis | null> {
  const cached = await getJsonCache<UFCEventDeepAnalysis>(getUFCAnalysisCacheKey(eventId))
  return cached ? validateCachedUFCEventAnalysis(cached, event) : null
}

export async function setCachedUFCEventAnalysis(eventId: string, analysis: UFCEventDeepAnalysis): Promise<void> {
  await setJsonCache(getUFCAnalysisCacheKey(eventId), analysis, UFC_DEEP_ANALYSIS_TTL_MS)
}

export async function getNextUFCEventForAnalysis(events?: UFCEvent[]): Promise<UFCEvent | null> {
  const list = events || await fetchUFCEvents()
  const actionable = list.filter(event => event.status !== 'post')
  return actionable.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || list[0] || null
}

type ResearchFn = typeof researchUFCFightWithAi

export interface BuildUFCEventDeepAnalysisOptions {
  force?: boolean
  kalshiIntelByFightId?: Record<string, KalshiUFCFightIntel | undefined>
  researchFight?: ResearchFn
  save?: boolean
}

function buildMarketContext(fight: UFCFight, kalshiIntel?: KalshiUFCFightIntel) {
  return {
    espnMoneyLine: { [fight.fighterA.name]: fight.moneyLineA, [fight.fighterB.name]: fight.moneyLineB },
    polymarket: fight.polyOdds,
    kalshiIntel,
  }
}

function summarizeCard(event: UFCEvent, fights: UFCFightDeepAnalysis[]): UFCEventDeepAnalysis['cardSummary'] {
  const bestLooks = fights
    .flatMap(fight => fight.bettingAngles.map(angle => `${fight.fighterA.name} vs ${fight.fighterB.name}: ${angle.label} — ${angle.side}`))
    .filter(line => !/pass/i.test(line))
    .slice(0, 4)
  const passFights = fights
    .filter(fight => fight.ai.confidence === 'pass' || fight.bettingAngles.some(angle => angle.marketType === 'pass'))
    .map(fight => `${fight.fighterA.name} vs ${fight.fighterB.name}`)
    .slice(0, 4)
  const fadeTheHype = fights
    .flatMap(fight => [fight.fighterA, fight.fighterB]
      .filter(fighter => fighter.hype.possibleMarketDistortion && fighter.hype.possibleMarketDistortion !== 'unknown')
      .map(fighter => `${fighter.name}: ${fighter.hype.possibleMarketDistortion}`))
    .slice(0, 4)
  return {
    headline: `${event.name}: ${fights.length} fight deep-analysis snapshot`,
    bestLooks,
    fadeTheHype,
    passFights,
  }
}

export async function buildUFCEventDeepAnalysis(event: UFCEvent, options: BuildUFCEventDeepAnalysisOptions = {}): Promise<UFCEventDeepAnalysis> {
  if (!options.force) {
    const cached = await getCachedUFCEventAnalysis(event.id, event)
    if (cached && cached.status !== 'stale') return cached
  }

  const generatedAt = new Date().toISOString()
  const researchFight = options.researchFight || researchUFCFightWithAi
  const fights: UFCFightDeepAnalysis[] = []
  let usedFallback = false

  for (const fight of event.fights) {
    const kalshiIntel = options.kalshiIntelByFightId?.[fight.id]
    const fallback = buildFallbackFightAnalysis(fight, kalshiIntel, event)
    try {
      const research = await researchFight(fight, event, buildMarketContext(fight, kalshiIntel))
      if (research.available && research.data) {
        const sanitized = sanitizeFightAnalysis({
          ...fallback,
          ...research.data,
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          market: { ...fallback.market, ...research.data.market },
          ai: { ...fallback.ai, ...research.data.ai },
          sources: research.data.sources || [],
        }, fight, event)
        const quality = getFightAnalysisQuality(sanitized)
        if (!quality.complete) usedFallback = true
        fights.push(quality.complete ? sanitized : downgradeUnsupportedFightAnalysis(sanitized, quality.reasons))
      } else {
        usedFallback = true
        fights.push(fallback)
      }
    } catch {
      usedFallback = true
      fights.push(fallback)
    }
  }

  const analysis: UFCEventDeepAnalysis = {
    schemaVersion: 1,
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    generatedAt,
    status: usedFallback ? 'partial' : 'complete',
    fights,
    cardSummary: summarizeCard(event, fights),
  }

  if (options.save !== false) await setCachedUFCEventAnalysis(event.id, analysis)
  return analysis
}
