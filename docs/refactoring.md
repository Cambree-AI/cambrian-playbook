# App.jsx Refactoring Plan

Status: **DRAFT** (2026-07-30). Companion to [aws-migration-plan.md](aws-migration-plan.md) — this plan *is* most of AWS migration Phase 1 and unblocks Phase 4.

Goal: decompose the ~17,000-line `src/App.jsx` monolith (127 `useState`, ~18 inline components, all AI orchestration) into tested modules and components **without changing behavior**. Every extraction is surrounded by tests before and after.

Source of truth for the monolith's internals: [ARCHITECTURE.md](ARCHITECTURE.md) §2 (module map, state inventory, effects) and §3 (brief pipeline). Line numbers below come from that audit and drift as the file changes — re-locate by symbol name, not line.

---

## 1. Ground rules

1. **Behavior-preserving only.** No feature changes, no "while I'm in here" fixes. Bugs found get an issue, not a drive-by fix.
2. **Tests lead.** Before extracting anything, write characterization tests that pin its current behavior (including oddities); the extraction passes when the same tests pass against the new module.
3. **One extraction per branch/PR**, issue-backed per [branching.md](branching.md), sized per [kanban.md](kanban.md). Small PRs keep review honest in a file this size.
4. **App.jsx is canonical.** Several previously "extracted" modules (`src/lib/api.js`, `src/data/prompts/*`) drifted from the inline versions App.jsx actually runs. Each extraction must *reconcile* with any drifted twin: diff them, keep the App.jsx behavior, delete or absorb the twin. Never assume the existing module is current.
5. **Regression gates:** every PR runs ESLint + Jest + `test:lint`. Extractions touching prompt-building, merge/validator, KL injection, or scoring also require a golden-set lite run and the Stage-0 rule (no correctly-scored target regresses >5 points; re-run Stripe + Boeing).
6. **LLM calls are always mocked in Jest.** The live-API golden set stays a separate CI tier.

## 2. Test infrastructure (Phase R0) — prerequisite

- **Jest** + **babel-jest** (Vite/ESM project — configure `transform` for JSX/ESM early; this is the fiddly part), **jsdom**, **React Testing Library** + `@testing-library/user-event`.
- **Mock seams:**
  - Network: mock `fetch` (or adopt MSW) for `/api/claude`, `/api/claude-stream`, `/api/knowledge`, `/api/enrich*`, Supabase REST. Never mock deeper than the HTTP boundary for characterization tests; unit tests may mock `claudeFetch`/`callAI`/`streamAI` directly once extracted.
  - **LLM fixtures:** recorded real responses — golden-set `reports/` JSON and captured p1–p9 payloads for one known account (use a Stage-0 target, e.g. Marriott) checked into `tests/fixtures/`. Contamination-case fixtures too (a wrong-entity Stripe payload) so the defenses stay tested.
  - `localStorage`, timers (`jest.useFakeTimers`) for debounced auto-save, wave stagger, and retry/backoff logic.
- **Smoke test:** `App` renders to the landing state without crashing, with `/api/knowledge` mocked. This alone catches most catastrophic regressions during the refactor.
- CI: add a `jest` job to PR checks alongside knowledge-lint.

Deliverable: `jest.config`, `tests/fixtures/`, first smoke + one example unit test, CI wiring. (~8 pts)

## 3. Extraction phases

Ordered by risk (pure functions first, state last). Phases R1–R3 can proceed in parallel branches; R4+ are sequential.

### R1 — Pure logic out of module scope (~lines 365–2,600, no React)

These functions already live *outside* the `App()` component — extraction is mostly a file move plus import fixes. Highest test value per effort.

| New module | Pulls from App.jsx | Notes / test focus | Pts |
|---|---|---|---|
| `src/lib/json.js` | `safeParseJSON`, `extractJsonWithKey`, `repairJSON`, `stripCitations` | Malformed-JSON corpus: smart quotes, trailing commas, brace-walking | 3 |
| `src/lib/dealHealth.js` | `calcConfidence`, `calcDealHealth`, `confColor` | Boundary scores, empty gates | 2 |
| `src/lib/knowledgeInjection.js` | `_rankAndCapKls`, `_matchVerticals`, `getVerticalInjection`, 25+ `get*Injection()` | 2-tier ranking caps, keyword thresholds, false-positive cases from knowledge-layer-review.md. Depends on `KL_*` globals — pass them in as a param object instead (see R1a) | 8 |
| `src/lib/proofPack.js` | `buildSellerProofPack` + `proofPackCache` memoization | Cache-key behavior, exclusion handling | 3 |
| `src/lib/briefMerge.js` | `mergeOverview/Execs/Strategy/Solutions/Live/Roles/DeepIntel`, consistency validator, corroboration gate | **The crown jewels.** Contamination stripping, P1_FIELDS allowlist, single-source-of-truth rules (revenue→P9, employees→P1, glassdoor→P5), revenue/HQ backfill. Test against real + contaminated fixtures | 13 |
| `src/lib/promptContext.js` | `baseLight`/`baseFull` context builders, identity anchor, anti-hallucination blocks | Snapshot tests on assembled prompts; reconcile with drifted `src/data/prompts/*` | 8 |

**R1a — KL state:** the ~160 module-level `let KL_*` variables mutated by `fetchKnowledgeLayer()` become a single knowledge-store module (`src/lib/knowledgeStore.js`) with an explicit getter, so injected functions take data as arguments and become testable. (5 pts)

### R2 — AI client consolidation

`claudeFetch` / `callAI` / `streamAI` / `streamAIWithSearch` (App.jsx ~1126–1358) vs. the drifted `src/lib/api.js`: merge into one client module with the App.jsx behavior (3× exponential backoff, 429/500/529 handling, JSON-repair pipeline, SSE parsing). Fake-timer tests for retry schedules; fixture tests for SSE chunk assembly. This module is the **permanent LLM mock seam** for all later tests, and its interface is what the Fargate worker will reimplement server-side. (8 pts)

### R3 — Already-separate UI components (~lines 2,700–3,750)

~18 components are defined outside `App()` but inside the file: `ChatPanel`, `CompanyLogo`, `EmptyState`, `InfoTip`, `StepHint`, `MilestoneCelebration`, `CommandPalette`, `BriefLoader`, `AuthShell`, `PasswordGate`, `PieChart`, `CohortDrillDown`, `RiverFieldCard`, `ExportMenu`, `EF` (editable field), `GuidePanel`, `FitSortTh`, `StarButton`.

Move each to `src/components/` with an RTL test (render, key interaction, key prop variants). Mechanical and low-risk; good first-contribution-sized PRs. Batch ~3–4 components per PR. (2–3 pts per batch; ~13 total)

### R4 — State decomposition into domain hooks

Group the 127 `useState` (inventory in ARCHITECTURE.md §2.3) into custom hooks by the clusters they already form, moving the related `useEffect`s and `useRef` caches with them:

| Hook | Owns (state cluster) | Coupled effects/refs |
|---|---|---|
| `useAuthSession` | authed, sbUser, sbToken, savedSessions, currentSessionId | session load on user change; auto-save (debounced 10s) + `lastAutoSaveSnap` |
| `useSellerContext` | sellerUrl, sellerICP, sellerDocs, products, proof points, exclusions | reset-on-URL-change; exclusions→ICP sync |
| `useIcpBuild` | icpTargeting, icpLoading/Status, icpEdits, icpDelta | build-on-mount; `prevICPRef`, `icpBuiltRef` |
| `useTargetImport` | rows/headers/mapping, import mode, target filters, disqualified | dropdown auto-population |
| `useFitScoring` | fitScores, fitWeights, sort state, intel adjustments | — |
| `useBriefPipeline` | selectedAccount, accountQueue, brief, briefLoading/Status/Error, riverHypo, discoveryQs, postCall | pre-cache effect + `execCacheRef`/`briefPreCacheRef`/`enrichmentCacheRef`, `lastGenSig` dedup |
| `useRiverCall` | activeRiver, gateAnswers, gateNotes, riverData | — |
| `useOrgBilling` | orgCtx, hubspotStatus | HubSpot check on login; OAuth callback listener |
| `useUiShell` | step, panels/modals/drawers (20+ flags), favorites, celebrations | keyboard shortcuts; milestone effects; `prevStepRef` |

Test each hook with `renderHook` + mocked client. Shared state crossing hooks (e.g. `sellerUrl` feeding everything) flows through props/context from `App` — introduce a thin context provider only where prop-drilling gets absurd. One hook per PR, `useBriefPipeline` last (it's the riskiest). (5–13 pts each; useBriefPipeline 13)

### R5 — Stage components (the 10-step UI)

With hooks in place, carve the step UIs out of `App()`'s render into `src/stages/S0_Setup.jsx` … `S8_PostCall.jsx` (S9 already exists), plus the shared shell (header, stepper, Milton panel mount, drawers). Each stage gets RTL tests: renders from fixture state, fires its primary actions, calls the right hook methods. One stage per PR. (5–8 pts each)

### R6 — Pipeline orchestration isolation (pre-AWS)

Extract `generateBrief()` (~line 1624), `scoreFit`, `buildSellerICP`, `buildRiverHypo`, `buildPostCall` and the wave/stagger/timeout logic into `src/pipeline/` as **React-free** functions: inputs in, progress callbacks out, no `setState` inside. `useBriefPipeline` becomes a thin adapter (progress callback → state). Test the orchestration with fake timers + mocked client: wave ordering (p1/p3/p5 → +3s p2/p4/p6 → +6s p7/p8/p9), max-3 concurrency, 90s hard timeout, per-section failure collection, validator-before-complete.

This module's boundary is deliberately the **portability seam for AWS Phase 4**: the Step Functions state machine replaces `src/pipeline/`'s scheduler, and the merge/validator/prompt modules from R1 move into the Fargate worker unchanged. (13 pts)

### R7 — CSS (parallel, low priority)

Split the 1,800-line `App.css` along component lines as components extract (colocated files or CSS modules). No tests; visual spot-check on staging. (ongoing, 1–2 pts per batch)

## 4. Order & milestones

```
R0 test infra ──► R1 pure logic (+R1a KL store) ──► R2 AI client ──► R4 hooks ──► R5 stages ──► R6 pipeline
                        └──────────── R3 components (parallel any time after R0) ────────────┘
                                                                        R7 CSS (parallel with R5+)
```

Milestones:
- **M1 — Safety net:** R0 done, smoke test in CI. *(everything after this is safer)*
- **M2 — Logic tested:** R1 + R2 done → contamination defenses, merge rules, JSON repair, retry logic all under unit test. This alone satisfies most of AWS-migration Phase 1.
- **M3 — App.jsx < 10k lines:** R3 + first hooks done.
- **M4 — App.jsx is a shell:** R5 done; App.jsx = providers + shell + stage routing (~target < 1,500 lines).
- **M5 — Portable pipeline:** R6 done; ready for Step Functions port.

## 5. Risks & mitigations

- **Hidden coupling via module globals** (`KL_*`, `_authToken`, caches): R1a converts to explicit stores first; grep for every reader before moving a global.
- **Effect timing changes:** moving `useEffect`s into hooks can reorder them. Keep dependency arrays identical; characterization-test observable sequences (e.g. auto-save debounce) with fake timers.
- **Drifted twins reintroducing old behavior:** rule 4 — always diff against App.jsx inline code and keep the inline behavior.
- **Silent brief-quality regressions** (not catchable by unit tests): golden-set lite on any prompt/merge/scoring PR; full Stage-0 run at milestones M2, M4, M5.
- **Long-running refactor vs. feature work:** rebase pain in a 17k-line file is severe. Land extractions quickly, smallest-first; avoid two open PRs touching the same App.jsx region.

## 6. Definition of done (per extraction)

1. Characterization tests written against the inline code and passing.
2. Code moved; App.jsx imports the module; no behavior/API change; drifted twin reconciled or deleted.
3. Same tests pass against the module; new unit tests for edge cases.
4. ESLint + Jest + knowledge-lint green; golden-set lite if prompt/merge/scoring-adjacent.
5. App.jsx line count strictly decreases; no new module-level mutable state.
