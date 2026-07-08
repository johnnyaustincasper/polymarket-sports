import { describe, expect, it } from 'vitest'
import {
  isExecutableGamePropMarket,
  isExecutableStandaloneGamePropMarket,
  kalshiTeamCode,
  marketContainsGame,
  selectedLegMarketTicker,
} from './kalshi-markets'

describe('Kalshi market filters', () => {
  it('normalizes ESPN team abbreviations to Kalshi team codes', () => {
    expect(kalshiTeamCode('GS', 'nba')).toBe('GSW')
    expect(kalshiTeamCode('SA', 'nba')).toBe('SAS')
    expect(kalshiTeamCode('CHW', 'mlb')).toBe('CWS')
    expect(kalshiTeamCode('OAK', 'mlb')).toBe('ATH')
    expect(kalshiTeamCode('ARI', 'mlb')).toBe('AZ')
    expect(kalshiTeamCode('KC', 'nfl')).toBe('KC')
  })

  it('detects a game from title, custom strike, or selected legs', () => {
    expect(marketContainsGame({ title: 'LALBOS player props' }, 'LAL', 'BOS')).toBe(true)
    expect(marketContainsGame({ custom_strike: { matchup: 'BOS at LAL' } }, 'LAL', 'BOS')).toBe(true)
    expect(marketContainsGame({ mve_selected_legs: [{ event_ticker: 'KXNBAPTS-LALBOS' }] }, 'LAL', 'BOS')).toBe(true)
    expect(marketContainsGame({ title: 'NYKBOS player props' }, 'LAL', 'BOS')).toBe(false)
  })

  it('recognizes executable combo markets only when they have sport legs, game text, ask, size, and open status', () => {
    const market = {
      title: 'LALBOS combo',
      status: 'open',
      yes_ask_dollars: '0.51',
      yes_ask_size_fp: '8',
      mve_selected_legs: [{ market_ticker: 'KXNBAPTS-LALBOS-LJAMES-25' }],
    }

    expect(isExecutableGamePropMarket(market, 'KXNBA', 'LAL', 'BOS')).toBe(true)
    expect(isExecutableGamePropMarket({ ...market, yes_ask_size_fp: '0' }, 'KXNBA', 'LAL', 'BOS')).toBe(false)
    expect(isExecutableGamePropMarket({ ...market, status: 'closed' }, 'KXNBA', 'LAL', 'BOS')).toBe(false)
    expect(isExecutableGamePropMarket({ ...market, mve_selected_legs: [{ market_ticker: 'KXNFLPASSYDS-KCDEN-MAHOMES-250' }] }, 'KXNBA', 'LAL', 'BOS')).toBe(false)
  })

  it('matches Kalshi AZ event tickers for ESPN ARI slates', () => {
    const market = {
      ticker: 'KXMLBHIT-26JUL072140AZSD-AZTTAWA13-1',
      event_ticker: 'KXMLBHIT-26JUL072140AZSD',
      title: 'Tim Tawa: 1+ hits?',
      status: 'active',
      yes_ask_dollars: '0.55',
      yes_ask_size_fp: '217',
    }

    expect(isExecutableStandaloneGamePropMarket(market, ['KXMLBHIT'], kalshiTeamCode('SD', 'mlb'), kalshiTeamCode('ARI', 'mlb'))).toBe(true)
  })

  it('recognizes executable standalone player props by supported prefix and game context', () => {
    const market = {
      ticker: 'KXNBAPTS-LALBOS-LJAMES-25',
      event_ticker: 'KXNBAPTS-LALBOS',
      title: 'LeBron James: 25+ points',
      status: 'active',
      yes_ask_dollars: '0.47',
      yes_ask_size_fp: '12',
    }

    expect(isExecutableStandaloneGamePropMarket(market, ['KXNBAPTS'], 'LAL', 'BOS')).toBe(true)
    expect(isExecutableStandaloneGamePropMarket({ ...market, ticker: 'KXNBAAST-LALBOS-LJAMES-8' }, ['KXNBAPTS'], 'LAL', 'BOS')).toBe(false)
    expect(isExecutableStandaloneGamePropMarket({ ...market, mve_selected_legs: [{ market_ticker: market.ticker }] }, ['KXNBAPTS'], 'LAL', 'BOS')).toBe(false)
    expect(isExecutableStandaloneGamePropMarket({ ...market, yes_ask_dollars: '1.00' }, ['KXNBAPTS'], 'LAL', 'BOS')).toBe(false)
  })

  it('extracts selected leg market tickers from Kalshi leg shapes', () => {
    expect(selectedLegMarketTicker({ market_ticker: 'A' })).toBe('A')
    expect(selectedLegMarketTicker({ market: 'B' })).toBe('B')
    expect(selectedLegMarketTicker({ ticker: 'C' })).toBe('C')
  })
})
