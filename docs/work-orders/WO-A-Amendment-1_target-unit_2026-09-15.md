# CC WORK ORDER A — AMENDMENT 1: unit discriminator on the brief cache (F-037 + expansion prep)

Authored: 2026-09-15 · Amends: WO-A (issue #156 / PR #160, unmerged) · Preflight base: `staging` @ `c8d15a7` · Repo `/Users/joe/Projects/cambrian-playbook`
Rules (for implementation — CC does not execute these): **one logical change per commit.** Stage → `git diff --cached` → **STOP for Joe's approval.** Joe owns all commits, pushes and deploys.

Anchor verification status (re-verified against `origin/staging` HEAD `aff7537`, 2026-09-15):
- Write side `:11721-11722` — byte-exact match
- Read side `:10093-10095` — byte-exact match (WO-A's version; Amendment 1 applies on top of WO-A Commit 1's TO text)
- WO-A inserts `briefIdentityMismatch` above `const pickAccount` (stated as `:10023` in WO-A) — at HEAD this anchor is now **line 10025** (+2 from c8d15a7); the code string `const pickAccount = async (member, overrideSellerUrl, forceRebuild = false) => {` still matches byte-for-byte.

**Decision (Joe, 9/15):** amend WO-A *before* it merges rather than patch afterward, so the cache identity is touched once. This amendment adds **one commit (2b)** between WO-A Commit 2 and Commit 3 and adds one line to WO-A Commit 1. Everything else in WO-A stands as written.

This file lives on the same `doc/issue-156-brief-identity` branch as WO-A and is part of the same implementation PR (#160).

---

## Context

The expansion / multi-brand work (WO-E1–E3) introduces targets that are a **brand or business unit inside a parent** — "Crest" under Procter & Gamble, "Arby's" under Inspire Brands. Two facts about that design bear on WO-A:

1. **A unit's `company_url` is never the parent's domain** (WO-E1 Commit 1, rule C3). A unit with its own site (crest.com) keys by that domain; a unit without one keys by *name* through WO-A Commit 2's fallback (`target_company=eq.<unit>`). So the Crest/Tide-both-`pg.com` collision is prevented at the source, not at the cache.
2. What is **not** prevented: the same unit name under two different parents for one seller ("Oral Care" under P&G and under Colgate), and — more importantly — the accruing dataset has no record of *which* parent a brief was about. Both are cheap to close now and expensive to close after rows exist.

This amendment writes the parent/unit identity into the cache row and rejects a cache hit whose parent disagrees with the selected member. It is deliberately small: WO-A's domain-first key stays exactly as WO-A wrote it.

**Verified in current HEAD (`aff7537`, `src/App.jsx`):** cache write at `:11721-11741` stamps `_briefPromptVersion` and `_ctxFp` into `data` and writes `target_company` / `target_domain` columns; cache read at `:10093-10095` admits on `ageDays < 7 && hasCritical && cachePromptVersion >= BRIEF_CACHE_VERSION && ctxFpMatches`. `readyAccounts` prefetch at `:9486-9509` filters empty domains (`.filter(Boolean)`) so name-keyed units cannot be marked "Ready" off a parent's row.

---

## Change to WO-A Commit 1 (identity gate) — one added line

In the `briefIdentityMismatch` helper WO-A inserts above `pickAccount`, **after** the line
```
    if (nameHit || domainHit) return "";
```
and **before** the `return \`brief body never mentions …\`` line, insert nothing. Instead, **change the `nameHit || domainHit` line** to require the unit name when the member is parented:

FROM (WO-A's own text):
```
    if (nameHit || domainHit) return "";
```
TO:
```
    // Expansion prep: a parented member (brand / unit) must be named in the body —
    // a domain match alone would let a parent-level brief pass for any of its units.
    if (member.parentCompany && !nameHit) return `brief body never names unit "${member.company}" (parent: ${member.parentCompany})`;
    if (nameHit || domainHit) return "";
```
- DO NOT change `wantName`, `wantDomain`, the stop-word list, or the haystack fields.
- When `member.parentCompany` is absent (every row today), behavior is byte-identical to WO-A as written.

---

## New Commit 2b — Stamp parent/unit into the cache row; reject a parent mismatch on read

Files: `src/App.jsx`

**Write side.** FROM anchor (verified byte-exact, `src/App.jsx:11721-11722`):
```
            _briefPromptVersion: BRIEF_CACHE_VERSION,
            _ctxFp: ctxFingerprint(sellerDocs, sellerICPInput), // #65: cache read rejects on mismatch
```
TO:
```
            _briefPromptVersion: BRIEF_CACHE_VERSION,
            _ctxFp: ctxFingerprint(sellerDocs, sellerICPInput), // #65: cache read rejects on mismatch
            _parent: (member.parentCompany || "").slice(0, 120) || undefined, // WO-A/1: identity of the parent this brief was built under
            _unit:   (member.unit || "").slice(0, 120) || undefined,
```
- `undefined` keys are dropped by `JSON.stringify`; rows for un-parented members are byte-identical to today.

**Read side.** FROM anchor (verified byte-exact, `src/App.jsx:10093-10095` — WO-A Commit 1 rewrites `:10095`; apply this on top of WO-A's version):
```
              const ctxFpMatches = (cd._ctxFp || "0") === ctxFingerprint(sellerDocs, sellerICPInput);
              if (!ctxFpMatches) console.log(`[brief-cache] Context fp mismatch for ${co} (cached "${cd._ctxFp || "0"}") — regenerating with current doc context`);
```
TO:
```
              const ctxFpMatches = (cd._ctxFp || "0") === ctxFingerprint(sellerDocs, sellerICPInput);
              if (!ctxFpMatches) console.log(`[brief-cache] Context fp mismatch for ${co} (cached "${cd._ctxFp || "0"}") — regenerating with current doc context`);
              // WO-A/1: a cached row built under a different parent is a different target. Absent on both sides = match.
              const parentMatches = ((cd._parent || "") === (member.parentCompany || ""));
              if (!parentMatches) console.error(`[brief-cache] PARENT REJECT for ${co}: cached under "${cd._parent || "(none)"}", selected under "${member.parentCompany || "(none)"}" — rebuilding`);
```
and extend WO-A's admission line (WO-A Commit 1's TO text) by one term:
```
              if (ageDays < 7 && hasCritical && cachePromptVersion >= BRIEF_CACHE_VERSION && ctxFpMatches && !identityMismatch && parentMatches) {
```
- DO NOT touch `_cacheKeyFilter` (WO-A Commit 2), `hasCritical`, `BRIEF_CACHE_VERSION`, `ctxFingerprint`, or the `readyAccounts` prefetch.
- DO NOT add columns or a migration. `_parent` / `_unit` live inside `data` (jsonb). A `target_parent` column is a later, separate order once WO-E has produced rows.
- `console.error` on the reject is load-bearing evidence — keep it.

---

## QA gate (before Joe pushes)

- `npm run test:lint` and `npm run test:backtest` pass (free tiers). Do **not** run golden-set tiers.
- Offline: fixture member `{company:"Southwest Airlines", company_url:"southwest.com"}` (no parent) → cache row `data` has no `_parent`/`_unit` keys; read path logs neither PARENT REJECT nor identity reject. Byte-identical to WO-A alone.
- Offline: fixture member `{company:"Crest", company_url:"crest.com", parentCompany:"Procter & Gamble", unit:"Crest"}` → row has `_parent`, `_unit`; a second member `{company:"Crest", parentCompany:"Colgate"}` against that row → PARENT REJECT, rebuild.
- Live on **staging.cambree.ai**: WO-A's own §QA (Cirium → Southwest) still passes.

## Blast radius
Same as WO-A: `pickAccount()` cache boundary and the brief write path. No auth, billing, RLS, or migration. Adds two optional jsonb keys and one boolean to an admission condition.

## Rollback
Revert of the WO-A branch merge commit reverts this with it (it lives on the same branch). Rows already written with `_parent`/`_unit` are harmless to older code (unknown keys ignored).

## Explicitly OUT of scope
- Any change to how `company_url` is chosen for a unit — that is WO-E1 Commit 1 (rule C3).
- A `target_parent` / `target_unit` column, or adding `org_id` to the cache key (WO-A already defers the latter to a `/security-review`).
- Cache-invalidation on account-context edits (`_acctFp`) — WO-E1 Commit 4.
