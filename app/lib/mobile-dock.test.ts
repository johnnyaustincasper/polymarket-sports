import { describe, expect, it } from 'vitest'
import { buildMobileDockTabs, getMobileDockActiveTab, mobileDockDateOptions, mobileDockSportOptions } from './mobile-dock'

describe('mobile bottom dock configuration', () => {
  it('uses the requested five bottom tabs with Signals centered and Teams beside Sport', () => {
    expect(buildMobileDockTabs().map(tab => tab.label)).toEqual(['Sport', 'Teams', 'Signals', 'Dates', 'Profile'])
    expect(buildMobileDockTabs()[1]).toMatchObject({ key: 'teams', label: 'Teams' })
    expect(buildMobileDockTabs()[2]).toMatchObject({ key: 'signals', label: 'Signals', primary: true })
  })

  it('maps app subtab state to dock active tabs', () => {
    expect(getMobileDockActiveTab('slate')).toBe('signals')
    expect(getMobileDockActiveTab('teams')).toBe('teams')
    expect(getMobileDockActiveTab('playerSignals')).toBe('signals')
  })

  it('exposes the available sports for the Sport vertical dock', () => {
    expect(mobileDockSportOptions.map(option => option.label)).toEqual(['NBA', 'MLB', 'UFC', 'NFL'])
  })

  it('keeps all five available day options in the Dates vertical dock', () => {
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
