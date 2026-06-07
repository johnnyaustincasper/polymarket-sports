export type Sport = 'nba' | 'nfl' | 'mlb' | 'nhl'

export type PropRecommendationLike = {
  metric: string
  line: number
}

export interface KalshiMarketMatch {
  ticker: string
  title: string
  url: string
  legTicker: string
  eventTicker?: string
  yesAsk: number
  yesAskSize: number
  yesBid: number
  yesBidSize: number
  isCombo: boolean
}

export function dollarsToCents(v: unknown): number {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function sizeToNum(v: unknown): number {
  const n = Number(v || 0)
  return Number.isFinite(n) ? n : 0
}

export function metricPrefixes(metric: string, sport: Sport): string[] {
  if (sport === 'nba') {
    if (metric === 'points') return ['KXNBAPTS']
    if (metric === 'rebounds') return ['KXNBAREB']
    if (metric === 'assists') return ['KXNBAAST']
    if (metric === 'steals') return ['KXNBASTL']
    if (metric === 'blocks') return ['KXNBABLK']
    if (metric === 'threes') return ['KXNBA3PT']
    return []
  }
  if (sport === 'mlb') {
    if (metric === 'hits') return ['KXMLBHIT']
    if (metric === 'home runs') return ['KXMLBHR']
    if (metric === 'hits + runs + RBIs') return ['KXMLBHRR']
    if (metric === 'total bases') return ['KXMLBTB']
    if (metric === 'strikeouts') return ['KXMLBKS']
    return []
  }
  if (sport === 'nhl') {
    if (metric === 'goals') return ['KXNHLGOAL']
    if (metric === 'points') return ['KXNHLPTS']
    if (metric === 'assists') return ['KXNHLAST']
    return []
  }
  if (metric === 'passing yards') return ['KXNFLPASSYDS', 'KXNFLPASSYD', 'KXNFLPYDS']
  if (metric === 'passing TDs') return ['KXNFLPASSTD', 'KXNFLPTD']
  if (metric === 'rushing yards') return ['KXNFLRUSHYDS', 'KXNFLRUSHYD', 'KXNFLRYDS']
  if (metric === 'receptions') return ['KXNFLREC']
  if (metric === 'receiving yards') return ['KXNFLRECYDS', 'KXNFLRECYD']
  return []
}

export function metricAliases(metric: string): string[] {
  if (metric === 'points') return ['points', 'pts']
  if (metric === 'rebounds') return ['rebounds', 'rebs', 'reb']
  if (metric === 'assists') return ['assists', 'asts', 'ast']
  if (metric === 'steals') return ['steals', 'stls', 'stl']
  if (metric === 'blocks') return ['blocks', 'blks', 'blk']
  if (metric === 'threes') return ['3pt', '3 pointer', 'threes', 'three pointers']
  if (metric === 'PTS+REB+AST') return ['pts reb ast', 'points rebounds assists', 'pra']
  if (metric === 'passing yards') return ['passing yards', 'pass yards']
  if (metric === 'passing TDs') return ['passing tds', 'passing touchdowns', 'pass tds', 'pass touchdowns']
  if (metric === 'rushing yards') return ['rushing yards', 'rush yards']
  if (metric === 'receiving yards') return ['receiving yards', 'rec yards']
  if (metric === 'receptions') return ['receptions', 'catches']
  if (metric === 'hits') return ['hits']
  if (metric === 'home runs') return ['home runs', 'homeruns', 'homers', 'hr']
  if (metric === 'hits + runs + RBIs') return ['hits runs rbis', 'hit run rbi', 'hrr']
  if (metric === 'total bases') return ['total bases', 'bases']
  if (metric === 'strikeouts') return ['strikeouts', 'ks', 'k s']
  if (metric === 'goals') return ['goals', 'goal']
  return [metric]
}

export function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function nameTokens(s: string): string[] {
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])
  return normalizeName(s).split(' ').filter(t => t && !suffixes.has(t))
}

export function playerNameMatches(a: string, b: string): boolean {
  const left = normalizeName(a)
  const right = normalizeName(b)
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)))
}

export function marketTextMatchesPlayer(player: string, marketText: string, sport: Sport): boolean {
  const hay = normalizeName(marketText)
  const name = normalizeName(player)
  if (!hay || !name) return false
  if (hay.includes(name)) return true

  const tokens = nameTokens(player)
  const first = tokens[0]
  const last = tokens.at(-1)
  if (sport === 'nba' || sport === 'mlb' || sport === 'nhl') return Boolean(first && last && first !== last && hay.includes(first) && hay.includes(last))

  return Boolean(last && last.length >= 5 && hay.includes(last))
}

export function textHaystack(m: any): string {
  return `${m.title || ''} ${m.yes_sub_title || ''} ${m.subtitle || ''} ${m.rules_primary || ''}`
}

export function marketTextMatches(player: string, rec: PropRecommendationLike, m: any, sport: Sport): boolean {
  const raw = textHaystack(m)
  if (!marketTextMatchesPlayer(player, raw, sport)) return false
  if (sport === 'nba' || sport === 'nfl' || sport === 'mlb' || sport === 'nhl') return true

  const hay = normalizeName(raw)
  const aliases = metricAliases(rec.metric).map(normalizeName)
  return aliases.some(alias => hay.includes(alias))
}

export function lineFromKalshiTicker(ticker: string): number | null {
  const parts = String(ticker || '').split('-').reverse()
  for (const part of parts) {
    const match = part.match(/\d+(?:\.\d+)?/)
    if (!match) continue
    const n = Number(match[0])
    if (Number.isFinite(n)) return n
  }
  return null
}

export function kalshiSeriesSlug(series: string): string {
  const s = series.toUpperCase()
  const map: Record<string, string> = {
    KXNBAPTS: 'pro-basketball-player-points',
    KXNBAREB: 'pro-basketball-player-rebounds',
    KXNBAAST: 'pro-basketball-player-assists',
    KXMLBHIT: 'pro-baseball-player-hits',
    KXMLBHR: 'pro-baseball-player-home-runs',
    KXMLBHRR: 'pro-baseball-player-hits-runs-rbis',
    KXMLBTB: 'pro-baseball-player-total-bases',
    KXMLBKS: 'pro-baseball-player-strikeouts',
    KXNFLPASSYDS: 'pro-football-player-passing-yards',
    KXNFLPASSYD: 'pro-football-player-passing-yards',
    KXNFLPYDS: 'pro-football-player-passing-yards',
    KXNFLPASSTD: 'pro-football-player-passing-touchdowns',
    KXNFLPTD: 'pro-football-player-passing-touchdowns',
    KXNFLRUSHYDS: 'pro-football-player-rushing-yards',
    KXNFLRUSHYD: 'pro-football-player-rushing-yards',
    KXNFLRYDS: 'pro-football-player-rushing-yards',
    KXNFLREC: 'pro-football-player-receptions',
    KXNFLRECYDS: 'pro-football-player-receiving-yards',
    KXNFLRECYD: 'pro-football-player-receiving-yards',
    KXNHLGOAL: 'pro-hockey-player-goals',
    KXNHLPTS: 'pro-hockey-player-points',
    KXNHLAST: 'pro-hockey-player-assists',
  }
  return map[s] || 'markets'
}

export function kalshiMarketUrl(ticker: string): string {
  const parts = String(ticker || '').split('-')
  const series = parts[0] || ''
  const eventTicker = parts.length >= 2 ? parts.slice(0, 2).join('-') : ticker
  const base = `https://kalshi.com/markets/${series.toLowerCase()}/${kalshiSeriesSlug(series)}/${eventTicker.toLowerCase()}`
  const encodedTicker = encodeURIComponent(ticker)
  return `${base}?market=${encodedTicker}&market_ticker=${encodedTicker}#${encodedTicker}`
}

export function metricFromKalshiTicker(ticker: string, sport: Sport): string | null {
  const t = String(ticker || '').toUpperCase()
  if (sport === 'nba') {
    if (t.startsWith('KXNBAPTS')) return 'points'
    if (t.startsWith('KXNBAREB')) return 'rebounds'
    if (t.startsWith('KXNBAAST')) return 'assists'
    if (t.startsWith('KXNBASTL')) return 'steals'
    if (t.startsWith('KXNBABLK')) return 'blocks'
    if (t.startsWith('KXNBA3PT')) return 'threes'
  }
  if (sport === 'mlb') {
    if (t.startsWith('KXMLBHRR')) return 'hits + runs + RBIs'
    if (t.startsWith('KXMLBHIT')) return 'hits'
    if (t.startsWith('KXMLBHR')) return 'home runs'
    if (t.startsWith('KXMLBTB')) return 'total bases'
    if (t.startsWith('KXMLBKS')) return 'strikeouts'
  }
  if (t.startsWith('KXNFLPASSYDS') || t.startsWith('KXNFLPASSYD') || t.startsWith('KXNFLPYDS')) return 'passing yards'
  if (t.startsWith('KXNFLPASSTD') || t.startsWith('KXNFLPTD')) return 'passing TDs'
  if (t.startsWith('KXNFLRUSHYDS') || t.startsWith('KXNFLRUSHYD') || t.startsWith('KXNFLRYDS')) return 'rushing yards'
  if (t.startsWith('KXNFLRECYDS') || t.startsWith('KXNFLRECYD')) return 'receiving yards'
  if (t.startsWith('KXNFLREC')) return 'receptions'
  if (sport === 'nhl') {
    if (t.startsWith('KXNHLGOAL')) return 'goals'
    if (t.startsWith('KXNHLPTS')) return 'points'
    if (t.startsWith('KXNHLAST')) return 'assists'
  }
  return null
}

export async function findKalshiMatch(player: string, rec: PropRecommendationLike, sport: Sport, markets: any[]): Promise<KalshiMarketMatch | null> {
  const prefixes = metricPrefixes(rec.metric, sport)
  if (!prefixes.length) return null
  const matches = markets
    .filter((m: any) => {
      const ticker = String(m.ticker || '')
      const legs = m.mve_selected_legs || []
      return legs.length === 0
        && prefixes.some(p => ticker.startsWith(p))
        && lineFromKalshiTicker(ticker) === rec.line
        && marketTextMatches(player, rec, m, sport)
    })
    .map((standalone: any) => {
      const ticker = String(standalone.ticker || '')
      const ask = dollarsToCents(standalone.yes_ask_dollars)
      const askSize = sizeToNum(standalone.yes_ask_size_fp)
      if (ask <= 0 || ask >= 100 || askSize <= 0 || !['open', 'active'].includes(String(standalone.status))) return null
      return {
        ticker,
        title: String(standalone.title || standalone.yes_sub_title || ''),
        url: kalshiMarketUrl(ticker),
        legTicker: ticker,
        eventTicker: String(standalone.event_ticker || ticker.split('-').slice(0, 2).join('-')),
        yesAsk: ask,
        yesAskSize: askSize,
        yesBid: dollarsToCents(standalone.yes_bid_dollars),
        yesBidSize: sizeToNum(standalone.yes_bid_size_fp),
        isCombo: false,
      } satisfies KalshiMarketMatch
    })
    .filter(Boolean) as KalshiMarketMatch[]

  return matches.sort((a, b) => a.yesAsk - b.yesAsk || b.yesAskSize - a.yesAskSize)[0] || null
}
