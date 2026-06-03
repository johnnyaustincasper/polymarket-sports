import { auth, currentUser } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AppClient from './AppClient'
import { SESSION_COOKIE, verifySessionToken } from './lib/auth'
import { isAccessCodeGuestSession } from './lib/access-code-guest-session'

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)

export default async function HomePage() {
  const cookieStore = await cookies()
  const legacySession = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)

  if (isAccessCodeGuestSession(legacySession)) {
    return <AppClient clerkEnabled={clerkEnabled} />
  }

  if (clerkEnabled) {
    const { userId, sessionClaims } = await auth()
    if (!userId) redirect('/login')

    const user = await currentUser()
    const metadata = (user?.publicMetadata || sessionClaims?.publicMetadata || {}) as { subscriptionStatus?: string }
    const active = metadata.subscriptionStatus === 'active' || metadata.subscriptionStatus === 'trialing' || metadata.subscriptionStatus === 'paid'
    if (!active) redirect('/subscribe')
  } else if (!legacySession || legacySession.guest) {
    redirect('/login')
  }

  return <AppClient clerkEnabled={clerkEnabled} />
}
