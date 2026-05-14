import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://athleteintelligence.xyz'
}

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return NextResponse.json({ error: 'Stripe is not configured yet.' }, { status: 503 })
  }

  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress
  const metadata = (user?.publicMetadata || {}) as { stripeCustomerId?: string }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: metadata.stripeCustomerId,
      customer_email: metadata.stripeCustomerId ? undefined : email,
      client_reference_id: userId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${appUrl()}/?subscribed=1`,
      cancel_url: `${appUrl()}/subscribe?cancelled=1`,
      allow_promotion_codes: true,
      metadata: { clerkUserId: userId },
      subscription_data: { metadata: { clerkUserId: userId } },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout failed', error)
    return NextResponse.json({ error: 'Unable to start Stripe checkout. Try again in a minute.' }, { status: 500 })
  }
}
