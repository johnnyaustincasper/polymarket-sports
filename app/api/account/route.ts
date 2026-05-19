import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/app/lib/auth'
import { isGuestAccessEnabled } from '@/app/lib/guest-access'
import { getAccountProfile, saveAccountProfile } from '@/app/lib/profile-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PublicProfileMeta = {
  username?: string
  displayName?: string
  details?: string
  avatarUrl?: string
  subscriptionStatus?: string
  stripeCustomerId?: string
}

function cleanUsername(value: unknown) {
  return String(value || '').trim().slice(0, 32).replace(/[^a-zA-Z0-9_.-]/g, '')
}

function cleanString(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

function legacyToAccountProfile(profile: any) {
  return {
    authType: profile.guest ? 'guest' : 'legacy',
    guest: Boolean(profile.guest),
    email: profile.email,
    username: profile.username || profile.preferences?.username || '',
    displayName: profile.displayName || profile.name || '',
    details: profile.details || profile.preferences?.details || '',
    avatarUrl: profile.avatarUrl || '',
    subscriptionStatus: profile.guest ? 'guest_full_access' : 'unknown',
    hasStripeCustomer: false,
    storage: profile.storage,
  }
}

function clerkToAccountProfile(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  const meta = (user.publicMetadata || {}) as PublicProfileMeta
  const email = user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || ''
  return {
    authType: 'clerk',
    guest: false,
    email,
    username: meta.username || user.username || '',
    displayName: meta.displayName || user.fullName || user.firstName || '',
    details: meta.details || '',
    avatarUrl: meta.avatarUrl || user.imageUrl || '',
    subscriptionStatus: meta.subscriptionStatus || 'inactive',
    hasStripeCustomer: Boolean(meta.stripeCustomerId),
    storage: 'clerk_public_metadata',
  }
}

async function getLegacySession(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (session?.guest && !isGuestAccessEnabled()) return null
  return session
}

export async function GET(req: NextRequest) {
  const legacySession = await getLegacySession(req)
  if (legacySession) {
    const profile = await getAccountProfile(legacySession, req)
    return NextResponse.json({ profile: legacyToAccountProfile(profile) })
  }

  const user = await currentUser().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  return NextResponse.json({ profile: clerkToAccountProfile(user) })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const displayName = cleanString(body.displayName, 80)
  const username = cleanUsername(body.username)
  const details = cleanString(body.details, 280)
  const avatarUrl = cleanString(body.avatarUrl, 2048)

  const legacySession = await getLegacySession(req)
  if (legacySession) {
    const res = NextResponse.json({ ok: true, profile: null as any })
    const profile = await saveAccountProfile(legacySession, req, {
      name: displayName,
      avatarUrl,
      preferences: { username, details },
    }, res)
    return NextResponse.json({ ok: true, profile: legacyToAccountProfile(profile) }, { headers: res.headers })
  }

  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const clerk = await clerkClient()
  const existing = await clerk.users.getUser(userId)
  const oldMeta = (existing.publicMetadata || {}) as PublicProfileMeta
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...oldMeta,
      username,
      displayName,
      details,
      avatarUrl,
    },
  })

  // Keep Clerk's visible name roughly aligned too, while using metadata as the
  // durable app profile source of truth.
  if (displayName) {
    const [firstName, ...rest] = displayName.split(/\s+/).filter(Boolean)
    await clerk.users.updateUser(userId, {
      firstName: firstName || undefined,
      lastName: rest.join(' ') || undefined,
      username: username || undefined,
    }).catch(() => null)
  }

  const updated = await clerk.users.getUser(userId)
  return NextResponse.json({ ok: true, profile: clerkToAccountProfile(updated) })
}
