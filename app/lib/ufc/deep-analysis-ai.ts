import { completeWithAi, type AiMessage } from '../ai-provider'
import type { UFCEvent, UFCFight } from './events'
import type { UFCFightDeepAnalysis, UFCFightThesisType } from './deep-analysis'

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

function parseRecordWins(record?: string): number {
  const match = String(record || '').match(/(\d+)\s*-\s*(\d+)/)
  return match ? Number(match[1]) : 0
}

function methodScore(dossier?: Partial<UFCFightDeepAnalysis['fighterA']>): number {
  const text = [
    dossier?.fightingStyle || dossier?.style || '',
    ...(dossier?.strengths || []),
    ...((dossier?.lastFive || []) as any[]).map(f => `${f?.result || ''} ${f?.method || ''}`),
  ].join(' ').toLowerCase()
  let score = 0
  score += (text.match(/win/g) || []).length * 1.2
  score += (text.match(/ko|tko|knockout/g) || []).length * 1.4
  score += (text.match(/submission|choke|armbar|bjj/g) || []).length * 1.2
  score -= (text.match(/loss|ko loss|knockout loss/g) || []).length * 1.5
  if (/undefeated/.test(text)) score += 2
  if (/pressure|power|wrestling|bjj|boxing|muay thai|kickboxing|sambo/.test(text)) score += 1
  return score
}

function profileScore(fighter: UFCFight['fighterA'], dossier?: Partial<UFCFightDeepAnalysis['fighterA']>): number {
  let score = parseRecordWins(dossier?.record || fighter.record) * 0.15
  if (typeof dossier?.age === 'number') {
    if (dossier.age >= 27 && dossier.age <= 34) score += 2
    if (dossier.age >= 36) score -= 1.5
  }
  score += methodScore(dossier)
  return score
}

type ThesisDraft = {
  thesisType: UFCFightThesisType
  profileLayer: string
  matchupLayer: string
  marketEdgeLayer: string
  marketRead: string
  whyMarketMayBeWrong: string[]
  killSwitch: string[]
}

function marketPctFor(fight: UFCFight, name: string): number | null {
  const poly = fight.polyOdds
  if (!poly?.hasWinner || poly.fighterAWin === null || poly.fighterBWin === null) return null
  if (name === fight.fighterA.name) return Number(poly.fighterAWin)
  if (name === fight.fighterB.name) return Number(poly.fighterBWin)
  return null
}

function fighterText(dossier?: Partial<UFCFightDeepAnalysis['fighterA']>): string {
  return [
    dossier?.fightingStyle,
    dossier?.style,
    dossier?.finishingProfile?.summary,
    ...(dossier?.strengths || []),
    ...(dossier?.concerns || []),
    ...((dossier?.lastFive || []) as any[]).map(f => `${f?.result || ''} ${f?.method || ''} ${f?.notes || ''}`),
  ].join(' ').toLowerCase()
}

function pctLabel(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'unknown' : `${Math.round(value * 100)}%`
}

export function classifyFightThesis(
  fight: UFCFight,
  pick: string,
  other: string,
  pickDossier?: Partial<UFCFightDeepAnalysis['fighterA']>,
  otherDossier?: Partial<UFCFightDeepAnalysis['fighterA']>,
): ThesisDraft {
  const pickText = fighterText(pickDossier)
  const otherText = fighterText(otherDossier)
  const pickMarketPct = marketPctFor(fight, pick)
  const otherMarketPct = marketPctFor(fight, other)
  const pickIsDog = pickMarketPct !== null && pickMarketPct < 0.5
  const otherIsChalk = otherMarketPct !== null && otherMarketPct >= 0.65
  const pickAge = pickDossier?.age
  const otherAge = otherDossier?.age

  const hasGrappling = /wrestl|grappl|sambo|takedown|bjj|submission|choke|armbar|jiu/.test(pickText)
  const hasPower = /ko|tko|knockout|power|strik|boxing|kickbox|muay|brawler/.test(pickText)
  const otherDurabilityConcern = /ko loss|knockout loss|finished|loss|dropped/.test(otherText)
  const hasCardio = /cardio|pace|pressure|volume|decision|late/.test(pickText)
  const otherCardioConcern = /gas|tired|cardio|late loss|faded/.test(otherText)

  if ((hasCardio || otherCardioConcern) && !pickIsDog) {
    return {
      thesisType: 'cardio_edge',
      profileLayer: `${pick}'s profile points to pace, volume, or late-fight stability as the separator.`,
      matchupLayer: `${other} has to keep the fight efficient; extended exchanges and repeated resets favor ${pick}.`,
      marketEdgeLayer: `If the market is anchored to early danger, it may be undervaluing ${pick}'s minute-winning and late-round equity.`,
      marketRead: `${pick} is priced around ${pctLabel(pickMarketPct)}; the bet only works if the pace edge shows up before volatility does.`,
      whyMarketMayBeWrong: [`Pace and cardio edges compound after the market's opening read.`, `${pick} can make a close fight less random by owning the longer exchanges.`],
      killSwitch: [`Kill the bet if ${pick} cannot control tempo in round one.`, `Downgrade if ${other} forces low-volume grappling/control instead of pace.`],
    }
  }

  if (pickIsDog && hasPower) {
    return {
      thesisType: 'early_ko_chaos',
      profileLayer: `${pick} has enough finishing/power indicators to make a low-probability early damage path relevant.`,
      matchupLayer: `${other} can still be the cleaner side, but striking exchanges create volatility before the favorite can bank control time.`,
      marketEdgeLayer: `If the market is pricing ${other} as safer, it may be underpricing early KO variance for ${pick}.`,
      marketRead: `${pick} is priced around ${pctLabel(pickMarketPct)}, so this is an upset/chaos thesis, not a favorite thesis.`,
      whyMarketMayBeWrong: [`The board may be over-weighting the likely winner and under-weighting the first-round damage branch.`, `${pick}'s best path does not need five clean rounds; it needs one high-leverage exchange.`],
      killSwitch: [`Kill the bet if ${pick} looks compromised at weigh-ins or steams out of underdog range.`, `Avoid exact-method exposure if ${other} shows a credible wrestling-first safety plan.`],
    }
  }

  if (pickIsDog && hasGrappling) {
    return {
      thesisType: 'submission_live_dog',
      profileLayer: `${pick}'s grappling/submission profile gives them a non-linear win condition.`,
      matchupLayer: `${other} may win minutes standing, but one scramble or takedown can flip the script.`,
      marketEdgeLayer: `The market may be too focused on overall win probability and not enough on ${pick}'s grappling path.`,
      marketRead: `${pick} near ${pctLabel(pickMarketPct)} implies the submission/control path is being treated as secondary.`,
      whyMarketMayBeWrong: [`Grappling paths can cash without matching the broader striking optics.`, `If ${other} accepts clinches or scrambles, the underdog price can go stale quickly.`],
      killSwitch: [`Kill the bet if ${other}'s takedown defense/scramble prep looks sharp early.`, `Do not chase if submission props or moneyline move sharply before entry.`],
    }
  }

  if (otherIsChalk) {
    return {
      thesisType: 'chalk_tax',
      profileLayer: `${pick} has enough profile support to question whether ${other}'s favorite price is inflated.`,
      matchupLayer: `${other} may be the public side, but the matchup is not clean enough to justify paying a big premium.`,
      marketEdgeLayer: `${other} around ${pctLabel(otherMarketPct)} creates chalk-tax risk if live alternate paths remain.`,
      marketRead: `${other} is the market favorite; this read is about price fragility, not pretending ${pick} is risk-free.`,
      whyMarketMayBeWrong: [`The market may be paying for name value, highlights, or public comfort instead of the actual risk distribution.`, `${pick} only needs to make the fight messy for an expensive favorite ticket to become unattractive.`],
      killSwitch: [`Pass if ${other}'s price drops into a fairer range before entry.`, `Pass if late news confirms a clean stylistic advantage for ${other}.`],
    }
  }

  if (hasGrappling) {
    return {
      thesisType: pickText.includes('wrestl') || pickText.includes('takedown') ? 'wrestling_control' : 'grappling_path',
      profileLayer: `${pick}'s profile points to wrestling/grappling as the most important lever.`,
      matchupLayer: `${pick} can change the fight if they force clinches, mat returns, or submission threats instead of a neutral kickboxing match.`,
      marketEdgeLayer: `If the market is reading this as a generic winner market, it may be missing how much control time can swing rounds.`,
      marketRead: `${pick} is priced around ${pctLabel(pickMarketPct)}. The question is whether that price captures control-time upside.`,
      whyMarketMayBeWrong: [`Control and grappling pressure can make striking metrics less predictive.`, `A single takedown-heavy round can reshape live pricing and decision equity.`],
      killSwitch: [`Kill the bet if ${pick} cannot win first-layer entries early.`, `Downgrade if referee standups or cage positioning neutralize control time.`],
    }
  }

  if (hasPower || otherDurabilityConcern) {
    return {
      thesisType: 'durability_gap',
      profileLayer: `${pick} has the more dangerous damage profile in the available recent-method/style data.`,
      matchupLayer: `${other} has to manage defensive responsibility; repeated pocket exchanges favor the cleaner damage path.`,
      marketEdgeLayer: `The market may be too comfortable with minute-winning while discounting durability risk.`,
      marketRead: `${pick} around ${pctLabel(pickMarketPct)} leaves room if damage equity is understated.`,
      whyMarketMayBeWrong: [`Markets often price the more stable minute-winner while underpricing damage spikes.`, `${pick}'s path can appear low-volume until one exchange changes the fight.`],
      killSwitch: [`Pass if ${pick} looks slow, depleted, or unable to close distance.`, `Avoid if the price rises without corresponding method/finish confirmation.`],
    }
  }

  if (typeof pickAge === 'number' && typeof otherAge === 'number' && pickAge < otherAge - 4) {
    return {
      thesisType: 'speed_edge',
      profileLayer: `${pick}'s age/profile suggests a possible speed and reaction-time edge.`,
      matchupLayer: `${other} may need to slow the fight down; open-space exchanges favor the faster athlete.`,
      marketEdgeLayer: `If the market is leaning on résumé, it may be slow to price athletic decline or speed differential.`,
      marketRead: `${pick} around ${pctLabel(pickMarketPct)} is attractive only if the speed gap is visible early.`,
      whyMarketMayBeWrong: [`Résumé-based pricing can lag when the faster fighter dictates exchanges.`, `Speed edges show up before traditional stats catch them.`],
      killSwitch: [`Kill if ${pick} is backing straight up or losing first-contact exchanges.`, `Pass if ${other} shows a clear wrestling/control plan.`],
    }
  }

  return {
    thesisType: 'volume_decision',
    profileLayer: `${pick} has the steadier profile read from available record, age, style, and recent-method context.`,
    matchupLayer: `${pick}'s safest path is to win minutes, avoid chaos, and force ${other} into lower-percentage offense.`,
    marketEdgeLayer: `The edge is modest unless the market price discounts the steadier round-winning side.`,
    marketRead: `${pick} is priced around ${pctLabel(pickMarketPct)}; this is a small edge unless the number is better than the matchup read.`,
    whyMarketMayBeWrong: [`The market may be overreacting to finish upside while underpricing round-to-round control.`, `If ${pick} owns pace and shot selection, the fight can look less volatile than the headline odds imply.`],
    killSwitch: [`Kill if ${pick} cannot control pace in round one.`, `Downgrade if ${other}'s power or grappling threat forces low-volume hesitation.`],
  }
}

function buildMatchupJudgement(fight: UFCFight, a?: Partial<UFCFightDeepAnalysis['fighterA']>, b?: Partial<UFCFightDeepAnalysis['fighterB']>, marketWinner = 'unknown') {
  const aScore = profileScore(fight.fighterA, a)
  const bScore = profileScore(fight.fighterB, b)
  const pick = aScore >= bScore ? fight.fighterA.name : fight.fighterB.name
  const edge = Math.abs(aScore - bScore)
  const favoriteMatches = marketWinner !== 'unknown' && marketWinner === pick
  const confidence: 'lean' | 'solid' | 'strong' = edge >= 5 && favoriteMatches ? 'solid' : edge >= 8 ? 'solid' : 'lean'
  const other = pick === fight.fighterA.name ? fight.fighterB.name : fight.fighterA.name
  const pickDossier = pick === fight.fighterA.name ? a : b
  const otherDossier = pick === fight.fighterA.name ? b : a
  const thesisDraft = classifyFightThesis(fight, pick, other, pickDossier, otherDossier)
  const why = [thesisDraft.profileLayer, thesisDraft.matchupLayer, thesisDraft.marketEdgeLayer, ...thesisDraft.whyMarketMayBeWrong.slice(0, 1)]
  return { pick, confidence, thesis: `${pick} over ${other}: ${thesisDraft.marketEdgeLayer}`, why, ...thesisDraft }
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
      style: athlete.displayFightingStyle || undefined,
      fightingStyle: athlete.displayFightingStyle || undefined,
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
  const judgement = buildMatchupJudgement(fight, espnA.dossier, espnB.dossier, expectedWinner)
  const pick = judgement.pick
  const thesis = judgement.thesis

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
        confidence: judgement.confidence,
        thesisType: judgement.thesisType,
        thesis,
        profileLayer: judgement.profileLayer,
        matchupLayer: judgement.matchupLayer,
        marketEdgeLayer: judgement.marketEdgeLayer,
        marketRead: judgement.marketRead,
        whyMarketMayBeWrong: judgement.whyMarketMayBeWrong,
        killSwitch: judgement.killSwitch,
        why: [
          ...judgement.why,
          hasWinner ? `Market context: ${expectedWinner} around ${expectedPct}%.` : 'No reliable winner market found; matchup read still generated from fighter data.',
          poly?.hasTotal ? `Totals market: over ${poly.totalLine} at ${Math.round(Number(poly.overOdds || 0) * 100)}%, under at ${Math.round(Number(poly.underOdds || 0) * 100)}%.` : '',
        ].filter(Boolean),
        risks: ['MMA variance: one knockdown/submission can erase a correct read.', ...judgement.killSwitch].slice(0, 4),
        watchouts: [...judgement.killSwitch.slice(0, 2), 'Late line movement', 'Weigh-in/body-language news'].slice(0, 4),
      },
      bettingAngles: [{
        label: `${pick} matchup edge`,
        marketType: 'moneyline',
        side: pick,
        rationale: thesis,
        maxRisk: judgement.confidence === 'lean' ? 'small' : 'normal',
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
- Include each fighter's actual fighting style/training base as fightingStyle/style, e.g. "wrestling", "brawler", "BJJ", "Muay Thai", "boxing", "kickboxing". Do not use stance words like Orthodox/Southpaw as style.
- Include hype, narrative, beef/storyline, camp news, injury/layoff notes, and possible market distortion.
- Include expected winner from market/public consensus and expected method.
- Include your model pick, method, timing, confidence, why bullets, risks, watchouts, and matchup judgement.
- Assign exactly one thesisType from: speed_edge, cardio_edge, chalk_tax, grappling_path, early_ko_chaos, durability_gap, wrestling_control, submission_live_dog, volume_decision, market_too_thin.
- Explain why the market might be wrong, not merely who is favored.
- Fill profileLayer with the fighter-specific profile reason, matchupLayer with the style-vs-style reason, and marketEdgeLayer with the price/market reason.
- Fill marketRead with the current market interpretation, whyMarketMayBeWrong with concrete fight-specific bullets, and killSwitch with concrete conditions that would invalidate the bet.
- Avoid generic phrases like "cleaner matchup profile", "fighter-first read", and "market pricing is secondary".
- Include source URLs from the research context in sources when they support the claims.
- If a fact is not found, return "unknown" instead of guessing. Do not fabricate exact last 5 results.
- Always provide a fighter-first matchup judgement. Do not answer "pass" as the pick; if evidence is thin, use confidence "lean" and explain what would flip the read.

Return JSON matching this shape (omit nothing; use "unknown"/[] when needed):
{
  "fighterA": { "name": "${fighterA}", "record": "", "age": null, "height": "", "reach": "", "style": "", "fightingStyle": "", "country": "", "ranking": null, "lastFightSummary": "", "lastFive": [], "strengths": [], "concerns": [], "hype": { "level": "low", "why": [], "possibleMarketDistortion": "unknown" }, "narrative": { "beefOrStory": "unknown", "campNews": "unknown", "injuryOrLayoffNotes": "unknown" } },
  "fighterB": { "name": "${fighterB}", "record": "", "age": null, "height": "", "reach": "", "style": "", "fightingStyle": "", "country": "", "ranking": null, "lastFightSummary": "", "lastFive": [], "strengths": [], "concerns": [], "hype": { "level": "low", "why": [], "possibleMarketDistortion": "unknown" }, "narrative": { "beefOrStory": "unknown", "campNews": "unknown", "injuryOrLayoffNotes": "unknown" } },
  "market": { "expectedWinner": "unknown", "expectedMethod": "unknown", "priceNotes": [] },
  "ai": { "pick": "${fighterA}", "method": "unknown", "roundOrTiming": "unknown", "confidence": "lean", "thesisType": "market_too_thin", "thesis": "", "profileLayer": "", "matchupLayer": "", "marketEdgeLayer": "", "marketRead": "", "whyMarketMayBeWrong": [], "killSwitch": [], "why": [], "risks": [], "watchouts": [] },
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
    { role: 'system', content: 'You are an MMA betting-market analyst. Return strict JSON only. Use unknown when facts are not found; do not fabricate exact fight logs. Every fight must have a specific thesis type, market-mispricing explanation, and kill switch.' },
    { role: 'user', content: prompt },
  ]
  const completion = await completeWithAi({
    messages,
    env,
    clients: options?.clients,
    maxTokens: 3500,
    temperature: 0.25,
  })
  if (!completion.available) {
    const error = 'error' in completion ? completion.error : 'AI provider unavailable'
    return research.baseline
      ? { available: true, data: { ...research.baseline, sources: research.sources } }
      : { available: false, data: null, error }
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
