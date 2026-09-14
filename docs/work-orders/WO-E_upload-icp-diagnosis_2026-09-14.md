# CC WORK ORDER E — Diagnosis spec: multi-file upload silently breaks the ICP build (F-044, P0)

Authored: 2026-09-14 · Preflight base: cut from `staging` · **This is a diagnosis spec, not a fix plan.** No `FROM/TO` blocks — the root cause is not yet known, and writing one without it would be guessing.
Issue: file as **"P0: multi-file seller upload silently drops the ICP (F-044); .xlsx rejected in picker (F-046)"**, branch `doc/issue-164-upload-icp-diagnosis`.
Evidence: `~/Desktop/Cambree/02_Product/Cambree_Feedback_Nick_Balestino_2026-09-10.md` (F-044, F-046); funnel: Nick's three Step-1 sessions in `session_journey` (user `9d58de80-…`).

---

## Context

On 2026-09-10 a design partner uploaded two spreadsheets, a PDF and a couple of decks (largest ~3 MB, total under 15 MB) at Step 0/1. The ICP build "timed out" and the resulting ICP **did not contain his seller context** — it built as if no docs existed. No error was shown; the run proceeded with the profile missing. Reproduced **three times** by the user before the call, then live. Starting fresh with **one PDF** worked. Separately, `.xlsx` files were not selectable in the file picker; the user re-saved as CSV mid-call.

Why P0: a motivated design partner could not complete a session unassisted; the failure is silent and the partial ICP looks complete.

---

## What Hare should look at, in order (all `src/App.jsx` unless noted; lines per `b573fed`)

1. **`readDocFile` (`5935`)** — 20 MB cap at `5934/5940-5946`; legacy `.doc/.ppt/.xls` rejected at `5948-5953`; xlsx/pdf/docx/pptx parsers. Question: is the picker's `accept=` attribute missing `.xlsx` / the spreadsheet MIME types (F-046)? Is there a per-file or aggregate size/time cap that fails silently for several files at once?
2. **`_buildResearchCtx` → ICP Pass 1 (`8060`, `8221`)** and the **doc budgets at `1814-1819`** (`DOC_EXCERPT_FULL = 2000` per doc, `DOC_EXCERPT_BRIEF_TOTAL = 6000`). Question: with 4–5 docs, does the research prompt exceed the guard's input cap in `api/_guard.js` ("input caps, max_tokens 8000")? If the proxy rejects or truncates, does the client swallow it (`returnRawOnFailure: true` at `8282`) and continue with `hasSellerContext` false?
3. **Pass 1 timeout `researchTimeout` = 100 s (`8278`)** with `maxSearches: 2`. Question: does a large doc context push Opus past 100 s, and does the timeout path fall through to Pass 2 *without* the docs — i.e. the ICP silently builds from the site alone? That would match "it didn't pick up your ICP" exactly.
4. **`ctxFingerprint(sellerDocs, sellerICPInput)` (`1803-1809`)** — if Pass 1 fails and a *cached* ICP with a different fingerprint is accepted anyway (check the rejection at `8181`), the user sees an old, doc-less profile.
5. **The "Skipping backfill — ICP is building" guard (`10152-10156`)** — not the cause, but a compounding symptom if the ICP keeps re-building.

---

## What the spec asks Hare to deliver

- A written root cause with the reproducing file set (Nick offered his — ask), and a decision on the fix shape:
  - (a) enforce and **display** the limit in the upload field (max files / max MB — R-24 copy: *"Up to N files, M MB total. XLSX, PDF, DOCX, PPTX, CSV."*), and/or
  - (b) chunk or summarise doc context before Pass 1 so N docs never exceed the guard cap, and/or
  - (c) surface a visible, non-blocking warning when Pass 1 times out or the proxy truncates: *"We couldn't read all of your documents — the profile below was built from your site only. Retry with fewer files, or continue."*
- Whatever the shape, the invariant to encode: **a seller profile built without the user's documents must say so on screen.** Empty beats wrong, and silent-partial is wrong.

---

## QA gate (for the eventual fix PR)

- Upload exactly the failing set (2 × XLSX + PDF + 2 decks) on staging → either the ICP contains doc-derived content (check `verifiedCustomers` / product names that exist only in the docs) or a visible warning states the docs were not used. Never silent.
- `.xlsx` is selectable in the picker and parses.
- One-PDF path unchanged.
- Golden-set: no scoring change expected; Stripe + Boeing per `CLAUDE.md`.

---

## Explicitly OUT of scope

- F-047 (Add-Intel corrections don't move the score) — that is R-34 in the flow spec, Phase 2.
- F-052 (hyphenated-domain identity contamination) — belongs with WO-A's identity gate; note it there when Hare implements.
