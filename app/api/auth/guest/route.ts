import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ ok: false, error: 'Guest access has been disabled. Membership is required.' }, { status: 410 })
}
