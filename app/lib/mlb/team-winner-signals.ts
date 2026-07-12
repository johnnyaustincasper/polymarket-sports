export type MlbWinnerPitcher = {
  name?: string
  team?: string
  era?: number | null
  whip?: number | null
  kPer9?: number | null
  difficulty?: number | null
  label?: string
}

export type MlbWinnerTeamProfile = {
  team?: string
  hitterCount?: number | null
  hitsAvg?: number | null
  totalBasesAvg?: number | null
  hrrAvg?: number | null
  strikeoutsAvg?: number | null
  weaknessScore?: number | null
  powerScore?: number | null
}

export type MlbWinnerTeamInput = {
  abbr: string
  name?: string
  record?: string
  side: 'home' | 'away'
  pitcher?: MlbWinnerPitcher | null
  battingProfile?: MlbWinnerTeamProfile | null
  opponentPitcher?: MlbWinnerPitcher | null
  opponentProfile?: MlbWinnerTeamProfile | null
}

export type MlbTeamWinnerSignal = {
  id: string
  gameId: string
  matchup: string
  gameTime?: string
  pick: 'home' | 'away'
  team: string
  opponent: string
  label: 'Strong look' | 'Small lean' | 'Price watch' | 'Needs better setup'
  decision: 'PLAY' | 'WATCH' | 'PASS'
  decisionLabel: 'Play' | 'Watch' | 'Pass'
  playabilityScore: number
  score: number
  edge: number
  starterEdge: number
  offenseEdge: number
  recordEdge: number
  confidence: number
  read: string
  whyLive: string[]
  path: string
  risk: string[]
  numberDiscipline: string
  playabilityReasons: string[]
  passReasons: string[]
  components: {
    team: { starter: number; offense: number; record: number; homeField: number }
    opponent: { starter: number; offense: number; record: number; homeField: number }
  }
}

function finite(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function cleanId(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
}

function recordPct(record?: string): number {
  const match = String(record || '').match(/(\d+)\s*-\s*(\d+)/)
  if (!match) return 50
  const wins = Number(match[1])
  const losses = Number(match[2])
  const total = wins + losses
  if (!total) return 50
  return clamp((wins / total) * 100)
}

function starterScore(pitcher?: MlbWinnerPitcher | null): number {
  const difficulty = finite(pitcher?.difficulty)
  if (difficulty != null) return clamp(100 - difficulty)
  const era = finite(pitcher?.era)
  const whip = finite(pitcher?.whip)
  const kPer9 = finite(pitcher?.kPer9)
  return clamp(58 + (era == null ? 0 : (4.4 - era) * 7) + (whip == null ? 0 : (1.32 - whip) * 22) + (kPer9 == null ? 0 : (kPer9 - 8) * 2.4))
}

function offenseScore(profile?: MlbWinnerTeamProfile | null): number {
  const power = finite(profile?.powerScore)
  if (power != null) return clamp(power)
  const hits = finite(profile?.hitsAvg)
  const tb = finite(profile?.totalBasesAvg)
  const hrr = finite(profile?.hrrAvg)
  return clamp(50 + (hits == null ? 0 : (hits - 0.9) * 30) + (tb == null ? 0 : (tb - 1.45) * 20) + (hrr == null ? 0 : (hrr - 1.8) * 12))
}

function matchupScore(team: MlbWinnerTeamInput): number {
  const starter = starterScore(team.pitcher)
  const offense = offenseScore(team.battingProfile)
  const opponentOffense = offenseScore(team.opponentProfile)
  const opponentStarterTarget = finite(team.opponentPitcher?.difficulty) ?? (100 - starterScore(team.opponentPitcher))
  const record = recordPct(team.record)
  const homeField = team.side === 'home' ? 54 : 48
  return clamp(
    starter * 0.30 +
    offense * 0.22 +
    (100 - opponentOffense) * 0.13 +
    opponentStarterTarget * 0.15 +
    record * 0.12 +
    homeField * 0.08
  )
}

function pitcherText(pitcher?: MlbWinnerPitcher | null) {
  if (!pitcher?.name) return 'starter context is still filling in'
  const parts = [pitcher.name]
  if (finite(pitcher.era) != null) parts.push(`${Number(pitcher.era).toFixed(2)} ERA`)
  if (finite(pitcher.whip) != null) parts.push(`${Number(pitcher.whip).toFixed(2)} WHIP`)
  if (finite(pitcher.kPer9) != null) parts.push(`${Number(pitcher.kPer9).toFixed(1)} K/9`)
  return parts.join(' · ')
}

function profileText(team: string, profile?: MlbWinnerTeamProfile | null) {
  if (!profile) return `${team} recent team-bat profile is still filling in.`
  const hitters = finite(profile.hitterCount)
  const hits = finite(profile.hitsAvg)
  const tb = finite(profile.totalBasesAvg)
  const hrr = finite(profile.hrrAvg)
  return `${team} recent bats: ${hits == null ? '—' : hits.toFixed(1)} hits avg, ${tb == null ? '—' : tb.toFixed(1)} total bases avg, ${hrr == null ? '—' : hrr.toFixed(1)} H+R+RBI avg${hitters ? ` across ${hitters} hitters` : ''}.`
}

function labelFor(score: number, edge: number): MlbTeamWinnerSignal['label'] {
  if (score >= 80 && edge >= 12) return 'Strong look'
  if (score >= 69 && edge >= 7) return 'Small lean'
  if (score >= 58 && edge >= 3) return 'Price watch'
  return 'Needs better setup'
}

function playabilityFor(args: {
  score: number
  edge: number
  starterEdge: number
  offenseEdge: number
  recordEdge: number
  picked: MlbWinnerTeamInput
  other: MlbWinnerTeamInput
}): { decision: MlbTeamWinnerSignal['decision']; decisionLabel: MlbTeamWinnerSignal['decisionLabel']; playabilityScore: number; reasons: string[]; passReasons: string[]; numberDiscipline: string } {
  const starter = starterScore(args.picked.pitcher)
  const opponentStarter = starterScore(args.other.pitcher)
  const offense = offenseScore(args.picked.battingProfile)
  const opponentOffense = offenseScore(args.other.battingProfile)
  const dataPenalty = (!args.picked.pitcher?.name ? 8 : 0) + (!args.picked.battingProfile ? 7 : 0) + (!args.other.battingProfile ? 5 : 0)
  const starterGate = args.starterEdge >= 8 && starter >= 62
  const offenseGate = args.offenseEdge >= 6 && offense >= 58
  const suppressGate = opponentOffense <= 52 || args.starterEdge >= 12
  const opponentStarterGate = opponentStarter <= 48 || finite(args.other.pitcher?.difficulty) != null && Number(args.other.pitcher?.difficulty) >= 58
  const contextGate = args.picked.side === 'home' || args.recordEdge >= 5
  const gates = [starterGate, offenseGate, suppressGate, opponentStarterGate, contextGate].filter(Boolean).length
  const playabilityScore = clamp(38 + args.edge * 2.2 + (args.score - 56) * 1.15 + gates * 6 - dataPenalty)
  const reasons: string[] = []
  const passReasons: string[] = []
  if (starterGate) reasons.push('Starting-pitching edge clears the first gate.')
  else passReasons.push('Starting-pitching edge is not wide enough by itself.')
  if (offenseGate) reasons.push('Recent team-bat profile supports the side.')
  else passReasons.push('Offense gap is too thin to force a winner bet.')
  if (suppressGate) reasons.push('Matchup gives the starter a cleaner path through the lineup.')
  else passReasons.push('Opponent bats are live enough to keep this volatile.')
  if (opponentStarterGate) reasons.push('Opposing starter looks attackable enough for early traffic.')
  else passReasons.push('Opposing starter is not weak enough to create a clean price edge.')
  if (dataPenalty) passReasons.push('Lineup/bullpen/price data is incomplete, so this cannot be an auto-play.')
  const decision: MlbTeamWinnerSignal['decision'] = playabilityScore >= 72 && gates >= 4 && args.edge >= 10
    ? 'PLAY'
    : playabilityScore >= 58 && gates >= 3 && args.edge >= 5
      ? 'WATCH'
      : 'PASS'
  const decisionLabel = decision === 'PLAY' ? 'Play' : decision === 'WATCH' ? 'Watch' : 'Pass'
  const numberDiscipline = decision === 'PLAY'
    ? 'Playable only if the moneyline is still fair; downgrade immediately after a hard move.'
    : decision === 'WATCH'
      ? 'Watch the number and confirmed lineup; only upgrade if price and bullpen news cooperate.'
      : 'Pass unless late lineup, bullpen, or price news materially improves the setup.'
  return { decision, decisionLabel, playabilityScore, reasons: reasons.slice(0, 3), passReasons: passReasons.slice(0, 3), numberDiscipline }
}

export function buildMlbTeamWinnerSignal(input: {
  gameId: string
  matchup: string
  gameTime?: string
  home: Omit<MlbWinnerTeamInput, 'side'>
  away: Omit<MlbWinnerTeamInput, 'side'>
}): MlbTeamWinnerSignal | null {
  const home: MlbWinnerTeamInput = { ...input.home, side: 'home', opponentPitcher: input.away.pitcher, opponentProfile: input.away.battingProfile }
  const away: MlbWinnerTeamInput = { ...input.away, side: 'away', opponentPitcher: input.home.pitcher, opponentProfile: input.home.battingProfile }
  if (!home.abbr || !away.abbr) return null
  const homeScore = matchupScore(home)
  const awayScore = matchupScore(away)
  const pickSide: 'home' | 'away' = homeScore >= awayScore ? 'home' : 'away'
  const picked = pickSide === 'home' ? home : away
  const other = pickSide === 'home' ? away : home
  const score = pickSide === 'home' ? homeScore : awayScore
  const opponentScore = pickSide === 'home' ? awayScore : homeScore
  const edge = Math.round(score - opponentScore)
  const starterEdge = starterScore(picked.pitcher) - starterScore(other.pitcher)
  const offenseEdge = offenseScore(picked.battingProfile) - offenseScore(other.battingProfile)
  const recordEdge = recordPct(picked.record) - recordPct(other.record)
  const label = labelFor(score, edge)
  const playability = playabilityFor({ score, edge, starterEdge, offenseEdge, recordEdge, picked, other })
  const starterLine = `${picked.abbr} starter edge: ${pitcherText(picked.pitcher)} vs ${pitcherText(other.pitcher)}.`
  const offenseLine = profileText(picked.abbr, picked.battingProfile)
  const opponentLine = `${other.abbr} lineup pressure check: ${profileText(other.abbr, other.battingProfile)}`
  return {
    id: cleanId(`mlb-team-winner-${input.gameId}-${picked.abbr}-over-${other.abbr}`),
    gameId: input.gameId,
    matchup: input.matchup,
    gameTime: input.gameTime,
    pick: pickSide,
    team: picked.abbr,
    opponent: other.abbr,
    label,
    decision: playability.decision,
    decisionLabel: playability.decisionLabel,
    playabilityScore: playability.playabilityScore,
    score,
    edge,
    starterEdge: Math.round(starterEdge),
    offenseEdge: Math.round(offenseEdge),
    recordEdge: Math.round(recordEdge),
    confidence: clamp(50 + edge * 3 + (score - 60) * 0.6),
    read: playability.decision === 'PASS'
      ? `${picked.abbr} grades as the cleaner side, but baseball variance makes this a pass unless late context improves.`
      : playability.decision === 'WATCH'
        ? `${picked.abbr} has a possible win path, but the setup needs price/lineup confirmation before forcing it.`
        : `${picked.abbr} clears enough starter, matchup, and team-form gates to be a playable game read if the price stays fair.`,
    whyLive: [starterLine, offenseLine, opponentLine].slice(0, 3),
    path: `${picked.abbr} can cash the game read if the starter gets through the middle innings and the lineup creates early traffic against ${other.pitcher?.name || `${other.abbr}'s starter`}.`,
    risk: [
      starterEdge < 4 ? 'Starting-pitcher edge is thin; downgrade if pitch count/news looks shaky.' : 'A short starter leash or early walks can erase the pitcher edge.',
      offenseEdge < 3 ? 'Offense gap is not wide enough to chase a bad number.' : `${other.abbr} still has a live counter if their top bats create early traffic.`,
    ],
    numberDiscipline: playability.numberDiscipline,
    playabilityReasons: playability.reasons,
    passReasons: playability.passReasons,
    components: {
      team: { starter: starterScore(picked.pitcher), offense: offenseScore(picked.battingProfile), record: recordPct(picked.record), homeField: picked.side === 'home' ? 54 : 48 },
      opponent: { starter: starterScore(other.pitcher), offense: offenseScore(other.battingProfile), record: recordPct(other.record), homeField: other.side === 'home' ? 54 : 48 },
    },
  }
}
