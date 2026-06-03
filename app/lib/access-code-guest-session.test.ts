import { describe, expect, it } from 'vitest'
import { buildAccessCodeGuestSession } from './access-code-guest-session'

describe('access-code guest sessions', () => {
  it('builds a paid guest identity from a valid free access code', () => {
    expect(buildAccessCodeGuestSession(' coach-vip ', {
      FREE_ACCESS_CODES_JSON: JSON.stringify([
        { code: 'COACH-VIP', label: 'Coach Pass', plan: 'Coach', subscriptionStatus: 'active' },
      ]),
    })).toMatchObject({
      email: 'coach-vip@guest.local',
      name: 'Coach Pass Guest',
      guest: true,
      subscriptionStatus: 'active',
      accessSource: 'code',
      accessCodeLabel: 'Coach Pass',
    })
  })

  it('returns null for invalid or expired free access codes', () => {
    const env = {
      FREE_ACCESS_CODES_JSON: JSON.stringify([
        { code: 'OLD-CODE', label: 'Old Pass', expiresAt: '2026-01-01T00:00:00.000Z' },
      ]),
    }

    expect(buildAccessCodeGuestSession('wrong-code', env, new Date('2026-06-03T12:00:00.000Z'))).toBeNull()
    expect(buildAccessCodeGuestSession('OLD-CODE', env, new Date('2026-06-03T12:00:00.000Z'))).toBeNull()
  })
})
