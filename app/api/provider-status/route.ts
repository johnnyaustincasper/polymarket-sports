import { NextResponse } from 'next/server'
import { getProviderStatus } from '@/app/lib/provider-status'

export async function GET() {
  const status = getProviderStatus()

  return NextResponse.json(status, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
