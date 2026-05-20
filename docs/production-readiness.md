# Athlete Intelligence production readiness runbook

Production URL: `https://athleteintelligence.xyz`

This runbook covers safe deployment-readiness checks for production. The smoke tooling only calls read-only status pages and must not use cookies, bearer tokens, API keys, invite codes, or Stripe secrets.

## Quick smoke test

```bash
npm run smoke:prod
```

Optional overrides:

```bash
SMOKE_BASE_URL=https://athleteintelligence.xyz npm run smoke:prod
SMOKE_TIMEOUT_MS=15000 npm run smoke:prod
SMOKE_STRICT_WARNINGS=1 npm run smoke:prod
```

The smoke test checks:

- `GET /api/auth/status`: expects HTTP 200 JSON and validates auth/cache booleans plus nested provider status.
- `GET /api/provider-status`: expects HTTP 200 JSON and validates provider booleans.
- `HEAD /admin/status`: expects a safe reachable response (`200`, redirect to login, auth denial, or method not allowed).
- `GET /admin/status`: expects a safe reachable response (`200`, redirect to login, or auth denial).
- Redaction guard: fails if status JSON contains raw secret-like values such as Stripe secret keys, webhook secrets, bearer tokens, passwords, or private keys.

Warnings are non-fatal by default so the command can be used during staged hardening. Use `SMOKE_STRICT_WARNINGS=1` for release gates that should fail on provider warnings.

## Durable Redis/KV setup

Production must use durable storage for profile state, cached sports/market data, rate-limit state, and other cross-instance runtime data. In-memory fallback is only acceptable for local development or degraded emergency operation.

Supported env pairs, in priority order:

- Vercel KV: `KV_REST_API_URL` + `KV_REST_API_TOKEN`
- Upstash Redis: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- Generic Redis REST: `REDIS_REST_API_URL` + `REDIS_REST_API_TOKEN`
- Optional read-only token fallback for reads: `KV_REST_API_READ_ONLY_TOKEN` or `UPSTASH_REDIS_REST_READONLY_TOKEN`
- Optional namespace: `DURABLE_CACHE_PREFIX` or `KV_CACHE_PREFIX` (default: `athlete-intel`)

Readiness criteria:

- `/api/provider-status` reports `cache.mode: "redis"`.
- `/api/provider-status` reports `cache.remoteConfigured: true`.
- `/api/provider-status` reports `cache.recommendedForProduction: true`.
- No durable-cache warning appears in `warnings`.

Operational notes:

- Use a production-only Redis/KV database. Do not share with preview/dev unless prefixes are unique.
- Keep REST tokens in Vercel environment variables only; never commit them.
- Rotate Redis/KV tokens after incident response or suspected exposure.
- Before destructive changes, export/backup keys with the active prefix from the provider dashboard or CLI.

## Guest access launch policy

Current launch posture should be explicit:

- Paid/private launch: set `ENABLE_GUEST_ACCESS=false`, configure Clerk, and configure `AUTHORIZED_EMAILS` or `AUTHORIZED_USERS_JSON` for allowlisted users.
- Open beta/demo launch: `ENABLE_GUEST_ACCESS=true` is acceptable only if product/ops agrees that full guest access is intended.
- Avoid bootstrap-only production: `authorizedUserCount: 0` with a global invite/app password is convenient for recovery but should not be the long-term access model.

Readiness criteria for a controlled production launch:

- `auth.clerkConfigured: true`
- `auth.legacySessionConfigured: true` until legacy routes are fully retired
- `auth.authorizedUserCount > 0` for allowlist launches
- `auth.guestAccessEnabled: false` unless the release explicitly approves guest access
- `auth.bootstrapMode: false` unless this is a time-boxed emergency/bootstrap window

## Stripe smoke checklist

Use Stripe test mode in preview/staging when possible. For production, only perform low-risk checks unless a real purchase/refund is intentionally authorized.

Pre-deploy status checks:

- `/api/provider-status` reports:
  - `billing.stripeConfigured: true`
  - `billing.checkoutConfigured: true`
  - `billing.webhookConfigured: true`
  - `billing.priceConfigured: true`
- Stripe dashboard has webhook endpoint: `https://athleteintelligence.xyz/api/webhooks/stripe`
- Webhook event families enabled:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Functional smoke options:

- Signed-in account with no active subscription: checkout button should create a Stripe Checkout session and redirect to Stripe.
- Stripe Checkout cancel URL should return safely to the app without changing subscription state.
- For an authorized end-to-end production smoke, complete a real low-value checkout, verify Clerk metadata/subscription UI updates, then immediately cancel/refund according to business policy.
- Stripe customer portal should open for subscribed users and return to the account page.
- Webhook delivery should show HTTP 2xx in Stripe dashboard; failed deliveries must be replayed after fixing config.

Never log or paste `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` into issues, chats, or smoke output.

## Rollback and backup

Deployment rollback:

- Prefer Vercel's previous production deployment rollback for code regressions.
- Keep the last known-good deployment URL and commit SHA in the release notes.
- After rollback, run `npm run smoke:prod` against `https://athleteintelligence.xyz` and inspect `/api/provider-status` warnings.

Data/config rollback:

- Before changing Redis/KV providers, export or snapshot keys for the active prefix.
- Before rotating auth, Stripe, AI, or Redis secrets, record which Vercel environment variables changed and when.
- Stripe subscriptions/customers are source-of-truth for billing. If app metadata gets out of sync, reconcile from Stripe events or dashboard before editing user metadata manually.
- Clerk user metadata changes should be backed up/exported before bulk edits.

Emergency degraded operation:

- If Redis/KV is down, the app can fall back to memory, but production data/cache state will not be durable across instances or deploys.
- If AI providers are down, deterministic sports/market routes should still return safe degraded responses where implemented.
- If Stripe is down or misconfigured, disable checkout entry points or communicate billing unavailability rather than attempting manual key workarounds.

## Current known warnings from live production smoke

Observed on `https://athleteintelligence.xyz` during readiness hardening:

- Durable cache is using memory fallback in production: configure Vercel KV or Upstash Redis so `cache.mode` becomes `redis`.
- Guest access is enabled: confirm this is the intended launch policy or set `ENABLE_GUEST_ACCESS=false`.
- `authorizedUserCount` is `0` and `bootstrapMode` is `true`: add `AUTHORIZED_EMAILS` or `AUTHORIZED_USERS_JSON` for controlled access and turn off bootstrap once admins are configured.

These warnings should be resolved or explicitly accepted before a production launch gate.
