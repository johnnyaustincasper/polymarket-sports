import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('market feed refresh resilience', () => {
  it('keeps sport-switch refreshes from letting stale requests overwrite the active slate', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'AppClient.tsx'), 'utf8')

    expect(source).toContain('feedRequestSeqRef')
    expect(source).toContain('feedAbortRef')
    expect(source).toContain('feedAbortRef.current?.abort()')
    expect(source).toContain('signal: controller.signal')
    expect(source).toContain('if (!isCurrentFeedRequest()) return')
  })

  it('keeps the user-facing markets route lenient enough for normal mobile sport switching', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/markets/route.ts'), 'utf8')

    expect(source).toContain("enforceRateLimit(req, 'markets', { limit: 240, windowMs: 60_000 })")
    expect(source).toContain('normalizeMarketDateParam')
    expect(source).toContain("value === 'tomorrow'")
    expect(source).toContain('chicagoYmd(new Date(event.date)) === displayDate')
  })

  it('advances MLB/Kalshi off final-only slates so Signals can scan upcoming games', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'AppClient.tsx'), 'utf8')

    expect(source).toContain('shouldSeekNextActiveSlate')
    expect(source).toContain("sportToLoad === 'mlb' && loadedGames.every(g => g.status === 'post')")
    expect(source).toContain('candidateGames.some(g => g.status !== \'post\')')
  })

  it('does not strand first-load Player Signals on empty UFC when MLB has the active slate', () => {
    const appSource = readFileSync(join(process.cwd(), 'app', 'AppClient.tsx'), 'utf8')
    const startupSource = readFileSync(join(process.cwd(), 'app', 'lib', 'startup-sport.ts'), 'utf8')

    expect(appSource).toContain("(sport === 'mlb' || sport === 'ufc')")
    expect(appSource).toContain("startupSportResolvedRef.current = lastSport !== 'ufc'")
    expect(startupSource).toContain("STARTUP_SPORT_FALLBACK_ORDER = ['mlb'")
  })

  it('keys daily signal cache by slate ids so partial scans do not poison full boards', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'api', 'signals', 'route.ts'), 'utf8')

    expect(source).toContain('function slateSignature')
    expect(source).toContain('todaySignalsCacheKey(sport, slateDate, activeGameIds)')
    expect(source).toContain('TODAY_SIGNAL_SCHEMA = \'v16\'')
  })

  it('loads a fast Signals board automatically instead of making the phone wait on full AI enrichment', () => {
    const appSource = readFileSync(join(process.cwd(), 'app', 'AppClient.tsx'), 'utf8')
    const routeSource = readFileSync(join(process.cwd(), 'app', 'api', 'signals', 'route.ts'), 'utf8')

    expect(appSource).toContain('runSignals(false, true)')
    expect(appSource).toContain('body: JSON.stringify({ sport, games: activeGames, force, fast, daily: !fast, slateDate: date })')
    expect(routeSource).toContain('const fast = body.fast === true')
    expect(routeSource).toContain('const daily = body.daily === true && !fast')
    expect(routeSource).toContain("SIGNAL_CACHE_SCHEMA = 'v18'")
  })
})
