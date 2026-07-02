import { describe, expect, it } from 'vitest'
import { buildJudgmentContext, statValueForMetric } from './judgment-context'

const baseLast12 = [
  { eventId: 'g1', date: '2026-05-30', opponent: 'DEN', stats: { minutes: 37, points: 29, fieldGoalsMade: 10, fieldGoalsAttempted: 21, fieldGoalPct: 47.6, threePointersMade: 4, threePointersAttempted: 9, threePointPct: 44.4, freeThrowsMade: 5, freeThrowsAttempted: 6, freeThrowPct: 83.3, rebounds: 6, assists: 5 } },
  { eventId: 'g2', date: '2026-05-28', opponent: 'DAL', stats: { minutes: 35, points: 24, fieldGoalsMade: 8, fieldGoalsAttempted: 19, fieldGoalPct: 42.1, threePointersMade: 2, threePointersAttempted: 7, freeThrowsMade: 6, freeThrowsAttempted: 7, rebounds: 5, assists: 7 } },
  { eventId: 'g3', date: '2026-05-26', opponent: 'OKC', stats: { minutes: 38, points: 31, fieldGoalsMade: 11, fieldGoalsAttempted: 23, threePointersMade: 3, threePointersAttempted: 8, freeThrowsMade: 6, freeThrowsAttempted: 8, rebounds: 7, assists: 4 } },
  { eventId: 'g4', date: '2026-05-24', opponent: 'PHX', stats: { minutes: 32, points: 18, fieldGoalsMade: 7, fieldGoalsAttempted: 16, threePointersMade: 1, threePointersAttempted: 5, freeThrowsMade: 3, freeThrowsAttempted: 4, rebounds: 4, assists: 6 } },
  { eventId: 'g5', date: '2026-05-22', opponent: 'LAL', stats: { minutes: 39, points: 37, fieldGoalsMade: 12, fieldGoalsAttempted: 25, threePointersMade: 5, threePointersAttempted: 11, freeThrowsMade: 8, freeThrowsAttempted: 9, rebounds: 8, assists: 3 } },
]

describe('signal judgment context', () => {
  it('extracts metric values and shooting-volume snapshots from full game logs', () => {
    expect(statValueForMetric(baseLast12[0], 'points')).toBe(29)
    expect(statValueForMetric(baseLast12[0], 'pts+reb+ast')).toBe(40)

    const context = buildJudgmentContext({
      player: 'Anthony Edwards',
      metric: 'points',
      line: 24.5,
      label: '25+ points',
      last12: baseLast12,
      lastGameMinutes: 37,
      risk: 'medium',
    })

    expect(context?.lastGame).toMatchObject({
      opponent: 'DEN',
      value: 29,
      minutes: 37,
      points: 29,
      fgMade: 10,
      fgAttempted: 21,
      fgPct: 47.6,
      threeMade: 4,
      threeAttempted: 9,
      ftMade: 5,
      ftAttempted: 6,
    })
    expect(context?.trend.last5Avg).toBe(27.8)
    expect(context?.trend.last5HitRate).toBe(3)
    expect(context?.trend.last5Games).toBe(5)
    expect(context?.trend.median).toBe(29)
    expect(context?.lineCheck).toMatchObject({ line: 24.5, median: 29, range: { min: 18, max: 37 }, hitRateLabel: '3 of 5 last 5 · 3 of 5 last 12' })
    expect(context?.volume.shotAttemptsLast5Avg).toBe(20.8)
    expect(context?.minutes.last5Avg).toBe(36.2)
    expect(context?.roleCheck?.status).toBe('stable')
    expect(context?.overallRatings.player.score).toBeGreaterThanOrEqual(60)
    expect(context?.overallRatings.matchup.label).toMatch(/Solid|Strong|Elite|Volatile/)
    expect(context?.consistency?.grade).toBe('solid')
    expect(context?.whyPlayerBullets.join(' ')).toContain("Anthony Edwards's case is scoring-volume driven")
    expect(context?.whyPlayerBullets.join(' ')).toContain('24.5+')
    expect(context?.whyPlayerBullets.join(' ')).toContain('Volume check: 20.8 shots')
    expect(context?.whyPlayerBullets.join(' ')).not.toMatch(/Minutes are the main thing|Simple read/)
  })

  it('writes judgment bullets around volume, minutes, clearer prop number, and playable number without generic matchup filler', () => {
    const context = buildJudgmentContext({
      player: 'Anthony Edwards',
      metric: 'points',
      line: 24.5,
      label: '25+ points',
      last12: baseLast12,
      lastGameMinutes: 37,
      risk: 'medium',
      teamIntel: {
        pace: { edgeLabel: 'fast', implication: 'Pace helps shot volume.' },
        injuryImpact: { homeNotes: ['Opponent missing a wing defender'] },
      },
      todayIntel: {
        lineup: { status: 'confirmed starter', reason: 'Normal starter minutes expected' },
        injuryContext: ['Teammate questionable could push usage his way'],
        usageContext: ['20+ shots in four straight games'],
        whatCouldKillIt: ['Blowout risk could cut 4Q minutes'],
      },
    })

    expect(context?.summaryBullets).toContain('Last game: 29 pts, 10/21 FG (47.6%), 4/9 3PT (44.4%), 5/6 FT in 37 min.')
    expect(context?.summaryBullets).toContain('Volume: 20.8 shots, 8.0 threes, and 6.8 free throws per game over the last 5.')
    expect(context?.summaryBullets.some(bullet => bullet.includes('Minutes: 37 last game / 36.2 last 5'))).toBe(true)
    expect(context?.decisionSections.map(section => section.title)).toEqual(['ROLE CHECK', 'PROP NUMBER', 'RISK CHECK'])
    const propNumberRows = context?.decisionSections.find(section => section.title === 'PROP NUMBER')?.rows.join(' ') || ''
    expect(propNumberRows).toContain("Today's prop: 24.5+ points")
    expect(propNumberRows).toContain('normal recent game is around 29')
    expect(propNumberRows).toContain('Recent hit rate: he hit 24.5+ points in 3 of the last 5 games')
    expect(propNumberRows).toContain('If it becomes 25.5+ points, be picky')
    expect(propNumberRows).toContain('If it becomes 26.5+ points, skip it')
    expect(propNumberRows).not.toMatch(/Listed prop|Recent middle result|easier threshold|line moves past/i)
    expect(context?.decisionSections.find(section => section.title === 'RISK CHECK')?.rows.join(' ')).toMatch(/Blowout risk|Green light is 24\.5\+ points/)
    expect(context?.decisionSections.some(section => section.title === 'MATCHUP CHECK' as never)).toBe(false)
    expect(context?.decisionSections.some(section => section.rows.join(' ').includes('Basketball context'))).toBe(false)
    expect(context?.matchupNotes.join(' ')).toMatch(/Pace helps shot volume|Opponent missing/)
    expect(context?.overallRatings.team.score).toBeGreaterThanOrEqual(65)
    expect(context?.riskNotes.join(' ')).toMatch(/Blowout risk/)
    expect(context?.playableNumber).toBe('Green light is 24.5+ points. If it jumps to 25.5+ points, be picky. If it reaches 26.5+ points, skip it.')
  })

  it('builds player-specific why bullets for assist props instead of generic role filler', () => {
    const context = buildJudgmentContext({
      player: "De'Aaron Fox",
      metric: 'assists',
      line: 4,
      label: '4+ assists',
      last12: baseLast12,
      lastGameMinutes: 37,
      risk: 'medium',
    })

    const why = context?.whyPlayerBullets.join(' ') || ''
    expect(why).toContain("De'Aaron Fox's case is creation-driven")
    expect(why).toContain('5.0 over the last 5')
    expect(why).toContain('4+')
    expect(why).toContain('normal on-ball reps')
    expect(why).not.toMatch(/Minutes are the main thing|Simple read|Last game:/)
  })

  it('builds player-specific why bullets for rebound props instead of template filler', () => {
    const hartLast12 = [
      { eventId: 'h1', stats: { minutes: 24, points: 6, rebounds: 11, assists: 3, fieldGoalsMade: 2, fieldGoalsAttempted: 5, threePointersMade: 1, threePointersAttempted: 3, freeThrowsMade: 1, freeThrowsAttempted: 2 } },
      { eventId: 'h2', stats: { minutes: 35, points: 12, rebounds: 9, assists: 5 } },
      { eventId: 'h3', stats: { minutes: 31, points: 8, rebounds: 7, assists: 4 } },
      { eventId: 'h4', stats: { minutes: 30, points: 10, rebounds: 9, assists: 2 } },
      { eventId: 'h5', stats: { minutes: 32, points: 7, rebounds: 4, assists: 6 } },
      { eventId: 'h6', stats: { minutes: 33, points: 11, rebounds: 8, assists: 3 } },
    ]

    const context = buildJudgmentContext({
      player: 'Josh Hart',
      metric: 'rebounds',
      line: 4,
      label: '4+ rebounds',
      last12: hartLast12,
      risk: 'medium',
    })

    const why = context?.whyPlayerBullets.join(' ') || ''
    expect(why).toContain("Josh Hart's case is rebounding-specific, not scoring-dependent")
    expect(why).toContain('11 boards last game')
    expect(why).toContain('one cold shooting night does not kill it')
    expect(why).toContain('Workload/floor check')
    expect(why).not.toMatch(/Stable \d+-\d+ minute role lately|Simple read|Minutes are the main thing|fits this rebounding look/)
  })

  it('supports MLB combo props without calling them points', () => {
    const last12 = [
      { eventId: 'm1', date: '2026-05-30', opponent: 'BAL', stats: { hits: 2, runs: 1, RBIs: 3, totalBases: 5 } },
      { eventId: 'm2', date: '2026-05-29', opponent: 'NYY', stats: { hits: 1, runs: 0, RBIs: 1, totalBases: 2 } },
      { eventId: 'm3', date: '2026-05-28', opponent: 'BOS', stats: { hits: 0, runs: 1, RBIs: 0, totalBases: 0 } },
    ]

    expect(statValueForMetric(last12[0], 'hits + runs + RBIs')).toBe(6)
    const context = buildJudgmentContext({
      player: 'Vladimir Guerrero Jr.',
      metric: 'hits + runs + RBIs',
      label: '3+ hits + runs + RBIs',
      line: 3,
      last12,
    })

    expect(context?.lastGame.value).toBe(6)
    expect(context?.summaryBullets[0]).toBe('Last game: 6 hits + runs + RBIs.')
    expect(context?.trend.last5HitRate).toBe(1)
    expect(context?.sportSpecificNotes?.[0]).toContain('baseball')
    expect(context?.whyPlayerBullets.join(' ')).toContain('full-offense involvement')
    expect(context?.whyPlayerBullets.join(' ')).toContain('lineup spot and team run environment')
    expect(context?.whyPlayerBullets.join(' ')).toContain('park/weather')
    expect(context?.whyPlayerBullets.join(' ')).not.toMatch(/raw odds|market price|Pass/i)
    expect(context?.mlbConviction?.read).toContain('run-environment read')
    expect(context?.mlbConviction?.matchupRating?.playerLabel).toBe('Run-production rating')
    expect(context?.mlbConviction?.matchupRating?.bestFit).toMatch(/Runs\/RBIs|Hits|Total bases/)
    expect(context?.mlbConviction?.matchupRating?.playerRating).toBeGreaterThanOrEqual(35)
    expect(context?.mlbConviction?.matchupRating?.rows.join(' ')).toContain('Best prop fit')
    expect(context?.mlbConviction?.whyLive.join(' ')).toContain('lineup spot and traffic')
    expect(context?.mlbConviction?.path).toContain('lineup context')
    expect(context?.mlbConviction?.killSwitch.join(' ')).toContain('drops in the order')
    expect(context?.mlbConviction?.whyLive.join(' ')).not.toMatch(/trend supports|recent form backs|good spot/i)
    expect(context?.decisionSections.find(section => section.title === 'PROP NUMBER')?.rows.join(' ')).toContain("Today's prop: 3+ hits + runs + rbis")
  })

  it('adds baseball-specific context for pitcher strikeout reads', () => {
    const last12 = [
      { eventId: 'p1', date: '2026-06-01', opponent: 'SEA', stats: { strikeouts: 8 } },
      { eventId: 'p2', date: '2026-05-26', opponent: 'TEX', stats: { strikeouts: 6 } },
      { eventId: 'p3', date: '2026-05-20', opponent: 'HOU', stats: { strikeouts: 4 } },
      { eventId: 'p4', date: '2026-05-14', opponent: 'OAK', stats: { strikeouts: 7 } },
      { eventId: 'p5', date: '2026-05-08', opponent: 'LAA', stats: { strikeouts: 5 } },
    ]

    const context = buildJudgmentContext({
      player: 'Tarik Skubal',
      metric: 'strikeouts',
      label: '6+ strikeouts',
      line: 6,
      last12,
    })

    const why = context?.whyPlayerBullets.join(' ') || ''
    expect(why).toContain('pitcher workload/swing-miss driven')
    expect(why).toContain('opponent K-rate')
    expect(why).toContain('umpire zone')
    expect(why).not.toMatch(/odds|market|Pass/i)
    expect(context?.mlbConviction?.read).toContain('pitcher-K read')
    expect(context?.mlbConviction?.matchupRating).toMatchObject({ playerLabel: 'Pitcher K rating', opponentLabel: 'Lineup contact risk', bestFit: 'Strikeouts' })
    expect(context?.mlbConviction?.matchupRating?.playerRating).toBeGreaterThanOrEqual(35)
    expect(context?.mlbConviction?.matchupRating?.opponentRating).toBeGreaterThanOrEqual(35)
    expect(context?.mlbConviction?.matchupRating?.rows.join(' ')).toContain('K form')
    expect(context?.mlbConviction?.whyLive.join(' ')).toContain('opposing lineup brings real swing-and-miss')
    expect(context?.mlbConviction?.path).toContain('two-strike pitches')
    expect(context?.mlbConviction?.killSwitch.join(' ')).toContain('short leash')
    expect(context?.mlbConviction?.whyLive.join(' ')).not.toMatch(/strikeout trend supports the number|trend supports|good spot/i)
  })

  it('grades an obvious ace-vs-whiff-lineup setup as a large strikeout matchup gap', () => {
    const last12 = [
      { eventId: 'a1', stats: { strikeouts: 11 } },
      { eventId: 'a2', stats: { strikeouts: 9 } },
      { eventId: 'a3', stats: { strikeouts: 10 } },
      { eventId: 'a4', stats: { strikeouts: 8 } },
      { eventId: 'a5', stats: { strikeouts: 12 } },
      { eventId: 'a6', stats: { strikeouts: 7 } },
      { eventId: 'a7', stats: { strikeouts: 9 } },
      { eventId: 'a8', stats: { strikeouts: 10 } },
      { eventId: 'a9', stats: { strikeouts: 8 } },
      { eventId: 'a10', stats: { strikeouts: 11 } },
    ]

    const context = buildJudgmentContext({
      player: 'Ace Starter',
      metric: 'strikeouts',
      label: '7+ strikeouts',
      line: 7,
      last12,
    })

    expect(context?.mlbConviction?.matchupRating).toMatchObject({
      playerLabel: 'Pitcher K rating',
      opponentLabel: 'Lineup contact risk',
      bestFit: 'Strikeouts',
    })
    expect(context?.mlbConviction?.matchupRating?.playerRating).toBeGreaterThanOrEqual(90)
    expect(context?.mlbConviction?.matchupRating?.matchupGap).toBeGreaterThanOrEqual(18)
    expect(context?.mlbConviction?.matchupRating?.read).toContain('/100 strikeout profile')
    expect(context?.mlbConviction?.misreadSignal).toMatchObject({
      kind: 'pitcher_k',
      label: 'Pitcher K misread',
      severity: 'strong',
      playerRating: expect.any(Number),
      opponentRating: expect.any(Number),
    })
    expect(context?.mlbConviction?.matchupRating?.ratingTitle).toBe('Pitcher K Overall')
    expect(context?.mlbConviction?.matchupRating?.subRatings.map(row => row.label)).toEqual(expect.arrayContaining(['Stuff', 'Recent form', 'Opponent whiff', 'Line fit']))
    expect(context?.mlbConviction?.misreadSignal?.summary).toContain('Pitcher K Overall')
  })

  it('flags hitter power misreads separately from contact looks', () => {
    const last12 = [
      { eventId: 'hr1', stats: { homeRuns: 3 } },
      { eventId: 'hr2', stats: { homeRuns: 2 } },
      { eventId: 'hr3', stats: { homeRuns: 2 } },
      { eventId: 'hr4', stats: { homeRuns: 1 } },
      { eventId: 'hr5', stats: { homeRuns: 2 } },
      { eventId: 'hr6', stats: { homeRuns: 2 } },
      { eventId: 'hr7', stats: { homeRuns: 1 } },
      { eventId: 'hr8', stats: { homeRuns: 2 } },
      { eventId: 'hr9', stats: { homeRuns: 2 } },
      { eventId: 'hr10', stats: { homeRuns: 3 } },
    ]

    const context = buildJudgmentContext({
      player: 'Power Bat',
      metric: 'home runs',
      label: '1+ home runs',
      line: 1,
      last12,
    })

    expect(context?.mlbConviction?.matchupRating?.bestFit).toBe('Home runs')
    expect(context?.mlbConviction?.misreadSignal).toMatchObject({
      kind: 'hitter_power',
      label: 'Power misread',
    })
    expect(context?.mlbConviction?.misreadSignal?.reason).toContain('power-path gap')
  })

})
