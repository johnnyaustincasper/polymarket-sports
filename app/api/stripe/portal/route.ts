import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireStripe } from '@/app/lib/billing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://athleteintelligence.xyz'
}

type BillingMetadata = {
  stripeCustomerId?: string
}

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)

function unavailable(reason: string) {
  return NextResponse.json({
    available: false,
    reason,
    url: null,
  })
}

export async function POST() {
  let stripeKey: string
  try {
    stripeKey = requireStripe()
  } catch {
    return NextResponse.json({ error: 'Stripe is not configured yet.' }, { status: 503 })
  }

  if (!clerkEnabled) return unavailable('Billing management needs Clerk account auth connected. Guest/legacy users have full testing access but no Stripe customer yet.')

  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const user = await currentUser()
  const metadata = (user?.publicMetadata || sessionClaims?.publicMetadata || {}) as BillingMetadata
  if (!metadata.stripeCustomerId) {
    return unavailable('No Stripe customer found yet.')
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: metadata.stripeCustomerId,
      return_url: appUrl(),
    })

    return NextResponse.json({
      available: true,
      url: session.url,
    })
  } catch (error) {
    console.error('Stripe billing portal failed', error)
    return NextResponse.json({
      available: false,
      reason: 'Unable to open the Stripe billing portal. Try again in a minute.',
      url: null,
    }, { status: 500 })
  }
}
