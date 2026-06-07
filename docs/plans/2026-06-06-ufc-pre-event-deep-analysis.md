# UFC Pre-Event Deep Analysis Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace UFC’s raw market-board experience with a once-per-card deep analysis workflow that researches each fight before the event and turns the board into a fight-preview decision cockpit.

**Architecture:** UFC cannot use the NBA/MLB/NFL prop pattern because there are too few events and the edge lives in context, matchup style, narrative/hype, market psychology, and finishing paths. Build a durable per-event analysis snapshot generated the day before each UFC event, using ESPN/Kalshi/Polymarket structured data plus Grok/live-search research, then render cached fight dossiers in the UFC Slate. Runtime user loads should read the saved analysis first and only fall back to thin market-derived intel if no pre-event snapshot exists.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, existing `completeWithAi` AI provider wrapper, existing `durable-cache` Redis/memory abstraction, ESPN UFC scoreboard/rankings feeds, Kalshi UFC series, Polymarket Gamma API, Vercel Cron or manual admin rebuild route.

---

## Product Decision

The current `app/api/ufc-kalshi/route.ts` pulls Kalshi contracts and adds a light `buildKalshiUFCFightIntel()` layer. That is useful as fallback, but it still starts from markets.

New UFC model:

1. **Card-first:** identify the upcoming UFC event and every fight.
2. **Fighter-first:** build a dossier for both fighters.
3. **Narrative-aware:** capture hype, beef, public story, injuries/camp concerns, and why money/attention might be moving.
4. **Recent-form-heavy:** last fight, last 5 results, finishing method trend, activity gaps, level of competition.
5. **Style matchup:** striker/grappler/wrestler, cardio, durability, finishing threat, defensive holes.
6. **Market-aware, not market-led:** expected winner/market lean vs our pick/method are informed by prices but not just copied from them.
7. **Cached pre-event:** generated roughly 24 hours before fight night, with manual rebuild available.

User-facing UFC Slate should answer:

- Who is expected to win?
- Who do we think wins?
- How do we think they win?
- Why is the hype there?
- Is there beef/narrative that could distort the market?
- What happened in each fighter’s last fight?
- How did each fighter’s last 5 fights finish?
- What is the cleanest betting angle, if any?
- What can kill the bet?

---

## Data Contract

Create these core types in `app/lib/ufc/deep-analysis.ts`:

```ts
export interface UFCFighterRecentFight {
  opponent: string
  date: string
  result: 'win' | 'loss' | 'draw' | 'no_contest' | 'unknown'
  method: string
  round: number | null
  time: string
  notes: string
}

export interface UFCFighterDossier {
  name: string
  record: string
  age: number | null
  height: string
  reach: string
  stance?: string
  country: string
  ranking: number | null
  lastFightSummary: string
  lastFive: UFCFighterRecentFight[]
  finishingProfile: {
    koTko: number
    submission: number
    decision: number
    unknown: number
    summary: string
  }
  strengths: string[]
  concerns: string[]
  hype: {
    level: 'low' | 'medium' | 'high'
    why: string[]
    possibleMarketDistortion: string
  }
  narrative: {
    beefOrStory: string
    campNews: string
    injuryOrLayoffNotes: string
  }
}

export interface UFCFightDeepAnalysis {
  fightId: string
  eventId: string
  eventName: string
  eventDate: string
  weightClass: string
  isMainEvent: boolean
  fighterA: UFCFighterDossier
  fighterB: UFCFighterDossier
  market: {
    expectedWinner: string
    expectedMethod: string
    kalshiLean?: string
    polymarketLean?: string
    priceNotes: string[]
  }
  ai: {
    pick: string
    method: string
    roundOrTiming: string
    confidence: 'pass' | 'lean' | 'solid' | 'strong'
    thesis: string
    why: string[]
    risks: string[]
    watchouts: string[]
  }
  bettingAngles: Array<{
    label: string
    marketType: 'moneyline' | 'method' | 'distance' | 'rounds' | 'pass'
    side: string
    rationale: string
    maxRisk: 'small' | 'normal' | 'avoid'
  }>
  generatedAt: string
  sources: string[]
  staleAfter: string
}

export interface UFCEventDeepAnalysis {
  schemaVersion: 1
  eventId: string
  eventName: string
  eventDate: string
  generatedAt: string
  status: 'missing' | 'partial' | 'complete' | 'stale'
  fights: UFCFightDeepAnalysis[]
  cardSummary: {
    headline: string
    bestLooks: string[]
    fadeTheHype: string[]
    passFights: string[]
  }
}
```

---

### Task 1: Extract shared UFC event loader

**Objective:** Reuse the existing ESPN/Polymarket UFC data without duplicating route logic.

**Files:**
- Create: `app/lib/ufc/events.ts`
- Modify: `app/api/ufc/route.ts`
- Test: `app/lib/ufc/events.test.ts`

**Steps:**
1. Move `UFCPolyOdds`, `UFCFighter`, `UFCFight`, `UFCEvent`, `fetchUFCEvents()`, `parseEventFromScoreboard()`, `getPolyOddsForFight()`, and helpers from `app/api/ufc/route.ts` into `app/lib/ufc/events.ts`.
2. Export `fetchUFCEvents()` from the new module.
3. Keep `app/api/ufc/route.ts` as a thin handler:
   ```ts
   import { fetchUFCEvents } from '@/app/lib/ufc/events'
   ```
4. Add a regression test with a minimal mocked ESPN event that verifies:
   - competitions are sorted main event first
   - fighter records/age/height are parsed
   - event status uses event-level status, not first competition status
5. Run:
   ```bash
   npm run test -- app/lib/ufc/events.test.ts
   npm run typecheck
   ```

---

### Task 2: Add deterministic deep-analysis reducer

**Objective:** Convert event, market, and AI output into a stable public shape with fallbacks.

**Files:**
- Create: `app/lib/ufc/deep-analysis.ts`
- Test: `app/lib/ufc/deep-analysis.test.ts`

**Steps:**
1. Define the interfaces above.
2. Add `buildFallbackFightAnalysis(fight, kalshiIntel)` that produces a `UFCFightDeepAnalysis` when AI is unavailable.
3. Add `summarizeFinishingProfile(lastFive)`.
4. Add `sanitizeFightAnalysis(raw, fight)` to enforce:
   - max 3 betting angles
   - max 4 why bullets
   - max 4 risks
   - no empty fighter names
   - missing last-five entries become `unknown`, not fabricated results
5. Tests:
   - last-five method counts are correct
   - no-AI fallback returns `confidence: 'pass' | 'lean'`, never fake strong confidence
   - sanitizer trims excessive bullets and preserves actual fighter names
6. Run:
   ```bash
   npm run test -- app/lib/ufc/deep-analysis.test.ts
   ```

---

### Task 3: Build UFC research prompt and parser

**Objective:** Ask Grok/Anthropic for structured fight research without hallucinated certainty.

**Files:**
- Create: `app/lib/ufc/deep-analysis-ai.ts`
- Test: `app/lib/ufc/deep-analysis-ai.test.ts`

**Prompt requirements:**
- Use `completeWithAi()` from `app/lib/ai-provider.ts`.
- Prefer xAI live search when available:
  ```ts
  xaiSearchParameters: {
    mode: 'on',
    sources: [{ type: 'web' }, { type: 'news' }, { type: 'x' }]
  }
  ```
- Instruct model to return strict JSON only.
- Explicitly ask for:
  - last fight summary for both fighters
  - last 5 fight results and finish methods
  - hype/narrative/beef/camp/injury/layoff notes
  - expected winner from market/public consensus
  - model pick and method
  - bet/pass recommendation with risks
- Include a hard rule: if a fact is not found, return `unknown` instead of guessing.
- Include source URLs or source names where possible.

**Tests:**
- parser extracts JSON from clean JSON
- parser extracts JSON from fenced code block
- parser returns unavailable fallback for malformed output
- prompt includes both fighter names and the words `last 5`, `hype`, `beef`, `last fight`, `expected winner`, `method`

---

### Task 4: Add durable event analysis builder

**Objective:** Generate and cache one deep-analysis snapshot per UFC event.

**Files:**
- Create: `app/lib/ufc/deep-analysis-service.ts`
- Test: `app/lib/ufc/deep-analysis-service.test.ts`

**Implementation:**
- `getUFCAnalysisCacheKey(eventId)` → `ufc:deep-analysis:v1:${eventId}`
- `getCachedUFCEventAnalysis(eventId)` uses `getJsonCache()`.
- `setCachedUFCEventAnalysis(eventId, analysis)` uses `setJsonCache()` with TTL 10 days.
- `buildUFCEventDeepAnalysis(event, options)` loops each fight and calls AI with a concurrency limit of 1–2 to avoid provider rate-limit pain.
- It should merge:
  - ESPN fight card/fighter data
  - Kalshi fight intel from `app/lib/ufc/kalshi-fight-intel.ts`
  - Polymarket odds already in `fight.polyOdds`
  - AI research JSON
- If AI is unavailable for one fight, return fallback for that fight and mark event `partial`.

**Tests:**
- cache key includes schema version
- existing fresh cache is returned unless `force=true`
- failed AI on one fight does not fail the entire card
- event status becomes `partial` if any fight uses fallback

---

### Task 5: Add API routes for read and rebuild

**Objective:** Let the app read cached analysis and let admin/cron rebuild it before events.

**Files:**
- Create: `app/api/ufc-analysis/route.ts`
- Create: `app/api/admin/ufc-analysis/rebuild/route.ts`
- Test: `app/api/ufc-analysis/route.test.ts`

**Read route behavior:**
- `GET /api/ufc-analysis?eventId=...`
- If `eventId` missing, choose next pre/live UFC event from `fetchUFCEvents()`.
- Return cached analysis if present.
- If missing, return:
  ```json
  { "available": false, "status": "missing", "message": "Deep UFC analysis has not been generated for this card yet." }
  ```
- Do **not** auto-run full AI research on normal user GET. User load must stay fast and cheap.

**Admin rebuild behavior:**
- `POST /api/admin/ufc-analysis/rebuild`
- Require existing admin secret pattern if present in repo; otherwise use `UFC_ANALYSIS_ADMIN_SECRET` header `x-admin-secret`.
- Body:
  ```json
  { "eventId": "optional", "force": true }
  ```
- Runs `buildUFCEventDeepAnalysis()` and saves cache.

**Tests:**
- unauthenticated rebuild is 401
- missing cache read returns `available:false`
- cached read returns `available:true`

---

### Task 6: Add Vercel Cron endpoint / day-before automation

**Objective:** Generate the analysis the day before UFC events.

**Files:**
- Create: `app/api/cron/ufc-analysis/route.ts`
- Modify: `vercel.json` if cron config already exists, otherwise create it.
- Test: `app/api/cron/ufc-analysis/route.test.ts`

**Behavior:**
- Cron route checks next UFC events.
- If an event starts within 12–36 hours and no cache exists, build analysis.
- Use `CRON_SECRET` / Authorization Bearer if current project pattern exists.
- Return summary: eventId, generated count, skipped count.

**Suggested Vercel cron:**
```json
{
  "crons": [
    { "path": "/api/cron/ufc-analysis", "schedule": "0 15 * * *" }
  ]
}
```

That runs around late morning US time; exact timezone is UTC. It can run daily and only build when event timing matches.

---

### Task 7: Redesign UFC Slate UI around analysis cards

**Objective:** Make UFC feel like a fight-preview cockpit, not Kalshi browse.

**Files:**
- Modify: `app/AppClient.tsx`
- Optional create: `app/components/UFCDeepAnalysisCard.tsx` if AppClient is too large
- Test: UI smoke or pure component helper test if components are extracted

**Mobile-first card hierarchy:**
1. Event header:
   - event name/date
   - `Analysis generated [time]`
   - status pill: `Deep card preview`, `Partial`, or `Needs rebuild`
2. Card summary:
   - `Best looks`
   - `Fade the hype`
   - `Pass fights`
3. Fight cards:
   - matchup + weight class
   - market expected winner vs AI pick
   - method call
   - confidence: Pass / Lean / Solid / Strong
   - 2–3 why bullets
   - 1–2 risk bullets
   - expandable fighter dossiers:
     - last fight
     - last 5 finishes
     - hype/narrative/beef/camp notes
4. Secondary accordion:
   - raw Kalshi markets / Polymarket odds

**Important UX rule:** the primary CTA should be `Open fight preview`, not `Load board` or `Open markets`.

---

### Task 8: Wire UFC Slate data flow

**Objective:** Fetch deep analysis alongside existing UFC/Kalshi data and degrade gracefully.

**Files:**
- Modify: `app/AppClient.tsx`

**Behavior:**
- When `activeSport === 'ufc'`, call `/api/ufc-analysis` after `/api/ufc` returns the selected event.
- If deep analysis exists, render it first.
- If not generated, show explicit empty state:
  - `Deep UFC preview has not been generated yet.`
  - `Market-only view below is a fallback, not a full fight analysis.`
- Keep yesterday’s `buildKalshiUFCFightIntel()` board below as fallback/secondary.

---

### Task 9: Add production/admin smoke script

**Objective:** Verify the exact custom-domain UFC analysis flow after deploy.

**Files:**
- Create: `scripts/smoke-ufc-analysis.js`
- Modify: `package.json`

**Script checks:**
- `GET https://athleteintelligence.xyz/api/ufc` returns at least one event or a clean empty array.
- `GET /api/ufc-analysis` returns either:
  - `available:true` with `fights[]`, or
  - `available:false` with `status:'missing'`.
- No 500s.
- If `UFC_ANALYSIS_ADMIN_SECRET` is set locally, optionally POST rebuild against preview or production and then re-read.

**Package script:**
```json
"smoke:ufc-analysis": "node scripts/smoke-ufc-analysis.js"
```

---

### Task 10: Verification and deploy

**Objective:** Ship only after tests and production smoke pass.

**Commands:**
```bash
npm run test
npm run typecheck
npm run lint
npm run build
git status --short
git add app docs scripts package.json vercel.json
git commit -m "feat: add UFC pre-event deep analysis"
git push origin main
npx vercel deploy --prod --yes
npm run smoke:prod
npm run smoke:ufc-analysis
```

**Done means:**
- UFC Slate no longer presents raw Kalshi contracts as the primary experience.
- A cached deep analysis snapshot is available for generated events.
- Missing analysis states are explicit and honest.
- Runtime user loads do not trigger expensive full-card AI research.
- Production custom domain is smoke-tested.

---

## Rollout Strategy

Phase 1 should ship read route + admin rebuild + UI fallback. That lets us manually rebuild before the next card and verify quality.

Phase 2 adds Vercel Cron once the generated analysis shape is stable.

Phase 3 can add richer sources if needed:
- UFCStats scraping or a licensed fighter-stats source
- Tapology/Sherdog-like record enrichment if legally/technically safe
- X/social sentiment summary via Grok live search
- closing-line movement tracking

---

## Guardrails

- Do not fabricate last-five fight results. Unknown is acceptable.
- Do not call a bet “strong” from hype alone.
- Do not make the public UI a raw source dump.
- Do not let normal users trigger expensive rebuilds.
- Do not overfit to market prices; market is one input.
- Always keep `pass` as a first-class answer.
