export interface UfcComboMarket {
  ticker: string
  category: string
  fighter: string
  title: string
  yesAsk: number
  yesAskSize: number
  url?: string
}

export interface UfcComboFight {
  id: string
  fighterA: string
  fighterB: string
  dateLabel?: string
  eventKey?: string
  markets: UfcComboMarket[]
}

export interface UfcComboAnalysisFight {
  fightId?: string
  weightClass?: string
  fighterA: { name: string; lastFive?: Array<{ result?: string; method?: string }> }
  fighterB: { name: string; lastFive?: Array<{ result?: string; method?: string }> }
  ai: {
    pick?: string
    method?: string
    confidence?: 'pass' | 'lean' | 'solid' | 'strong' | string
    thesis?: string
    risks?: string[]
    watchouts?: string[]
  }
}

export interface UfcComboLeg {
  fightId: string
  matchup: string
  fighter: string
  price: number
  available: number
  ticker: string
  url?: string
  confidence: 'lean' | 'solid' | 'strong'
  statisticalWhy: string
  risk: string
}

export interface UfcComboCard {
  id: string
  label: string
  title: string
  payoutLabel: string
  estimatedReturn: number
  risk: 'Lower variance' | 'Balanced' | 'Aggressive'
  thesis: string
  legs: UfcComboLeg[]
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

function findAnalysis(fight: UfcComboFight, analyses: UfcComboAnalysisFight[]) {
  return analyses.find(candidate => {
    const aToA = nameMatches(fight.fighterA, candidate.fighterA.name)
    const bToB = nameMatches(fight.fighterB, candidate.fighterB.name)
    const aToB = nameMatches(fight.fighterA, candidate.fighterB.name)
    const bToA = nameMatches(fight.fighterB, candidate.fighterA.name)
    return (aToA && bToB) || (aToB && bToA)
  }) || null
}

function cleanPick(pick: string | undefined, fallback: string) {
  const value = String(pick || '').trim()
  if (!value || value.toLowerCase() === 'pass') return fallback
  return value
}

function countRecentWins(fighter?: { lastFive?: Array<{ result?: string }> }) {
  return (fighter?.lastFive || []).filter(row => row.result === 'win').length
}

function countRecentFinishes(fighter?: { lastFive?: Array<{ result?: string; method?: string }> }) {
  return (fighter?.lastFive || []).filter(row => /ko|tko|sub|submission|choke|armbar/i.test(String(row.method || ''))).length
}

function confidenceRank(value: string | undefined) {
  if (value === 'strong') return 3
  if (value === 'solid') return 2
  return 1
}

function confidenceLabel(value: string | undefined): UfcComboLeg['confidence'] {
  if (value === 'strong') return 'strong'
  if (value === 'solid') return 'solid'
  return 'lean'
}

function legScore(leg: UfcComboLeg) {
  const priceScore = leg.price >= 48 && leg.price <= 68 ? 24 : leg.price > 68 && leg.price <= 76 ? 14 : leg.price < 48 ? 12 : 5
  const liquidityScore = leg.available >= 1000 ? 18 : leg.available >= 300 ? 12 : leg.available >= 75 ? 6 : 0
  const confidenceScore = leg.confidence === 'strong' ? 18 : leg.confidence === 'solid' ? 12 : 7
  return priceScore + liquidityScore + confidenceScore
}

function buildLeg(fight: UfcComboFight, analyses: UfcComboAnalysisFight[]): UfcComboLeg | null {
  const analysis = findAnalysis(fight, analyses)
  if (!analysis) return null
  const pick = cleanPick(analysis.ai.pick, analysis.fighterA.name)
  const winnerMarkets = fight.markets
    .filter(m => m.category === 'Winner' && m.yesAsk > 0 && m.yesAsk < 96)
    .sort((a, b) => (b.yesAsk || 0) - (a.yesAsk || 0))
  const market = winnerMarkets.find(m => nameMatches(m.fighter || m.title || '', pick))
  if (!market) return null
  const price = Number(market.yesAsk || 0)
  if (price < 35 || price > 84) return null
  const pickedDossier = nameMatches(pick, analysis.fighterB.name) ? analysis.fighterB : analysis.fighterA
  const oppDossier = pickedDossier.name === analysis.fighterA.name ? analysis.fighterB : analysis.fighterA
  const recentWins = countRecentWins(pickedDossier)
  const oppWins = countRecentWins(oppDossier)
  const finishes = countRecentFinishes(pickedDossier)
  const confidence = confidenceLabel(analysis.ai.confidence)
  const whyParts = [
    `${confidence.toUpperCase()} matchup lean from deep analysis`,
    `${recentWins}-${5 - recentWins} recent verified log vs ${oppWins}-${5 - oppWins} opponent log`,
  ]
  if (finishes >= 2) whyParts.push(`${finishes} recent finish-method rows support upside`)
  return {
    fightId: fight.id,
    matchup: `${fight.fighterA} vs ${fight.fighterB}`,
    fighter: market.fighter || pick,
    price,
    available: Number(market.yesAskSize || 0),
    ticker: market.ticker,
    url: market.url,
    confidence,
    statisticalWhy: whyParts.join(' · '),
    risk: (analysis.ai.risks?.[0] || analysis.ai.watchouts?.[0] || 'MMA variance: one grappling exchange, knockdown, or cardio swing can break the card.'),
  }
}

function comboReturn(legs: UfcComboLeg[]) {
  const cost = legs.reduce((acc, leg) => acc * Math.max(0.01, leg.price / 100), 1)
  return cost > 0 ? 1 / cost : 0
}

function uniqueLegs(legs: UfcComboLeg[]) {
  const seen = new Set<string>()
  return legs.filter(leg => {
    if (seen.has(leg.fightId)) return false
    seen.add(leg.fightId)
    return true
  })
}

function makeCard(id: string, label: string, title: string, risk: UfcComboCard['risk'], legs: UfcComboLeg[], thesis: string): UfcComboCard | null {
  const clean = uniqueLegs(legs).filter(Boolean)
  if (clean.length < 2) return null
  const estimatedReturn = comboReturn(clean)
  return {
    id,
    label,
    title,
    risk,
    thesis,
    legs: clean,
    estimatedReturn,
    payoutLabel: `${estimatedReturn.toFixed(1)}x est. gross return`,
  }
}

export function buildUfcComboCards(fights: UfcComboFight[], analyses: UfcComboAnalysisFight[]): UfcComboCard[] {
  const legs = fights
    .map(fight => buildLeg(fight, analyses))
    .filter((leg): leg is UfcComboLeg => Boolean(leg))
    .sort((a, b) => legScore(b) - legScore(a))

  const playable = legs.filter(leg => leg.available >= 100 && leg.price >= 45 && leg.price <= 78)
  const valueBand = playable.filter(leg => leg.price >= 48 && leg.price <= 68)
  const anchors = playable.filter(leg => leg.price > 68 && leg.price <= 78)
  const liveDogs = playable.filter(leg => leg.price >= 35 && leg.price < 52)

  const cards = [
    makeCard(
      'smart-two',
      'Smart 2-leg',
      'Best blend of matchup edge + playable price',
      'Lower variance',
      valueBand.slice(0, 2).length >= 2 ? valueBand.slice(0, 2) : playable.slice(0, 2),
      'Two legs only: both need a deep-analysis fighter lean, real winner-market liquidity, and a price that is not already too expensive.'
    ),
    makeCard(
      'plus-return-three',
      'Plus-return 3-leg',
      'Good return without stacking only heavy favorites',
      'Balanced',
      [...valueBand.slice(0, 2), ...anchors.slice(0, 1), ...playable].slice(0, 3),
      'A three-leg card built from statistically favored fighters while avoiding a pure chalk stack. Better payout, but still anchored in fight reads.'
    ),
    makeCard(
      'sprinkle-upside',
      'Upside sprinkle',
      'Higher payout with one live-price swing',
      'Aggressive',
      [...valueBand.slice(0, 2), ...liveDogs.slice(0, 1), ...playable.slice(2)].slice(0, 3),
      'This is the bigger-return card: one price-sensitive leg can boost payout, so treat it as smaller sizing and confirm late news/weigh-ins.'
    ),
  ].filter((card): card is UfcComboCard => Boolean(card))

  const seen = new Set<string>()
  return cards.filter(card => {
    const key = card.legs.map(leg => leg.ticker).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)
}
