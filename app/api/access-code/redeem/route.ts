import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { buildAccessGrantMetadata, findAccessCodeGrant } from '@/app/lib/access-codes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const code = String(body.code || '').trim()
  const grant = findAccessCodeGrant(code)
  if (!grant) return NextResponse.json({ error: 'Invalid or expired access code.' }, { status: 400 })

  const clerk = await clerkClient()
  const user = await currentUser().catch(() => null)
  const existingPublicMetadata = (user?.publicMetadata || {}) as Record<string, unknown>
  const grantMetadata = buildAccessGrantMetadata(grant)

  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...existingPublicMetadata,
      ...grantMetadata,
    },
  })

  return NextResponse.json({
    ok: true,
    status: grantMetadata.subscriptionStatus,
    plan: grantMetadata.plan,
    label: grant.label,
  })
}
