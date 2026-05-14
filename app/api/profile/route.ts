import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/app/lib/current-user'
import { getAccountProfile, saveAccountProfile } from '@/app/lib/profile-store'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const profile = await getAccountProfile(user, req)
  return NextResponse.json({ profile })
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const patch = await req.json().catch(() => null)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return NextResponse.json({ error: 'Expected a JSON object.' }, { status: 400 })
  }

  const res = NextResponse.json({ ok: true, profile: null as any })
  const profile = await saveAccountProfile(user, req, patch as Record<string, unknown>, res)
  return NextResponse.json({ ok: true, profile }, { headers: res.headers })
}
