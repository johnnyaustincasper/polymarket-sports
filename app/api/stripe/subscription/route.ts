import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES = new Set(['active', 'trialing'])
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)

type SubscriptionMetadata = {
  subscriptionStatus?: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}

function subscriptionPayload(metadata: SubscriptionMetadata = {}) {
  const status = metadata.subscriptionStatus || 'inactive'
  const hasStripeCustomer = Boolean(metadata.stripeCustomerId)

  return {
    configured: {
      clerk: clerkEnabled,
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      billingPortal: Boolean(process.env.STRIPE_SECRET_KEY && hasStripeCustomer),
    },
    subscription: {
      status,
      active: ACTIVE_STATUSES.has(status),
      stripeSubscriptionId: metadata.stripeSubscriptionId || null,
      hasStripeCustomer,
    },
  }
}

export async function GET() {
  if (!clerkEnabled) {
    return NextResponse.json({
      available: false,
      reason: 'Clerk is not configured yet.',
      ...subscriptionPayload(),
    })
  }

  const { userId, sessionClaims } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }

  const user = await currentUser()
  const metadata = (user?.publicMetadata || sessionClaims?.publicMetadata || {}) as SubscriptionMetadata

  return NextResponse.json({
    available: true,
    user: {
      id: userId,
      email: user?.primaryEmailAddress?.emailAddress || null,
    },
    ...subscriptionPayload(metadata),
  })
}
