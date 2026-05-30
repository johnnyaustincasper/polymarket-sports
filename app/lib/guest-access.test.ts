import { describe, expect, it } from 'vitest'
import { isGuestAccessEnabled } from './guest-access'

describe('guest access policy', () => {
  it('blocks guest access in development', () => {
    expect(isGuestAccessEnabled({ NODE_ENV: 'development' })).toBe(false)
  })

  it('blocks guest access in production', () => {
    expect(isGuestAccessEnabled({ NODE_ENV: 'production' })).toBe(false)
  })

  it('does not allow the old explicit guest access flag to reopen the board', () => {
    expect(isGuestAccessEnabled({ NODE_ENV: 'production', ENABLE_GUEST_ACCESS: 'true' })).toBe(false)
  })
})
