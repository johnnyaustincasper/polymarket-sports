import { describe, it, expect } from 'vitest'
import { getBillingStatus, requireStripe } from './billing'

describe('billing', () => {
  it('returns correct status when nothing is configured', () => {
    const status = getBillingStatus({} as any)
    expect(status.stripeConfigured).toBe(false)
    expect(status.checkoutConfigured).toBe(false)
    expect(status.isFullyConfigured).toBe(false)
  })

  it('detects partial Stripe configuration', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_test_123' }
    const status = getBillingStatus(env as any)
    expect(status.stripeConfigured).toBe(true)
    expect(status.checkoutConfigured).toBe(false)
    expect(status.webhookConfigured).toBe(false)
  })

  it('detects full configuration', () => {
    const env = {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PRICE_ID: 'price_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
    }
    const status = getBillingStatus(env as any)
    expect(status.isFullyConfigured).toBe(true)
  })

  it('requireStripe throws when not configured', () => {
    expect(() => requireStripe()).toThrow(/Stripe is not configured/)
  })
})
