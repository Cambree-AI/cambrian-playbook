# CC WORK ORDER A — Brief identity: stop rendering another company's brief

Authored: 2026-09-10 · Preflight base: cut from `staging` · repo `/Users/joe/Projects/cambrian-playbook`
Rules (for Hare's implementation — CC does not execute these): **one logical change per commit.** Stage → `git diff --cached` → **STOP for Joe's approval.** Joe owns all commits, pushes and deploys.
Issue: file as **"P0: brief for company A renders company B's content (F-037/F-038)"**, branch `bugfix/issue-156-brief-identity`.

Anchor verification status (re-verified against `origin/staging` HEAD, 2026-09-14): all four code strings match byte-for-byte. Line numbers have drifted by ±3 from the `b573fed` baseline — see drift notes inline.

---

## Context

On 2026-09-10, in **production**, on Joe's account, a brief headed **"Sales Brief — Southwest Airlines Co. (LUV) · Cirium selling to Southwest Airlines Co. (LUV)"** rendered **Apple's** brief in every section: Apple's 17 executives (Cook, Cue, Federighi), headline "Tim Cook to become Executive Chairman", AAPL 10-K financials, competitors Samsung/Google/Microsoft/Xiaomi, and — most damningly — a panel titled **"Open Positions at Southwest Airlines Co. (LUV)"** listing **Apple Pay Security Engineering** and **Apple Ads** roles. The fit score and header were correct and Southwest-specific (79 · Strong). Only the body was wrong. No error was shown; the page presented as a complete brief.

Same page, Deal Readiness → Watch-Outs read *"Seller-stage credibility fit — **Blackhawk Network** must demonstrate enterprise-grade security…"* The seller of record was **Cirium**. A third org's content surfaced in the session (F-038). This matches the 2026-08-12 export that mixed a Cirium header with BHN openers.

Repro used: Sessions → open the saved 8/11 `cirium.com` session (target: Apple) → Step 3 Quick Entry → add `Southwest Airlines / southwest.com` → Research → Review → Next to Brief.

This is the exact failure the anti-fabrication doctrine exists to prevent (`CLAUDE.md` → "Empty is ALWAYS better than wrong", "Identity contamination is the recurring failure mode"), on the exact motion the product sells, on a design partner's seller profile. A rep who trusted it would have walked into Southwest holding Apple's org chart.

**What I verified in code (byte-exact, current HEAD):**

- `pickAccount()` at `src/App.jsx:10023` **does** clear state: `setBrief(null)` at `:10044`.
- The brief cache read at `src/App.jsx:10054-10069` is keyed on **`output_type` + `target_company` (free-text company NAME) + `seller_url` + `is_latest`**. There is **no `target_domain`, no `user_id`, no `org_id`** in the filter. Row isolation depends entirely on RLS (`supabase/migrations/028_output_persistence.sql:62`).
- On a cache hit, `:10130` force-clears the error state: `_failedSections: [], _error: null`. **A cached brief can never display the "sections incomplete" banner**, so a bad cache hit is indistinguishable from a good build.
- The full cross-section consistency validator (`:10830-11562`) lives **inside the fresh-build branch only**. It never runs on a cache hit — only a small HQ check at `:10078-10087` does.
- Session restore sets the previous target's brief into state at `:9243` (`setBrief(restoredBrief)`).

**I could not determine from static reading alone which of these produced the Apple render.** Do not guess. Commit 1 below is a defence that closes the class regardless of path *and* logs the path if it recurs; Commit 2 removes the weakest link (name-keyed cache) whether or not it was the culprit.

---

## Commit 1 — Refuse to render a brief whose identity does not match the selected account

Files: `src/App.jsx`

Add a single guard helper and apply it at the cache-hit boundary. The rule: **a brief object may only enter `brief` state if its own content agrees it is about the selected company.** On mismatch → discard, log loudly, fall through to a fresh build. Never render.

- **Insert the helper immediately above** the `pickAccount` declaration.
  FROM anchor (verified byte-exact, `src/App.jsx:10023`):

> ⚠ ANCHOR DRIFT: line is at **10025** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
  const pickAccount = async (member, overrideSellerUrl, forceRebuild = false) => {
  ```
  TO — insert this block *before* that line, leaving the line itself unchanged:
  ```
  // Identity gate (F-037): a brief may only render if its own body agrees it is about
  // the selected company. Cheap, deterministic, no API call. Returns a reason string on
  // mismatch (truthy = reject) or "" when the brief is consistent with `member`.
  const briefIdentityMismatch = (data, member) => {
    if (!data || !member?.company) return "";
    const core = (s) => (s || "").toLowerCase()
      .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
      .replace(/\.(com|io|ai|co|net|org|tech|inc)$/i, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
    const wantName = core(member.company).split(" ").filter(w => w.length > 2 &&
      !["inc","the","co","corp","company","group","holdings","airlines","llc","ltd","plc"].includes(w));
    const wantDomain = core(member.company_url || member.domain || "");
    const haystack = [
      data.companySnapshot, data.strategicTheme, data.elevatorPitch, data.website,
      Array.isArray(data.recentHeadlines) ? data.recentHeadlines.join(" ") : data.recentHeadlines,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack) return "";
    const nameHit = wantName.length ? wantName.some(w => haystack.includes(w)) : true;
    const domainHit = wantDomain ? haystack.includes(wantDomain) : false;
    if (nameHit || domainHit) return "";
    return `brief body never mentions "${member.company}"${wantDomain ? ` or "${wantDomain}"` : ""}`;
  };

  ```

- **Apply the gate at the cache-hit boundary.** Extend the existing admission condition so a mismatched row is rejected.
  FROM anchor (verified byte-exact, `src/App.jsx:10092-10093`):

> ⚠ ANCHOR DRIFT: block starts at **10095** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
              if (ageDays < 7 && hasCritical && cachePromptVersion >= BRIEF_CACHE_VERSION && ctxFpMatches) {
                console.log(`[brief-cache] Found complete cached brief for ${co} (${ageDays}d old, v${cachePromptVersion}) — loading`);
  ```
  TO:
  ```
              const identityMismatch = briefIdentityMismatch(cd, member);
              if (identityMismatch) console.error(`[brief-cache] IDENTITY REJECT for ${co}: ${identityMismatch} — discarding cache row and rebuilding`);
              if (ageDays < 7 && hasCritical && cachePromptVersion >= BRIEF_CACHE_VERSION && ctxFpMatches && !identityMismatch) {
                console.log(`[brief-cache] Found complete cached brief for ${co} (${ageDays}d old, v${cachePromptVersion}) — loading`);
  ```

- **DO NOT** change `hasCritical`, `BRIEF_CACHE_VERSION`, `ctxFingerprint`, the PATCH-then-POST write path at `:11684-11745`, or the `readyAccounts` prefetch at `:9490`. **DO NOT** add an API call inside the gate — it must stay synchronous and free.
- **DO NOT** silently swallow the reject: the `console.error` line is load-bearing evidence for the next occurrence and must stay.

---

## Commit 2 — Key the brief cache on target domain + seller, not on a free-text company name

Files: `src/App.jsx`

`target_company` is whatever string the user or the scorer produced ("Southwest", "Southwest Airlines", "Southwest Airlines Co. (LUV)"). Domain is the identity the rest of the product pins on (`CLAUDE.md`: "Cambree pins to domain by design"). Prefer domain when we have one; keep the name filter only as a fallback for rows written before domain was populated.

- FROM anchor (verified byte-exact, `src/App.jsx:10060`):

> ⚠ ANCHOR DRIFT: line is at **10063** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
          const cachedRes = await fetch(`${SB_URL_BC}/rest/v1/account_outputs?output_type=eq.brief&target_company=eq.${encodeURIComponent(co)}&seller_url=eq.${encodeURIComponent(sellerUrl)}&is_latest=eq.true&select=data,created_at&limit=1`, {
  ```
  TO:
  ```
          // F-037: domain is the identity key. Name-only matching let a differently-named
          // row satisfy the lookup. Fall back to name only when no domain is known.
          const _cacheDomain = ((member.company_url || member.domain || "").trim().toLowerCase()
            .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""));
          const _cacheKeyFilter = _cacheDomain
            ? `target_domain=eq.${encodeURIComponent(_cacheDomain)}`
            : `target_company=eq.${encodeURIComponent(co)}`;
          const cachedRes = await fetch(`${SB_URL_BC}/rest/v1/account_outputs?output_type=eq.brief&${_cacheKeyFilter}&seller_url=eq.${encodeURIComponent(sellerUrl)}&is_latest=eq.true&select=data,created_at&limit=1`, {
  ```

- **Before writing the code, CC must confirm** that `account_outputs.target_domain` exists and is populated on recent rows. Run:
  ```sql
  select count(*) as total,
         count(target_domain) as with_domain,
         count(*) filter (where created_at > now() - interval '30 days') as last_30d,
         count(target_domain) filter (where created_at > now() - interval '30 days') as last_30d_with_domain
  from account_outputs where output_type = 'brief';
  ```
  against **staging** (`akceiidofsiajrjtgone`) first. **If `target_domain` does not exist as a column, or fewer than 80% of the last-30-day rows have it populated, STOP and report** — do not write a migration in this work order, and do not proceed to Commit 3.
- **DO NOT** change the cache *write* at `:11723-11731` in this commit. **DO NOT** touch the `readyAccounts` prefetch (`:9490-9495`) — it already queries both name and domain and is display-only.

---

## Commit 3 — A cached brief must be allowed to admit it is broken

Files: `src/App.jsx`

On a cache hit the code hard-writes `_failedSections: []` and `_error: null`, so the amber "sections incomplete" banner can never appear for cached content. That is the line that turned a wrong brief into a *confident* wrong brief. Preserve whatever the cached row itself recorded.

- FROM anchor (verified byte-exact, `src/App.jsx:10130`):

> ⚠ ANCHOR DRIFT: line is at **10129** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
                const cachedBriefData = { ...cd, _generatedAt: new Date(cached[0].created_at).getTime(), _cached: true, _loadingSections: loadingFlags, _executivesPhase: missingExecutives ? "extracting" : "done", _failedSections: [], _error: null, _completedSections: initialCompletedSections };
  ```
  TO:
  ```
                const cachedBriefData = { ...cd, _generatedAt: new Date(cached[0].created_at).getTime(), _cached: true, _loadingSections: loadingFlags, _executivesPhase: missingExecutives ? "extracting" : "done", _failedSections: Array.isArray(cd._failedSections) ? cd._failedSections : [], _error: cd._error || null, _completedSections: initialCompletedSections };
  ```

- **DO NOT** change `initialCompletedSections` or `loadingFlags`.
- Note for the reviewer: this can surface an amber banner on briefs that previously looked clean. That is the intended behaviour — it is honest, and the banner's own button (`Retry Brief (free)`) is the correct remedy.

---

## QA gate (before Joe pushes)

Offline / free:
- `npm run lint`
- `npm run test:lint`
- `npm run test:backtest`

Live on **staging.cambree.ai**, signed in as a test user:
1. **Primary repro must fail closed.** Load a saved session for seller A → target X. Add a *different* target Y at Step 3, score it, open the brief. Assert: no section of X's content appears under Y's header. Check the console for `[brief-cache] IDENTITY REJECT` — if it fires, the gate caught a real bad row and the brief rebuilt.
2. **Cache still works (no regression).** Open target Y a second time within 7 days. Assert `[brief-cache] Found complete cached brief` in the console and a near-instant load. If every brief now rebuilds, Commit 2's domain key is missing data — STOP and report.
3. **Cross-seller.** Repeat step 1 with a *different* `seller_url` and confirm no third-party seller name (e.g. a prior test seller) appears in Watch-Outs or outreach copy.
4. **Identity gate has no false positives.** Run three targets whose brand differs from their legal name (suggested: `Alphabet / google.com`, `Meta / facebook.com`, `Southwest Airlines Co. (LUV) / southwest.com`). None may log `IDENTITY REJECT`. A false reject costs a paid run — this check is mandatory.

Golden-run gate:
- `npm run test:golden` (**ask Joe before running — live Anthropic API, costs money**). Per `CLAUDE.md`, include **Stripe** (contamination) and **Boeing** (revenue/HQ) in the Stage-0 set. Reject the change if any correctly-scored target regresses more than 5 points.

## Blast radius

`pickAccount()` is the single entry point for every brief in the app — Quick Brief, full brief, Retry Brief, and the account queue all route through it. Commit 2 changes which rows a returning user hits: users whose historical rows lack `target_domain` will rebuild once (a free rebuild only on the `forceRebuild` path — a normal open **will** meter a run, so verify the `target_domain` backfill number before merging). Commit 3 can make previously-silent partial briefs display the amber banner. Nothing here touches auth, billing logic, RLS, or migrations.

## Rollback

Single revert of the branch merge commit; no data migration, no schema change, nothing written that needs undoing. If the identity gate misfires in production before a revert can land, Commit 1 can be neutralised in one line by changing `&& !identityMismatch` back to nothing at `:10092`. Joe flips it; no flag infrastructure needed.

## Explicitly OUT of scope

- The `retryOverview` / "Retry the play" reliability defect (F-040) → **Work Order B**.
- The ownership / PE-Backed misclassification (F-041) and the play sentence-splitter (F-042) → **Work Order B**.
- Writing a `target_domain` backfill migration — if Commit 2's precheck shows the column is thin, that is its own work order with a revert file written first.
- The fit-distribution double-count (F-039, "Strong Fit · 1 accts / Low Fit · 1 accts" for one account) — cosmetic, backlog.
- Re-scoping `account_outputs` RLS or adding `org_id` to the cache key. Worth doing; not under time pressure; separate review because it touches RLS and would require `/security-review`.
