const KALSHI_API = 'https://external-api.kalshi.com/trade-api/v2'

const SERIES = {
  nba: ['KXNBAPTS', 'KXNBAREB', 'KXNBAAST', 'KXNBASTL', 'KXNBABLK', 'KXNBA3PT'],
  mlb: ['KXMLBHIT', 'KXMLBHR', 'KXMLBHRR', 'KXMLBTB', 'KXMLBKS'],
}

function cents(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function size(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function isExecutable(market) {
  const ask = cents(market.yes_ask_dollars)
  const askSize = size(market.yes_ask_size_fp)
  return ask > 0 && ask < 100 && askSize > 0 && ['open', 'active'].includes(String(market.status))
}

async function json(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`)
  return res.json()
}

async function getSessionCookie(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/guest`, { method: 'POST' })
  return res.headers.get('set-cookie')?.split(';')[0] || ''
}

function eventSuffixesFromApp(players) {
  const suffixes = new Set()
  for (const player of players) {
    for (const rec of player.recommendations || []) {
      const eventTicker = rec.kalshi?.eventTicker || String(rec.kalshi?.legTicker || '').split('-').slice(0, 2).join('-')
      const suffix = String(eventTicker || '').split('-')[1]
      if (suffix) suffixes.add(suffix)
    }
  }
  return [...suffixes]
}

async function rawExecutableTickers(sport, suffixes) {
  const tickers = new Set()
  for (const suffix of suffixes) {
    for (const series of SERIES[sport]) {
      const data = await json(`${KALSHI_API}/events/${series}-${suffix}`).catch(() => ({ markets: [] }))
      for (const market of data.markets || []) {
        if (isExecutable(market)) tickers.add(String(market.ticker))
      }
    }
  }
  return tickers
}

async function main() {
  const [baseUrl = 'http://localhost:3000', sport = 'nba', home, away] = process.argv.slice(2)
  if (!SERIES[sport] || !home || !away) {
    console.error('Usage: node scripts/check-prop-coverage.js <baseUrl> <nba|mlb> <HOME> <AWAY>')
    process.exit(2)
  }

  const cookie = await getSessionCookie(baseUrl)
  const app = await json(`${baseUrl}/api/props?home=${home.toUpperCase()}&away=${away.toUpperCase()}&sport=${sport}`, { headers: { cookie } })
  const players = [...(app.home || []), ...(app.away || [])]
  const appTickers = new Set(players.flatMap(player => (player.recommendations || []).map(rec => rec.kalshi?.legTicker).filter(Boolean)))
  const suffixes = eventSuffixesFromApp(players)
  if (!suffixes.length) throw new Error('No Kalshi event suffix found in app response; cannot verify coverage.')

  const rawTickers = await rawExecutableTickers(sport, suffixes)
  const missing = [...rawTickers].filter(ticker => !appTickers.has(ticker)).sort()

  console.log(JSON.stringify({
    sport,
    game: `${away.toUpperCase()}@${home.toUpperCase()}`,
    eventSuffixes: suffixes,
    rawExecutable: rawTickers.size,
    appReturned: appTickers.size,
    missing: missing.length,
    missingTickers: missing.slice(0, 25),
  }, null, 2))

  if (missing.length) process.exit(1)
}

main().catch(error => {
  console.error(error.message || error)
  process.exit(1)
})
