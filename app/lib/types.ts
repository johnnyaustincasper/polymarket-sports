// ─── Shared TypeScript interfaces for NBA Intel ────────────────────────────────

export interface TeamStreak {
  name: string
  abbr: string
  streak: number // positive = win streak, negative = loss streak
  streakLabel: string // e.g. 'W5' | 'L3'
  lastGames: ('W' | 'L')[] // last 5 results, newest first
  analysis: string // AI-generated "why" for streaks 3+
  keyFactors: string[] // bullet-point factors
}

export interface TeamIntel {
  home: {
    abbr: string
    streak: number
    streakLabel: string
    lastGames: ('W' | 'L')[]
    restDays: number
    fatigue: FatigueReport | null
  }
  away: {
    abbr: string
    streak: number
    streakLabel: string
    lastGames: ('W' | 'L')[]
    restDays: number
    fatigue: FatigueReport | null
  }
  h2h: string // e.g. "BOS leads 2-1 this season"
  edgeRead: string // 2-sentence AI edge
  injuryImpact: {
    home: 'none' | 'minor' | 'major'
    away: 'none' | 'minor' | 'major'
    homeNotes: string
    awayNotes: string
  }
}

export interface GamePrediction {
  // TODO: ML-style prediction combining streak + injury + rest + H2H
  // Inputs: TeamStreak, InjuryReport, rest days, H2H record
  homeWinPct: number
  awayWinPct: number
  confidence: number // 0-100
  factors: {
    streak: number   // weight 0-1
    injury: number   // weight 0-1
    rest: number     // weight 0-1
    h2h: number      // weight 0-1
  }
  recommendation: 'home' | 'away' | 'pass'
  notes: string
}

export interface InjuryReport {
  // TODO: Detailed injury report for a team
  // Fetch from: ESPN, RotoWire, Rotoworld APIs
  team: string
  players: {
    name: string
    status: 'Out' | 'Questionable' | 'Doubtful' | 'Probable' | 'GTD'
    injury: string
    impact: 'star' | 'role' | 'bench' // star = 20+ PPG, role = starter, bench = reserve
  }[]
  impact: 'none' | 'minor' | 'major' // derived from players list
}

export interface PlayerMinutes {
  name: string
  minutes: number          // minutes played last game (-1 = DNP)
  fatigueFlag: 'high' | 'moderate' | 'normal' | 'dnp'  // high=36+, moderate=28-35, normal<28
  isStarter: boolean
  restingStarter: boolean  // starter with 0 min / DNP but no injury listed — likely load mgmt
  criticalFatigue: boolean // back-to-back AND 35+ min last game
}

export interface FatigueReport {
  teamAbbr: string
  isBackToBack: boolean
  lastGameDate: string
  players: PlayerMinutes[]
  hasFatigueRisk: boolean     // any player with criticalFatigue
  hasRestingStarter: boolean  // any starter likely sitting for rest
  restingStarters: string[]   // names of players likely resting
  summary: string             // e.g. "⚠️ LeBron likely resting (B2B)" or "✅ Full strength"
}

export interface BettingTrend {
  // TODO: ATS and O/U records per team
  // Data source: covers.com, teamrankings.com APIs
  team: string
  atsRecord: string        // e.g. '22-18'
  atsWinPct: number        // 0-1
  ouRecord: string         // e.g. '20-20 O/U'
  ouOverPct: number        // % of games that went over
  homeSURecord: string     // straight-up home record
  awaySURecord: string     // straight-up away record
  lastTenATS: string       // e.g. '6-4 ATS'
}

export interface PlayerProp {
  // TODO: Player prop value detection (over/under)
  // Data source: DraftKings, FanDuel, PrizePicks APIs
  player: string
  team: string
  opponent: string
  prop: string             // e.g. 'Points', 'Assists', 'Rebounds'
  line: number             // bookmaker line
  ourProjection: number    // model projection
  edge: number             // % edge vs the line (positive = over, negative = under)
  recommendation: 'over' | 'under' | 'pass'
  confidence: number       // 0-100
  reasoning: string        // brief explanation
}
