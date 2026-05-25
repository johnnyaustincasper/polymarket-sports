import type { SupportedSport } from './sports-utils'

export type MobileDockTab = 'sport' | 'teams' | 'signals' | 'dates' | 'profile'
export type MobileDockIcon = MobileDockTab
export type MobileSportOption = { value: SupportedSport | 'ufc'; label: string }
export type MobileDateOption = { label: string; value: string }

export const mobileDockSportOptions: MobileSportOption[] = [
  { value: 'nba', label: 'NBA' },
  { value: 'mlb', label: 'MLB' },
  { value: 'ufc', label: 'UFC' },
  { value: 'nfl', label: 'NFL' },
]

export function buildMobileDockTabs(): { key: MobileDockTab; label: string; icon: MobileDockIcon; primary?: boolean }[] {
  return [
    { key: 'sport', label: 'Sport', icon: 'sport' },
    { key: 'teams', label: 'Teams', icon: 'teams' },
    { key: 'signals', label: 'Signals', icon: 'signals', primary: true },
    { key: 'dates', label: 'Dates', icon: 'dates' },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ]
}

export function getMobileDockActiveTab(subtab: 'slate' | 'teams' | 'playerSignals'): MobileDockTab {
  if (subtab === 'playerSignals') return 'signals'
  if (subtab === 'teams') return 'teams'
  return 'signals'
}

export function mobileDockDateOptions(days: MobileDateOption[]): MobileDateOption[] {
  return days.slice(0, 5)
}
