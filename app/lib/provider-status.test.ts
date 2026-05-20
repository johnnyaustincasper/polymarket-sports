import { describe, expect, it } from 'vitest'
import { getProviderStatus } from './provider-status'

describe('provider status', () => {
  it('reports public providers available and paid providers unconfigured for an empty env', () => {
    const status = getProviderStatus({})

    expect(status.app.appUrlConfigured).toBe(false)
    expect(status.auth.clerkConfigured).toBe(false)
    expect(status.auth.legacySessionConfigured).toBe(false)
    expect(status.billing.stripeConfigured).toBe(false)
    expect(status.cache.mode).toBe('memory')
    expect(status.ai.primary).toBeNull()
    expect(status.ai.xai.configured).toBe(false)
    expect(status.ai.anthropic.configured).toBe(false)
    expect(status.search.brave.configured).toBe(false)
    expect(status.sports.espn.available).toBe(true)
    expect(status.markets.primary).toBe('kalshi')
    expect(status.markets.kalshi.available).toBe(true)
    expect(status.markets.polymarket.available).toBe(true)
  })

  it('reports configured providers without exposing secret values', () => {
    const status = getProviderStatus({
      NEXT_PUBLIC_APP_URL: 'https://athleteintelligence.xyz',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_secretish',
      CLERK_SECRET_KEY: 'sk_test_secretish',
      AUTH_SESSION_SECRET: 'session-secret',
      ENABLE_GUEST_ACCESS: 'false',
      STRIPE_SECRET_KEY: 'sk_live_secretish',
      STRIPE_PRICE_ID: 'price_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_secretish',
      KV_REST_API_URL: 'https://redis.example.com',
      KV_REST_API_TOKEN: 'redis-secret',
      XAI_API_KEY: 'xai-secret',
      XAI_MODEL: 'grok-4.3',
      XAI_BASE_URL: 'https://api.x.ai/v1',
      ANTHROPIC_API_KEY: 'anthropic-secret',
      BRAVE_API_KEY: 'brave-secret',
    })

    expect(status.app).toMatchObject({ appUrlConfigured: true, appUrlHost: 'athleteintelligence.xyz' })
    expect(status.auth).toMatchObject({ clerkConfigured: true, legacySessionConfigured: true, guestAccessEnabled: false })
    expect(status.billing).toMatchObject({ stripeConfigured: true, checkoutConfigured: true, webhookConfigured: true, priceConfigured: true })
    expect(status.cache).toMatchObject({ mode: 'redis', remoteConfigured: true, recommendedForProduction: true })
    expect(status.ai.primary).toBe('xai')
    expect(status.ai.xai).toMatchObject({ configured: true, model: 'grok-4.3', baseUrlHost: 'api.x.ai' })
    expect(status.ai.anthropic).toMatchObject({ configured: true, role: 'fallback' })
    expect(status.search.brave.configured).toBe(true)

    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('redis.example.com')
    expect(serialized).not.toContain('sk_live')
  })

  it('marks Anthropic as legacy primary only when xAI is absent', () => {
    const status = getProviderStatus({ ANTHROPIC_API_KEY: 'anthropic-secret' })

    expect(status.ai.primary).toBe('anthropic')
    expect(status.ai.xai.configured).toBe(false)
    expect(status.ai.anthropic).toMatchObject({ configured: true, role: 'legacy-primary' })
  })
})
