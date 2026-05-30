import { describe, expect, it } from 'vitest'
import { evaluateAccessPolicy } from './access-policy'

describe('access policy helper', () => {
  const anonymous = null
  const guest = { authenticated: true, guest: true, subscriptionStatus: 'guest_full_access' as const }
  const freeUser = { authenticated: true, guest: false, subscriptionStatus: 'free' as const }
  const paidUser = { authenticated: true, guest: false, subscriptionStatus: 'active' as const }
  const trialUser = { authenticated: true, guest: false, subscriptionStatus: 'trialing' as const }
  const admin = { authenticated: true, guest: false, role: 'admin' as const, subscriptionStatus: 'free' as const }

  it('allows public policy for anonymous, guest, paid, and admin callers', () => {
    for (const principal of [anonymous, guest, paidUser, admin]) {
      expect(evaluateAccessPolicy('public', principal).allowed).toBe(true)
    }
  })

  it('requires a signed-in user for authenticated policy', () => {
    expect(evaluateAccessPolicy('authenticated', anonymous)).toMatchObject({ allowed: false, reason: 'auth_required' })
    expect(evaluateAccessPolicy('authenticated', guest).allowed).toBe(true)
    expect(evaluateAccessPolicy('authenticated', freeUser).allowed).toBe(true)
  })

  it('allows paid policy for active/trialing subscriptions and admins', () => {
    expect(evaluateAccessPolicy('paid', paidUser).allowed).toBe(true)
    expect(evaluateAccessPolicy('paid', trialUser).allowed).toBe(true)
    expect(evaluateAccessPolicy('paid', admin).allowed).toBe(true)
  })

  it('does not treat guests as paid unless the route explicitly opts into guest full access', () => {
    expect(evaluateAccessPolicy('paid', guest, { guestFullAccess: false, guestAccessEnabled: true })).toMatchObject({
      allowed: false,
      reason: 'subscription_required',
    })
    expect(evaluateAccessPolicy('paid', guest, { guestFullAccess: true, guestAccessEnabled: true })).toMatchObject({
      allowed: true,
      reason: 'guest_full_access',
    })
  })

  it('disables guest full access when the environment guest flag is off', () => {
    expect(evaluateAccessPolicy('paid', guest, { guestFullAccess: true, guestAccessEnabled: false })).toMatchObject({
      allowed: false,
      reason: 'guest_disabled',
    })
  })

  it('requires admin role for admin policy', () => {
    expect(evaluateAccessPolicy('admin', paidUser)).toMatchObject({ allowed: false, reason: 'admin_required' })
    expect(evaluateAccessPolicy('admin', guest)).toMatchObject({ allowed: false, reason: 'admin_required' })
    expect(evaluateAccessPolicy('admin', admin).allowed).toBe(true)
  })
})
