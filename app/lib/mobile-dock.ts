import type { SupportedSport } from './sports-utils'

export type MobileDockTab = 'sport' | 'signals' | 'slate' | 'dates' | 'profile'
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
    { key: 'signals', label: 'Signals', icon: 'signals' },
    { key: 'slate', label: 'Slate', icon: 'slate', primary: true },
    { key: 'dates', label: 'Dates', icon: 'dates' },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ]
}

export function getMobileDockActiveTab(subtab: 'slate' | 'playerSignals'): MobileDockTab {
  return subtab === 'playerSignals' ? 'signals' : 'slate'
}

export function mobileDockDateOptions(days: MobileDateOption[]): MobileDateOption[] {
  return days.slice(0, 5)
}
