# Claude Code Handoff — The Play Synthesis (`buildThePlay()`)

**Workstream:** v2 Initiative 1 — synthesis pass ("The Play")
**Branch:** `v2-staging` only. Never push to `staging` or `main` without Joe's explicit approval.
**Prepared from:** live read of `src/App.jsx` @ `v2-staging` (1:1 copy of `staging`), `V2_UX_REDESIGN.md` (full contract), `CAMBRIAN_V2_DESIGN_SPEC.md`.
**Baseline confirmed green before any edits:** `npm run test:fitcheck` → no-op PASS, golden-scores PASS, 26/26 property tests PASS.

> Paste this whole file into Claude Code as the task brief. It is self-contained. Field names and line numbers below are from the real codebase, not the idealized spec — **trust this file over the prose spec where they differ** (the divergences are called out in §2).

---

## 0a. LOCKED DECISIONS (June 30 — authoritative; override anything below that conflicts)

These were resolved with Joe and take precedence over the original contract:

1. **Non-streaming for v1.** Fire the Play when the 4 required sections (P1/P2/P4/P5) complete; generate fully, then render — **no token streaming**. Use the non-streaming JSON path (`callAI`-style) with a **Sonnet override** (`callAI` hardcodes Haiku via `activeModel()` — add a `model` param or call `claudeFetch` directly with the same JSON extraction). If a preferred section lands later, the Playbook updates but the Play does **not** re-run.
2. **P6 (scoring rationale) = Optional** in quorum. Required = P1/P2/P4/P5 only. Fit-score number comes from `fitScores`, not P6.
3. **Determinism model = fact-anchored generation.** Every generative clause must be anchored to a sourced, deterministic fact; no claim renders without an anchor. High-risk fields (contact name/title, top product, fit score, key signal) are **code-populated from validated data, never model-generated**. Temp 0.
4. **Auditable stored provenance.** Persist each Play field → fact-anchors → source refs (brief section / signal / filing / URL) with the Play, so any claim is traceable on demand.
5. **Runtime checks = 7 + 3 anchoring checks.** The 7 = the original 6 (§7) **plus number/stat verification** (with format normalization). The 3 added: **claim-anchor** (every generative clause maps to a stored anchor), **numeric-provenance capture** (every number stored with its source), **cross-field consistency** (`topProduct` == top `solutionMapping` product; displayed fit score == scorer output; primary contact == P2 top exec).
6. **Claim-level fail-closed, not whole-Play suppression.** If a clause can't be verified, strip/rewrite *that clause* and keep the rest. Only suppress the whole Play on the §8 "unavailable" triggers (required section missing / JSON parse fail after retry).
7. **`play-synthesis` feature flag.** Ship behind a flag (instant kill-switch; can run shadow/off). No No-Op/property-test port — eval + anchoring + flag are the guard.
8. **Full context in, facts out.** Inject the full available context — all fit-check signals, buyer-intent signals, sales guidance, Knowledge Layers — via a rich prompt. KLs/guidance shape **framing/angle only**; target **facts** come solely from validated brief/signal data.
9. **Eval = superset (8 checks), on every prompt change + nightly CI.** Golden-set = subset of Fit Check's 10 chosen for Play coverage; contamination pair must be distinct. This eval is a **new, independent harness** — not the broken brief-quality golden set (that fix is parked until after V2).
10. **Dark card subtree only.** Style just the Play card in v2 dark glass; leave the rest of Step 5 on the current theme (demo-critical screen, themed later).

> The stage consolidation (canonical Solution Thesis; merge Prep + Solution Fit; Post-Call → Solution Review) is a **separate, behavioral handoff** — not part of this additive build.

---

## 0b. Amendment A (June 30) — resolves pre-build verification questions

These four points were raised on review and resolved against the live code. **Authoritative; they supersede §0a items 1, 7 and §10 where more specific.**

**A1 · `callAI` model override — add an optional param (verified safe; matches existing pattern).** `callAI` (`async function callAI(prompt, { maxTokens = 5500, skipJsonSuffix = false } = {})`) is called in ~13 places, **none of which pass a model**. Add an optional `model` to the options, defaulting to `activeModel()`, and inside change `model: activeModel()` → `model` in the `claudeFetch` call. Then call `callAI(prompt, { maxTokens: 1200, model: SONNET })`. This is consistent with `streamAI`/search helpers, which already accept `model` (e.g. `model: OPUS`). Do **not** call `claudeFetch` directly — keep `callAI`'s JSON extraction/repair. (Adding a backward-compatible optional param to a generic helper is allowed; it is not one of the protected functions in §0.)

**A2 · Feature-flag mechanism — localStorage (no formal flag system exists).** The codebase has no flag framework; it uses query params + localStorage for runtime toggles, and the design spec prescribes a localStorage toggle. Implement a single localStorage switch `cc_play_synthesis` with three states: `'on'` (default on `v2-staging`), `'off'`, `'shadow'`. Do not invent an env/admin system.

**A3 · Flag-off behavior — "off" must be byte-identical to today (three-place guard).**
- **Trigger effect:** if flag ≠ `on`/`shadow`, do not fire `buildThePlay()` (no wasted call).
- **Render:** if flag ≠ `on`, render nothing — Step 5 is byte-identical to current.
- **`buildThePlay()`:** early-return guard as defense in depth.
- `'shadow'` = effect fires, generates, validates, logs, but the card stays hidden. `'off'` = nothing fires, nothing renders. This is the instant kill-switch for the demo window.

**A4 · Eval fixtures — `companies.json` is the WRONG fixture; capture is required.** `tests/golden-set/companies.json` is a brief fact-match set with a *fixed seller* — no seller ICP / `solutionMapping` / executives in the Play's shape. `tests/fit-check/golden-set.json` is the BHN-seller scoring set (Marriott, Chipotle, Boeing, Stripe, Verizon…). The Play eval needs, per account, a **brief** (`keyExecutives`, `solutionMapping`, signals) + **sellerICP** + **fitScore** — not pre-canned anywhere. So **capture** brief+ICP+score fixtures for the chosen accounts (same pattern as `FIT_CHECK_GOLDEN_SET_CAPTURE.md`) under `tests/the-play/`. Use BHN-seller targets with rich brief data (e.g., Marriott, Verizon, Stripe, Boeing, Chipotle); the back-to-back contamination pair must be clearly distinct (e.g., Marriott vs. Stripe).

> Also: line numbers throughout are branch-time hints — **search by pattern, not line number** (`function callAI`, `const BLANK_BRIEF`, `_loadingSections`, `{step===5&&(`, `setBrief(`). The code is truth.

---

## 0. Guardrails (non-negotiable)

1. **Aesthetic ≠ behavior, and additive ≠ destructive.** This feature is *purely additive*. Do not modify `generateBrief()`, the 7 section mergers, `computeFitScore`, the scoring lib, the ICP build, or any existing handler/state. You are *adding* a new state object, one trigger effect, one async function, and one render block.
2. **Non-degradation gate.** `npm run test:fitcheck` must stay green (no-op + golden-scores + 26 property tests). Run it before you start and after you finish. The Play touches none of the scored paths, so a red result means you broke something unrelated — stop and fix.
3. **The validation IS the feature.** Do not ship the synthesis call without the quorum gate (§5), the 6 post-generation checks (§6), and the 4 render states (§7). An un-guarded Play is a trust-destroying fabrication/contamination risk in front of a real customer.
4. **Build/lint must pass.** `npm run build` and `npm run lint` clean before handing back.
5. **Commit discipline.** Commit only the files you changed for this feature. Do **not** stage Joe's pre-existing uncommitted `ARCHITECTURE.md` change or unrelated untracked files. Suggested message: `feat(v2): add The Play synthesis pass with quorum gate + validation (v2-staging)`.

---

## 1. What you're building

One additional AI pass that runs **after** the brief's required sections complete, producing **The Play** — a single decision card rendered at the **top of Step 5 (Brief)**. It is *extractive* (selects/sequences already-validated brief facts), *identity-anchored* (cannot contaminate across back-to-back accounts), *quorum-gated* (won't generate on a partial brief), and *validated* (6 programmatic checks before render).

Scope of THIS handoff (Phase 2, items 1–5 of the revised sequence in `V2_UX_REDESIGN.md`):
- `buildThePlay()` synthesis call — identity anchor + extractive rule + quorum gate
- Post-generation validation (6 checks)
- Streaming + 4 render states
- The Play card UI in the v2 look, at top of Step 5
- Golden-set eval harness (5 accounts) + npm script + cost tagging

Out of scope here (later handoffs): Playbook reordering, surface/depth split, Quick-Brief seller-context exclusion, RIVER cross-step state, HubSpot dual-button. The Play renders above the **existing** Step 5 content, which is left untouched.

---

## 2. Spec → real codebase map (READ THIS FIRST)

The contract in `V2_UX_REDESIGN.md` assumes field names that **do not exist** in the code. Use the real ones:

| Spec says | Reality in `src/App.jsx` |
|---|---|
| `brief.overview` | Fields on `brief`: `companySnapshot`, `revenue`, `publicPrivate`, `employeeCount`, `headquarters`, `founded`, `fundingProfile`, `competitors`, `watchOuts` (these are the P1 "overview" fields — see `P1_FIELDS` @ line 2246 and `BLANK_BRIEF` @ line 336) |
| `brief.executives` | `brief.keyExecutives` (`[]`) and `brief.keyContacts` (`[{name,title,initials,angle}]`) |
| `brief.solutions` | `brief.solutionMapping` (`[{product, imperativeServed, buyerRole, jobToBeDone, painRelieved, fit, provenWith, measurableOutcome, ...}]`) |
| `brief.liveIntel` / signals | `brief.recentSignals` (`["","",""]`), `brief.recentHeadlines`, `brief.growthSignals`, `brief.publicSentiment` |
| `brief.strategy` | `brief.strategicTheme`, `brief.openingAngle`, `brief.sellerOpportunity` |
| `sellerICP.productCatalog` | `sellerICP.icp.productCatalog` |
| `sellerICP.verifiedCustomers` | `sellerICP.icp.verifiedCustomers` (also `sellerICP.icp.customerExamples`) |
| `sellerICP.sellerName` / `.sellerDescription` | Correct as-is: `sellerICP.sellerName`, `sellerICP.sellerDescription`; also `sellerICP.marketCategory`, `sellerICP.icp.industries`, `sellerICP.icp.buyerPersonas` |
| fit score input | `fitScores[targetCompany]` → `{ score, label, reason, color, bg, ownershipType, customerSimilarity, incumbentRisk, ... }` (state set via `setFitScores`) |

**Section-done signal:** `brief._loadingSections` is an object of booleans (`true` = still loading). Keys: `overview, executives, strategy, solutions, live, roles, deepIntel` (defined @ line 2236). A section is *done* when its flag is `false`.

**Critical correction — `topProduct` provenance:** Validate `topProduct` against **`brief.solutionMapping[].product`** (the grounded P4 output), not `sellerICP.icp.productCatalog` alone. The solutionMapping products are what the brief actually grounded for *this* account; the ICP catalog is the seller's full menu. Prefer solutionMapping; fall back to ICP catalog only if solutionMapping is empty.

**Critical correction — `primaryContact` provenance:** Validate the contact name against the raw text of **`brief.keyExecutives` + `brief.keyContacts`** (P2). These are arrays of objects — stringify them for the substring check.

---

## 3. AI plumbing you will reuse (do not reinvent)

All in `src/App.jsx`:

- **Models** (line ~588): `const SONNET = "claude-sonnet-4-6";` `const OPUS = "claude-opus-4-6";` and `HAIKU`. **Use `SONNET`** for The Play (quality matters; it's the primary output).
- **Streaming call** (line 1187): `async function streamAI(prompt, onChunk, maxTok=2000, { model=null, signal=null, system=null } = {})` → POSTs `/api/claude-stream`, **temperature 0 already enforced in the body**, sends `_trackingCtx` headers. Use this so the card can stream.
- **Non-stream JSON wrapper** (line 1402): `async function callAI(prompt, { maxTokens, skipJsonSuffix })` → wraps `claudeFetch`, applies `ANTI_HALLUCINATION_SYSTEM`, and **already does robust JSON extraction/repair** (`repairJSON`, unicode sanitize, trailing-comma strip). If you choose non-streaming, reuse `callAI` and you get parsing for free.
- **Recommended approach:** stream raw text into a buffer with `streamAI(..., {model: SONNET, system: PLAY_SYSTEM})`, then parse the buffer with the **same extraction logic `callAI` uses** (factor lines 1416–1434 into a small `extractJSON(raw)` helper and call it from both, or just call `callAI` non-streaming for v1 and add streaming polish later — non-streaming is acceptable for beta since the Playbook renders immediately beneath).
- **Anti-hallucination system prompt** (line 1176): `ANTI_HALLUCINATION_SYSTEM`. Prepend your identity anchor + extractive rule to this (don't replace it).
- **Cost tagging** (line 596): `setTrackingContext(targetCompany, sellerUrl, briefType)` sets `_trackingCtx["x-brief-type"]`. **Call `setTrackingContext(targetCompany, sellerUrl, "play-synthesis")` immediately before the synthesis call** so it logs as its own line item in `api_usage_log` (Initiative 6 / cost attribution). Restore the prior brief-type context afterward if needed.
- **Prompt-injection sanitizer** (line 1494): `sanitizeForPrompt(str)` — run seller/target free-text through it before interpolation (the brief sections are already sanitized upstream, but ICP free-text may not be).

---

## 4. Where to put the code (insertion points)

| What | Location in `src/App.jsx` | Notes |
|---|---|---|
| `PLAY_SYSTEM` const (identity anchor + extractive rule) | near `ANTI_HALLUCINATION_SYSTEM`, ~line 1186 | module scope |
| `buildPlayPrompt(...)`, `validatePlay(...)`, `extractJSON(...)` helpers | module scope, near `callAI` ~line 1435 | pure functions, unit-testable |
| New state: `const [thePlay, setThePlay] = useState(null);` and `const [playState, setPlayState] = useState("idle");` | inside `App()`, beside `const [brief, setBrief]` @ line 4680 | `playState ∈ {idle, building, full, reduced, contactUnconfirmed, unavailable}` |
| `buildThePlay()` async fn (quorum check → call → validate → setState) | near other async builders, ~line 8200 (same neighborhood as `pickAccount` @ 8231) | reads `brief`, `sellerICP`, `fitScores`, target company/domain from session state |
| Trigger `useEffect` | model it on the celebrate effect @ line 7888 | fires when quorum met (see §5); guard against double-fire and against Quick Brief (see §8) |
| The Play card render | **top of the `{step===5&&(` block @ line 14851**, before the existing brief sections | aesthetic-only addition above existing content |

Session target company/domain: trace what `pickAccount` (line 8231) and `setTrackingContext` receive — reuse that exact value as the canonical `targetCompany` for both the prompt anchor and the validation checks.

---

## 5. Quorum gate

The Play **does not generate** until all **required** sections are done AND required inputs are present.

```
REQUIRED brief sections done  →  brief._loadingSections.{overview, executives, solutions, live} === false
REQUIRED inputs present       →  targetCompany, targetDomain, sellerICP, and sellerICP.icp.productCatalog all non-empty
PREFERRED (generate anyway, flag reduced) →  brief._loadingSections.strategy === false ; fitScores[targetCompany]?.score
```

- If a **required** input/section is missing or its section errored (`brief._error` set for that section) → set `playState="unavailable"`, render the "Play unavailable" card, do **not** call the model.
- If required present but a **preferred** one missing → proceed, but set `playState="reduced"` after validation.
- Trigger effect dependency array should watch `brief?._loadingSections` and `brief?.companySnapshot`. Fire once per account: gate on `thePlay===null && playState!=="building"`. **Reset `thePlay`/`playState` on account switch** (when `pickAccount` loads a new target) so account B never shows account A's Play.

---

## 6. The prompt (extractive + identity-anchored)

`PLAY_SYSTEM` (prepend to `ANTI_HALLUCINATION_SYSTEM`):

```
You are building a sales play for ONE specific session. Output valid JSON only.
EXTRACTIVE RULE: You may only assert facts that appear in the SOURCE SECTIONS provided.
Do not introduce any claim, name, number, or title not present in the source. If a fact
is not in the source, omit it — never infer, estimate, or approximate. Every sentence you
write must be traceable to a labeled source section.
```

`buildPlayPrompt(targetCompany, targetDomain, sellerICP, briefSections, fitScore)` assembles, **in this order** (anchor first):

```
═══════════════════════════════════════════════════════
You are building a sales play for ONE specific session.
SELLER: {sellerICP.sellerName} (selling {sellerICP.sellerDescription})
TARGET COMPANY: {targetCompany} ({targetDomain})
DIRECTION OF SALE: {sellerICP.sellerName} → {targetCompany}
Every sentence must be about {targetCompany} specifically. If you find yourself writing
about a different company, stop. This is a play for {targetCompany} only.
═══════════════════════════════════════════════════════

SOURCE SECTIONS (carry labels through to output):
[P1: COMPANY OVERVIEW]
{companySnapshot} · revenue:{revenue} · employees:{employeeCount} · HQ:{headquarters} · {fundingProfile}  (truncate ~3000 chars)
[P2: EXECUTIVES]
{JSON.stringify(keyExecutives)} {JSON.stringify(keyContacts)}  (truncate ~2000)
[P4: SOLUTIONS MATCH]
{JSON.stringify(solutionMapping)}  (truncate ~2000)
[P5: LIVE SIGNALS]
{recentSignals} · {recentHeadlines} · {growthSignals} · sentiment:{publicSentiment.sentimentSummary}  (truncate ~2000)
[P3: STRATEGY] (if present)
{strategicTheme} · {openingAngle} · {sellerOpportunity}  (truncate ~1500)
[ICP: SELLER CONTEXT]
{sellerICP.sellerDescription} · products:{sellerICP.icp.productCatalog top 3} · customers:{sellerICP.icp.verifiedCustomers top 3}

TASK: Build The Play for {sellerICP.sellerName} selling into {targetCompany}. Output valid JSON only.

OUTPUT SCHEMA:
{
  "situation": "2–3 sentences. What's happening at {targetCompany} now, relevant to {sellerName}. Ground in [P1]/[P5]. Name the signal.",
  "whyNow": "1–2 sentences. Which {sellerName} product fits + the [P5] signal making it timely. Reference a named product.",
  "yourMove": "2–3 sentences. Who to contact (name+title from [P2] ONLY), channel, opening angle. Directive.",
  "primaryContact": { "name": "from [P2] only", "title": "from [P2] only", "rationale": "1 sentence from [P2]" },
  "elevatorPitch": "3–4 sentences tailored to {targetCompany}. May cite a verified customer from [ICP]. No capabilities not in [ICP].",
  "draftEmailSubject": "One line, specific to {targetCompany}.",
  "draftEmailBody": "4–6 sentences: credibility → {targetCompany} pain → low-friction ask.",
  "topProduct": "Product name from [P4 solutionMapping] / [ICP] only — exact match.",
  "keySignal": "Single most important [P5] signal making this timely — one sentence.",
  "sectionSources": { "situation":["P1","P5"], "whyNow":["P4","P5"], "yourMove":["P2"], "elevatorPitch":["P4","ICP"], "primaryContact":["P2"] }
}
```

Call: `streamAI(prompt, onChunk, 1200, { model: SONNET, system: PLAY_SYSTEM + "\n" + ANTI_HALLUCINATION_SYSTEM })` (or `callAI(prompt, {maxTokens:1200})` for non-streaming v1). Set `setTrackingContext(targetCompany, sellerUrl, "play-synthesis")` first.

---

## 7. Post-generation validation (run before render; <5ms)

After parse, before `setThePlay`:

| # | Check | Implementation | Failure action |
|---|---|---|---|
| 1 | **Target present** | `JSON contains targetCompany or targetDomain (case-insensitive) at least once` | suppress Play → `playState="unavailable"` |
| 2 | **No other company** | scan string fields for any company name ≠ targetCompany/seller (use brief.competitors + a capitalized-token heuristic; conservative) | strip offending sentence; `console.warn` + log |
| 3 | **Contact in P2** | `primaryContact.name` substring-present in `JSON.stringify(keyExecutives)+JSON.stringify(keyContacts)` | clear `primaryContact` → `playState="contactUnconfirmed"` |
| 4 | **topProduct in source** | present in `solutionMapping.map(s=>s.product)` (preferred) or `sellerICP.icp.productCatalog` | clear `topProduct`, show "—" |
| 5 | **sectionSources populated** | object present + non-empty | render but flag provenance unverified (log) |
| 6 | **JSON parse ok** | parse succeeded (reuse `callAI`'s extractor) | retry once; if still fails → `playState="unavailable"` |

These set/adjust `playState`. Precedence: parse-fail/target-missing → `unavailable`; else contact-fail → `contactUnconfirmed`; else preferred-missing → `reduced`; else `full`.

---

## 8. The four render states (card UI)

Card lives at top of Step 5. **Use the v2 design tokens** (these are NOT the app's current light theme — define them locally scoped to the card so you don't disturb the rest of the page; see §9).

| State | Trigger | Treatment |
|---|---|---|
| **full** | all checks pass, preferred present | full card: Situation / Why Now / Your Move / Fit badge / Elevator Pitch (copy) / Draft Email (copy) |
| **reduced** | required ok, preferred missing | full card + amber chip "Built on partial brief — strategic context incomplete" |
| **contactUnconfirmed** | check 3 failed | card renders; contact line shows "Contact not confirmed — verify in full brief" |
| **unavailable** | required missing / parse fail after retry | dark card: "Couldn't build a confident play for this account. Full research is available below." |
| **building** | quorum met, awaiting/streaming | skeleton with "Building your play…" |

Copy buttons: reuse whatever clipboard helper already exists in the file (grep `navigator.clipboard` / `copy`); match existing toast behavior.

---

## 9. The Play card visual spec (v2 look)

From `CAMBRIAN_V2_DESIGN_SPEC.md` + `cambrian_overview_reel.html`. The card is a **dark glass panel with a 3px coral left border** — visually distinct because it is the deliverable, not a summary. Scope these as inline styles / a local style object on the card subtree only (the rest of Step 5 keeps the current theme until the redesign workstream).

```
--ink:#080b12  --panel1:rgba(22,28,46,.86)  --panel2:rgba(12,16,28,.86)
--line:rgba(122,140,176,.18)  --lineL:rgba(122,140,176,.30)
--txt:#eef2f8  --mut:#8b97ad  --coral:#ff6a3d  --mint:#5eead4  --amber:#f4b740
--mono: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace
```

- **Panel:** `background:linear-gradient(180deg,var(--panel1),var(--panel2)); border:1px solid var(--lineL); border-left:3px solid var(--coral); border-radius:14px; box-shadow:0 18px 50px rgba(0,0,0,.45), 0 0 50px rgba(94,234,212,.05); backdrop-filter:blur(6px);`
- **Header:** mono eyebrow `THE PLAY` in coral (uppercase, letter-spacing 2px) + company name (sans, weight 800) + fit badge right-aligned (mint pill `STRONG · 81`, mono).
- **Field rows:** mono label in mint (`WHY NOW`, `YOUR MOVE`, min-width ~74px) + value in `--txt`. Reference: `.play` / `.line` / `.lab` classes in `cambrian_overview_reel.html` (lines 69–75) — match that layout.
- **Buttons:** coral fill for primary copy actions (`background:var(--coral); color:#1a0c06; font-weight:800; box-shadow:0 0 22px rgba(255,106,61,.45)`), ghost/outline for secondary.
- **Amber chip** for reduced-confidence; muted dark card for unavailable.
- Contrast/readability: all interactive controls must remain clickable and legible on the dark card. Don't let the dark card bleed into the surrounding light page — contain it.

---

## 10. Golden-set eval (required before beta)

Add `tests/the-play/eval.js` + npm script `"test:play": "node tests/the-play/eval.js"`. Model it on the existing `tests/fit-check/*` harness style (plain node, no deps). 5 reference accounts — **see Amendment A4: do NOT use `companies.json`; capture brief+ICP+score fixtures under `tests/the-play/`** for BHN-seller targets (e.g., Marriott, Verizon, Stripe, Boeing, Chipotle). For each, given a recorded brief + ICP, assert on a recorded/generated Play:

1. **Correct primary contact** — `primaryContact.name` matches an executive in P2; no invented title.
2. **Full traceability** — every sentence in `situation`/`whyNow`/`yourMove` maps to a source section (token-overlap heuristic acceptable for CI).
3. **Zero cross-account contamination** — run two accounts back-to-back in one harness session; account B's Play contains zero references to account A's company/execs/products/signals. **This is the highest-priority check.**
4. **Internal consistency** — `topProduct` ∈ solutionMapping; displayed fit score == `fitScores[target].score`; `keySignal` appears (verbatim/near) in P5.
5. **Elevator-pitch accuracy** — no product capabilities/customers/outcomes absent from ICP/brief.

Run cadence: after every change to `buildPlayPrompt`/`PLAY_SYSTEM`. Wire into CI alongside `test:fitcheck` if a CI workflow exists (`.github/`).

---

## 11. Acceptance criteria (definition of done)

- [ ] `npm run test:fitcheck` green (unchanged from baseline).
- [ ] `npm run test:play` green (new; ≥5 accounts, contamination check passing).
- [ ] `npm run build` and `npm run lint` clean.
- [ ] The Play renders at top of Step 5 in the v2 look; existing Step 5 content below it is byte-unchanged.
- [ ] All 4 render states reachable and correct (force each via fixture/devtools).
- [ ] Quorum gate verified: with a required section forced to error, card shows "unavailable" and no model call fires.
- [ ] Contamination guard verified: run account A → account B in one session; B's Play contains nothing from A.
- [ ] Synthesis call logs as `x-brief-type: play-synthesis` in `api_usage_log`.
- [ ] No changes to scoring/ICP/brief-generation logic or handlers (diff is additive).
- [ ] Quick Brief path does NOT trigger The Play (Full Session only) — confirm via `sessionMode`/`sellerUrl === "research-only"` guard.

---

## 12. North-star test

A rep with 4 minutes before a call reads The Play, taps Copy on the pitch, and walks in knowing who to call, why now, and the angle — without scrolling. If the card requires scrolling or a second read, it's not done.
