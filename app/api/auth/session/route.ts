import { NextRequest, NextResponse } from 'next/server'
import { getAuthConfigStatus } from '@/app/lib/auth'
import { getCurrentUser, isClerkAuthEnabled } from '@/app/lib/current-user'
import { getAccountProfile, getProfileStorageStatus } from '@/app/lib/profile-store'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      guest: false,
      auth: { provider: isClerkAuthEnabled() ? 'clerk' : 'legacy', ...getAuthConfigStatus() },
      profile: null,
      ...getProfileStorageStatus(),
    })
  }

  const profile = await getAccountProfile(user, req)

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id || user.email,
      email: user.email,
      name: profile.name || user.name,
      guest: user.guest,
      subscriptionStatus: user.subscriptionStatus,
      accessSource: user.accessSource,
    },
    guest: user.guest,
    auth: { provider: isClerkAuthEnabled() ? 'clerk' : 'legacy' },
    profile,
  })
}
