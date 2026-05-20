# Athlete Intelligence API Provider Standardization Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Do not touch the backup branch/tag. Work only on `refactor/api-provider-standardization` or short-lived child branches.

**Goal:** Standardize Athlete Intelligence around the intended production stack without losing app functionality: Vercel/Next.js, Clerk, Stripe, Upstash/Vercel KV, ESPN, Kalshi, xAI/Grok, Brave Search, with Polymarket and Anthropic preserved as optional legacy/bot providers.

**Architecture:** Add provider status/config abstractions first, then migrate AI usage behind a provider adapter, then clarify feature ownership and fallback behavior. Keep existing API routes alive. Prefer feature flags and provider fallbacks over deleting functionality. Every task must run `npm run verify` before commit.

**Tech Stack:** Next.js 14, TypeScript, Vitest, Clerk, Stripe, Upstash/Vercel KV, Kalshi API, ESPN public APIs, xAI OpenAI-compatible SDK, Brave Search, optional Anthropic and Polymarket.

**Functionality guarantee:** No route should be removed in this refactor. Legacy routes may be marked optional/legacy, but must keep returning useful fallback/status responses when env vars are missing.

**Known good backup before this plan:**
- Commit: `db7787e`
- Remote branch: `backup/functioning-state-20260519-132520`
- Remote tag: `functioning-state-20260519-132520`
- Local archive: `/Users/celeste/Backups/athlete-intelligence/polymarket-sports-db7787e-20260519-132520.tar.gz`

---

## Execution strategy using maximum safe subagents

Use parallel subagents only for tasks touching separate files. Do not dispatch multiple implementers against the same files at the same time. After each implementation batch, run a central integration verify from the controller session.

### Batch 1 — Discovery and safety rails, parallel

Dispatch 3 subagents in parallel:

1. **Provider map auditor**
   - Goal: produce a precise route-to-provider map from the current code.
   - Files to inspect: `app/api/**/route.ts`, `app/lib/**/*.ts`, env usage.
   - Output: markdown inventory with route, method, providers, required envs, optional envs, fallback behavior.
   - No code changes.

2. **Environment/schema auditor**
   - Goal: identify all env vars and propose production/preview/local values.
   - Files to inspect: all `process.env` usage, `README*`, deployment files if any.
   - Output: `.env.example` proposal and docs gaps.
   - No code changes unless explicitly assigned later.

3. **Risk/regression auditor**
   - Goal: identify routes that could lose functionality during provider standardization.
   - Focus: AI routes, Polymarket bot routes, Anthropic routes, cache/profile/auth fallbacks.
   - Output: risk list and tests needed.
   - No code changes.

Controller gate after Batch 1:
- Compare outputs.
- Update this plan if necessary.
- Only then implement.

---

## Batch 2 — Provider status/config foundation

### Task 1: Add provider status module

**Objective:** Create one typed source of truth for which providers are configured.

**Files:**
- Create: `app/lib/provider-status.ts`
- Test: `app/lib/provider-status.test.ts`
- Modify: optionally `app/api/auth/status/route.ts`

**Required behavior:**
- Export `getProviderStatus(env = process.env)`.
- Return status for:
  - `app`: `NEXT_PUBLIC_APP_URL`
  - `auth`: Clerk + legacy auth + guest access
  - `billing`: Stripe
  - `cache`: Upstash/Vercel KV
  - `ai`: xAI primary, Anthropic optional
  - `search`: Brave
  - `markets`: Kalshi public API, Polymarket public API
  - `sports`: ESPN public API
- Do not require secrets to be exposed, only booleans/mode labels.

**Tests:**
- Empty env reports public/free providers available but paid providers unconfigured.
- Full env reports configured providers.
- xAI is marked primary when `XAI_API_KEY` exists.
- Anthropic is marked optional/legacy when `ANTHROPIC_API_KEY` exists.

**Verify:**
```bash
npx vitest run app/lib/provider-status.test.ts
npm run verify
```

**Commit:**
```bash
git add app/lib/provider-status.ts app/lib/provider-status.test.ts app/api/auth/status/route.ts
git commit -m "feat: add provider configuration status"
```

---

### Task 2: Add deployment/env docs

**Objective:** Document what production should run on.

**Files:**
- Create or modify: `.env.example`
- Create or modify: `docs/production-providers.md`

**Required content:**
- Production required envs:
  - `NEXT_PUBLIC_APP_URL=https://athleteintelligence.xyz`
  - Clerk keys
  - Stripe keys/webhook/price
  - xAI keys/model
  - Brave key
  - Upstash/Vercel KV keys
  - `AUTH_SESSION_SECRET`
  - `ENABLE_GUEST_ACCESS=false`
- Optional envs:
  - `ANTHROPIC_API_KEY`
  - legacy auth invite vars
- Explain provider ownership by feature.

**Tests:**
- No runtime tests needed; run full verify to ensure docs/env example did not break build.

**Verify:**
```bash
npm run verify
```

**Commit:**
```bash
git add .env.example docs/production-providers.md
git commit -m "docs: document production provider setup"
```

---

## Batch 3 — AI provider abstraction, preserve functionality

### Task 3: Add AI provider adapter

**Objective:** Centralize xAI primary and Anthropic optional behavior without deleting Anthropic routes yet.

**Files:**
- Create: `app/lib/ai-provider.ts`
- Test: `app/lib/ai-provider.test.ts`

**Required behavior:**
- Export `getAiProviderStatus(env = process.env)`.
- Export helpers for selecting provider:
  - default primary: `xai` when `XAI_API_KEY` exists
  - fallback: `anthropic` when only `ANTHROPIC_API_KEY` exists
  - unavailable: return clear status when neither exists
- Do not make network calls in unit tests.
- Keep model defaults:
  - xAI: `XAI_MODEL || 'grok-3-mini'`
  - Anthropic fallback model can be documented but avoid hard dependency if not needed.

**Verify:**
```bash
npx vitest run app/lib/ai-provider.test.ts
npm run verify
```

**Commit:**
```bash
git add app/lib/ai-provider.ts app/lib/ai-provider.test.ts
git commit -m "feat: centralize AI provider selection"
```

---

### Task 4: Migrate `/api/team-intel` AI summary to adapter

**Objective:** Keep route behavior, but prefer xAI/Grok when available and fallback to Anthropic if configured.

**Files:**
- Modify: `app/api/team-intel/route.ts`
- Add tests only if pure summary-selection logic is extracted.

**Required behavior:**
- ESPN/ActionNetwork/Brave data gathering remains unchanged.
- AI summary provider selection uses the new adapter.
- If no AI key exists, route should still return structured intel with a clear `ai.available=false` or fallback narrative, not crash.
- Do not remove Anthropic support.

**Verify:**
```bash
npm run verify
```

**Commit:**
```bash
git add app/api/team-intel/route.ts app/lib/ai-provider.ts app/lib/ai-provider.test.ts
git commit -m "refactor: prefer xai for team intel summaries"
```

---

### Task 5: Migrate `/api/streaks` AI summary to adapter

**Objective:** Preserve streak functionality while preferring xAI/Grok.

**Files:**
- Modify: `app/api/streaks/route.ts`
- Add/extract tests if practical.

**Required behavior:**
- Existing streak data logic remains.
- xAI primary, Anthropic fallback.
- No key means graceful degraded response.

**Verify:**
```bash
npm run verify
```

**Commit:**
```bash
git add app/api/streaks/route.ts app/lib/ai-provider.ts app/lib/ai-provider.test.ts
git commit -m "refactor: prefer xai for streak summaries"
```

---

### Task 6: Migrate bot AI routes to adapter without changing routes

**Objective:** Keep `/api/bot/fullscan` and `/api/bot/signals` functional, but mark them as optional legacy/bot features and prefer xAI if available.

**Files:**
- Modify: `app/api/bot/fullscan/route.ts`
- Modify: `app/api/bot/signals/route.ts`

**Required behavior:**
- Polymarket scan behavior remains.
- Anthropic remains fallback.
- Missing AI keys produce clear degraded response, not a 500 unless the core task truly cannot run.

**Verify:**
```bash
npm run verify
```

**Commit:**
```bash
git add app/api/bot/fullscan/route.ts app/api/bot/signals/route.ts app/lib/ai-provider.ts
git commit -m "refactor: standardize bot AI provider selection"
```

---

## Batch 4 — Market provider clarity

### Task 7: Add market provider status and docs markers

**Objective:** Make Kalshi the primary market provider while preserving Polymarket routes.

**Files:**
- Modify: `app/lib/provider-status.ts`
- Modify: `docs/production-providers.md`
- Possibly add small route metadata constants if helpful.

**Required behavior:**
- Provider status clearly says:
  - Kalshi: primary market provider for props/contracts
  - Polymarket: optional legacy/event scanner provider
- No route deletion.

**Verify:**
```bash
npm run verify
```

**Commit:**
```bash
git add app/lib/provider-status.ts app/lib/provider-status.test.ts docs/production-providers.md
git commit -m "docs: clarify kalshi primary market provider"
```

---

### Task 8: Add route/provider inventory endpoint or static status response

**Objective:** Give the app/admin a way to see what is configured.

**Files:**
- Modify: `app/api/auth/status/route.ts` or create `app/api/provider-status/route.ts`

**Required behavior:**
- Return auth, cache, provider status.
- Do not expose secret values.
- Keep response safe for authenticated/admin usage; if public, return booleans only.

**Verify:**
```bash
npm run verify
```

**Commit:**
```bash
git add app/api/auth/status/route.ts app/lib/provider-status.ts
git commit -m "feat: expose safe provider status"
```

---

## Batch 5 — Cache/auth/billing hardening without feature loss

### Task 9: Ensure production cache warns when memory fallback is active

**Objective:** Make it obvious if production is accidentally running without Redis/KV.

**Files:**
- Modify: `app/lib/durable-cache.ts`
- Modify tests: `app/lib/durable-cache.test.ts`

**Required behavior:**
- Status includes `recommendedForProduction: false` when mode is memory/cookie fallback on Vercel production.
- Do not break local dev.

**Verify:**
```bash
npx vitest run app/lib/durable-cache.test.ts
npm run verify
```

**Commit:**
```bash
git add app/lib/durable-cache.ts app/lib/durable-cache.test.ts
git commit -m "feat: flag non-durable production cache"
```

---

### Task 10: Verify Stripe/Clerk production status and degraded states

**Objective:** Ensure billing routes clearly tell you what is missing instead of failing opaquely.

**Files:**
- Inspect/modify:
  - `app/api/stripe/checkout/route.ts`
  - `app/api/stripe/portal/route.ts`
  - `app/api/stripe/subscription/route.ts`
  - `app/api/account/subscription/route.ts`
- Tests if pure helpers are extracted.

**Required behavior:**
- Missing Stripe env returns 503 with clear message.
- Missing Clerk returns clear auth/config message.
- Existing functionality preserved.

**Verify:**
```bash
npm run verify
```

**Commit:**
```bash
git add app/api/stripe app/api/account/subscription/route.ts
git commit -m "fix: clarify billing provider configuration errors"
```

---

## Batch 6 — Final review and merge safety

### Task 11: Final integration audit

**Objective:** Verify no functionality was lost.

**Checks:**
- Run `npm run verify`.
- Compare API route list before/after; no route removed.
- Confirm provider status docs match code.
- Confirm main app still builds.
- Confirm backup branch/tag still exist.

**Commands:**
```bash
npm run verify
git diff --stat main...HEAD
git diff --name-status main...HEAD
```

**Commit:** only if final fixes are needed.

---

### Task 12: PR creation

**Objective:** Push branch and open PR, do not merge automatically unless Johnny approves.

**Commands:**
```bash
git push -u origin refactor/api-provider-standardization
gh pr create --title "refactor: standardize Athlete Intelligence providers" --body-file docs/plans/2026-05-19-api-provider-standardization.md
```

If `gh` unavailable, use GitHub web link after push.

---

## Rollback instructions

If anything goes sideways:

```bash
git checkout main
git reset --hard db7787e
git push --force-with-lease origin main
```

Safer rollback without rewriting main:

```bash
git checkout backup/functioning-state-20260519-132520
npm run verify
```

Restore local archive:

```bash
mkdir -p /tmp/athlete-restore
tar -xzf /Users/celeste/Backups/athlete-intelligence/polymarket-sports-db7787e-20260519-132520.tar.gz -C /tmp/athlete-restore
```

---

## Answer to functionality-risk question

You should not lose app functionality if this plan is followed because:
- No routes are removed.
- Polymarket remains available as optional legacy/event scanner functionality.
- Anthropic remains available as fallback while xAI becomes preferred.
- Missing provider keys produce clear degraded responses instead of crashes where possible.
- Backup branch, tag, and archive preserve the working app state.
