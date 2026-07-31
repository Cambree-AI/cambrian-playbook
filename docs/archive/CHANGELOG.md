# Changelog

All notable changes to Cambrian Catalyst RIVER Playbook. Newest first.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Dates are in `YYYY-MM-DD`.

---

## [v108-security-perf] — 2026-04-20

22 commits. Security hardening, performance overhaul, knowledge layer
protection, anti-fabrication guardrails, and Milton (chat assistant).

### Security
- **JWT auth on all Claude proxy calls**: `api/_guard.js` requires
  `Authorization: Bearer <supabase-jwt>`. Validates exp + iss. Guest mode
  via `ALLOW_GUEST` env var.
- **Rate limiting**: 60 req/min per IP, sliding window in-memory per
  Vercel instance. Returns 429 on excess.
- **Knowledge layer server-side**: scoring heuristics, framework injections,
  NAICS/CPV codes served from `/api/knowledge.js` behind JWT — removed from
  client bundle. Verified: dist contains zero sensitive data.
- **Input size caps**: 120KB total messages + 12KB system prompt in guard.
- **Clerk removed**: eliminated critical CVE GHSA-vqx2-fgx2-5wq9 (unused
  since Supabase migration). npm audit: 0 vulnerabilities.
- **Supabase RLS verified**: anon key returns `[]` for fake user_id queries.

### Performance
- **Fixed duplicate API calls**: pre-cache stored `"loading"` strings;
  `pickAccount` duplicated all 5 calls (8 total). Now stores Promises.
- **Streamed 4 heavy calls**: Hypothesis, Post-Call, Discovery Qs, Solution
  Fit — all converted from blocking `callAI` to progressive `streamAI`.
- **Hypothesis fires 5-10s earlier**: triggers on `earlyDone` (p1+p3+p4)
  instead of waiting for slow web_search calls (p2, p5).
- **Top-3 account pre-caching**: after fit scores arrive, top 3 accounts
  get executive data pre-warmed automatically.
- **Brief proof pack trimmed**: LinkedIn + heavy proof-point data excluded
  from brief (added only to hypothesis/talk tracks where it matters).
- **Pre-fetch overview + live search on account select** (step 4).

### Chat Assistant (Milton)
- Embedded sales coach with dry humor (Office Space, Glengarry, Tommy Boy,
  Jerry Maguire, Wolf of Wall Street, Boiler Room, Pursuit of Happyness).
- Full knowledge layer (all negotiation frameworks, fit heuristics, buying
  signals) — never reveals proprietary methodology or framework names.
- Context-aware per step (10 step guides), injects brief/hypothesis/fit data.
- Calls out lazy reps (<20% discovery fields + no notes) with humorous nudges.
- Red Swingline stapler icon.

### Data Accuracy
- **Anti-fabrication rules on every prompt**: baseLight, proof pack (rule
  #9), hypothesis, fit scoring, discovery, post-call, solution fit,
  transcript analysis, ICP. Pattern: "NEVER invent — leave blank or [Verify]."
- **Never-invent seller stats** (rule #8 in proof pack).
- **3-dimension fit scoring**: ICP Alignment (40%) + Customer Similarity
  (30%) + Competitive Landscape (30%), with research-backed industry averages.

### Knowledge Layer Integration
- All `src/data/` modules now imported via `/api/knowledge.js` endpoint.
- `FIT_SCORING_RULES` heuristics injected into fit scoring prompts.
- `NAICS_CATEGORY_MAP` + `CPV_CATEGORY_MAP` into RFP search queries.
- `ALL_NEGOTIATION_INJECTIONS` into hypothesis + discovery.
- `BUYING_SIGNALS` into hypothesis + post-call deal routing.
- `JOLT_EFFECT` + `CHALLENGER_FRAMEWORK` into hypothesis + brief p3.
- `FISHER_URY` + `GRAHAM` into post-call + transcript analysis + SA review.

### Features
- **LinkedIn input + proof points**: Session page fields for seller's
  LinkedIn profile and manual proof points (case studies, ROI, wins, awards).
- **Scan Products button**: manual "Scan Products, Solutions & Services"
  fallback for mobile (onBlur doesn't always fire).
- **Call transcript upload**: paste or upload Gong/Chorus/Otter/VTT/SRT
  transcripts for full RIVER analysis on Post-Call page.
- **Any-model sales support**: removed B2B assumption — adapts to B2C,
  B2B2C, B2G, marketplace, hybrid.

### Code Quality
- Wired `src/lib/supabase.js` — deleted inline duplicates from App.jsx.
- Updated reference module comments in `src/data/prompts/` (briefGeneration,
  fitScoring, icpGeneration) — reflect streaming arch, knowledge layer API.

---

## [v107-ux-phases] — 2026-04-17

19 commits. Major UX overhaul (Phases 1-3 of the award-winning-SaaS plan),
target-generation filters, data-accuracy fixes, and desktop layout.

### UX Phase 1 — Foundation polish
- **Elevation system**: flat 1px borders → box-shadow on cards, bb blocks,
  stat cards, pie cards, cohort cards, account items, outcome tiles. Hover
  lifts cards with translateY(-1px) + elevated shadow.
- **Spacing scale**: `--sp-1` (4px) through `--sp-8` (64px) tokens.
- **Universal transitions**: 30 interactive element selectors get smooth
  spring-eased transitions on all state changes.
- **Skeleton shimmer**: `.skeleton` class for consistent async loading.
- **EmptyState component**: unified icon + Lora title + sub + CTA pattern
  replacing 5 ad-hoc dashed-border blocks.

### UX Phase 2 — Interaction layer
- **Cmd-K command palette**: full-width overlay, fuzzy search across stages
  (10), actions (save/print/regenerate), and accounts (up to 50).
  Keyboard nav (↑↓↵ Esc), grouped results, backdrop blur, slide animation.
- **Brief section collapse**: 4 heaviest sections (Company Overview,
  Solution Mapping, Tech Stack, Culture/Workforce) toggle on header click.
  CSS grid-template-rows animation, chevron rotation.
- **Keyboard shortcuts**: ⌘K palette, ⌘S save, ⌘P print, ←→ stage nav,
  1-9 stage jump. Only fires outside inputs.
- **Milestone celebration**: stepper circle pulses green on step completion.

### UX Phase 3 — Focus & immersion
- **In-call focus mode** (auto on step 7): header shrinks to 44px dark bar,
  stepper/session-bar/footer hidden, bg shifts calmer, type scales up
  across questions/gates/pills. Auto-reverts on step change.
- **Dark mode**: 🌙 toggle in header. Warm-dark palette (not cold blue-black).
  Covers surfaces, ink, brand tan, semantic colors, shadows, inputs, tables,
  command palette, tab switchers.
- **Stage transitions**: keyed wrapper div triggers CSS slide-in (opacity 0→1,
  translateX 16→0) on every step change.

### Target generation enhancements
- **Industry selector**: up to 3 industries from ICP defaults + 17 common
  B2B verticals + free-text custom. Chip picker with add/remove.
- **Headcount + revenue dropdowns**: 8 headcount bands (1-49 through 50K+),
  8 revenue bands (Under $1M through $10B+). Default shows ICP value.
  Both override ICP defaults in the generation prompt when selected.

### Data accuracy fixes
- **Executive name hallucination**: Brief p2 (executives) switched from
  streamAI (training recall) to claudeFetch + web_search. Prompt: "ACCURACY
  IS CRITICAL — if you cannot verify a name, return 'Verify at LinkedIn'."
- **Fit-score boundary hysteresis**: Potential Fit threshold raised 50 → 55.
  Accounts scoring 50-54 now consistently "Poor Fit" instead of flickering.
- **Open positions**: search careers pages FIRST (LinkedIn Jobs, Indeed,
  {company}/careers) with max_uses:3. Falls back to training knowledge if
  inaccessible. Filters out apology summaries from web_search failures.

### Layout & polish
- **Desktop width**: .page 860px → 1200px; .incall-wrap 940px → 1200px;
  Account Review 960px → 1200px. Responsive breakpoints: ≤1024px → 860px,
  ≤768px → 100%. Auto-fit grids for stats/pies/outcomes.
- **Session page**: 580px fixed → 720px in .page container.
- **Company logos** via Clearbit: Brief header (seller → target), Account
  Review hero, Hypothesis title. Fallback to initials on 404.
- **Search icon**: ⌘K button uses magnifying glass SVG.
- **Framework labels removed**: (Moore), (Revella), (Dunford), DMAIC
  stripped from all user-facing UI. Kept in prompt strings.

### Bug fixes
- **RFP cache**: empty arrays `[]` no longer served as valid cache hits.
- **RFP no-results**: "Couldn't parse" error → clean "No matching RFPs
  found" EmptyState with explanation.

---

## [v106-pipeline-quality] — 2026-04-16

Major iteration spanning ~24 commits over two sessions. Focus: make the
pipeline smarter (richer prompt context), faster (parallel execution +
caches), more honest (tier vocabulary purge, label normalization,
hallucination guards), and more useful (export, target generation,
proof pack).

### Resilience & infrastructure
- **Sonnet fallback on Anthropic 529.** Server-side proxy automatically
  retries with `claude-sonnet-4-5` when Haiku returns `overloaded_error`.
  Adds `x-fallback-model` header + `_fallbackModel` field for
  observability. ~3× per-call cost during fallback events; only fires
  on overload. Sonnet added to the proxy's `ALLOWED_MODELS` allow-list
  but cannot be requested directly by clients — substitution happens
  server-side based on `MODEL_FALLBACK` map.
- **Client retry on 529.** `claudeFetch()` helper introduced — handles
  both `rate_limit_error` (429) and `overloaded_error` (529) with
  exponential backoff (2s/5s/10s for overload, 15s/30s/45s for rate).
  Replaces ad-hoc retry in `callAI`, `streamAI`, `scanSellerUrl`,
  `buildSellerICP` (both phases), `fetchRFPIntel`, `generateBrief` p5.
- **`MAX_TOOL_USES`** raised from 1 → 3 in `api/_guard.js` so RFP
  intel can do separate searches for private + government sources.
- **Cache version bumps** ICP/RFP `v2 → v3` after the tier vocabulary
  purge. New `purgeStaleCaches()` IIFE on app boot removes any
  `icp:vN:*` / `rfp:vN:*` entries that don't match the current version
  so old data doesn't accumulate or surface stale language.

### Performance
- **Parallel fit-score batches** (`scoreFit`). Was sequential
  for…of…await — now Promise.all. Wall time on 100 rows: ~25s → ~4s.
  Each batch updates state as it lands so scores fade in progressively.
- **Brief skeleton render.** `generateBrief` is now synchronous,
  returns `{skeleton, mergers, allDone}`. The skeleton paints
  instantly; each of the 5 micro-call mergers fires as its Haiku call
  resolves. Time-to-first-paint dropped from ~3-5s to instant.
- **Brief progress banner.** Live "N/5 sections complete" indicator
  with 5 status dots, pending-section names, and a pulsing animation
  while sections are still streaming. Auto-hides on completion.
- **ICP debounced pre-fetch.** 900ms after the user stops typing a
  recognizable URL on the setup page, ICP build kicks off in the
  background. Complements the existing `onBlur` trigger.
- **CSS extraction.** ~440-line inline `const css =` template literal
  moved to `src/App.css`. Vite now ships separate JS + CSS bundles;
  CSS parses in parallel and caches independently. Bundle: 486 KB JS
  → 443 KB JS + 33 KB CSS (137 KB → 129 KB JS gzip).

### RFP Intel
- **Split into two parallel calls.** Open RFPs and Closed awards each
  get their own Haiku call with their own `web_search` budget.
  Each renders independently as it lands; Closed shows a skeleton while
  still loading.
- **Auto-trigger on ICP completion.** New `useEffect` watches a stable
  `icpSignature`; when the ICP becomes available (or changes via
  Regenerate) RFP fetch fires automatically. Force-refresh on ICP
  change so stale RFP data doesn't sit against a new ICP.
- **localStorage cache** keyed by `(userId, sellerUrl, marketCategory,
  schema version)`. Repeat tab opens are instant. Explicit `↻ Refresh`
  button forces a rebuild.
- **Prompt enriched with full ICP context.** Was passing only
  `sellerUrl` + `marketCategory` + `industries`. Now also injects
  `companySize`, `revenueRange`, `geographies`, `buyerPersonas`,
  `priorityInitiative`, `disqualifiers`, `dealSize`,
  `competitiveAlternatives`, `uniqueDifferentiators`, plus
  search-query patterns Haiku can adapt (`site:sam.gov ... 2025` etc).
- **`isGovernment` field** required on every row. Filter UI predicates
  tightened to strict `=== true / === false` so legacy data without
  the field doesn't silently pass either filter. Filter buttons now
  show live counts.
- **Awarded-To accuracy fix.** `awardedTo` now backed by `web_search`;
  if the vendor can't be verified, the field returns empty string and
  the UI renders "— unverified" in italic gray. Prompt explicitly:
  "do not invent."
- **Robust JSON extraction** for tool-use responses (text + tool_use +
  tool_result blocks). Walks blocks in reverse with brace + string-
  literal-aware counting.
- **Data-integrity disclaimer banner** above RFP tables: "Verify
  before acting. RFP data is AI-generated from live web search."
- **RFP titles are clickable links** to the source URL when present.

### ICP / Prompts
- **Tier 1 / The Wall vocabulary purge.** Internal scoring labels
  ("THE WALL", "TIER 1") were leaking into Brief watchOuts and Hypothesis
  segment-rule sections. Rewrote to plain-language categories
  ("structurally-difficult industries", "underserved high-fit segments").
  Updated reference module `src/data/prompts/fitScoring.js` to match.
- **Canonical fit labels.** `scoreFit` output now strict-enum:
  "Strong Fit" (≥75) / "Potential Fit" (50-74) / "Poor Fit" (<50).
  Score-derived label normalizer overwrites whatever Haiku returns —
  single source of truth = the score. Reason text scrubbed of any
  leaked "tier"/"wall"/"band"/"bucket" vocabulary.
- **Hypothesis 'route' field hallucination fix.** When Haiku returned
  `route` as a nested object instead of a string, UI rendered
  `"[object Object]"`. Two-layer fix: tightened prompt with explicit
  "STRING (not object)", and added `normalizeRiverField` helper that
  flattens any object-shape value to a readable bullet list. Applied
  at both fresh-build and session-restore.
- **Seller Proof Pack.** New `buildSellerProofPack()` helper composes
  a uniform "why buy from us" block (differentiators, named customers,
  competitive alternatives, success factors, priority trigger,
  traction channels, uploaded proof docs, product catalog) and
  prepends it to brief, hypothesis, solution-fit, and fit-score
  prompts. Schema for `solutionMapping[]` and `caseStudies[]` updated
  to require named-customer + differentiator citation.

### UX
- **Account Review redesign** — vertical full-width layout. Was 1fr/320px
  split with 4 stacked cards on the right. Now single column: account
  selector strip → hero → ICP match (4-col grid) → deal + outcomes
  with full-width Build Brief CTA.
- **Hypothesis "Solutions You're Selling" card** matches app language
  (was solid navy with light-blue text — now standard `.bb` block
  with tan `.sol-badge` chips).
- **Color sweep** — ~500 inline-style hex literals migrated to design
  tokens (`var(--green)`, `var(--tan-0)`, etc.). Ternary branches,
  border shorthands, and gradients all swept.
- **Login focus loss fix.** `AuthShell` was defined inside
  `PasswordGate`; React saw a fresh component identity on every
  keystroke, unmounted/remounted the form, and stole focus from the
  password input back to email. Hoisted to module scope.
- **Sample data + cohort cap.** Sample expanded 26 → 100 companies
  across 19 normalized industries. `buildCohorts` capped at 10 (top 9
  named + "Other" catch-all so no row is dropped). ACV column dropped
  from the Accounts table — ACV is a salesperson input on Account
  Review, not an attribute of the account.
- **Sample-load button** copy now reflects actual `SAMPLE_ROWS.length`
  ("Load Sample Data — 100 accounts").
- **'Build my target accounts'** — new gold CTA on the Import step.
  When ICP is built, generates 20 ICP-matched real companies via
  `web_search`, routes through standard cohort + fit pipeline.
- **In-call Solution Architecture discovery.** `generateDiscoveryQs`
  now produces TWO tracks per RIVER stage: SALES (existing — Mom
  Test, Voss, Cialdini etc.) and ARCHITECTURE (Rajput, McSweeney,
  Richards/Ford, Fowler, DMAIC, pilot scoping, adjacent-system risk).
  Architecture answers feed `buildSolutionFit` automatically via
  `riverData` (`sa_<stage>_<idx>` keys). SA + onboarding start at ~70%
  context instead of 0%.
- **Print-to-PDF** on every stage. ICP, Accounts, Account Review,
  Brief, Hypothesis, In-Call, Post-Call, Solution Fit. Print stylesheet
  extended to handle the In-Call split-pane layout, account-strip
  scroller, long tables, and pie charts (hidden in print).
- **JSON data export** companion (💾 Data button) on every stage.
  Downloads stage-specific structured data: ICP, RFP intel, accounts +
  fit scores, brief, hypothesis, in-call notes, post-call, solution
  fit. Dated filenames (`brief__usaa__2026-04-16.json`).

### Data integrity / business
- **Cost model + P&L scenario script.** New `docs/cost-model.md` with
  Anthropic pricing, per-stage cost breakdown calibrated against
  measured token data, persona scenarios (Light/Medium/Heavy/Power),
  pricing tier proposal, sensitivity analysis. Runnable
  `scripts/pl.mjs` with CLI overrides (`--users`, `--fallback`,
  `--haiku-mult`, etc.). Headline: 96% gross margin at 1K users with
  default mix.
- **Pipeline-wide consistency harness.** Three new scripts join
  existing `test-icp.mjs`:
  - `test-fit.mjs` — fit-score variance per (seller, account)
  - `test-brief.mjs` — brief field drift across runs (4 micro-calls
    in parallel)
  - `test-pipeline.mjs` — hypothesis + discovery consistency using
    fixed brief input
  Cost: ~$4 for full sweep across 8 sellers × N=3.

### Verified post-deploy
Daily security pen-test against production: all 11 probes pass —
- Security headers (HSTS / CSP / X-Frame / X-CTO / Referrer / Permissions)
- Opus injection → 400 "model not permitted"
- Cross-origin from evil domain → 403 "origin not allowed"
- `max_uses: 10` → silently capped to 3
- GET → 405
- Malformed body → 400
- Missing messages → 400
- Localhost / Vercel preview origins → 200

### Known issues / not yet addressed
- Brief Phase 2 (Executives) name hallucination — fix is to add
  `web_search` to that micro-call. Not yet done.
- Fit-score boundary hysteresis — accounts hovering at score 50 flip
  between Potential and Poor across runs. Either widen the threshold
  (≥55 for Potential) or surface the numeric score more prominently.
- Narrative ICP fields (topPains, priorityInitiative, etc.) still
  drift run-to-run — anchoring deferred until users complain.
- Post-call routing + Solution Fit consistency tests — need synthetic
  call data to test.
- `/api/claude*` no Supabase JWT auth — current allow-list bounds
  per-request cost but not requests-per-second.
- Briefs/Hypotheses saved to Supabase before today still carry tier
  vocabulary; only ICP/RFP got cache versioning + auto-purge.

---

## [v105-ux-polish] — 2026-04-15

### Fixed (same-day patch)
- **Login page now uses the app shell.** First v105 shipped a bespoke gated splash (custom gradient, custom card, custom logo/tagline/eyebrow classes) that didn't share the app's design language — user feedback was "looks like it's from 1984." Rebuilt using the standard `.app` > `.header` > `.page` > `.page-title` / `.page-sub` > `.card` > `.btn` pattern that every authenticated page uses. Only three login-specific classes remain (`.pw-tabs` segmented control, `.pw-error` inline alert, `.pw-guest` subtle link). No more separate visual system. Header shows the logo + "Private Beta" badge, `.page` centers at 480px, `.card` holds the form, the footer matches the rest of the app.

### Added
- **Design tokens** (`:root { --... }`) at the top of the stylesheet. Single source of truth for colors, radii, shadows, motion. 12 semantic tokens replace 40+ scattered hex literals. Documented inline — adding a raw hex color now means first adding a token.
- **Redesigned stepper**: 24px filled circles, connecting rails that fill as you progress (tan when completed, half-tan-half-gray on the active rail), active step gets a subtle focus ring + slight scale. Real `<button>` elements with proper `disabled` + `aria-current` instead of clickable divs. Labels hide on small screens to keep it scrollable without crowding.
- **Login page polish**: larger logo (30px), eyebrow chip (`● Private Beta`), tagline line ("Turn the next 1,000 accounts into your next 10 wins. AI-guided discovery from first account to closed deal."), tab switcher rebuilt on design tokens, tighter input padding, radial-gradient background replacing the old solid-to-green linear. Verification email state also upgraded.
- **Button lift**: `.btn-primary/-gold/-green/-navy` get a subtle 1px translateY on hover plus elevated shadow. Feels clickable without being flashy.

### Changed
- Header grew from 52px → 64px to accommodate the larger stepper comfortably. `calc(100vh - 52px)` updated to `-64px` in `.call-layout`.
- Button padding: 8px 16px → 9px 16px (subtle). `.btn-lg` from 11px 22px → 12px 24px.
- Page title: 26px → 28px with tighter letter-spacing. Slightly more confident.
- Focus rings: all focusable inputs now use `--sh-ring` (consistent tan glow) instead of one-off box-shadows.
- Consolidated cream backgrounds: `#F7F6F2` / `#F8F6F1` / `#FAF8F4` / `#F0EDE6` / `#FAFAF8` / `#F5F3EE` → `--bg-0` · `--bg-1` · `--bg-2`.
- Consolidated gold shades: `#8B6F47` / `#7A6040` / `#7A5C30` / `#BA7517` / `#C87533` / `#7A5010` → `--tan-0` · `--tan-1` · `--tan-ink` · `--amber`.

### Technical
- Stepper now uses `React.Fragment` and iterates `[rail, item, rail, item, ...]` instead of nested flex divs. Semantically cleaner.
- Fixed a pre-existing bug in stepper nav gating: had two `if(i===6)` branches (dead second) and step-index off-by-one on in-call/post-call/solution-fit requirements. Indices now match STEPS array order.
- Removed ~180 lines of inline styles from the login page in favor of `.pw-*` classes.

### Not changed (scope-limited)
- Page internals (Brief, ICP, Account Review, In-Call panels). The tokens cascade through the existing CSS classes, so those pages pick up the color consolidation automatically without JSX changes.
- Inline style attributes elsewhere in App.jsx (`style={{...}}`) still use raw hexes in some places. Those will migrate as stages get extracted to modules (S8 next, per roadmap).

---

## [v104-security-hardening] — 2026-04-15

### Security
- **`/api/claude` + `/api/claude-stream` proxies were open pass-throughs.** Pen test confirmed an unauthenticated caller could POST `{"model":"claude-opus-4-5","max_tokens":32000,"tools":[…]}` and the proxy would forward it to Anthropic, billing us at up to ~18× Haiku cost. Fixed by introducing `api/_guard.js` — a shared validator that builds a clean outbound body from scratch (no `…req.body` spread), allow-lists model (`claude-haiku-4-5-20251001` only), tool types (`web_search_20250305` only, `max_uses` capped at 1), caps `max_tokens` at 8000, and strips unknown fields. `temperature:0` hardcoded.
- **Origin allow-list** on both proxies: `cambrian-playbook.vercel.app`, Vercel preview subdomains (`cambrian-playbook-*.vercel.app`), and `localhost`. Absent-Origin requests (server-side tools like our consistency harness) still permitted — real defense is the field allow-list, not Origin.
- **User-scoped ICP cache** (`src/App.jsx`). Previous key was `icp:v2:<url>`; two users on the same browser saw each other's cached ICPs. Now `icp:v2:<userId|guest>:<url>`.
- **Security headers** in `vercel.json`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (deny camera/mic/geo/FLoC), `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. HSTS was already set by Vercel's default.

### Verified
Post-deploy pen re-test confirmed:
- Opus request → `400 "model not permitted"`
- 32K max_tokens → `200`, silently capped to 8000
- `Origin: https://evil.example.com` → `403 "origin not allowed"`
- `web_search max_uses:5` → `200`, silently capped to 1
- Malformed body → `400` with structured error
- Legitimate Haiku request → `200`, unchanged

---

## [v103-obscure-seller-fix] — 2026-04-15

### Fixed
- **ICP generation failed silently for obscure sellers.** Phase 1 of `buildSellerICP()` previously relied on Haiku's training knowledge. For any seller less famous than Gong/Linear (i.e. most real users), the model returned "Unknown" on every field. Phase 1 now uses `web_search_20250305` (max_uses:1) to pull the seller's actual website, press, and customer logos.
- **Cache no longer traps failures.** If an ICP contains `"Unknown"` / `"Unable to determine"` / `"PICK ONE"` in core fields (marketCategory, companySize, revenueRange, dealSize), it is NOT persisted to localStorage. Next load retries instead of permanently displaying a broken ICP.

### Verified
- Regression test: `scripts/consistency/test-icp.mjs` against `tillo.com` × N=5:
  - `companySize`, `revenueRange`, `salesCycle`, `industries`: **5/5 identical**
  - Before this fix: 4/5 runs returned "Unknown" for every field.

### Tradeoff
- Phase 1 latency: 5s → 22s (one-time per seller due to cache).
- Cost per ICP build: +~$0.01.

---

## [v102-icp-consistency] — 2026-04-15

### Added
- **Anchored enum schema for ICP Phase 2** (`buildSellerICP`). The model must pick `companySize`, `revenueRange`, `dealSize`, `salesCycle`, `adoptionProfile`, `ownershipTypes`, `geographies` from fixed buckets — no free-form ranges. This eliminates the "500-10K one run, 1K-100K the next" drift users were seeing.
- **localStorage cache** keyed by normalized seller URL + schema version (`icp:v2:<url>`). Once built, the same user sees the same ICP on every reload.
- **Explicit ↻ Regenerate button** in the ICP/RFP tab switcher (with confirm dialog) to force a rebuild.
- **`scripts/consistency/test-icp.mjs`** — Node test harness that runs the two-phase ICP generator N times per seller and reports field-by-field drift. Baseline comparison with `scripts/consistency/sellers.json` golden set.
- **`src/stages/S9_SolutionFit.jsx`** — first extracted stage component.

### Changed
- Extracted S9 SolutionFit view from App.jsx to `src/stages/S9_SolutionFit.jsx` as a presentational component. App.jsx shrank from 5,254 → 5,034 lines.
- `COHORT_COLORS` expanded from 5 → 15 distinct colors. Adjacent cohorts no longer collide in pie charts/legends. Synced across App.jsx, `config/constants.js`, and `lib/utils.js`.
- Brief micro-calls `p1-p4` (overview, execs, strategy, solutions) converted from `callAI()` → `streamAI()`. Uses `/api/claude-stream` with 120s timeout vs 60s. Tokens arrive progressively. `p5` (live web_search) stays non-streaming because `web_search_20250305` tool requires the non-streaming endpoint.
- Removed unused `MAX_COHORTS` constant and `.slice(0,5)` from `lib/utils.js buildCohorts()`.

### Measured (via harness, N=5 per seller)
- Before: 17–19 of 20 ICP fields unstable per seller.
- After: 4 core numeric fields 100% stable on well-known sellers (Gong, Tango, Savvi).
- Narrative fields (`topPains`, `priorityInitiative`, `uniqueDifferentiators`) still drift — intentionally not anchored in v102.

### Chore (in same tag)
- Remove `src/App.jsx.bak` (365KB of pre-v99 dead weight).
- Remove stray root `0` file (accidental shell redirect from earlier session).
- Remove redundant `src/.gitignore`.
- Fix duplicate `export async function streamAI` in `src/lib/api.js` (would have thrown SyntaxError if imported).
- Deduplicate and refresh `AGENT_CONTEXT.md`.

---

## [v101-modular-foundation] — 2026-04-15

### Added
- Extracted knowledge layer (reference only, not yet imported by App.jsx):
  - `src/config/constants.js`
  - `src/lib/api.js` (callAI, streamAI, callAIRaw)
  - `src/lib/supabase.js` (sbAuth, sbGetUser, sbSessions)
  - `src/lib/utils.js` (parseACV, labelOrgSize, buildCohorts, calcConfidence, etc.)
  - `src/data/outcomes.js`, `riverFramework.js` (imported), `sampleAccounts.js`
  - `src/data/negotiationFrameworks.js` (Voss, Fisher/Ury, Cialdini, Sun Tzu, Graham, Crucial Conv., JOLT, Challenger)
  - `src/data/rfpSources.js` (global registry, CPV + NAICS mappings, signal rules)
  - `src/data/prompts/{fitScoring,icpGeneration,briefGeneration,negotiationInjections}.js`
- `AGENT_CONTEXT.md` — comprehensive agent onboarding doc.

### Security
- All Claude calls routed through `/api/claude` and `/api/claude-stream` serverless proxies. Proxies force `temperature:0` server-side. `ANTHROPIC_API_KEY` lives only in Vercel server-side env.
- Supabase keys moved to `.env` vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Supabase RLS policy on `sessions`: `auth.uid()::text = user_id`.

### Performance
- ICP phase 2 converted to streaming — content appears in ~1-2s instead of blocking for full response.
- `scoreFit` prompt cut from 1,571 → ~200 tokens.
- ICP prompt cut from 2,010 → ~300 tokens (pre-v102 anchoring).
- Proxy timeouts: 60s for `/api/claude`, 120s for `/api/claude-stream`.
- URL scanner `web_search` reduced to `max_uses:1`.

### Features
- RFP Intel tab on ICP page — open RFPs + closed awards + Private/Government toggle, `isGovernment` flag drives badge color.
- Step 2 renamed "ICP" → "ICP & RFPs".
- Account Review page redesigned to fit a single laptop screen.
- Accounts table "Brief →" button renamed "Review →" and routed to Account Review (not straight to Brief).
- All cohorts now display (removed `.slice(0,5)` limit at display layer).
- Various button-wiring fixes: Build Brief, Review Hypothesis, Start In-Call.

---

## [v100-stable] — 2026-04-09

Last stable tag before the API-proxy migration. Beyond this point all AI calls go through serverless proxies; prior versions called Anthropic directly from the browser (with the exposed-key issue that was remediated in commits `a555339` and `dfbbff1`).

---

## [v99-clean] — 2026-04-06

Early stable checkpoint. Initial structure with direct browser→Anthropic calls (deprecated from v100 onward).

---

## Known limitations (across v103)

- **Monolithic App.jsx** (~5,028 lines). Only S9 stage is extracted. S1, S5, S6, S8 still inline.
- **Duplicate implementations**. `callAI`, `streamAI`, `buildCohorts` exist in both App.jsx (live, canonical) and `src/lib/*` (extracted, unused). Next stage extraction should wire these imports.
- **Extracted prompt modules are reference only**. `src/data/prompts/*.js` do NOT drive runtime behavior; App.jsx has its own inline prompts. Each module now carries a canonical-source pointer to the App.jsx line range — treat those files as maps, not executables.
- **Narrative ICP fields still drift** (`topPains`, `priorityInitiative`, `uniqueDifferentiators`). Anchoring technique from v102 can be applied if users complain.
- **`/api/claude*` endpoints are unauthenticated**. Anyone who finds the URL can POST to them and burn Anthropic credits. Lower-priority than the ICP bugs but worth adding Supabase JWT validation before scaling the user base.
- **RFP Intel uses Haiku training data, not live SAM.gov/TED APIs**. Planned.
- **CSS is a ~400-line string inside App.jsx**. Planned migration to `App.css`.
