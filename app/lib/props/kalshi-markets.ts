import { dollarsToCents, sizeToNum, type Sport } from './kalshi-matching'

export function kalshiTeamCode(abbr: string, sport: Sport): string {
  const upper = abbr.toUpperCase()
  if (sport === 'nba') {
    const map: Record<string, string> = { NY: 'NYK', SA: 'SAS', GS: 'GSW', PHX: 'PHX', NO: 'NOP', BKN: 'BKN' }
    return map[upper] || upper
  }
  if (sport === 'mlb') {
    const map: Record<string, string> = {
      // Kalshi encodes the Diamondbacks as AZ in MLB player-prop event tickers
      // (for example KXMLBHIT-26JUL072140AZSD), while ESPN/slate data uses ARI.
      AZ: 'AZ', ARI: 'AZ',
      ATH: 'ATH', OAK: 'ATH',
      CWS: 'CWS', CHW: 'CWS',
      WSH: 'WSH', WAS: 'WSH',
      SD: 'SD', SF: 'SF', TB: 'TB',
    }
    return map[upper] || upper
  }
  return upper
}

export function marketContainsGame(market: any, home: string, away: string): boolean {
  const hay = `${market.title || ''} ${JSON.stringify(market.custom_strike || {})} ${JSON.stringify(market.mve_selected_legs || [])}`.toUpperCase()
  return (hay.includes(`${away}${home}`) || hay.includes(`${home}${away}`) || (hay.includes(home) && hay.includes(away)))
}

export function selectedLegMarketTicker(leg: any): string {
  return String(leg?.market_ticker || leg?.market || leg?.ticker || '')
}

export function isExecutableGamePropMarket(m: any, prefix: string, homeCode: string, awayCode: string): boolean {
  const ask = dollarsToCents(m.yes_ask_dollars)
  const askSize = sizeToNum(m.yes_ask_size_fp)
  if (ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(m.status))) return false
  const legs = m.mve_selected_legs || []
  const hasSportLeg = legs.some((l: any) => String(l.market_ticker || l.event_ticker || '').startsWith(prefix))
  return hasSportLeg && marketContainsGame(m, homeCode, awayCode)
}

export function isExecutableStandaloneGamePropMarket(m: any, prefixes: string[], homeCode: string, awayCode: string): boolean {
  const ticker = String(m.ticker || '')
  if ((m.mve_selected_legs || []).length) return false
  if (!prefixes.some(p => ticker.startsWith(p))) return false
  const ask = dollarsToCents(m.yes_ask_dollars)
  const askSize = sizeToNum(m.yes_ask_size_fp)
  if (ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(m.status))) return false
  return marketContainsGame(m, homeCode, awayCode) || marketContainsGame({ title: `${m.event_ticker || ''} ${ticker}` }, homeCode, awayCode)
}
