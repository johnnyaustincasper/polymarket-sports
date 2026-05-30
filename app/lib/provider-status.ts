import { getAuthConfigStatus } from './auth'
import { getDurableCacheStatus } from './durable-cache'
import { getBillingStatus } from './billing'
import { isGuestAccessEnabled } from './guest-access'

type Env = Record<string, string | undefined>

function configured(value: string | undefined): boolean {
  return Boolean(value && value.trim())
}

function urlHost(value: string | undefined): string | undefined {
  if (!configured(value)) return undefined
  try {
    return new URL(value as string).host
  } catch {
    return undefined
  }
}

function countAuthorizedUsers(env: Env): number {
  const usersJson = env.AUTHORIZED_USERS_JSON?.trim()
  if (usersJson) {
    try {
      const parsed = JSON.parse(usersJson)
      if (Array.isArray(parsed)) {
        return parsed.filter(user => {
          const email = typeof user === 'string' ? user : user?.email
          return typeof email === 'string' && email.includes('@')
        }).length
      }
    } catch {
      // Fall through to comma-separated legacy config.
    }
  }

  return (env.AUTHORIZED_EMAILS || '')
    .split(',')
    .map(email => email.trim())
    .filter(email => email.includes('@'))
    .length
}

function authStatus(env: Env) {
  if (env === process.env) {
    const current = getAuthConfigStatus()
    const clerkConfigured = configured(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && configured(env.CLERK_SECRET_KEY)
    return {
      clerkConfigured,
      legacySessionConfigured: current.hasSecret,
      authorizedUserCount: current.authorizedUserCount,
      hasGlobalInviteCode: current.hasGlobalInviteCode,
      guestAccessEnabled: current.guestAccessEnabled,
      bootstrapMode: current.bootstrapMode,
    }
  }

  const authorizedUserCount = countAuthorizedUsers(env)
  return {
    clerkConfigured: configured(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && configured(env.CLERK_SECRET_KEY),
    legacySessionConfigured: configured(env.AUTH_SESSION_SECRET) || configured(env.SESSION_SECRET),
    authorizedUserCount,
    hasGlobalInviteCode: configured(env.AUTH_INVITE_CODE) || configured(env.APP_PASSWORD),
    guestAccessEnabled: isGuestAccessEnabled(env as unknown as NodeJS.ProcessEnv),
    bootstrapMode: authorizedUserCount === 0 && configured(env.APP_PASSWORD),
  }
}

function aiStatus(env: Env) {
  const xaiConfigured = configured(env.XAI_API_KEY)
  const anthropicConfigured = configured(env.ANTHROPIC_API_KEY)
  const primary = xaiConfigured ? 'xai' : anthropicConfigured ? 'anthropic' : null

  return {
    primary,
    xai: {
      configured: xaiConfigured,
      role: 'primary' as const,
      model: env.XAI_MODEL || 'grok-3-mini',
      baseUrlHost: urlHost(env.XAI_BASE_URL || 'https://api.x.ai/v1'),
    },
    anthropic: {
      configured: anthropicConfigured,
      role: xaiConfigured ? 'fallback' as const : anthropicConfigured ? 'legacy-primary' as const : 'legacy' as const,
      model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    },
    openai: {
      configured: configured(env.OPENAI_API_KEY),
      role: 'optional-fallback' as const,
      model: env.OPENAI_MODEL || null,
    },
  }
}

type ReadinessSeverity = 'ready' | 'warning' | 'blocked'

function readinessCheck(ready: boolean, severity: ReadinessSeverity, message: string) {
  return { ready, severity, message }
}

function buildReadiness({
  auth,
  billing,
  cache,
  ai,
  search,
  markets,
}: {
  auth: ReturnType<typeof authStatus>
  billing: ReturnType<typeof getBillingStatus>
  cache: ReturnType<typeof getDurableCacheStatus>
  ai: ReturnType<typeof aiStatus>
  search: { brave: { configured: boolean; role: 'optional-context' } }
  markets: {
    kalshi: { available: boolean }
    polymarket: { available: boolean }
  }
}) {
  const authProviderReady = auth.clerkConfigured || auth.legacySessionConfigured
  const authAccessReady = auth.authorizedUserCount > 0 || auth.hasGlobalInviteCode || auth.bootstrapMode
  const authReady = authProviderReady && authAccessReady
  const marketsReady = markets.kalshi.available || markets.polymarket.available

  const checks = {
    cache: readinessCheck(
      cache.recommendedForProduction,
      cache.recommendedForProduction ? 'ready' : 'blocked',
      cache.recommendedForProduction ? 'Durable cache is production-ready.' : 'Configure Upstash or Vercel KV for durable production caching.',
    ),
    auth: readinessCheck(
      authReady,
      authReady ? 'ready' : 'blocked',
      authReady ? 'Authentication and at least one paid access path are configured.' : 'Configure Clerk or legacy session auth plus an authorized user or invite code.',
    ),
    billing: readinessCheck(
      billing.isFullyConfigured,
      billing.isFullyConfigured ? 'ready' : 'blocked',
      billing.isFullyConfigured ? 'Stripe checkout and webhook handling are configured.' : 'Configure Stripe secret, price, and webhook secret for paid subscriptions.',
    ),
    ai: readinessCheck(
      Boolean(ai.primary),
      ai.primary ? 'ready' : 'blocked',
      ai.primary ? `Primary AI provider is ${ai.primary}.` : 'Configure xAI or Anthropic for AI-backed analysis.',
    ),
    search: readinessCheck(
      search.brave.configured,
      search.brave.configured ? 'ready' : 'warning',
      search.brave.configured ? 'Brave Search context is configured.' : 'Brave Search is optional but missing, so contextual search enrichment is disabled.',
    ),
    markets: readinessCheck(
      marketsReady,
      marketsReady ? 'ready' : 'blocked',
      marketsReady ? 'At least one public market data source is available.' : 'No market data source is available.',
    ),
  }

  const criticalChecks = [checks.cache, checks.auth, checks.billing, checks.ai, checks.markets]
  return {
    ready: criticalChecks.every(check => check.ready),
    checks,
    generatedAt: new Date().toISOString(),
  }
}

export function getProviderStatus(env: Env = process.env) {
  const cache = getDurableCacheStatus(env)
  const ai = aiStatus(env)
  const auth = authStatus(env)
  const billing = getBillingStatus(env as NodeJS.ProcessEnv)
  const search = {
    brave: {
      configured: configured(env.BRAVE_API_KEY),
      role: 'optional-context' as const,
    },
  }
  const markets = {
    primary: 'kalshi' as const,
    kalshi: {
      available: true,
      requiresSecret: false,
      source: 'public-api' as const,
      role: 'primary-props-contracts' as const,
    },
    polymarket: {
      available: true,
      requiresSecret: false,
      source: 'public-api' as const,
      role: 'legacy-event-scanner' as const,
    },
  }
  const readiness = buildReadiness({ auth, billing, cache, ai, search, markets })
  const warnings = Object.values(readiness.checks)
    .filter(check => check.severity !== 'ready')
    .map(check => check.message)

  return {
    readiness,
    app: {
      appUrlConfigured: configured(env.NEXT_PUBLIC_APP_URL),
      appUrlHost: urlHost(env.NEXT_PUBLIC_APP_URL),
      isVercel: env.VERCEL === '1' || env.VERCEL === 'true',
      nodeEnv: env.NODE_ENV || null,
    },
    auth,
    billing,
    cache,
    ai,
    search,
    markets,
    sports: {
      espn: {
        available: true,
        requiresSecret: false,
        source: 'public-api' as const,
      },
    },
    database: {
      supabase: {
        configured: false,
        role: 'not-integrated' as const,
      },
    },
    warnings,
  }
}

export type ProviderStatus = ReturnType<typeof getProviderStatus>
