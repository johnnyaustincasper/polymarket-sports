import { getAuthConfigStatus } from './auth'
import { getDurableCacheStatus } from './durable-cache'
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

export function getProviderStatus(env: Env = process.env) {
  const cache = getDurableCacheStatus(env)
  const ai = aiStatus(env)
  const warnings: string[] = []

  if (!ai.primary) warnings.push('No AI provider is configured; analysis routes should return degraded non-AI responses.')
  if (!cache.recommendedForProduction) warnings.push('Durable cache is using memory fallback in production; configure Upstash or Vercel KV.')
  if (!configured(env.STRIPE_SECRET_KEY) || !configured(env.STRIPE_PRICE_ID)) warnings.push('Stripe checkout is not fully configured.')

  return {
    app: {
      appUrlConfigured: configured(env.NEXT_PUBLIC_APP_URL),
      appUrlHost: urlHost(env.NEXT_PUBLIC_APP_URL),
      isVercel: env.VERCEL === '1' || env.VERCEL === 'true',
      nodeEnv: env.NODE_ENV || null,
    },
    auth: authStatus(env),
    billing: {
      stripeConfigured: configured(env.STRIPE_SECRET_KEY),
      checkoutConfigured: configured(env.STRIPE_SECRET_KEY) && configured(env.STRIPE_PRICE_ID),
      webhookConfigured: configured(env.STRIPE_SECRET_KEY) && configured(env.STRIPE_WEBHOOK_SECRET),
      priceConfigured: configured(env.STRIPE_PRICE_ID),
    },
    cache,
    ai,
    search: {
      brave: {
        configured: configured(env.BRAVE_API_KEY),
        role: 'optional-context' as const,
      },
    },
    markets: {
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
    },
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
