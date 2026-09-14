# CC WORK ORDER B — Retry that retries, ownership that reads negations, play text that isn't mangled

Authored: 2026-09-10 · Preflight base: cut from `staging` · repo `/Users/joe/Projects/cambrian-playbook`
Rules (for Hare's implementation — CC does not execute these): **one logical change per commit.** Stage → `git diff --cached` → **STOP for Joe's approval.** Joe owns all commits, pushes and deploys.
Issue: file as **"P1: play retry is a no-op; public company labelled PE-Backed; play text truncated mid-quote (F-040/041/042)"**, branch `bugfix/issue-157-play-and-ownership`.

Anchor verification status (re-verified against `origin/staging` HEAD, 2026-09-14): all code strings match byte-for-byte. Line numbers have drifted by -1 to +18 from the `b573fed` baseline — see drift notes inline.

Run **after** Work Order A (#156) merges — Commit 2 below touches `mergeOverview`, which WO-A does not, but both land in `pickAccount`'s blast radius and should be sequenced, never parallel.

---

## Context

Same production run as WO-A (Cirium → Southwest Airlines, 2026-09-10, Joe's account). After the brief regenerated with genuine Southwest content, three further defects showed on one page:

1. **"↻ Retry the play" is a no-op when the Overview failed.** The banner said "Brief generation partial — Overview failed"; THE PLAY said "Couldn't complete the play… transient hiccup". Clicking Retry the play **three times** changed nothing. Only "↻ Retry Brief (free)" unblocked it, after which the play rendered in ~3 minutes. On a $99 seat the user hits three dead ends before finding the one control that works.
2. **Southwest Airlines was labelled `🏦 PE-Backed` with a `60-90 day budget cycle` pill, and `OWNERSHIP: Private`** — on the same card whose own funding text reads *"Publicly traded on NYSE (ticker: LUV); **no private equity backing**."* Both symptoms are fully explained by verified code (below). Before the regenerate, the field was blank — i.e. the system got *worse* by filling it in.
3. **THE PLAY → SITUATION opened:** *"Southwest Airlines is executing its 'Southwest. The airline has expanded…"* The transformation plan is named **"Southwest. Even Better."** The internal period was treated as a sentence boundary, a fragment was stripped by a downstream filter, and the survivor reads as a truncation artefact. Strategic Theme renders the same name correctly, so the model output was fine — the post-processing mangled it.

Unlike WO-A, **all three root causes are confirmed by reading current HEAD.** No diagnosis is deferred.

---

## Commit 1 — Make "Retry the play" actually retry

Files: `src/App.jsx`

The button at `:17553` only resets three pieces of React state:
```
onClick={() => { playBuiltRef.current = false; setThePlay(null); setPlayState("building"); }}
```
It makes **no API call**. It relies on the Phase-2 effect at `:9548-9560`, which gates on
`const hasOverview = !!brief?.companySnapshot && !LOADING_STUB.test(brief.companySnapshot);`
So when the Overview has failed, `brief.companySnapshot` is empty, the quorum can never be met, and the button is guaranteed to do nothing — forever. Compounding it, `mergeOverview` records a failed overview into **`_completedSections`**, not `_failedSections` (`src/App.jsx:2987-2990`), so the weak-inputs auto-retry at `:9621-9628` — which is gated on `_failedSections.length > 0` — also never fires for this case.

Fix: when the play's own precondition is missing, route the retry to the path that can actually supply it (`pickAccount(..., forceRebuild=true)` — the same free rebuild "Retry Brief" uses, exempt from the run meter per `:10030-10032`).

- FROM anchor (verified byte-exact, `src/App.jsx:17553`):

> ⚠ ANCHOR DRIFT: line is at **17571** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
                      <button onClick={() => { playBuiltRef.current = false; setThePlay(null); setPlayState("building"); }}
  ```
  TO:
  ```
                      <button onClick={() => {
                        // F-040: the Phase-2 quorum (:9548) requires a real companySnapshot. If the
                        // Overview failed, resetting play state alone can never re-fire the build —
                        // the button was a visible no-op. Route to the free full rebuild instead.
                        const _LOADING_STUB = /^Researching /i;
                        const _hasOverview = !!brief?.companySnapshot && !_LOADING_STUB.test(brief.companySnapshot);
                        playBuiltRef.current = false; setThePlay(null); setPlayState("building");
                        if (!_hasOverview) { console.warn("[ThePlay] Retry with no overview — escalating to free brief rebuild"); setBriefError(""); pickAccount(selectedAccount, null, true); }
                      }}
  ```

- Also stop mis-filing a failed overview as completed, so the existing auto-retry at `:9621` can see it.
  FROM anchor (verified byte-exact, `src/App.jsx:2987-2990`):

> ⚠ ANCHOR DRIFT: no drift — block is at **2987-2990** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
    if (!r1 || typeof r1 !== "object") {
      return {...prev, _error: (prev._error || "Brief generation partial — Overview failed. Try Regenerate."),
              _loadingSections: {...(prev._loadingSections||{}), overview:false},
              _completedSections: [...new Set([...(prev._completedSections||[]), "overview"])]};
    }
  ```
  TO:
  ```
    if (!r1 || typeof r1 !== "object") {
      // F-040: a failed overview must be recorded as FAILED, not completed. Filing it under
      // _completedSections hid it from the weak-inputs auto-retry guard at :9621.
      return {...prev, _error: (prev._error || "Brief generation partial — Overview failed. Try Regenerate."),
              _loadingSections: {...(prev._loadingSections||{}), overview:false},
              _failedSections: [...new Set([...(prev._failedSections||[]), "overview"])]};
    }
  ```

- **DO NOT** change `buildThePlay()` (`:9409`), `validatePlay()` (`:1587`), the Phase-2 quorum condition itself (`:9548-9560`), or the one-shot `retryOverview()` (`:3701-3713`).
- **Watch for a retry loop:** the auto-retry at `:9622` is guarded by `autoSectionRetryRef.current !== _retryCo` (once per company). CC must confirm that guard still holds after this change and report it explicitly in the staged-diff summary. If the change can produce more than one automatic rebuild per company, **STOP and report** rather than shipping.

---

## Commit 2 — Ownership classification must read negations and must not infer "Private" from the word "acquire"

Files: `src/App.jsx`

Two independent verified defects produce the Southwest result:

**(a) The badge — `src/App.jsx:18461-18463`.** `isPE` matches the bare substring `"private equity"`, so the sentence *"no private equity backing"* sets `isPE = true`. `isPublic` requires `"nyse:"` with a colon, so *"NYSE (ticker: LUV)"* does **not** match. `isPE` is evaluated first in the ternary and wins. A NYSE-listed carrier is rendered `🏦 PE-Backed` + `60-90 day budget cycle`. `"acquired by"` is matched the same way, so any company that *made* an acquisition is at risk.

**(b) The field — `src/App.jsx:3053-3060`.** `isPrivateSignal` uses the stem `/acquir|pe-backed|private equity|…/`, which the same *"no private equity backing"* sentence satisfies. With a real ticker present, the code strips the ticker, rewrites "Public" → "Private", and then hard-defaults to the literal string `"Private"`. That literal is precisely the `/^private$/i` trigger for the consistency validator's PE-enrichment at `:11449`, which can then append a 13F institutional holder's name and produce `"Private (PE-backed — blackstone)"` for a public issuer.

- **(a) Fix the badge.** FROM anchor (verified byte-exact, `src/App.jsx:18461-18463`):

> ⚠ ANCHOR DRIFT: block starts at **18479** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
                          const isPE=fp.includes("pe-backed")||fp.includes("private equity")||fp.includes("portfolio company")||fp.includes("acquired by");
                          const isSeries=fp.match(/series [a-e]/i);
                          const isPublic=fp.includes("nyse:")||fp.includes("nasdaq:")||fp.includes("public (");
  ```
  TO:
  ```
                          // F-041: substring matching was negation-blind — "no private equity backing"
                          // set isPE on a NYSE issuer. Public evidence now wins, and negated phrases
                          // ("no private equity", "not PE-backed") no longer count as PE evidence.
                          const fpPos=fp.replace(/\b(?:no|not|never|without|nor)\b[^.;]{0,40}?(private equity|pe-backed|portfolio company|acquired by)/g,"");
                          const isPublic=/\b(?:nyse|nasdaq|tsx|lse|amex)\b\s*[:(]/.test(fp)||fp.includes("public (")||fp.includes("publicly traded")||fp.includes("publicly held");
                          const isPE=!isPublic&&(fpPos.includes("pe-backed")||fpPos.includes("private equity")||fpPos.includes("portfolio company")||fpPos.includes("acquired by"));
                          const isSeries=fp.match(/series [a-e]/i);
  ```
  (Note the deliberate reordering: `isPublic` must be computed before `isPE`. The `label` / `lColor` / `lBg` ternaries at `:18464-18466` are unchanged and still read `isPE ? … : isSeries ? … : isPublic ? …`.)

- **(b) Fix the field rewrite.** FROM anchor (verified byte-exact, `src/App.jsx:3053-3060`):

> ⚠ ANCHOR DRIFT: no drift — block is at **3053-3062** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
      const fp = (next.fundingProfile||"").toLowerCase();
      const pp = (next.publicPrivate||"").toLowerCase();
      const isPrivateSignal = /acquir|pe-backed|private equity|went private|taken private|buyout|delisted/.test(fp);
      const hasTicker = /\((?:nyse|nasdaq|tsx|lse):\s*[a-z]+\)/i.test(next.publicPrivate);
      if (isPrivateSignal && hasTicker) {
        // Strip the stale ticker — fundingProfile is more authoritative on ownership changes
        next.publicPrivate = next.publicPrivate.replace(/\s*\((?:NYSE|NASDAQ|TSX|LSE):\s*[A-Z]+\)/i, "").replace(/public/i, "Private").trim();
        if (!/private/i.test(next.publicPrivate)) next.publicPrivate = "Private";
      }
  ```
  TO:
  ```
      const fp = (next.fundingProfile||"").toLowerCase();
      // F-041: the old stem /acquir/ fired on any acquisition the company MADE, and the
      // whole test was negation-blind. Require an explicit going-private event, and never
      // overwrite a ticker that the funding text itself corroborates as still listed.
      const fpPos = fp.replace(/\b(?:no|not|never|without|nor)\b[^.;]{0,40}?(private equity|pe-backed|taken private|went private)/g, "");
      const isPrivateSignal = /\b(?:went private|taken private|delisted|acquired by|pe-backed|private equity)\b/.test(fpPos);
      const stillListed = /\b(?:nyse|nasdaq|tsx|lse|amex)\b|\bpublicly (?:traded|held|listed)\b/.test(fp);
      const hasTicker = /\((?:nyse|nasdaq|tsx|lse):\s*[a-z]+\)/i.test(next.publicPrivate);
      if (isPrivateSignal && hasTicker && !stillListed) {
        // Strip the stale ticker — fundingProfile is more authoritative on ownership changes
        next.publicPrivate = next.publicPrivate.replace(/\s*\((?:NYSE|NASDAQ|TSX|LSE):\s*[A-Z]+\)/i, "").replace(/public/i, "Private").trim();
        if (!/private/i.test(next.publicPrivate)) next.publicPrivate = "Private";
      } else if (isPrivateSignal && hasTicker && stillListed) {
        console.warn(`[overview] Ownership conflict for ${next.website||"target"}: funding text implies private but also asserts listing — leaving publicPrivate as-is`);
      }
  ```

- **DO NOT** change the consistency validator's PE-enrichment block at `:11446-11455` or the `PE_FIRMS` regex at `:11425` in this commit. Commit 2 removes its trigger (the bare `"Private"` literal); changing both at once makes the diff unreviewable. If the enrichment still misfires after staging QA, that is a follow-up.
- **DO NOT** delete the now-unused `pp` variable in the same commit — flag it in the diff summary as dead code for a later cleanup pass.

---

## Commit 3 — Stop the play's sentence filters from cutting inside a quoted name

Files: `src/App.jsx`

`validatePlay()` splits on `/(?<=[.!?])\s+/` in two places — Check 2 competitor stripping (`:1629`) and Check 7 unsourced-stat stripping (`:1717`). That regex splits at **any** period followed by whitespace, including one inside a quoted proper noun. `"Southwest. Even Better."` becomes two "sentences"; a downstream filter drops one; the survivor is the observed `"…executing its 'Southwest."`.

Fix in two parts: don't split inside an open quote, and don't emit a field that ends mid-quote.

- **Add a shared splitter.** Insert immediately above the Check 2 comment.
  FROM anchor (verified byte-exact, `src/App.jsx:1620`):

> ⚠ ANCHOR DRIFT: no drift — line is at **1620** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
    // Check 2 — no competitor names in generative fields
  ```
  TO:
  ```
    // F-042: quote-aware sentence split. A bare /(?<=[.!?])\s+/ splits inside quoted proper
    // nouns ("Southwest. Even Better."), so a downstream filter can drop half a name and
    // leave a mangled stub. Re-join any fragment that leaves a quote open.
    const splitSentences = (s) => {
      const raw = String(s).split(/(?<=[.!?])\s+/);
      const out = [];
      for (const part of raw) {
        const prev = out.length ? out[out.length - 1] : null;
        const openQuote = prev !== null && ((prev.match(/["'''""]/g) || []).length % 2 === 1);
        if (openQuote) out[out.length - 1] = `${prev} ${part}`;
        else out.push(part);
      }
      return out;
    };

    // Check 2 — no competitor names in generative fields
  ```

- **Use it in Check 2.** FROM anchor (verified byte-exact, `src/App.jsx:1629`):

> ⚠ ANCHOR DRIFT: no drift — line is at **1629** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
        const sentences = play[field].split(/(?<=[.!?])\s+/);
        play[field] = sentences.filter(s => !s.toLowerCase().includes(comp)).join(" ").trim();
  ```
  TO:
  ```
        const sentences = splitSentences(play[field]);
        play[field] = sentences.filter(s => !s.toLowerCase().includes(comp)).join(" ").trim();
  ```

- **Use it in Check 7.** FROM anchor (verified byte-exact, `src/App.jsx:1717-1718`):

> ⚠ ANCHOR DRIFT: block starts at **1716** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
        const sentences = play[field].split(/(?<=[.!?])\s+/);
        const filtered = sentences.filter(s => !new RegExp(`\\b${escaped}\\b`, "i").test(s));
  ```
  TO:
  ```
        const sentences = splitSentences(play[field]);
        const filtered = sentences.filter(s => !new RegExp(`\\b${escaped}\\b`, "i").test(s));
  ```

- **DO NOT** touch the third splitter at `:10740-10757` (TL;DR stat stripper — not on the play path), the solution-card export truncation at `:12698`, or any of the knowledge-layer `split(".")` calls at `:802` / `:11876`.
- **DO NOT** change what Checks 2 and 7 *decide* to strip — this commit changes only where the text is cut.

---

## QA gate (before Joe pushes)

Offline / free:
- `npm run lint`
- `npm run test:lint`
- `npm run test:backtest`
- Add a plain-Node assertion under `tests/` for `splitSentences` (no LLM call): input `Acme is running its 'Fast. Better.' plan. It grew 40% last year.` must produce **2** sentences, and the first must contain `Better.'`. Put it wherever `tests/knowledge-lint.js` style fixtures live; do not introduce Jest.

Live on **staging.cambree.ai**:
1. **F-040.** Force an overview failure (block the p1 request in devtools, or use a target with no public footprint). Confirm the amber banner names `overview` in the failed list, then click **↻ Retry the play** once. Assert: it triggers a rebuild (network activity + `[ThePlay] Retry with no overview — escalating` in the console), and that it fires **at most once per company** — no loop.
2. **F-041, the exact regression.** Run `Southwest Airlines / southwest.com` against any seller. Assert the Overview card shows **📈 Public Company** (or no badge), **not** 🏦 PE-Backed, **no** "60-90 day budget cycle" pill, and OWNERSHIP is not the bare string "Private".
3. **F-041, the other direction — do not over-correct.** Run one genuinely PE-owned target and one Series-B target. The PE company must still show 🏦 PE-Backed; the Series B must still show 🚀 VC-Backed. If either is now unlabelled, the negation strip is too greedy — STOP and report.
4. **F-042.** Re-run the Cirium → Southwest play. Assert SITUATION contains `'Southwest. Even Better.'` intact and does not end mid-quote. Spot-check two other targets' SITUATION/WHY NOW for unbalanced quotes.

Golden-run gate:
- `npm run test:golden` (**ask Joe first — live API, costs money**). Include **Stripe** and **Boeing** per `CLAUDE.md`. Boeing is the load-bearing one here: it is public, it has made acquisitions, and it is the exact shape that broke. Reject on any correctly-scored target regressing more than 5 points.

## Blast radius

- Commit 1 touches `mergeOverview`, which every brief passes through, and adds a rebuild path that consumes a run only if the exemption at `:10030` fails to apply — verify in QA that the retry does **not** decrement `orgCtx.run_count`.
- Commit 2 changes ownership classification for **every** target, not just public ones. The Stage-0 golden set is the real gate.
- Commit 3 affects only `validatePlay()` string fields (`situation`, `whyNow`, `yourMove`, `elevatorPitch`, `draftEmailBody`). Quotes are common in `elevatorPitch`, so check that field specifically.
- Nothing here touches auth, billing, RLS, migrations, or the Anthropic proxy — `/security-review` is **not** required for this work order.

## Rollback

Single revert of the branch merge commit. No schema change, no migration, no data written. Each commit is independently revertible: Commit 3 is a pure helper swap, Commit 2 is two contiguous blocks, Commit 1 is one button handler plus one early-return.

## Explicitly OUT of scope

- Everything in **Work Order A** (#156) (cache identity, cache key, cached-error suppression).
- The consistency validator's PE-enrichment at `:11446-11455` and the `PE_FIRMS` regex — trigger removed here, block itself untouched by design.
- **F-043** (Quick Take briefly displayed "$2.0B in revenue" mid-build before settling on the correct $27.5B). Real, self-corrected, P3 — worth a guard that revenue is not rendered until the financial section resolves, but that is a separate change to the streaming render.
- **F-039** (fit distribution shows "Strong Fit · 1 accts" and "Low Fit · 1 accts" for a single scored account; "2 SCORED" for 1). Cosmetic double-count, backlog.
- Removing the dead `pp` variable at `:3054` and the other `split(".")` truncations — cleanup pass.
