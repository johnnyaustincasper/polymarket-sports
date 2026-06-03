import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionToken, verifySessionToken } from './auth'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.useRealTimers()
})

describe('legacy session tokens', () => {
  it('preserves access-code guest subscription claims through verification', async () => {
    process.env.AUTH_SESSION_SECRET = 'unit-test-secret'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'))

    const token = await createSessionToken('AI-VIP@guest.local', 'Free Access Guest', {
      guest: true,
      id: 'guest-access-code',
      subscriptionStatus: 'active',
      accessSource: 'code',
      accessCodeLabel: 'VIP Pass',
    })

    await expect(verifySessionToken(token)).resolves.toMatchObject({
      id: 'guest-access-code',
      email: 'ai-vip@guest.local',
      name: 'Free Access Guest',
      guest: true,
      subscriptionStatus: 'active',
      accessSource: 'code',
      accessCodeLabel: 'VIP Pass',
    })
  })
})
