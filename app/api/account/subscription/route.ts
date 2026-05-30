import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { SESSION_COOKIE, verifySessionToken } from '@/app/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SubscriptionMetadata = {
  subscriptionStatus?: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  plan?: string
  currentPeriodEnd?: string
}

const ACTIVE_STATUSES = new Set(['active', 'trialing'])

function buildSubscriptionResponse(meta: SubscriptionMetadata, authType: 'clerk' | 'legacy', fallbackStatus = 'unknown') {
  const status = meta.subscriptionStatus || fallbackStatus
  const hasStripeCustomer = Boolean(meta.stripeCustomerId)

  return {
    status,
    active: ACTIVE_STATUSES.has(status),
    plan: meta.plan || 'Premium',
    currentPeriodEnd: meta.currentPeriodEnd || null,
    stripeSubscriptionId: meta.stripeSubscriptionId || null,
    hasStripeCustomer,
    canManageBilling: Boolean(process.env.STRIPE_SECRET_KEY && hasStripeCustomer),
    unavailableReason: !process.env.STRIPE_SECRET_KEY
      ? 'Stripe is not configured yet.'
      : hasStripeCustomer
        ? null
        : 'No Stripe customer found yet.',
    authType,
  }
}

export async function GET(req: NextRequest) {
  const clerkUser = await currentUser().catch(() => null)
  if (clerkUser) {
    const meta = (clerkUser.publicMetadata || {}) as SubscriptionMetadata
    return NextResponse.json(buildSubscriptionResponse(meta, 'clerk'))
  }

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  return NextResponse.json(buildSubscriptionResponse({
    subscriptionStatus: 'unknown',
    plan: 'Premium',
  }, 'legacy'))
}
