import { completeWithAi, type AiMessage } from '../ai-provider'
import type { UFCEvent, UFCFight } from './events'
import type { UFCFightDeepAnalysis } from './deep-analysis'

export type UFCResearchParseResult =
  | { available: true; data: Partial<UFCFightDeepAnalysis> }
  | { available: false; data: null; error: string }

type BraveSearchResult = { title: string; url: string; description: string }
type EspnFighterContext = { context: string; sources: string[]; dossier?: Partial<UFCFightDeepAnalysis['fighterA']> }

function configured(value: string | undefined): boolean {
  return Boolean(value && value.trim())
}

function cleanQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function dedupeResults(results: BraveSearchResult[]): BraveSearchResult[] {
  const seen = new Set<string>()
  const out: BraveSearchResult[] = []
  for (const result of results) {
    const key = result.url || result.title
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(result)
  }
  return out.slice(0, 10)
}

async function braveSearch(query: string, env: Record<string, string | undefined>): Promise<BraveSearchResult[]> {
  const token = env.BRAVE_API_KEY || env.BRAVE_SEARCH_API_KEY
  if (!configured(token)) return []
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '5')
  url.searchParams.set('country', 'us')
  url.searchParams.set('search_lang', 'en')
  url.searchParams.set('safesearch', 'moderate')
  const res = await fetch(url, {
    headers: {
      'X-Subscription-Token': token as string,
      'Accept': 'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => null) as any
  return ((data?.web?.results || []) as any[]).map(item => ({
    title: String(item?.title || '').replace(/<[^>]*>/g, '').trim(),
    url: String(item?.url || '').trim(),
    description: String(item?.description || '').replace(/<[^>]*>/g, '').trim(),
  })).filter(item => item.title || item.description || item.url)
}

function normalizeResult(value: unknown): 'win' | 'loss' | 'draw' | 'no_contest' | 'unknown' {
  const text = String(value || '').toLowerCase()
  if (text === 'w' || text.includes('win')) return 'win'
  if (text === 'l' || text.includes('loss')) return 'loss'
  if (text === 'd' || text.includes('draw')) return 'draw'
  if (text.includes('no contest') || text === 'nc') return 'no_contest'
  return 'unknown'
}

function pickEspnAthleteUrl(athlete: any): string {
  const links = Array.isArray(athlete?.links) ? athlete.links : []
  return links.find((link: any) => Array.isArray(link?.rel) && link.rel.includes('athlete') && typeof link.href === 'string')?.href
    || `https://www.espn.com/mma/fighter/_/id/${athlete?.id || ''}`
}

async function fetchEspnFighterContext(fighter: UFCFight['fighterA']): Promise<EspnFighterContext> {
  if (!fighter.id) return { context: `${fighter.name}: no ESPN athlete id available.`, sources: [] }
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/mma/ufc/athletes/${encodeURIComponent(fighter.id)}`, { cache: 'no-store' })
    if (!res.ok) return { context: `${fighter.name}: ESPN athlete profile unavailable (${res.status}).`, sources: [] }
    const data = await res.json() as any
    const athlete = data?.athlete || {}
    const sources = [pickEspnAthleteUrl(athlete)].filter(Boolean)
    const profile = [
      `Name: ${athlete.displayName || fighter.name}`,
      athlete.nickname ? `Nickname: ${athlete.nickname}` : '',
      athlete.statsSummary ? `Record summary: ${athlete.statsSummary}` : fighter.record ? `Record: ${fighter.record}` : '',
      athlete.age ? `Age: ${athlete.age}` : '',
      athlete.displayHeight ? `Height: ${athlete.displayHeight}` : fighter.height ? `Height: ${fighter.height}` : '',
      athlete.displayWeight ? `Weight: ${athlete.displayWeight}` : '',
      athlete.displayReach ? `Reach: ${athlete.displayReach}` : fighter.reach ? `Reach: ${fighter.reach}` : '',
      athlete.stance ? `Stance: ${athlete.stance}` : '',
      athlete.displayFightingStyle ? `Style: ${athlete.displayFightingStyle}` : '',
      athlete.weightClass ? `Weight class: ${athlete.weightClass}` : '',
    ].filter(Boolean)

    const events = Object.values(data?.eventsMap || {}) as any[]
    const recentObjects = events
      .filter(item => item?.gameDate)
      .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
      .slice(0, 5)
      .map(item => {
        const status = item.status || {}
        const method = status?.result?.displayName || status?.result?.shortDisplayName || status?.result?.name || 'unknown'
        return {
          opponent: item.opponent?.displayName || item.opponent?.fullName || 'unknown opponent',
          date: item.gameDate || 'unknown',
          result: normalizeResult(item.gameResult),
          method,
          round: Number.isFinite(Number(status?.period)) ? Number(status.period) : null,
          time: status?.displayClock || '',
          notes: item.name || 'ESPN fight history entry',
        }
      })
    const recent = recentObjects.map((item, idx) => {
      const round = item.round ? `R${item.round}` : 'round unknown'
      const time = item.time ? ` ${item.time}` : ''
      return `${idx + 1}. ${item.date}: ${item.result.toUpperCase()} vs ${item.opponent} by ${item.method} (${round}${time}) at ${item.notes}`
    })

    const videoNotes = (Array.isArray(data?.videos) ? data.videos : [])
      .slice(0, 4)
      .map((video: any) => `${video.headline || video.title || ''}${video.description ? ` — ${video.description}` : ''}`.trim())
      .filter(Boolean)

    const lastFight = recentObjects[0]
    const dossier: Partial<UFCFightDeepAnalysis['fighterA']> = {
      name: athlete.displayName || fighter.name,
      record: athlete.statsSummary || fighter.record || '',
      age: typeof athlete.age === 'number' ? athlete.age : fighter.age,
      height: athlete.displayHeight || fighter.height || '',
      reach: athlete.displayReach || fighter.reach || '',
      stance: athlete.stance || undefined,
      country: athlete.citizenship || athlete.flag || fighter.country || '',
      ranking: fighter.ranking,
      lastFightSummary: lastFight ? `${lastFight.result.toUpperCase()} vs ${lastFight.opponent} by ${lastFight.method} at ${lastFight.notes}.` : 'unknown',
      lastFive: recentObjects,
      strengths: [athlete.displayFightingStyle ? `Listed style: ${athlete.displayFightingStyle}` : '', videoNotes[0] || ''].filter(Boolean).slice(0, 3),
      concerns: recentObjects.some(item => item.result === 'loss') ? ['Recent ESPN history includes a loss; verify matchup context before staking.'] : [],
      hype: { level: videoNotes.length ? 'medium' : 'low', why: videoNotes.slice(0, 3), possibleMarketDistortion: videoNotes.length ? 'Recent ESPN highlights/news may be driving public attention.' : 'unknown' },
      narrative: { beefOrStory: 'unknown', campNews: videoNotes[0] || 'unknown', injuryOrLayoffNotes: 'unknown' },
    }

    return {
      context: [`${fighter.name} ESPN profile:`, ...profile, 'Recent ESPN fight history:', ...(recent.length ? recent : ['No ESPN recent fight history listed.']), ...(videoNotes.length ? ['ESPN video/news notes:', ...videoNotes] : [])].join('\n'),
      sources,
      dossier,
    }
  } catch {
    return { context: `${fighter.name}: ESPN athlete profile fetch failed.`, sources: [] }
  }
}

export async function buildUFCFightResearchContext(fight: UFCFight, event?: UFCEvent, env: Record<string, string | undefined> = process.env): Promise<{ context: string; sources: string[]; baseline?: any }> {
  const fighterA = fight.fighterA.name
  const fighterB = fight.fighterB.name
  const eventName = event?.name || 'UFC'
  const queries = [
    `${fighterA} ${fighterB} prediction ${eventName}`,
    `${fighterA} last five fights method UFC`,
    `${fighterB} last five fights method UFC`,
    `${fighterA} ${fighterB} odds pick preview news`,
    `${fighterA} ${fighterB} beef hype camp injury layoff`,
  ].map(cleanQuery)

  const [espnA, espnB, resultGroups] = await Promise.all([
    fetchEspnFighterContext(fight.fighterA),
    fetchEspnFighterContext(fight.fighterB),
    Promise.all(queries.map(async query => ({ query, results: await braveSearch(query, env) }))),
  ])
  const results = dedupeResults(resultGroups.flatMap(group => group.results))
  const braveLines = results.map((item, idx) => {
    const description = item.description ? ` — ${item.description}` : ''
    return `${idx + 1}. ${item.title}${description}\n   URL: ${item.url}`
  })
  const braveContext = braveLines.length
    ? `External web/news research context from Brave Search:\n${braveLines.join('\n')}`
    : 'No valid Brave Search context available; rely on ESPN profile/history and market data.'

  const poly = fight.polyOdds
  const hasWinner = Boolean(poly?.hasWinner && poly.fighterAWin !== null && poly.fighterBWin !== null)
  const expectedWinner = hasWinner
    ? (Number(poly.fighterAWin) >= Number(poly.fighterBWin) ? fight.fighterA.name : fight.fighterB.name)
    : 'unknown'
  const expectedPct = hasWinner ? Math.round(Math.max(Number(poly.fighterAWin), Number(poly.fighterBWin)) * 100) : null
  const expectedMethod = poly?.hasTotal
    ? `${Math.round(Number(poly.overOdds || 0) * 100)}% over ${poly.totalLine}, ${Math.round(Number(poly.underOdds || 0) * 100)}% under ${poly.totalLine}`
    : 'unknown'
  const pick = hasWinner && expectedPct !== null && expectedPct >= 53 ? expectedWinner : 'pass'
  const thesis = hasWinner
    ? `ESPN profile/history context loaded. Current market expectation is ${expectedWinner} around ${expectedPct}%${expectedPct !== null && expectedPct < 53 ? ', effectively a coin flip, so this is a pass until a stronger edge appears' : ''}. Review last-five method history and recent-fight notes before staking.`
    : 'ESPN profile/history context loaded, but no reliable winner market is available; treat as research-only/pass.'

  return {
    context: [espnA.context, espnB.context, braveContext].join('\n\n'),
    sources: Array.from(new Set([...espnA.sources, ...espnB.sources, ...results.map(item => item.url).filter(Boolean)])).slice(0, 10),
    baseline: {
      fighterA: espnA.dossier,
      fighterB: espnB.dossier,
      market: {
        expectedWinner,
        expectedMethod,
        polymarketLean: hasWinner ? `${expectedWinner} ${expectedPct}% on Polymarket` : undefined,
        priceNotes: hasWinner ? [`Polymarket winner market is ${fight.fighterA.name} ${Math.round(Number(poly.fighterAWin) * 100)}% / ${fight.fighterB.name} ${Math.round(Number(poly.fighterBWin) * 100)}%.`] : [],
      },
      ai: {
        pick,
        method: expectedMethod,
        roundOrTiming: 'unknown',
        confidence: pick === 'pass' ? 'pass' : 'lean',
        thesis,
        why: [
          'ESPN profile and last-five fight history are available for both fighters.',
          hasWinner ? `Market expectation: ${expectedWinner} around ${expectedPct}%.` : 'No reliable winner market found.',
          poly?.hasTotal ? `Totals market: over ${poly.totalLine} at ${Math.round(Number(poly.overOdds || 0) * 100)}%, under at ${Math.round(Number(poly.underOdds || 0) * 100)}%.` : '',
        ].filter(Boolean),
        risks: ['MMA variance: one knockdown/submission can erase a correct read.', 'External injury/camp/news context is limited when Brave Search is unavailable or invalid.'],
        watchouts: ['Late line movement', 'Weigh-in/body-language news', 'Confirmed camp/injury reports'],
      },
      bettingAngles: [{
        label: pick === 'pass' ? 'Pass — market too tight / verify news' : `${pick} lean`,
        marketType: pick === 'pass' ? 'pass' : 'moneyline',
        side: pick,
        rationale: thesis,
        maxRisk: pick === 'pass' ? 'avoid' : 'small',
      }],
      sources: Array.from(new Set([...espnA.sources, ...espnB.sources, ...results.map(item => item.url).filter(Boolean)])).slice(0, 10),
    },
  }
}

export function buildUFCFightResearchPrompt(fight: UFCFight, event?: UFCEvent, marketContext?: unknown, researchContext = 'No external research context supplied.'): string {
  const fighterA = fight.fighterA.name
  const fighterB = fight.fighterB.name
  return `Return strict JSON only for a UFC fight deep analysis.

Event: ${event?.name || 'unknown'}
Date: ${event?.date || 'unknown'}
Fight: ${fighterA} vs ${fighterB}
Weight class: ${fight.weightClass}
Market context: ${JSON.stringify(marketContext || {}, null, 2)}
Research context:
${researchContext}

Requirements:
- Include both fighters by name: ${fighterA} and ${fighterB}.
- Use the research context above to identify each fighter's last fight summary and last 5 fight results with method, round/time if available, opponent, date if available, and notes.
- Include hype, narrative, beef/storyline, camp news, injury/layoff notes, and possible market distortion.
- Include expected winner from market/public consensus and expected method.
- Include your model pick, method, timing, confidence, why bullets, risks, watchouts, and bet/pass recommendation.
- Include source URLs from the research context in sources when they support the claims.
- If a fact is not found, return "unknown" instead of guessing. Do not fabricate exact last 5 results.
- You may still make a conservative fight pick from style/market/context if enough support exists, but use confidence "lean" unless evidence is strong.

Return JSON matching this shape (omit nothing; use "unknown"/[] when needed):
{
  "fighterA": { "name": "${fighterA}", "record": "", "age": null, "height": "", "reach": "", "country": "", "ranking": null, "lastFightSummary": "", "lastFive": [], "strengths": [], "concerns": [], "hype": { "level": "low", "why": [], "possibleMarketDistortion": "unknown" }, "narrative": { "beefOrStory": "unknown", "campNews": "unknown", "injuryOrLayoffNotes": "unknown" } },
  "fighterB": { "name": "${fighterB}", "record": "", "age": null, "height": "", "reach": "", "country": "", "ranking": null, "lastFightSummary": "", "lastFive": [], "strengths": [], "concerns": [], "hype": { "level": "low", "why": [], "possibleMarketDistortion": "unknown" }, "narrative": { "beefOrStory": "unknown", "campNews": "unknown", "injuryOrLayoffNotes": "unknown" } },
  "market": { "expectedWinner": "unknown", "expectedMethod": "unknown", "priceNotes": [] },
  "ai": { "pick": "pass", "method": "unknown", "roundOrTiming": "unknown", "confidence": "pass", "thesis": "", "why": [], "risks": [], "watchouts": [] },
  "bettingAngles": [],
  "sources": []
}`
}

function stripJsonFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return (fenced?.[1] || text).trim()
}

export function parseUFCResearchJson(text: string): UFCResearchParseResult {
  const cleaned = stripJsonFence(text)
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { available: false, data: null, error: 'AI output was not a JSON object.' }
    }
    return { available: true, data: parsed as Partial<UFCFightDeepAnalysis> }
  } catch (error) {
    return { available: false, data: null, error: error instanceof Error ? error.message : 'Malformed AI JSON.' }
  }
}

export async function researchUFCFightWithAi(fight: UFCFight, event?: UFCEvent, marketContext?: unknown, options?: {
  env?: Record<string, string | undefined>
  clients?: Parameters<typeof completeWithAi>[0]['clients']
}): Promise<UFCResearchParseResult & { provider?: string; model?: string }> {
  const env = options?.env || process.env
  const research = await buildUFCFightResearchContext(fight, event, env)
  const prompt = buildUFCFightResearchPrompt(fight, event, marketContext, research.context)
  const messages: AiMessage[] = [
    { role: 'system', content: 'You are an MMA research analyst. Return strict JSON only. Use unknown when facts are not found; do not fabricate exact fight logs.' },
    { role: 'user', content: prompt },
  ]
  const completion = await completeWithAi({
    messages,
    env,
    clients: options?.clients,
    maxTokens: 3500,
    temperature: 0.1,
  })
  if (!completion.available) {
    const error = 'error' in completion ? completion.error : 'AI provider unavailable'
    return { available: false, data: null, error }
  }
  const parsed = parseUFCResearchJson(completion.text)
  if (!parsed.available) {
    return research.baseline
      ? { available: true, data: { ...research.baseline, sources: research.sources }, provider: completion.provider, model: completion.model }
      : parsed
  }
  const aiSources = Array.isArray(parsed.data.sources) ? parsed.data.sources : []
  const parsedAi = (parsed.data.ai || {}) as any
  const baselineAi = (research.baseline?.ai || {}) as any
  const aiLooksEmpty = !parsedAi.thesis && (!Array.isArray(parsedAi.why) || parsedAi.why.length === 0) && (!parsedAi.pick || parsedAi.pick === 'pass')
  return {
    ...parsed,
    data: {
      ...research.baseline,
      ...parsed.data,
      fighterA: { ...research.baseline?.fighterA, ...parsed.data.fighterA },
      fighterB: { ...research.baseline?.fighterB, ...parsed.data.fighterB },
      market: { ...research.baseline?.market, ...parsed.data.market },
      ai: aiLooksEmpty ? baselineAi : { ...baselineAi, ...parsedAi },
      bettingAngles: parsed.data.bettingAngles?.length ? parsed.data.bettingAngles : research.baseline?.bettingAngles,
      sources: Array.from(new Set([...aiSources, ...research.sources])).slice(0, 8),
    },
    provider: completion.provider,
    model: completion.model,
  }
}
