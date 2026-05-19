import { describe, expect, it } from 'vitest'
import { isGuestAccessEnabled } from './guest-access'

describe('guest access policy', () => {
  it('allows guest access outside production by default for local testing', () => {
    expect(isGuestAccessEnabled({ NODE_ENV: 'development' })).toBe(true)
  })

  it('blocks guest access in production by default', () => {
    expect(isGuestAccessEnabled({ NODE_ENV: 'production' })).toBe(false)
  })

  it('honors an explicit guest access flag in production', () => {
    expect(isGuestAccessEnabled({ NODE_ENV: 'production', ENABLE_GUEST_ACCESS: 'true' })).toBe(true)
  })

  it('honors an explicit off flag outside production', () => {
    expect(isGuestAccessEnabled({ NODE_ENV: 'development', ENABLE_GUEST_ACCESS: 'false' })).toBe(false)
  })
})
