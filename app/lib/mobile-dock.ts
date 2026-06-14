import type { SupportedSport } from './sports-utils'

export type MobileDockTab = 'sport' | 'teams' | 'slate' | 'signals' | 'profile'
export type MobileDockIcon = MobileDockTab
export type MobileSportOption = { value: SupportedSport | 'ufc'; label: string }
export type MobileDateOption = { label: string; value: string }

export const mobileDockSportOptions: MobileSportOption[] = [
  { value: 'mlb', label: 'MLB' },
  { value: 'ufc', label: 'UFC' },
  { value: 'nfl', label: 'NFL' },
  { value: 'nhl', label: 'NHL' },
  { value: 'nba', label: 'NBA' },
]

export function buildMobileDockTabs(sport?: SupportedSport | 'ufc'): { key: MobileDockTab; label: string; icon: MobileDockIcon; primary?: boolean }[] {
  return [
    { key: 'sport', label: 'Sport', icon: 'sport' },
    { key: 'teams', label: sport === 'ufc' ? 'Fighters' : 'Teams', icon: 'teams' },
    { key: 'slate', label: 'Slate', icon: 'slate', primary: true },
    { key: 'signals', label: 'Signals', icon: 'signals' },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ]
}

export const premiumMobileDockLayout = {
  columns: 5,
  buttonMinHeight: 58,
  iconSize: 26,
  activeScale: 1,
  activeTranslateY: 0,
  containerRadius: 30,
} as const

export const slateMainFeatureAnimation = {
  tab: 'slate',
  ariaLabel: 'Slate — main feature',
  ringAnimationName: 'slate-main-feature-ring',
  shimmerAnimationName: 'slate-main-feature-shimmer',
  respectsReducedMotion: true,
  preservesEqualFootprint: true,
} as const

export function getMobileDockActiveTab(subtab: 'slate' | 'teams' | 'playerSignals'): MobileDockTab {
  if (subtab === 'playerSignals') return 'signals'
  if (subtab === 'teams') return 'teams'
  return 'slate'
}

export function mobileDockDateOptions(days: MobileDateOption[]): MobileDateOption[] {
  return days.slice(0, 5)
}
