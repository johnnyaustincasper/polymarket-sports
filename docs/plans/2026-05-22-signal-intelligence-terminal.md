# Signal Intelligence Terminal Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Upgrade Athlete Intelligence from a prop list into a trading-desk style signal terminal that explains why a market matters, whether it is executable, what changed, and what risks/alerts apply.

**Architecture:** Keep the current working app intact. Add tested pure modules under `app/lib/` for signal decisions, liquidity, deltas, stat distributions, correlation warnings, and watchlist alerts. Then add presentational components under `app/components/signal-terminal/` and wire them into the existing `SignalsModelPanel` / prop board with minimal, isolated changes to `app/AppClient.tsx`.

**Tech Stack:** Next.js App Router, TypeScript, React client components, Vitest, inline dark terminal styling, localStorage for first-pass watchlist/alerts.

---

## Safety Checkpoint

Completed before this plan:

- Verified baseline with `npm run verify`.
- Remote backup branch: `backup/functioning-state-20260522-094507`.
- Annotated backup tag: `functioning-state-20260522-094507`.
- Local archive: `/Users/celeste/Backups/polymarket-sports/polymarket-sports-12c4791-20260522-094507.tar.gz`.
- Archive checksum verified with `shasum -a 256 -c`.
- Working branch: `feat/signal-intelligence-terminal-20260522-094507`.

## Non-overlap Rules for Parallel Subagents

- Workstream A owns only `app/lib/signals/*` and signal route wiring.
- Workstream B owns only `app/lib/props/distributions.*` and optionally appending pure fields in `app/api/props/route.ts`.
- Workstream C owns only `app/lib/parlays/*`, `app/lib/live/*`, and `app/lib/watchlist/*`.
- Workstream D owns only `app/components/signal-terminal/*`.
- Integration into `app/AppClient.tsx` happens after pure modules/components exist; only one subagent may edit `AppClient.tsx` at a time.
- No new chart dependency; build charts with lightweight SVG.
- Preserve existing routes, existing signal ledger keys, existing prop recommendations, and existing Kalshi exact matching behavior.

---

### Task 1: Add signal decision, execution liquidity, and delta modules

**Objective:** Create tested pure modules for the signal card's decision label, execution quality, and changed-since-refresh feed.

**Files:**
- Create: `app/lib/signals/liquidity.ts`
- Create: `app/lib/signals/liquidity.test.ts`
- Create: `app/lib/signals/delta-feed.ts`
- Create: `app/lib/signals/delta-feed.test.ts`
- Create: `app/lib/signals/insight.ts`
- Create: `app/lib/signals/insight.test.ts`

**Required API:**

```ts
export type SignalDecision = 'actionable' | 'watch' | 'pass' | 'stale' | 'trap' | 'thin'
export type LiquidityGrade = 'blocked' | 'thin' | 'real' | 'deep' | 'unknown'

export function gradeLiquidity(input: {
  ask?: number | null
  askSize?: number | null
  bid?: number | null
  bidSize?: number | null
  lastTradeAt?: string | null
  now?: Date
}): { grade: LiquidityGrade; label: string; warnings: string[] }

export function classifySignalDecision(input: {
  tier?: 'A' | 'B' | 'WATCH' | 'KILL'
  edge?: number | null
  ask?: number | null
  maxBuy?: number | null
  liquidityGrade?: LiquidityGrade
  flags?: string[]
  generatedAt?: string | null
  now?: Date
}): { decision: SignalDecision; label: string; reason: string }

export function buildWhyCare(input: {
  player: string
  label: string
  edge?: number | null
  fairPrice?: number | null
  ask?: number | null
  hitRate?: number | null
  hits?: number | null
  games?: number | null
  reasons?: string[]
  flags?: string[]
}): string[]
```

**TDD steps:**

1. Write failing tests for blocked/thin/real/deep liquidity boundaries.
2. Run `npm run test -- app/lib/signals/liquidity.test.ts`; expected FAIL before implementation.
3. Implement `gradeLiquidity` minimally.
4. Run targeted test; expected PASS.
5. Write failing tests for decision labels: actionable, watch, pass, stale, trap, thin.
6. Implement `classifySignalDecision` and `buildWhyCare`.
7. Write failing tests for `computeSignalDeltas` detecting new signal, tier change, ask improvement, fair move, liquidity improvement, and ignoring tiny noise.
8. Implement `delta-feed.ts`.
9. Run `npm run test -- app/lib/signals` and `npm run typecheck`.

**Acceptance criteria:**

- Pure modules are fully typed and exported.
- No route/UI behavior changes yet.
- Tests prove liquidity and decision boundaries.

---

### Task 2: Add prop stat distributions and ladders

**Objective:** Create a tested pure module that summarizes recent game logs into stat distributions and alternate-line ladders for the detail drawer.

**Files:**
- Create: `app/lib/props/distributions.ts`
- Create: `app/lib/props/distributions.test.ts`

**Required API:**

```ts
export type StatDistribution = {
  count: number
  mean: number | null
  median: number | null
  p25: number | null
  p75: number | null
  min: number | null
  max: number | null
  hitRate: number | null
  volatility: 'low' | 'medium' | 'high' | 'unknown'
  values: number[]
}

export function buildStatDistribution(values: Array<number | null | undefined>, line?: number | null): StatDistribution
export function buildPropLadder(values: number[], thresholds: number[]): Array<{ line: number; hits: number; games: number; hitRate: number }>
export function getMetricStatValue(log: Record<string, unknown>, metric: string): number | null
```

**TDD steps:**

1. Write failing tests for mean/median/p25/p75/hit rate.
2. Verify RED with `npm run test -- app/lib/props/distributions.test.ts`.
3. Implement distribution helpers.
4. Write failing tests for ladders using `>= line` and empty arrays.
5. Implement ladder helpers.
6. Write metric alias tests for points, rebounds, assists, PRA, hits, home runs, strikeouts, total bases.
7. Run targeted tests and `npm run typecheck`.

**Acceptance criteria:**

- Drawer can pass `last12` logs + metric and receive a compact distribution/ladders object.
- Handles empty/missing data gracefully.

---

### Task 3: Add correlation warnings, live prop progress, and watchlist alert modules

**Objective:** Create tested pure modules for parlay sanity warnings, live stat progress, and local watchlist/alert evaluation.

**Files:**
- Create: `app/lib/parlays/correlation.ts`
- Create: `app/lib/parlays/correlation.test.ts`
- Create: `app/lib/live/prop-progress.ts`
- Create: `app/lib/live/prop-progress.test.ts`
- Create: `app/lib/watchlist/alerts.ts`
- Create: `app/lib/watchlist/alerts.test.ts`

**Required API:**

```ts
export function detectCorrelationWarnings(items: Array<{
  player?: string
  team?: string
  gameId?: string
  metric?: string
  label?: string
  ticker?: string
  askSize?: number | null
}>): Array<{ severity: 'info' | 'watch' | 'danger'; label: string; detail: string }>

export function getLivePropProgress(live: unknown, playerName: string, metric: string, line?: number | null): { value: number; line: number; hit: boolean; label: string } | null

export function buildWatchKey(item: { id?: string; gameId?: string; player?: string; label?: string; ticker?: string }): string
export function watchlistReducer(state: WatchItem[], action: WatchAction): WatchItem[]
export function evaluateAlerts(input: { previous?: WatchSnapshot | null; current: WatchSnapshot; rules: AlertRule[]; now?: Date }): AlertEvent[]
```

**TDD steps:**

1. Write failing tests for duplicate ticker/player, same-game clusters, same-team stacks, pitcher-vs-hitter, and thin-liquidity warnings.
2. Implement correlation warnings.
3. Write failing tests for live prop progress against nested `stats`, `statistics`, direct row values, and HRR calculations.
4. Implement live progress helpers.
5. Write failing tests for idempotent watch add/remove/toggle and alert triggers: ask <= target, edge >= target, tier upgrade, liquidity crosses minimum, cooldown.
6. Implement watchlist/alert helpers.
7. Run all targeted tests and `npm run typecheck`.

**Acceptance criteria:**

- All helpers are pure and browser-independent.
- Invalid/missing data returns warnings/nulls, not exceptions.

---

### Task 4: Build presentational signal-terminal components

**Objective:** Add reusable UI components for the upgraded signal card, detail drawer, movement chart, consensus placeholder, flags, correlation warnings, and watch controls.

**Files:**
- Create: `app/components/signal-terminal/types.ts`
- Create: `app/components/signal-terminal/SignalTerminalCard.tsx`
- Create: `app/components/signal-terminal/SignalDetailDrawer.tsx`
- Create: `app/components/signal-terminal/PropDetailDrawer.tsx`
- Create: `app/components/signal-terminal/PriceFairMovementChart.tsx`
- Create: `app/components/signal-terminal/ChangedSinceRefreshFeed.tsx`
- Create: `app/components/signal-terminal/SportsbookConsensusPanel.tsx`
- Create: `app/components/signal-terminal/LineupInjuryFlags.tsx`
- Create: `app/components/signal-terminal/CorrelationWarnings.tsx`
- Create: `app/components/signal-terminal/WatchlistControls.tsx`

**Guidelines:**

- Use inline styles matching `AppClient.tsx`: dark terminal, neon green, amber warnings, red danger, rounded glass panels.
- Do not import app-specific state from `AppClient.tsx`.
- Components should render gracefully with missing optional data.
- `PriceFairMovementChart` must use SVG and no new dependency.
- `SportsbookConsensusPanel` may show current placeholder text for prop consensus.

**Verification:**

1. Run `npm run typecheck` after component creation.
2. Run `npm run lint`; only pre-existing warnings should remain.

**Acceptance criteria:**

- Components compile in isolation.
- No fetching/localStorage inside presentational components except button callbacks passed by props.

---

### Task 5: Wire `/api/signals` to expose enriched signal insights

**Objective:** Keep existing signal generation intact while adding optional `decision`, `execution`, `whyCare`, and `changeSinceRefresh` fields to signal responses.

**Files:**
- Modify: `app/api/signals/route.ts`
- Optionally create: `app/lib/signals/types.ts`
- Tests: extend/create `app/lib/signals/insight.test.ts` or add a small route-adapter test if practical.

**Steps:**

1. Import `gradeLiquidity`, `classifySignalDecision`, and `buildWhyCare`.
2. In signal scoring, compute:
   - `execution.ask`, `askSize`, `bid`, `bidSize`, `spread` when available.
   - `liquidityGrade`.
   - decision label/reason.
   - `whyCare` bullets.
3. Compare against previous latest signal snapshot from durable cache to compute deltas where data exists.
4. Preserve existing fields and ledger behavior exactly.
5. Run `npm run test -- app/lib/signals` and `npm run typecheck`.

**Acceptance criteria:**

- Existing UI still works because old fields remain.
- New UI can consume enriched optional fields.
- No network behavior is added beyond existing `/api/props` calls.

---

### Task 6: Integrate upgraded signal terminal UI into `SignalsModelPanel`

**Objective:** Replace the existing inline signal card list with upgraded terminal cards and a detail drawer while preserving scan/settle controls.

**Files:**
- Modify: `app/AppClient.tsx`
- Uses components from `app/components/signal-terminal/*`

**Steps:**

1. Import `SignalTerminalCard`, `SignalDetailDrawer`, and watchlist helpers.
2. Extend the local `ModelSignal` type with optional enriched fields.
3. Add local state:
   - selected signal
   - watched signal keys
   - alert rules/events
   - signal delta events from previous response
4. Render top `ChangedSinceRefreshFeed` inside Player Signals area.
5. Replace each signal anchor/card with `SignalTerminalCard`.
6. On click, open `SignalDetailDrawer` with reasons, flags, execution quality, chart, consensus placeholder, correlation warnings, and watch controls.
7. Preserve `ExactKalshiBetButton` behavior where ticker/url exists.
8. Run `npm run typecheck` and targeted tests.

**Acceptance criteria:**

- Player Signals becomes a signal terminal without losing scan/settle/performance controls.
- Watch/unwatch works locally and is idempotent.
- Detail drawer closes reliably on desktop/mobile.

---

### Task 7: Integrate prop detail drawer into `KalshiGameCard`

**Objective:** Add a deeper prop drawer for player-contract context: distribution, ladders, execution, sportsbook placeholder, injury/lineup flags, live progress, and correlation warnings.

**Files:**
- Modify: `app/AppClient.tsx`
- Uses `PropDetailDrawer` and pure modules from prior tasks.

**Steps:**

1. Add `activePropDetail` state inside `KalshiGameCard`.
2. Add a `Details` button to expanded contract blocks near the existing exact Kalshi button.
3. Build distribution/ladders from `bet.last12` or player game logs using `getMetricStatValue` + `buildStatDistribution`.
4. Add live progress using `getLivePropProgress`.
5. Add lineup/injury flags from prop injury fields and `lineups`/`intel` when available.
6. Add correlation warnings against currently selected parlay contracts.
7. Render `PropDetailDrawer`.
8. Run `npm run typecheck`.

**Acceptance criteria:**

- Current prop card expansion remains functional.
- New drawer adds depth without changing matching/scoring.

---

### Task 8: Add persistent refresh-change feed and alert evaluation

**Objective:** Preserve the existing 5-second odds drift animation but add a longer-lived change feed and alert evaluation for signal/prop changes.

**Files:**
- Modify: `app/AppClient.tsx`
- Uses `app/lib/signals/delta-feed.ts`
- Uses `app/lib/watchlist/alerts.ts`

**Steps:**

1. In `Home.fetchGames`, keep existing `oddsDrift` logic and also append durable feed events.
2. In `SignalsModelPanel`, compare previous and new signals with `computeSignalDeltas`.
3. Evaluate alerts for watched signals after new data arrives.
4. Cap feed length at a reasonable number (e.g. 30 events).
5. Render `ChangedSinceRefreshFeed` in the signal terminal and/or slate header.
6. Run `npm run typecheck`.

**Acceptance criteria:**

- Feed shows new signal, tier change, ask moved, fair moved, liquidity changed.
- Tiny movements are ignored.
- Alerts do not spam thanks to cooldown.

---

### Task 9: Final integration review and verification

**Objective:** Prove the full implementation is ready to push.

**Files:**
- All changed files.

**Steps:**

1. Run `npm run test`.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Run `npm run build`.
5. Run `npm run verify`.
6. Restore generated artifacts like `tsconfig.tsbuildinfo` if modified.
7. Review `git diff --stat` and `git diff --check`.
8. Commit with `feat: add signal intelligence terminal`.
9. Push branch.
10. Create a PR if GitHub CLI auth is available.

**Acceptance criteria:**

- Full verification passes.
- Branch is pushed.
- Backup branch/tag/archive remain available as rollback contract.
