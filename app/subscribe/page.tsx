import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import SubscriptionActions from '../components/SubscriptionActions'

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)

export default async function SubscribePage() {
  if (!clerkEnabled) {
    return <SubscribeShell title="Subscription setup pending" subtitle="Add Clerk and Stripe environment variables in Vercel to turn on paid subscriptions." />
  }

  const { userId, sessionClaims } = await auth()
  if (!userId) redirect('/login')

  const user = await currentUser()
  const metadata = (user?.publicMetadata || sessionClaims?.publicMetadata || {}) as { subscriptionStatus?: string; stripeCustomerId?: string }
  const active = metadata.subscriptionStatus === 'active' || metadata.subscriptionStatus === 'trialing'

  if (active) redirect('/')

  return (
    <SubscribeShell
      title="Unlock Athlete Intelligence"
      subtitle="Premium market signals, player context, injury/fatigue intelligence, and source-aware edge analysis."
      email={user?.primaryEmailAddress?.emailAddress}
    />
  )
}

function SubscribeShell({ title, subtitle, email }: { title: string; subtitle: string; email?: string }) {
  const configured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID)

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#030502', color: '#f7fff0', padding: 18, fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(166,255,63,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(166,255,63,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 60% 60% at 50% 35%, rgba(166,255,63,0.15), transparent 72%)' }} />
      <section style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 520, borderRadius: 34, border: '1px solid rgba(166,255,63,0.24)', background: 'linear-gradient(135deg, rgba(8,12,6,0.98), rgba(0,0,0,0.92))', boxShadow: '0 0 70px rgba(166,255,63,0.12), 0 24px 90px rgba(0,0,0,0.82)', padding: 30 }}>
        <p style={{ color: '#a6ff3f', fontWeight: 950, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>Premium Required</p>
        <h1 style={{ margin: '10px 0 8px', fontSize: 36, letterSpacing: '-0.05em' }}>{title}</h1>
        <p style={{ margin: '0 0 22px', color: 'rgba(226,255,204,0.62)', fontSize: 15, lineHeight: 1.5 }}>{subtitle}</p>
        <div style={{ border: '1px solid rgba(166,255,63,0.18)', borderRadius: 24, padding: 20, background: 'rgba(166,255,63,0.055)', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 42, letterSpacing: '-0.06em' }}>$25</strong>
            <span style={{ color: 'rgba(226,255,204,0.58)', fontWeight: 800 }}>/ month</span>
          </div>
          <ul style={{ margin: '14px 0 0', paddingLeft: 20, color: 'rgba(226,255,204,0.72)', lineHeight: 1.7, fontSize: 14 }}>
            <li>Discord, Google, or email login</li>
            <li>Premium app access after active subscription</li>
            <li>Cancel or manage billing through Stripe</li>
          </ul>
        </div>
        {email && <p style={{ color: 'rgba(226,255,204,0.52)', fontSize: 12, marginTop: 0 }}>Signed in as {email}</p>}
        {configured ? <SubscriptionActions /> : <p style={{ color: '#f2ff7a', fontWeight: 800, fontSize: 13 }}>Stripe is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID in Vercel.</p>}
      </section>
    </main>
  )
}
