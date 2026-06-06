export interface KalshiUFCMarketForIntel {
  ticker: string
  category: string
  fighter: string
  title: string
  yesAsk: number
  yesAskSize: number
  yesBid?: number
  yesBidSize?: number
}

export interface KalshiUFCRecommendedLook {
  label: string
  market: string
  reason: string
  risk: string
  confidence: 'strong' | 'medium' | 'watch'
  ticker: string
}

export interface KalshiUFCFightIntel {
  primaryLean: string
  marketRead: string
  finishRead: string
  redFlags: string[]
  recommendedLooks: KalshiUFCRecommendedLook[]
}

function pct(cents: number): number {
  return Math.max(0, Math.min(99, Math.round(cents || 0)))
}

function compactTitle(market: KalshiUFCMarketForIntel): string {
  const fighter = market.fighter.trim()
  if (fighter && !/^yes$/i.test(fighter)) return fighter
  return market.title
    .replace(/^Will\s+/i, '')
    .replace(/\?$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function confidenceFor(market: KalshiUFCMarketForIntel, priceGap = 0): KalshiUFCRecommendedLook['confidence'] {
  const size = market.yesAskSize || 0
  if (size >= 100 && priceGap >= 12) return 'strong'
  if (size >= 25 || (size >= 15 && priceGap >= 8)) return 'medium'
  return 'watch'
}

function byAskThenSize(a: KalshiUFCMarketForIntel, b: KalshiUFCMarketForIntel) {
  return (b.yesAsk - a.yesAsk) || ((b.yesAskSize || 0) - (a.yesAskSize || 0))
}

export function buildKalshiUFCFightIntel(markets: KalshiUFCMarketForIntel[]): KalshiUFCFightIntel {
  const valid = markets.filter(m => m.yesAsk > 0 && m.yesAsk < 100)
  const winners = valid.filter(m => m.category === 'Winner').sort(byAskThenSize)
  const distance = valid.filter(m => m.category === 'Distance').sort(byAskThenSize)
  const methods = valid.filter(m => m.category === 'Finish Method' || m.category === 'Victory Method').sort(byAskThenSize)
  const rounds = valid.filter(m => m.category === 'Total Rounds' || m.category === 'Victory Round').sort(byAskThenSize)
  const redFlags: string[] = []
  const recommendedLooks: KalshiUFCRecommendedLook[] = []

  const totalSize = valid.reduce((sum, m) => sum + (m.yesAskSize || 0), 0)
  if (!winners.length) redFlags.push('No clean winner market found yet; start with fight style, not props.')
  if (totalSize > 0 && totalSize < 75) redFlags.push('Thin available size — confirm the market is still executable before acting.')
  if (valid.length > 18) redFlags.push('Lots of derivative props are live; avoid chasing exact round/method unless the fight script supports it.')

  const topWinner = winners[0]
  const secondWinner = winners[1]
  let primaryLean = 'No clear fighter lean yet'
  let marketRead = 'Winner market is not matched cleanly yet. Treat the board as watch-only until a clean side appears.'

  if (topWinner) {
    const gap = secondWinner ? Math.abs(topWinner.yesAsk - secondWinner.yesAsk) : topWinner.yesAsk
    const topLabel = compactTitle(topWinner)
    primaryLean = `${topLabel} ${pct(topWinner.yesAsk)}%`
    marketRead = secondWinner
      ? `${topLabel} is the market lean at ${pct(topWinner.yesAsk)}% vs ${pct(secondWinner.yesAsk)}% for the other side. ${gap >= 18 ? 'That is a real favorite profile; look for whether the style matchup justifies laying the price.' : 'That is close enough to demand tape/style confirmation before choosing a side.'}`
      : `${topLabel} is the only clean winner side found at ${pct(topWinner.yesAsk)}%. Confirm the opposing side is not missing before treating it as a full fight read.`

    recommendedLooks.push({
      label: 'Start here',
      market: `${topLabel} to win · ${pct(topWinner.yesAsk)}%`,
      reason: gap >= 14
        ? 'The cleanest signal is the outright winner lean, not a narrow exact-method prop.'
        : 'Winner is the simplest market to compare against your fighter read because the price gap is not overwhelming.',
      risk: topWinner.yesAsk >= 78
        ? 'Price is already expensive; do not chase if the number moves higher.'
        : 'Still verify cardio, wrestling threat, and opponent durability before sizing.',
      confidence: confidenceFor(topWinner, gap),
      ticker: topWinner.ticker,
    })
  }

  const topDistance = distance[0]
  const topMethod = methods[0]
  const topRound = rounds[0]
  let finishRead = 'No clean finish/distance lean yet.'

  if (topDistance || topMethod) {
    const distText = topDistance ? `${compactTitle(topDistance)} at ${pct(topDistance.yesAsk)}%` : ''
    const methodText = topMethod ? `${compactTitle(topMethod)} at ${pct(topMethod.yesAsk)}%` : ''
    finishRead = [distText, methodText].filter(Boolean).join(' · ')
  }

  if (topDistance && topDistance.yesAsk >= 45) {
    recommendedLooks.push({
      label: 'Fight script',
      market: `${compactTitle(topDistance)} · ${pct(topDistance.yesAsk)}%`,
      reason: 'Distance/finish markets describe how the fight is expected to play out and help check the winner thesis.',
      risk: 'If one fighter has a clear submission or power path, distance pricing can break quickly.',
      confidence: confidenceFor(topDistance, topDistance.yesAsk - (distance[1]?.yesAsk || 0)),
      ticker: topDistance.ticker,
    })
  } else if (topMethod && topMethod.yesAsk >= 32) {
    recommendedLooks.push({
      label: 'Method clue',
      market: `${compactTitle(topMethod)} · ${pct(topMethod.yesAsk)}%`,
      reason: 'The board is hinting at a finish path, but method props need stronger style confirmation than winner markets.',
      risk: 'Exact method markets are fragile; pass if the fighter can win multiple ways.',
      confidence: confidenceFor(topMethod, topMethod.yesAsk - (methods[1]?.yesAsk || 0)),
      ticker: topMethod.ticker,
    })
  }

  if (topRound && topRound.yesAsk >= 40 && recommendedLooks.length < 3) {
    recommendedLooks.push({
      label: 'Timing check',
      market: `${compactTitle(topRound)} · ${pct(topRound.yesAsk)}%`,
      reason: 'Round/total markets can validate whether the board expects a slow decision fight or early chaos.',
      risk: 'Do not use timing props as the primary bet unless the matchup has a clear pace/finish trigger.',
      confidence: 'watch',
      ticker: topRound.ticker,
    })
  }

  if (!recommendedLooks.length && valid[0]) {
    const top = [...valid].sort(byAskThenSize)[0]
    recommendedLooks.push({
      label: 'Only watchlist',
      market: `${compactTitle(top)} · ${pct(top.yesAsk)}%`,
      reason: 'This is the most prominent live price, but the fight board does not have enough structure for a strong lean.',
      risk: 'Wait for cleaner winner/distance markets or add external fight research before betting.',
      confidence: 'watch',
      ticker: top.ticker,
    })
  }

  return {
    primaryLean,
    marketRead,
    finishRead,
    redFlags: redFlags.slice(0, 3),
    recommendedLooks: recommendedLooks.slice(0, 3),
  }
}
