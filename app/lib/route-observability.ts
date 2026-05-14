import { NextResponse } from 'next/server'

type RouteTimingContext = {
  route: string
  startedAt: number
}

export function startRouteTiming(route: string): RouteTimingContext {
  return { route, startedAt: Date.now() }
}

export function finishRouteTiming(ctx: RouteTimingContext, res: NextResponse) {
  const durationMs = Date.now() - ctx.startedAt
  const rounded = Math.max(0, durationMs)

  res.headers.set('Server-Timing', `app;dur=${rounded}`)
  res.headers.set('X-Route-Duration-Ms', String(rounded))

  // Lightweight, safe observability for live/serverless logs. No user tokens,
  // cookies, secrets, or full URLs are logged.
  console.info(`[route-timing] ${ctx.route} ${rounded}ms`)

  return res
}
