import { describe, expect, it } from 'vitest'
import { getFighterPhotoUrl, isWeightClassOpenByDefault } from './fighters-directory'

describe('fighters directory helpers', () => {
  it('falls back to the ESPN MMA headshot CDN when the ranking feed omits a headshot', () => {
    expect(getFighterPhotoUrl({ id: '3022677', name: 'Jon Jones', headshot: null })).toBe(
      'https://a.espncdn.com/i/headshots/mma/players/full/3022677.png',
    )
  })

  it('keeps existing feed headshots ahead of the generated ESPN CDN URL', () => {
    expect(getFighterPhotoUrl({ id: '3022677', name: 'Jon Jones', headshot: 'https://example.com/jon.png' })).toBe(
      'https://example.com/jon.png',
    )
  })

  it('opens only the first weight class by default so sections are collapsible instead of a wall of cards', () => {
    expect(isWeightClassOpenByDefault(0)).toBe(true)
    expect(isWeightClassOpenByDefault(1)).toBe(false)
  })
})
