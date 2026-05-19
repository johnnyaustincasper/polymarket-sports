import { NextResponse } from 'next/server'
import { getAuthConfigStatus } from '@/app/lib/auth'
import { getDurableCacheStatus } from '@/app/lib/durable-cache'

export async function GET() {
  return NextResponse.json({ ...getAuthConfigStatus(), cache: getDurableCacheStatus() })
}
