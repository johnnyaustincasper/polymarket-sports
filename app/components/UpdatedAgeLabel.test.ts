import { describe, expect, it } from 'vitest'
import { formatAge } from '../lib/time-format'

describe('formatAge', () => {
  it('formats seconds under a minute', () => {
    expect(formatAge(0)).toBe('0s ago')
    expect(formatAge(59)).toBe('59s ago')
  })

  it('formats seconds at or above a minute as whole minutes', () => {
    expect(formatAge(60)).toBe('1m ago')
    expect(formatAge(119)).toBe('1m ago')
    expect(formatAge(3600)).toBe('60m ago')
  })
})
