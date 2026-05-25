import { describe, expect, it } from 'vitest'
import { buildMobileDockTabs, getMobileDockActiveTab, mobileDockDateOptions, mobileDockSportOptions } from './mobile-dock'

describe('mobile bottom dock configuration', () => {
  it('keeps Slate as the centered primary tab and adds Signals as its own tab', () => {
    expect(buildMobileDockTabs().map(tab => tab.label)).toEqual(['Sport', 'Teams', 'Slate', 'Signals', 'Profile'])
    expect(buildMobileDockTabs()[1]).toMatchObject({ key: 'teams', label: 'Teams' })
    expect(buildMobileDockTabs()[2]).toMatchObject({ key: 'slate', label: 'Slate', primary: true })
    expect(buildMobileDockTabs()[3]).toMatchObject({ key: 'signals', label: 'Signals' })
  })

  it('renames Teams to Fighters when UFC is selected', () => {
    expect(buildMobileDockTabs('ufc')[1]).toMatchObject({ key: 'teams', label: 'Fighters' })
    expect(buildMobileDockTabs('nba')[1]).toMatchObject({ key: 'teams', label: 'Teams' })
  })

  it('maps app subtab state to dock active tabs without replacing Slate with Signals', () => {
    expect(getMobileDockActiveTab('slate')).toBe('slate')
    expect(getMobileDockActiveTab('teams')).toBe('teams')
    expect(getMobileDockActiveTab('playerSignals')).toBe('signals')
  })

  it('exposes the available sports for the Sport vertical dock', () => {
    expect(mobileDockSportOptions.map(option => option.label)).toEqual(['NBA', 'MLB', 'NFL', 'UFC'])
  })

  it('keeps all five available day options in the Dates helper for non-dock consumers', () => {
    const days = [
      { label: 'May 23', value: '20260523' },
      { label: 'Yest', value: '20260524' },
      { label: 'Today', value: '20260525' },
      { label: 'May 26', value: '20260526' },
      { label: 'May 27', value: '20260527' },
    ]

    expect(mobileDockDateOptions(days)).toEqual(days)
  })
})
