import { describe, expect, it } from 'vitest'
import { buildAccessGrantMetadata, findAccessCodeGrant } from './access-codes'

describe('free access code grants', () => {
  it('accepts simple comma-separated codes and normalizes spacing/case', () => {
    const grant = findAccessCodeGrant(' johnnyvip ', {
      FREE_ACCESS_CODES: 'JOHNNYVIP, COACHFREE',
    })

    expect(grant).toMatchObject({
      code: 'JOHNNYVIP',
      label: 'Free Access',
      subscriptionStatus: 'active',
      plan: 'Free Access',
    })
  })

  it('accepts configured JSON grants with labels, plans, and expirations', () => {
    const grant = findAccessCodeGrant('coach-2026', {
      FREE_ACCESS_CODES_JSON: JSON.stringify([
        {
          code: 'COACH-2026',
          label: 'Coaches Pass',
          plan: 'Coach Pass',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      ]),
    }, new Date('2026-06-01T00:00:00.000Z'))

    expect(grant).toMatchObject({
      code: 'COACH-2026',
      label: 'Coaches Pass',
      plan: 'Coach Pass',
      subscriptionStatus: 'active',
    })
  })

  it('rejects expired JSON grants', () => {
    const grant = findAccessCodeGrant('OLDPASS', {
      FREE_ACCESS_CODES_JSON: JSON.stringify([{ code: 'OLDPASS', expiresAt: '2025-01-01T00:00:00.000Z' }]),
    }, new Date('2026-06-01T00:00:00.000Z'))

    expect(grant).toBeNull()
  })

  it('builds public Clerk metadata for free access without Stripe customer fields', () => {
    expect(buildAccessGrantMetadata({ code: 'JOHNNYVIP', label: 'VIP Pass', subscriptionStatus: 'active', plan: 'VIP' }, new Date('2026-06-01T12:00:00.000Z'))).toMatchObject({
      subscriptionStatus: 'active',
      plan: 'VIP',
      accessSource: 'code',
      accessCodeLabel: 'VIP Pass',
      accessGrantedAt: '2026-06-01T12:00:00.000Z',
    })
  })
})
