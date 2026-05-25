const TEAM_STAT_LABELS: Record<string, string> = {
  PPG: 'Points per game',
  RPG: 'Rebounds per game',
  APG: 'Assists per game',
  'AST/TO': 'Assist/turnover ratio',
  PFPG: 'Personal fouls per game',
  GP: 'Games played',
  GS: 'Games started',
  MIN: 'Total minutes',
  MPG: 'Minutes per game',
  REB: 'Total rebounds',
  AST: 'Total assists',
  PTS: 'Total points',
  FG: 'Field goals',
  'FG%': 'Field goal percentage',
  '3P%': 'Three-point percentage',
  FT: 'Free throws',
  'FT%': 'Free throw percentage',
  STL: 'Steals',
  BLK: 'Blocks',
  TOV: 'Turnovers',
  G: 'Games',
  AB: 'At bats',
  H: 'Hits',
  BA: 'Batting average',
  AVG: 'Batting average',
  R: 'Runs',
  HR: 'Home runs',
  RBI: 'Runs batted in',
  SB: 'Stolen bases',
  OBP: 'On-base percentage',
  SLG: 'Slugging percentage',
  OPS: 'On-base plus slugging',
  '2B': 'Doubles',
  '3B': 'Triples',
  BB: 'Walks',
  SO: 'Strikeouts',
  ERA: 'Earned run average',
  WHIP: 'Walks plus hits per inning pitched',
  PF: 'Points for',
  PA: 'Points against',
  YPG: 'Yards per game',
} as const

export function expandTeamStatLabel(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return trimmed
  const direct = TEAM_STAT_LABELS[trimmed.toUpperCase()]
  if (direct) return direct
  return trimmed
}
