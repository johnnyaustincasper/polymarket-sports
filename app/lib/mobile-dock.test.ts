import { describe, expect, it } from 'vitest'
import { buildMobileDockTabs, getMobileDockActiveTab, mobileDockDateOptions, mobileDockSportOptions } from './mobile-dock'

describe('mobile bottom dock configuration', () => {
  it('uses the requested five bottom tabs with Slate centered', () => {
    expect(buildMobileDockTabs().map(tab => tab.label)).toEqual(['Sport', 'Signals', 'Slate', 'Dates', 'Profile'])
    expect(buildMobileDockTabs()[2]).toMatchObject({ key: 'slate', label: 'Slate', primary: true })
  })

  it('maps app subtab state to dock active tabs', () => {
    expect(getMobileDockActiveTab('slate')).toBe('slate')
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
