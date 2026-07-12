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
  if (score >= 78 && edge >= 8) return 'Strong look'
  if (score >= 66 && edge >= 4) return 'Small lean'
  if (score >= 56 && edge >= 1) return 'Price watch'
  return 'Needs better setup'
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
    score,
    edge,
    starterEdge: Math.round(starterEdge),
    offenseEdge: Math.round(offenseEdge),
    recordEdge: Math.round(recordEdge),
    confidence: clamp(50 + edge * 3 + (score - 60) * 0.6),
    read: `${picked.abbr} has the cleaner win path because the starter/offense blend grades better than ${other.abbr} tonight.`,
    whyLive: [starterLine, offenseLine, opponentLine].slice(0, 3),
    path: `${picked.abbr} can cash the game read if the starter gets through the middle innings and the lineup creates early traffic against ${other.pitcher?.name || `${other.abbr}'s starter`}.`,
    risk: [
      starterEdge < 4 ? 'Starting-pitcher edge is thin; downgrade if pitch count/news looks shaky.' : 'A short starter leash or early walks can erase the pitcher edge.',
      offenseEdge < 3 ? 'Offense gap is not wide enough to chase a bad number.' : `${other.abbr} still has a live counter if their top bats create early traffic.`,
    ],
    numberDiscipline: label === 'Strong look' || label === 'Small lean'
      ? 'Playable only at a fair moneyline; do not chase after a hard move.'
      : 'Keep this as a watch unless the number improves or lineups confirm the edge.',
    components: {
      team: { starter: starterScore(picked.pitcher), offense: offenseScore(picked.battingProfile), record: recordPct(picked.record), homeField: picked.side === 'home' ? 54 : 48 },
      opponent: { starter: starterScore(other.pitcher), offense: offenseScore(other.battingProfile), record: recordPct(other.record), homeField: other.side === 'home' ? 54 : 48 },
    },
  }
}
