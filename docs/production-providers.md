# Athlete Intelligence production providers

This app should run as a Vercel/Next.js app at `https://athleteintelligence.xyz` with deterministic sports/market data first and AI used for summaries, reasoning, and signal explanations.

## Production required envs

- App URL: `NEXT_PUBLIC_APP_URL=https://athleteintelligence.xyz`
- Clerk auth: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Legacy/session safety: `AUTH_SESSION_SECRET`, `ENABLE_GUEST_ACCESS=false`
- Stripe billing: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- AI primary: `XAI_API_KEY`, `XAI_MODEL`, optional `XAI_BASE_URL=https://api.x.ai/v1`
- Search enrichment: `BRAVE_API_KEY`
- Durable cache/profile storage: one of Vercel KV, Upstash Redis, or Redis REST URL/token pairs

## Optional envs

- `ANTHROPIC_API_KEY`: legacy/fallback AI provider while old bot/team/streak routes are preserved.
- `ANTHROPIC_MODEL`: defaults to `claude-haiku-4-5`.
- `XAI_FULLSCAN_MODEL`, `ANTHROPIC_FULLSCAN_MODEL`: route-level overrides for the heavier `/api/bot/fullscan` prompt. Anthropic fullscan fallback defaults to `claude-sonnet-4-5`.
- `AUTHORIZED_EMAILS`, `AUTHORIZED_USERS_JSON`, `AUTH_INVITE_CODE`, `APP_PASSWORD`: legacy login/bootstrap controls.
- `API_RATE_LIMIT_REQUESTS`, `API_RATE_LIMIT_WINDOW_MS`: route rate limit overrides.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`: reserved optional fallback shape; not required for current production.

## Provider ownership by feature

- xAI/Grok: primary AI analysis provider for app analysis, prop enrichment, and future summaries.
- Anthropic: optional legacy/fallback provider for bot, team intel, and streak summary paths during migration.
- Brave Search: optional context enrichment for injuries, news, and external supporting links.
- ESPN: public sports data source; no secret required.
- Kalshi: primary market/contract provider for player props; no secret required for current public endpoints.
- Polymarket: optional legacy/event scanner provider; preserve routes but do not treat as the primary props source.
- Redis/KV: production durable cache and profile storage. Memory/file/cookie fallbacks are for local or degraded operation only.
- Stripe: checkout, portal, subscription state, and webhook metadata updates.
- Clerk: preferred production auth and subscription metadata store.
- Supabase: not currently integrated.

## Degraded modes to expect

- Missing xAI: Anthropic is used as fallback when configured; otherwise analysis routes return clear unavailable/degraded responses and prop enrichment is skipped.
- Missing Anthropic: bot/team/streak/fullscan routes use xAI if configured; otherwise they return fallback narratives/raw context where safe.
- Missing Brave: search context is omitted, but core sports/market data should still work.
- Missing Redis/KV: durable cache reports `memory` and warns when production/Vercel is using non-durable fallback.
- Missing Stripe: checkout/webhook are disabled with clear configuration errors; account pages should still render safe unavailable states.
- Missing Clerk: legacy session/guest flows can still work when configured, but production billing management requires Clerk.

## Provider status

`GET /api/auth/status` returns existing auth/cache status plus a safe `providers` object. It only exposes booleans, roles, modes, public provider labels, model names, and hostnames. It must never expose API keys, tokens, Redis URLs, or Stripe secrets.

## Stripe webhook setup

Configure Stripe to send webhooks to:

```txt
https://athleteintelligence.xyz/api/webhooks/stripe
```

Expected event families:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The webhook updates Clerk metadata fields such as subscription status, Stripe customer ID, Stripe subscription ID, plan, and current period end.

## Local verification

```bash
npm install
cp .env.example .env.local
npm run dev
npm run test
npm run typecheck
npm run build
npm run verify
```
