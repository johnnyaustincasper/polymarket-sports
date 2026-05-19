import { describe, expect, it } from 'vitest'
import {
  findKalshiMatch,
  marketTextMatchesPlayer,
  lineFromKalshiTicker,
  metricFromKalshiTicker,
} from './kalshi-matching'

const baseRec = {
  metric: 'points',
  line: 20,
}

describe('Kalshi player-prop matching', () => {
  it('matches an exact NBA player, stat family, and line from a standalone contract', async () => {
    const match = await findKalshiMatch('Jalen Brunson', baseRec, 'nba', [{
      ticker: 'KXNBAPTS-NYKIND-JBRUNSON-20',
      event_ticker: 'KXNBAPTS-NYKIND',
      title: 'Jalen Brunson: 20+ points',
      yes_ask_dollars: '0.48',
      yes_ask_size_fp: '13',
      yes_bid_dollars: '0.45',
      yes_bid_size_fp: '22',
      status: 'open',
    }])

    expect(match).toMatchObject({
      ticker: 'KXNBAPTS-NYKIND-JBRUNSON-20',
      legTicker: 'KXNBAPTS-NYKIND-JBRUNSON-20',
      eventTicker: 'KXNBAPTS-NYKIND',
      yesAsk: 48,
      yesAskSize: 13,
      isCombo: false,
    })
  })

  it('rejects same-last-name NBA markets unless first and last names both match', async () => {
    const match = await findKalshiMatch('Jalen Williams', baseRec, 'nba', [{
      ticker: 'KXNBAPTS-OKCDAL-JWILLIAMS-20',
      event_ticker: 'KXNBAPTS-OKCDAL',
      title: 'Jaylin Williams: 20+ points',
      yes_ask_dollars: '0.42',
      yes_ask_size_fp: '4',
      status: 'open',
    }])

    expect(match).toBeNull()
  })

  it('rejects the right player when the Kalshi ticker line differs from the requested line', async () => {
    const match = await findKalshiMatch('Jalen Brunson', baseRec, 'nba', [{
      ticker: 'KXNBAPTS-NYKIND-JBRUNSON-25',
      event_ticker: 'KXNBAPTS-NYKIND',
      title: 'Jalen Brunson: 25+ points',
      yes_ask_dollars: '0.33',
      yes_ask_size_fp: '10',
      status: 'open',
    }])

    expect(match).toBeNull()
  })

  it('rejects the right player and line when the stat family is wrong', async () => {
    const match = await findKalshiMatch('Jalen Brunson', baseRec, 'nba', [{
      ticker: 'KXNBAAST-NYKIND-JBRUNSON-20',
      event_ticker: 'KXNBAAST-NYKIND',
      title: 'Jalen Brunson: 20+ assists',
      yes_ask_dollars: '0.01',
      yes_ask_size_fp: '99',
      status: 'open',
    }])

    expect(match).toBeNull()
  })

  it('uses the cheapest executable exact contract when multiple matches exist', async () => {
    const match = await findKalshiMatch('Jalen Brunson', baseRec, 'nba', [
      {
        ticker: 'KXNBAPTS-NYKIND-JBRUNSON-20-A',
        event_ticker: 'KXNBAPTS-NYKIND',
        title: 'Jalen Brunson: 20+ points',
        yes_ask_dollars: '0.55',
        yes_ask_size_fp: '100',
        status: 'open',
      },
      {
        ticker: 'KXNBAPTS-NYKIND-JBRUNSON-20',
        event_ticker: 'KXNBAPTS-NYKIND',
        title: 'Jalen Brunson: 20+ points',
        yes_ask_dollars: '0.47',
        yes_ask_size_fp: '7',
        status: 'active',
      },
    ])

    expect(match?.ticker).toBe('KXNBAPTS-NYKIND-JBRUNSON-20')
    expect(match?.yesAsk).toBe(47)
  })

  it('normalizes suffixes and accents for player text matching', () => {
    expect(marketTextMatchesPlayer('José Alvarado Jr.', 'Jose Alvarado: 2+ steals', 'nba')).toBe(true)
  })

  it('parses supported metric families and numeric lines from Kalshi tickers', () => {
    expect(metricFromKalshiTicker('KXNBAREB-LALBOS-ADAVIS-12', 'nba')).toBe('rebounds')
    expect(metricFromKalshiTicker('KXMLBHRR-NYYBOS-AJUDGE-3', 'mlb')).toBe('hits + runs + RBIs')
    expect(lineFromKalshiTicker('KXNBAPTS-NYKIND-JBRUNSON-20.5')).toBe(20.5)
  })
})
