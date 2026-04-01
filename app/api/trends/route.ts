import { NextRequest, NextResponse } from 'next/server'
// TODO: Betting trends — ATS record, O/U record per team
//
// Implementation plan:
// 1. Fetch ATS records from covers.com or teamrankings.com
// 2. Calculate O/U hit rate per team
// 3. Break down by home/away, last 10, vs. division
// 4. Highlight meaningful trends (e.g. "covers ATS 70% at home")
//
// Query params:
//   ?team=<abbr>   — get trends for a specific team
//   ?date=<YYYYMMDD>   — get trends for all teams playing that day
//
// Response shape: BettingTrend[] (see app/lib/types.ts)

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'Betting trends intelligence coming soon',
    status: 'stub',
    // TODO: implement
  })
}
