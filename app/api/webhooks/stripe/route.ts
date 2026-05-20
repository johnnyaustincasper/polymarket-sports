import { clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireStripe } from '@/app/lib/billing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function subscriptionStatus(status?: Stripe.Subscription.Status) {
  if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'unpaid' || status === 'canceled') return status
  return 'inactive'
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const seconds = (subscription as any).current_period_end
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : undefined
}

function subscriptionPlan(subscription: Stripe.Subscription) {
  const item = subscription.items?.data?.[0]
  return item?.price?.nickname || item?.price?.lookup_key || item?.price?.id || 'Premium'
}

function compactMetadata(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}

async function updateUser(userId: string, data: Record<string, unknown>) {
  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { ...(user.publicMetadata || {}), ...compactMetadata(data) },
  })
}

export async function POST(req: NextRequest) {
  let stripeKey: string
  try {
    stripeKey = requireStripe()
  } catch {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid signature.' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id || session.metadata?.clerkUserId
    if (userId) {
      const subscription = typeof session.subscription === 'string'
        ? await stripe.subscriptions.retrieve(session.subscription)
        : null

      await updateUser(userId, {
        subscriptionStatus: subscription ? subscriptionStatus(subscription.status) : 'active',
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
        stripeSubscriptionId: subscription?.id || (typeof session.subscription === 'string' ? session.subscription : undefined),
        currentPeriodEnd: subscription ? subscriptionPeriodEnd(subscription) : undefined,
        plan: subscription ? subscriptionPlan(subscription) : 'Premium',
      })
    }
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const userId = subscription.metadata?.clerkUserId
    if (userId) {
      await updateUser(userId, {
        subscriptionStatus: subscriptionStatus(subscription.status),
        stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : undefined,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: subscriptionPeriodEnd(subscription),
        plan: subscriptionPlan(subscription),
      })
    }
  }

  return NextResponse.json({ received: true })
}
