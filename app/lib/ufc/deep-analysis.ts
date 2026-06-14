import type { KalshiUFCFightIntel } from './kalshi-fight-intel'
import type { UFCEvent, UFCFight } from './events'

export interface UFCFighterRecentFight {
  opponent: string
  date: string
  result: 'win' | 'loss' | 'draw' | 'no_contest' | 'unknown'
  method: string
  round: number | null
  time: string
  notes: string
}

export interface UFCFighterDossier {
  name: string
  record: string
  age: number | null
  height: string
  reach: string
  stance?: string
  style?: string
  fightingStyle?: string
  country: string
  ranking: number | null
  lastFightSummary: string
  lastFive: UFCFighterRecentFight[]
  finishingProfile: {
    koTko: number
    submission: number
    decision: number
    unknown: number
    summary: string
  }
  strengths: string[]
  concerns: string[]
  hype: {
    level: 'low' | 'medium' | 'high'
    why: string[]
    possibleMarketDistortion: string
  }
  narrative: {
    beefOrStory: string
    campNews: string
    injuryOrLayoffNotes: string
  }
}

export interface UFCFightDeepAnalysis {
  fightId: string
  eventId: string
  eventName: string
  eventDate: string
  weightClass: string
  isMainEvent: boolean
  fighterA: UFCFighterDossier
  fighterB: UFCFighterDossier
  market: {
    expectedWinner: string
    expectedMethod: string
    kalshiLean?: string
    polymarketLean?: string
    priceNotes: string[]
  }
  ai: {
    pick: string
    method: string
    roundOrTiming: string
    confidence: 'pass' | 'lean' | 'solid' | 'strong'
    thesis: string
    why: string[]
    risks: string[]
    watchouts: string[]
  }
  bettingAngles: Array<{
    label: string
    marketType: 'moneyline' | 'method' | 'distance' | 'rounds' | 'pass'
    side: string
    rationale: string
    maxRisk: 'small' | 'normal' | 'avoid'
  }>
  generatedAt: string
  sources: string[]
  staleAfter: string
}

export interface UFCEventDeepAnalysis {
  schemaVersion: 1
  eventId: string
  eventName: string
  eventDate: string
  generatedAt: string
  status: 'missing' | 'partial' | 'complete' | 'stale'
  fights: UFCFightDeepAnalysis[]
  cardSummary: {
    headline: string
    bestLooks: string[]
    fadeTheHype: string[]
    passFights: string[]
  }
}

type FinishProfile = UFCFighterDossier['finishingProfile']

type RawFightAnalysis = Partial<UFCFightDeepAnalysis> & {
  fighterA?: Partial<UFCFighterDossier>
  fighterB?: Partial<UFCFighterDossier>
}

function cleanString(value: unknown, fallback = 'unknown'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function cleanStringArray(value: unknown, max: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map(item => cleanString(item, ''))
    .filter(Boolean)
    .slice(0, max)
}

function normalizeFighterName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function deriveFightingStyle(dossier: Partial<UFCFighterDossier>, fighterName: string): string {
  const direct = cleanString(dossier.fightingStyle || dossier.style, '')
  if (direct && !/^(orthodox|southpaw|switch)$/i.test(direct)) return direct
  const known: Record<string, string> = {
    'justin gaethje': 'Brawler / wrestling base',
    'ilia topuria': 'Boxing / BJJ',
    'charles oliveira': 'BJJ / submission grappler',
    'islam makhachev': 'Sambo / wrestling',
    'khabib nurmagomedov': 'Sambo / wrestling',
    'alex pereira': 'Kickboxing / Muay Thai',
    'max holloway': 'Volume boxing',
    'paddy pimblett': 'BJJ / grappler',
  }
  const mapped = known[normalizeFighterName(fighterName)]
  if (mapped) return mapped
  const text = [
    ...(Array.isArray(dossier.strengths) ? dossier.strengths : []),
    ...(Array.isArray(dossier.lastFive) ? dossier.lastFive.map(f => f?.method || '') : []),
    dossier.finishingProfile?.summary || '',
  ].join(' ').toLowerCase()
  const tags: string[] = []
  if (/wrestl|grappl|sambo|takedown/.test(text)) tags.push(/sambo/.test(text) ? 'Sambo' : 'Wrestling')
  if (/bjj|jiu|submission|rear naked|armbar|choke/.test(text)) tags.push('BJJ')
  if (/muay|kickbox|kickboxing|thai|leg kick|head kick/.test(text)) tags.push(/muay/.test(text) ? 'Muay Thai' : 'Kickboxing')
  if (/box|strik|ko|tko|knockout|power|pressure|brawler/.test(text)) tags.push(/pressure|brawler/.test(text) ? 'Brawler' : 'Boxing')
  return Array.from(new Set(tags)).slice(0, 2).join(' / ')
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString()
}

function isMeaningful(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && value.trim().toLowerCase() !== 'unknown'
}

function classifyMethod(method: string): keyof Omit<FinishProfile, 'summary'> {
  const text = method.toLowerCase()
  if (text.includes('ko') || text.includes('tko') || text.includes('knockout')) return 'koTko'
  if (text.includes('sub')) return 'submission'
  if (text.includes('dec')) return 'decision'
  return 'unknown'
}

export function summarizeFinishingProfile(lastFive: UFCFighterRecentFight[]): FinishProfile {
  const counts = { koTko: 0, submission: 0, decision: 0, unknown: 0 }
  for (const fight of lastFive.slice(0, 5)) counts[classifyMethod(fight?.method || '')] += 1
  const parts = [
    counts.koTko ? `${counts.koTko} KO/TKO` : '',
    counts.submission ? `${counts.submission} submission` : '',
    counts.decision ? `${counts.decision} decision` : '',
    counts.unknown ? `${counts.unknown} unknown` : '',
  ].filter(Boolean)
  return { ...counts, summary: parts.length ? parts.join(', ') : 'No verified last-five finishes available.' }
}

function emptyDossier(fighter: UFCFight['fighterA'], note = 'No verified last-five fight log available from ESPN/market data.'): UFCFighterDossier {
  return {
    name: fighter.name || 'TBA',
    record: fighter.record || '',
    age: fighter.age,
    height: fighter.height || '',
    reach: fighter.reach || '',
    fightingStyle: deriveFightingStyle({}, fighter.name || 'TBA'),
    country: fighter.country || '',
    ranking: fighter.ranking,
    lastFightSummary: 'unknown',
    lastFive: [],
    finishingProfile: summarizeFinishingProfile([]),
    strengths: [],
    concerns: [note],
    hype: { level: 'low', why: [], possibleMarketDistortion: 'unknown' },
    narrative: { beefOrStory: 'unknown', campNews: 'unknown', injuryOrLayoffNotes: 'unknown' },
  }
}

function polymarketLean(fight: UFCFight): string | undefined {
  const { polyOdds } = fight
  if (!polyOdds?.hasWinner) return undefined
  const a = polyOdds.fighterAWin
  const b = polyOdds.fighterBWin
  if (a === null || b === null) return undefined
  const winner = a >= b ? fight.fighterA.name : fight.fighterB.name
  const pct = Math.round(Math.max(a, b) * 100)
  return `${winner} ${pct}% on Polymarket`
}

function espnMoneylineLean(fight: UFCFight): string | null {
  if (fight.moneyLineA === null || fight.moneyLineB === null) return null
  const winner = fight.moneyLineA <= fight.moneyLineB ? fight.fighterA.name : fight.fighterB.name
  return `${winner} by ESPN moneyline (${fight.moneyLineA}/${fight.moneyLineB})`
}

export function buildFallbackFightAnalysis(fight: UFCFight, kalshiIntel?: KalshiUFCFightIntel, event?: UFCEvent): UFCFightDeepAnalysis {
  const generatedAt = new Date().toISOString()
  const polyLean = polymarketLean(fight)
  const espnLean = espnMoneylineLean(fight)
  const expectedWinner = kalshiIntel?.primaryLean && !kalshiIntel.primaryLean.startsWith('No clear')
    ? kalshiIntel.primaryLean
    : polyLean || espnLean || 'unknown'
  const confidence: 'lean' = 'lean'
  const priceNotes = [kalshiIntel?.marketRead, kalshiIntel?.finishRead, polyLean, espnLean].filter(Boolean) as string[]
  const fallbackReason = kalshiIntel ? 'AI research unavailable; this is a matchup-context fallback using ESPN profile fields plus market context.' : 'Limited live research available; use a conservative matchup read from verified fighter profile fields.'
  const fallbackPick = expectedWinner !== 'unknown' ? expectedWinner : fight.fighterA.name

  return {
    fightId: fight.id,
    eventId: event?.id || '',
    eventName: event?.name || '',
    eventDate: event?.date || '',
    weightClass: fight.weightClass,
    isMainEvent: fight.isMainEvent,
    fighterA: emptyDossier(fight.fighterA),
    fighterB: emptyDossier(fight.fighterB),
    market: {
      expectedWinner,
      expectedMethod: kalshiIntel?.finishRead || 'unknown',
      kalshiLean: kalshiIntel?.primaryLean,
      polymarketLean: polyLean,
      priceNotes: priceNotes.slice(0, 4),
    },
    ai: {
      pick: fallbackPick,
      method: 'unknown',
      roundOrTiming: 'unknown',
      confidence,
      thesis: fallbackReason,
      why: priceNotes.slice(0, 4),
      risks: [fallbackReason, ...(kalshiIntel?.redFlags || [])].slice(0, 4),
      watchouts: ['Verify late injury/camp/weigh-in news before upgrading confidence.'],
    },
    bettingAngles: [{
      label: `${fallbackPick} conservative matchup edge`,
      marketType: 'moneyline',
      side: fallbackPick,
      rationale: fallbackReason,
      maxRisk: 'small',
    }],
    generatedAt,
    sources: ['ESPN UFC scoreboard', ...(kalshiIntel ? ['Kalshi market intel'] : []), ...(polyLean ? ['Polymarket Gamma'] : [])],
    staleAfter: addDaysIso(2),
  }
}

function sanitizeRecentFight(value: unknown): UFCFighterRecentFight {
  const raw = (value && typeof value === 'object') ? value as Partial<UFCFighterRecentFight> : {}
  const result = ['win', 'loss', 'draw', 'no_contest', 'unknown'].includes(String(raw.result)) ? raw.result as UFCFighterRecentFight['result'] : 'unknown'
  const round = typeof raw.round === 'number' && Number.isFinite(raw.round) ? raw.round : null
  return {
    opponent: cleanString(raw.opponent, 'unknown'),
    date: cleanString(raw.date, 'unknown'),
    result,
    method: cleanString(raw.method, 'unknown'),
    round,
    time: cleanString(raw.time, 'unknown'),
    notes: cleanString(raw.notes, 'unknown'),
  }
}

function sanitizeDossier(raw: unknown, fighter: UFCFight['fighterA']): UFCFighterDossier {
  const obj = (raw && typeof raw === 'object') ? raw as Partial<UFCFighterDossier> : {}
  const lastFive = (Array.isArray(obj.lastFive) ? obj.lastFive : []).slice(0, 5).map(sanitizeRecentFight)
  const finishingProfile = summarizeFinishingProfile(lastFive)
  const styleSeed: Partial<UFCFighterDossier> = { ...obj, lastFive, finishingProfile }
  return {
    name: fighter.name || cleanString(obj.name, 'TBA'),
    record: cleanString(obj.record, fighter.record || ''),
    age: typeof obj.age === 'number' ? obj.age : fighter.age,
    height: cleanString(obj.height, fighter.height || ''),
    reach: cleanString(obj.reach, fighter.reach || ''),
    stance: obj.stance,
    style: cleanString(obj.style, ''),
    fightingStyle: deriveFightingStyle(styleSeed, fighter.name || cleanString(obj.name, 'TBA')),
    country: cleanString(obj.country, fighter.country || ''),
    ranking: typeof obj.ranking === 'number' ? obj.ranking : fighter.ranking,
    lastFightSummary: cleanString(obj.lastFightSummary, 'unknown'),
    lastFive,
    finishingProfile,
    strengths: cleanStringArray(obj.strengths, 5),
    concerns: cleanStringArray(obj.concerns, 5),
    hype: {
      level: obj.hype?.level === 'high' || obj.hype?.level === 'medium' || obj.hype?.level === 'low' ? obj.hype.level : 'low',
      why: cleanStringArray(obj.hype?.why, 4),
      possibleMarketDistortion: cleanString(obj.hype?.possibleMarketDistortion, 'unknown'),
    },
    narrative: {
      beefOrStory: cleanString(obj.narrative?.beefOrStory, 'unknown'),
      campNews: cleanString(obj.narrative?.campNews, 'unknown'),
      injuryOrLayoffNotes: cleanString(obj.narrative?.injuryOrLayoffNotes, 'unknown'),
    },
  }
}

export function sanitizeFightAnalysis(raw: RawFightAnalysis, fight: UFCFight, event?: UFCEvent): UFCFightDeepAnalysis {
  const fallback = buildFallbackFightAnalysis(fight, undefined, event)
  const market = (raw.market || {}) as Partial<UFCFightDeepAnalysis['market']>
  const ai = (raw.ai || {}) as Partial<UFCFightDeepAnalysis['ai']>
  const confidence = ['solid', 'strong'].includes(String(ai.confidence)) ? ai.confidence as UFCFightDeepAnalysis['ai']['confidence'] : 'lean'
  const rawPick = cleanString(ai.pick, fallback.ai.pick)
  const safePick = rawPick.toLowerCase() === 'pass' ? fallback.ai.pick : rawPick
  const angles = Array.isArray(raw.bettingAngles) ? raw.bettingAngles : []
  return {
    ...fallback,
    ...raw,
    fightId: fight.id,
    eventId: event?.id || fallback.eventId,
    eventName: event?.name || fallback.eventName,
    eventDate: event?.date || fallback.eventDate,
    weightClass: fight.weightClass,
    isMainEvent: fight.isMainEvent,
    fighterA: sanitizeDossier(raw.fighterA, fight.fighterA),
    fighterB: sanitizeDossier(raw.fighterB, fight.fighterB),
    market: {
      expectedWinner: cleanString(market.expectedWinner, fallback.market.expectedWinner),
      expectedMethod: cleanString(market.expectedMethod, fallback.market.expectedMethod),
      kalshiLean: market.kalshiLean || fallback.market.kalshiLean,
      polymarketLean: market.polymarketLean || fallback.market.polymarketLean,
      priceNotes: cleanStringArray(market.priceNotes, 4),
    },
    ai: {
      pick: safePick,
      method: cleanString(ai.method, 'unknown'),
      roundOrTiming: cleanString(ai.roundOrTiming, 'unknown'),
      confidence,
      thesis: cleanString(ai.thesis, fallback.ai.thesis),
      why: cleanStringArray(ai.why, 4),
      risks: cleanStringArray(ai.risks, 4),
      watchouts: cleanStringArray(ai.watchouts, 4),
    },
    bettingAngles: angles.slice(0, 3).map(angle => ({
      label: cleanString(angle.label, `${safePick} matchup edge`).replace(/pass/ig, 'matchup watch'),
      marketType: ['moneyline', 'method', 'distance', 'rounds'].includes(String(angle.marketType)) ? angle.marketType : 'moneyline',
      side: cleanString(angle.side, safePick).toLowerCase() === 'pass' ? safePick : cleanString(angle.side, safePick),
      rationale: cleanString(angle.rationale, 'unknown'),
      maxRisk: ['small', 'normal', 'avoid'].includes(String(angle.maxRisk)) ? angle.maxRisk : 'avoid',
    })),
    sources: cleanStringArray(raw.sources, 8),
    generatedAt: cleanString(raw.generatedAt, fallback.generatedAt),
    staleAfter: cleanString(raw.staleAfter, fallback.staleAfter),
  }
}

export function getFightAnalysisQuality(analysis: UFCFightDeepAnalysis): { complete: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (!analysis.sources.some(isMeaningful)) reasons.push('missing meaningful sources')
  if (!isMeaningful(analysis.ai.thesis)) reasons.push('missing AI thesis')
  if (!analysis.ai.why.some(isMeaningful)) reasons.push('missing AI why bullets')
  if (!analysis.ai.risks.some(isMeaningful)) reasons.push('missing AI risk bullets')
  if (!analysis.bettingAngles.length) reasons.push('missing matchup angle')
  if ((analysis.ai.confidence === 'solid' || analysis.ai.confidence === 'strong') && reasons.length > 0) reasons.push('high confidence without support')
  return { complete: reasons.length === 0, reasons }
}

export function downgradeUnsupportedFightAnalysis(analysis: UFCFightDeepAnalysis, reasons: string[]): UFCFightDeepAnalysis {
  return {
    ...analysis,
    ai: {
      ...analysis.ai,
      confidence: 'lean',
      pick: analysis.ai.pick && analysis.ai.pick.toLowerCase() !== 'pass' ? analysis.ai.pick : analysis.fighterA.name,
      thesis: isMeaningful(analysis.ai.thesis)
        ? `${analysis.ai.thesis} Validation downgrade: ${reasons.join('; ')}.`
        : `Validation downgrade: ${reasons.join('; ')}. Keep this as a low-confidence matchup read until verified research/sources improve.`,
      risks: Array.from(new Set([...analysis.ai.risks, ...reasons])).slice(0, 4),
    },
    bettingAngles: analysis.bettingAngles.length ? analysis.bettingAngles.map(angle => ({ ...angle, label: angle.label.replace(/pass/ig, 'matchup watch'), marketType: angle.marketType === 'pass' ? 'moneyline' as const : angle.marketType, side: angle.side.toLowerCase() === 'pass' ? analysis.fighterA.name : angle.side, maxRisk: 'small' as const })) : [{
      label: `${analysis.fighterA.name} low-confidence matchup edge`,
      marketType: 'moneyline',
      side: analysis.fighterA.name,
      rationale: reasons.join('; '),
      maxRisk: 'small',
    }],
  }
}
