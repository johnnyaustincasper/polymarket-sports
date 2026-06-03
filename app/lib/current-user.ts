import { auth, currentUser } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from './auth'
import { isAccessCodeGuestSession } from './access-code-guest-session'
import { isGuestAccessEnabled } from './guest-access'

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)

export async function getCurrentUser(req: NextRequest): Promise<SessionUser | null> {
  // Legacy sessions are intentionally limited by the paid-access policy.
  const legacySession = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (legacySession) {
    if (legacySession.guest && !isAccessCodeGuestSession(legacySession) && !isGuestAccessEnabled()) return null
    return legacySession
  }

  if (clerkEnabled) {
    const { userId } = await auth()
    if (!userId) return null

    const user = await currentUser()
    const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || `${userId}@clerk.local`
    const name = user?.fullName || user?.firstName || user?.username || undefined
    return { id: userId, email: email.toLowerCase(), name, guest: false }
  }

  return null
}

export function isClerkAuthEnabled() {
  return clerkEnabled
}
