# CC WORK ORDER E3 — Parent-aware research and the "Context used" strip (expansion & multi-brand, part 3 of 3)

Authored: 2026-09-15 · Preflight base: `staging` @ `c8d15a7` **plus WO-E1 and WO-E2 merged** · Repo `/Users/joe/Projects/cambrian-playbook`
Rules (for implementation — CC does not execute these): **one logical change per commit.** Stage → `git diff --cached` → **STOP for Joe's approval.** Joe owns all commits, pushes and deploys.
Issue: **#180** · Branch (implementation): `feature/issue-180-account-context-parent`. Cut from `staging` after WO-E2 merges **AND WO-B (issue #157) merges**.
Design + evidence: `02_DesignRecord/AdversarialReview_and_Decisions.md` (H3, C2, C3, X8, §3), mockup screen 6.
**Sequencing:** after WO-E2. Commit 3 lands in `generateBrief`'s exec pipeline that WO-B Commit 2 (ownership classification) also touches — **if WO-B is unmerged, land WO-B first**, never parallel.

Anchor verification status (re-verified against `origin/staging` HEAD `aff7537`, 2026-09-15):
- `:2045` — byte-exact: `const _isAcquired = /\bacquired\b|…|parent company/i.test(_p1Ownership);`
- `:2047` — byte-exact: `` ? `Search 3 (ACQUIRED COMPANY): OWNERSHIP CONTEXT from verified company research: "${sanitizeForPrompt(_p1Ownership).slice(0, 400)}"\n`+ ``
- `:2601` — byte-exact: `const canonicalSellerName = /^research-only(\.com)?$/i.test(_rawSellerName) ? "your team" : _rawSellerName;`
- `:2605-2607` — **post-E2 anchor** (after E2's `buildAccountContextBlock` injection lands): `identityAnchor +` / `buildAccountContextBlock(…) +` / `enrichmentCtx +`. At current HEAD, `:2605-2606` reads `identityAnchor + enrichmentCtx +`. Re-verify against the implementation branch after E1 and E2 merge.
- `:9740` — byte-exact: `const companiesStr = needsId.map(m => \`${m.company}|${m.company_url || ""}\`).join("\n");`
- `:9749` — byte-exact: `` `Companies (Name|URL):\n${companiesStr}\n\n` + ``
- `:9780` — byte-exact: `` const r = await apiFetch(`/api/enrich-free?company=…&domain=…`); ``
- `:17470-17471` — byte-exact: `{/* Brief header with logos */}` / `<div className="page-hero" style={{display:"flex",…,marginBottom:6}}>`

**Critical constraint on Commit 3:** WO-B Commit 2 also edits the exec pipeline region near `:2045`. Confirm WO-B is fully merged before implementing Commit 3; verify with `git log --oneline staging | head -10` for the WO-B merge commit. Never land E3 Commit 3 in parallel with WO-B edits.

---

## Standing rules for every commit in this order

1. **Anti-fabrication is P0. Empty beats wrong.** A parent's facts are parent-level. Nothing here may let the model attribute parent revenue, headcount, initiatives, or executives to a unit unless a source ties them to the unit. The PARENT CONTEXT wording below is reviewed (H3) — paste verbatim.
2. **Identity contamination is the recurring failure mode — and this order is where it bites.** A unit with no domain must **never** be identified by name alone (C2). The parent is supplied by the user; the model is never asked to infer it. The existing regex path (`_isAcquired`) is untouched for un-parented rows.
3. **The parent name comes from the user, not the model.** The exec-pipeline branch already forbids parent inference from training knowledge (`:2043-2044`); the field path only removes a guess.
4. **Zero regression contract.** With the flag off, or on with no `parentCompany`, identification, research, exec extraction, and the Brief page are byte-identical to post-E2. Proven with the E1 prompt tap.
5. **Feature flag `cc_account_context`, default OFF.**
6. **No scoring changes.** A unit row is scored on whatever firmographics it carries; E2 already labels it "scored on parent firmographics." Do not touch `scoreFit`.
7. **Cost is gated.** Parent research adds searches only for parented rows; log `parent_research` so the cost per parented brief is measurable.
8. **Re-verify every FROM anchor**; on byte drift add `> ⚠ ANCHOR DRIFT:` and continue. Never rewrite the code block.
9. **Do not attribute Claude on GitHub.**
10. After each staged diff, run the `diff-reviewer` subagent and report PASS / CONCERNS / BLOCK with file:line.

---

## Context

After E1/E2 a unit row ("Crest" under Procter & Gamble; "Oral Care" under P&G with no site of its own) carries `parentCompany` / `parentDomain` / `unit`, but the pipeline still treats it as a standalone company: Phase-0 AI identification runs on `Name|URL` (`:9740-9750`), EDGAR matches by name (`:9780`, the code's own comment warns it "returns wrong entities for ambiguous names"), `generateBrief`'s identity anchor falls to the name-only branch when there is no URL (`:2587-2596`), and the exec pipeline only reaches the subsidiary branch if P1 happened to mention ownership (`:2045`). This order makes each of those parent-aware, gated on the field, and adds the read-only **"Context used"** strip to the Brief so users can see which inputs reached the model — replacing the misleading "your corrections carry forward" promise (F-047c).

---

## Commit 1 — Phase-0 identification receives the parent; EDGAR is skipped for parented rows without their own domain

Files: `src/App.jsx`

**(a) Identification prompt.** FROM anchor (verified byte-exact, `src/App.jsx:9740`):
```
        const companiesStr = needsId.map(m => `${m.company}|${m.company_url || ""}`).join("\n");
```
TO:
```
        // WO-E3 (C2): a brand/unit is identified in the context of its parent, never by name alone.
        const companiesStr = needsId.map(m => `${m.company}|${m.company_url || ""}${accountCtxOn() && m.parentCompany ? `|parent: ${m.parentCompany}${m.parentDomain ? ` (${m.parentDomain})` : ""}` : ""}`).join("\n");
        const _hasParented = accountCtxOn() && needsId.some(m => m.parentCompany);
```
FROM anchor (verified byte-exact, `src/App.jsx:9749`):
```
          `Companies (Name|URL):\n${companiesStr}\n\n` +
```
TO:
```
          (_hasParented ? `PARENTED ROWS: a row with "|parent: X" is a BRAND or BUSINESS UNIT inside parent company X. Identify it in that context only: industry = the unit's category; employees and ownership = the PARENT's, and say so by appending " (parent)" to those values; url = the unit's own site if one certainly exists, otherwise empty. Never match a unit name to an unrelated company that shares the name.\n\n` : "") +
          `Companies (Name|URL${_hasParented ? "|parent" : ""}):\n${companiesStr}\n\n` +
```
- The response mapping at `:9752-9768` keys on `c.company` (the exact name); unchanged. `" (parent)"` suffixes flow into `employees` / `publicPrivate` and are visible in the ranking — that is intended (honest labeling, C4).
- **DO NOT** change the JSON schema line at `:9750` or the `needsId` filter.

**(b) EDGAR skip.** FROM anchor (verified byte-exact, `src/App.jsx:9780`):
```
          const r = await apiFetch(`/api/enrich-free?company=${encodeURIComponent(m.company)}&domain=${encodeURIComponent(m.company_url || "")}`);
```
TO:
```
          // WO-E3 (C2): EDGAR is name-matched; a unit without its own domain would hit the wrong entity. Skip it — the parent's firmographics arrive via Phase 0.
          if (accountCtxOn() && m.parentCompany && !m.company_url) return [m.company, null];
          const r = await apiFetch(`/api/enrich-free?company=${encodeURIComponent(m.company)}&domain=${encodeURIComponent(m.company_url || "")}`);
```
- **DO NOT** touch `api/enrich-free.js`.

---

## Commit 2 — PARENT CONTEXT in the brief base prompt

Files: `src/App.jsx`

**(a) Build the block.** Insert immediately **AFTER** this line.
FROM anchor (verified byte-exact, `src/App.jsx:2601`):
```
  const canonicalSellerName = /^research-only(\.com)?$/i.test(_rawSellerName) ? "your team" : _rawSellerName;
```
INSERT AFTER:
```
  // WO-E3 (H3): a brand/unit is researched in the context of its parent. Parent facts are parent-level.
  // "" when the flag is off or there is no parent — byte-identical to pre-E3.
  const parentCtx = (accountCtxOn() && member.parentCompany)
    ? `PARENT CONTEXT (seller-provided): "${co}" is a BRAND / BUSINESS UNIT of ${sanitizeForPrompt(member.parentCompany)}${member.parentDomain ? ` (${sanitizeForPrompt(member.parentDomain)})` : ""}.\n`+
      `RESEARCH STRATEGY FOR A UNIT:\n`+
      (member.company_url
        ? `- The unit has its own site (${url}): use it for the unit's positioning, products, and any unit-level people.\n`
        : `- The unit has NO site of its own. Do NOT search the bare name "${co}" (it matches unrelated companies). Search ${member.parentDomain ? `site:${sanitizeForPrompt(member.parentDomain)} "${co}"` : `"${sanitizeForPrompt(member.parentCompany)}" "${co}"`} and the parent's press/investor pages for the unit.\n`)+
      `- Corporate facts (revenue, employees, HQ, ownership, filings, board, strategy) come from the PARENT and MUST be labeled parent-level, e.g. "Parent (${sanitizeForPrompt(member.parentCompany)}): ~108,000 employees". Never state a parent figure as the unit's own.\n`+
      `- Unit-level revenue/headcount not found → empty string. Do not estimate a unit from its parent.\n`+
      `- Signals and initiatives: attribute to the unit ONLY when a source names the unit; otherwise label parent-level.\n`+
      `- Executives: unit leadership first (GM, brand/category head); parent executives only when labeled parent-level.\n`+
      `- companySnapshot must open by naming the unit AND its parent in one sentence.\n\n`
    : "";
```
**(b) Inject beside E2's block.** FROM anchor (post-E2 text at `:2605-2607` — **contingent on E1 and E2 being applied first**):
```
    identityAnchor +
    buildAccountContextBlock(member, products.filter(p=>p?.name?.trim()).map(p=>p.name.trim())) +
    enrichmentCtx +
```
TO:
```
    identityAnchor +
    parentCtx +
    buildAccountContextBlock(member, products.filter(p=>p?.name?.trim()).map(p=>p.name.trim())) +
    enrichmentCtx +
```
- `identityAnchor` is left exactly as is. For a unit with no site, its name-only branch still says "Research the company X" — `parentCtx` immediately follows and overrides the search strategy. Do not edit `identityAnchor` to "fix" this; the block is the fix and the anchor text is load-bearing for every other brief.
- Add a source tag: locate the source-tag list in the brief prompt (the `[proof pack]`, `[web search]`, `[industry benchmark]`, `[estimated]` enumeration referenced in `CLAUDE.md` → "Product doctrine") and, **only if it is a single enumerated list in one place**, append `[parent-level]`. If the tags are enumerated in more than one place, **STOP and report** with the locations — Joe decides.

**(c) Log the cost.** In `pickAccount` (the single entry point for briefs, `:10023`/`:10025`), immediately before `generateBrief(` is invoked (`:10602-10609` region), add — flag-gated and only when parented:
```
        if (accountCtxOn() && member?.parentCompany) logJourney("parent_research", { company: member.company, parent: member.parentCompany, hasUnitSite: !!member.company_url });
```
- If there is more than one `generateBrief(` invocation inside `pickAccount`, add the line before each and say so.

**(d) Validator check (X8) — a test, not a code change.** After this commit, run the Crest/P&G fixture through a **fresh** build (not a cache hit) and read the consistency-validator output (`:10830-11562`). If it strips or flags parent-labeled facts as contradictions, **STOP and report** the exact validator message; adding `parent-level` to its allow-list is a separate one-line commit Joe approves on evidence.

---

## Commit 3 — Exec pipeline: the user-supplied parent triggers the subsidiary branch

Files: `src/App.jsx`

**PREREQUISITE CHECK:** Confirm WO-B (issue #157) has merged into staging before implementing this commit. Check `git log origin/staging --oneline | head -20` for the WO-B merge commit. If WO-B is not merged, **STOP and report** — do not implement this commit in parallel with WO-B edits.

FROM anchor (verified byte-exact, `src/App.jsx:2045`):
```
    const _isAcquired = /\bacquired\b|\bacquisition\b|subsidiary|\bdivision of\b|merged (?:with|into)|now part of|\bowned by\b|wholly[- ]owned|taken private|parent company/i.test(_p1Ownership);
```
TO:
```
    // WO-E3: a user-supplied parent forces the subsidiary branch and supplies the parent NAME —
    // the model is no longer asked to infer it. Regex path unchanged for un-parented rows.
    const _userParent = accountCtxOn() && member?.parentCompany ? sanitizeForPrompt(member.parentCompany) : "";
    const _isAcquired = !!_userParent || /\bacquired\b|\bacquisition\b|subsidiary|\bdivision of\b|merged (?:with|into)|now part of|\bowned by\b|wholly[- ]owned|taken private|parent company/i.test(_p1Ownership);
```
FROM anchor (verified byte-exact, `src/App.jsx:2047` — first line of the `_acquiredExecCtx` template):
```
      ? `Search 3 (ACQUIRED COMPANY): OWNERSHIP CONTEXT from verified company research: "${sanitizeForPrompt(_p1Ownership).slice(0, 400)}"\n`+
```
TO:
```
      ? `Search 3 (ACQUIRED COMPANY): OWNERSHIP CONTEXT from verified company research: "${_userParent ? `${co} is a unit of ${_userParent} (seller-provided). ` : ""}${sanitizeForPrompt(_p1Ownership).slice(0, 400)}"\n`+
```
- `member` is a parameter of `runExecIntelPipeline` (`:2030`). `co` is too.
- The rest of `_acquiredExecCtx` (`:2048-2050`) is unchanged — including the **PE exception** ("if the parent is a private-equity or investment firm, the operating leadership remains the target"), which is what makes *Arby's / Inspire Brands* (operator) and *Arby's / Roark Capital* (PE) resolve differently from the same field.
- **DO NOT** change Search 1/2, the extraction rules, Gate A/B, or `mergeExecs`.

---

## Commit 4 — "Context used" strip on the Brief (DOM only)

Files: `src/App.jsx`

A read-only line rendered from state. No API call, no prompt change. Flag-gated. It replaces the promise "your corrections carry forward" with a statement of what actually reached the model.

**Component.** Insert immediately **ABOVE** `AccountContextPanel` (E1 Commit 3 placed it above `pickAccount`):
```
  // WO-E3 (§3): what actually reached the model for this brief. Renders from state only.
  const ContextUsedStrip = ({ member }) => {
    if (!acctCtxEnabled || !member) return null;
    const bits = [];
    bits.push(member.relationship === "existing" ? "Existing customer" : "New logo");
    if (member.relationship === "existing") bits.push(member.currentScope ? `Current scope (${member.currentScope.length} chars)` : "Current scope: not provided");
    if (member.targetOffer) {
      const inCat = (products||[]).some(p => (p?.name||"").trim().toLowerCase() === member.targetOffer.trim().toLowerCase());
      bits.push(`Target offer: ${member.targetOffer} (${inCat ? "catalog" : "label — capabilities unverified"})`);
    }
    if (member.parentCompany) bits.push(`Parent: ${member.parentCompany}${member.parentDomain ? ` (${member.parentDomain})` : ""}${member.company_url ? "" : " · unit has no site — researched via parent"}`);
    if (accountDocs.length) {
      const used = accountDocs.reduce((n, d) => n + Math.min(800, (d.content||"").length), 0);
      const total = accountDocs.reduce((n, d) => n + (d.content||"").length, 0);
      bits.push(`Docs: ${accountDocs.length} uploaded — ${used.toLocaleString()} of ${total.toLocaleString()} chars used`);
    }
    if (selectedOutcomes.length) bits.push(`Outcomes: ${selectedOutcomes.join(", ")}`);
    return (
      <div style={{fontSize:11.5,color:"var(--ink-2)",background:"var(--bg-0)",border:"1px solid var(--line-0)",borderRadius:8,padding:"6px 10px",margin:"6px 0 10px",lineHeight:1.5}}>
        <span style={{fontWeight:700,color:"var(--ink-1)"}}>Context used in this brief:</span> {bits.join(" · ")}
        <span style={{color:"var(--ink-3)"}}> — typed fields are cited as seller-provided; uploads are excerpts.</span>
      </div>
    );
  };
```
- The `800` must equal the literal at `:2623`. When the account-doc budget row ships, both change together.
- `accountDocs`, `selectedOutcomes`, `products` are component state (`:5797`, `:5720`, `:15371`).

**Mount.** FROM anchor (verified byte-exact, `src/App.jsx:17470-17471`):
```
            {/* Brief header with logos */}
            <div className="page-hero" style={{display:"flex",alignItems:"center",gap:16,marginBottom:6}}>
```
Locate the closing `</div>` of this `page-hero` block (it wraps the two `CompanyLogo`s and the title/subtitle `div` at `:17476-17482`) and insert **immediately after it**:
```
            <ContextUsedStrip member={selectedAccount} />
```
- If the closing tag cannot be identified unambiguously, **STOP and report** with the surrounding lines.
- **DO NOT** change the hero, the title, `CompanyLogo`, or anything else on the Brief page.

---

## QA gate (before Joe pushes)

**Offline / free tiers:** `npm run test:lint`, `npm run test:backtest`, `npm run lint` pass. Do **not** run `test:golden*`.

**Regression contract (E1 prompt tap):**
1. Flag **off**, fixture *Cirium → Southwest Airlines* → captured prompts **byte-identical** to the E2 baseline.
2. Flag **on**, no parent set (Crest with `relationship` + scope only) → the Phase-0 prompt, EDGAR call, `parentCtx` (`""`), and exec prompt are **byte-identical** to E2 for that member.

**Contamination / hallucination fixtures, flag on (read the outputs):**
| Fixture | Must be true |
|---|---|
| `Crest / crest.com`, parent `Procter & Gamble` | Phase-0 row carries `\|parent:`; EDGAR **is** called (unit has a domain); snapshot names Crest *and* P&G in one sentence; **no unit revenue figure**; any P&G figure is labeled parent-level; exec block lists Crest/Oral Care leadership or parent execs labeled parent-level; validator does not strip parent-labeled facts (X8) |
| `Oral Care`, parent `Procter & Gamble`, **no URL** | `company_url` empty (E1/C3); EDGAR **skipped**; Phase-0 employees/ownership carry " (parent)"; prompt says do NOT search the bare name; brief contains nothing about an unrelated "Oral Care" company |
| `Arby's / arbys.com`, parent `Inspire Brands` | exec pipeline runs Search 3 with the seller-provided parent; Inspire leadership acceptable, labeled |
| `Arby's / arbys.com`, parent `Roark Capital` | PE exception: Arby's operating leadership remains the target; no Roark partners listed |
| `Cerner` (no parent field) | regex path unchanged — Oracle Health leadership found as before |
| `session_journey` | one `parent_research` row per parented brief with `hasUnitSite` correct |

**Context-used strip, flag on:** Brief for Crest shows *Existing customer · Current scope (N chars) · Target offer: X (catalog) · Parent: Procter & Gamble (pg.com) · Docs: 1 uploaded — 800 of 4,210 chars used · Outcomes: …*. Flag off: no strip.

**Golden-run gate:** golden fixtures carry no parent — Commits 1–3 must not change their prompts (tap diff). Do not run the paid tier.

## Blast radius
`enrichAndScore` Phase 0 + Phase 1 (identification and EDGAR for parented rows only), `generateBrief` base prompt (one gated block), `runExecIntelPipeline` gate + one context line, `pickAccount` (one log line), Brief page header (one component). No auth, billing, RLS, migration, or scoring code. New React state: none.

## Rollback
Runtime: flag off → all four commits are inert. Code: single revert of the branch merge commit. Briefs built with `parentCtx` are correct briefs for parented rows and need no cleanup; `_parent`/`_unit` stamps (WO-A Amendment 1) keep them from serving a different parent.

## Explicitly OUT of scope
- Raising the 800 / 400 account-doc excerpt literals (`:2623`, `:11601`) → backlog row. The strip **reports** the cap; it does not change it.
- A generated "pick a brand" menu; a `target_parent` column; unifying the two catalog sources (`products` vs `sellerICP.icp.productCatalog`).
- Expansion-scoped fit scoring — deferred until the golden set can detect drift.
- Changing `identityAnchor` (`:2587-2596`), `api/enrich-free.js`, `mergeExecs`, Gate A/B, or the consistency validator (a one-line allow-list change is its own commit *only* if Commit 2(d) produces evidence).
