# CC WORK ORDER E2 — Account context: prompt blocks, Known Customer retirement, fit-ranking read-only UI (expansion & multi-brand, part 2 of 3)

Authored: 2026-09-15 · Preflight base: `staging` @ `c8d15a7` **plus WO-E1 merged** · Repo `/Users/joe/Projects/cambrian-playbook`
Rules (for implementation — CC does not execute these): **one logical change per commit.** Stage → `git diff --cached` → **STOP for Joe's approval.** Joe owns all commits, pushes and deploys.
Issue: **#179** · Branch (implementation): `feature/issue-179-account-context-prompts`. Cut from `staging` after WO-E1 merges.
Design + evidence: `02_DesignRecord/AdversarialReview_and_Decisions.md` (H1–H5, C4, X6, D5), mockup screens 3, 5, 6.
**Sequencing:** after WO-E1. Independent of WO-C (touches no Step 4 gate).

Anchor verification status (re-verified against `origin/staging` HEAD `aff7537`, 2026-09-15):
- `:1476` — byte-exact: `function buildPlayPrompt(targetCompany, targetDomain, sellerICP, brief, fitScore, solutionFit = null) {`
- `:1539` — byte-exact: `` `${sellerDesc} · products:${catalog} · customers:${customers}` ``
- `:1587` — byte-exact: `function validatePlay(play, targetCompany, targetDomain, brief, sellerICP) {`
- `:1693-1694` — byte-exact: `JSON.stringify(sellerICP?.icp?.verifiedCustomers||[]),` + `].filter(Boolean).join(" ");`
- `:1797` — byte-exact: `// Stable djb2 hash over the seller's uploaded docs + free-form ICP notes.`
- `:2605-2606` — byte-exact at current HEAD: `identityAnchor +` / `enrichmentCtx +`. **Post-E1 anchor** (after E1 merges, E1 inserts helpers above `:1797` and Commit 1(b) changes this exact region — re-verify against the implementation branch state after E1 lands.)
- `:2621-2624` — byte-exact: `accountDocs.length > 0 ?` … `join("\n") + "\n\n"` block
- `:9431` — byte-exact: `const prompt = buildPlayPrompt(targetCompany, targetDomain, sellerICP, brief, fitScore, solutionFit);`
- `:11829-11830` — byte-exact: `const co = member.company;` + `const snapshot = (briefData.companySnapshot || "").slice(0,350);`
- `:12227-12228` — byte-exact (pre-call SA): `` `OUTCOMES SOUGHT: …\n`+ `` / `` `BRIEFING COMPLETENESS: ${confidence}%\n\n`+ ``
- `:12267-12268` — byte-exact (post-call SA): `` `OUTCOMES SOUGHT: …\n`+ `` / `` `BRIEFING COMPLETENESS: ${confidence}%\n`+ `` (single `\n` distinguishes from pre-call)
- `:13415` — byte-exact: `` contactRole ? `Contact role: ${sanitizeForPrompt(contactRole)}` : "", ``
- `:17035-17036` — byte-exact: `return _fitRows;` / `})().map((m,i)=>{`
- `:17039-17040` — byte-exact: `return(` / `<tr key={i} style={{cursor:"pointer",…`
- `:17052-17053` — byte-exact: `<div>{m.company}</div>` / `{m.company_url&&<div style={{…}}>🌐 {m.company_url}</div>}`
- `:17073` — byte-exact: `…fitScores[m.company].score < 65 ? "Stretch target — may be viable with additional relationship context or intel" : ""]…`
- `:17081` — byte-exact: `` : `${fs.score}% · ${fs.label}${fs.score < 65 ? " · Stretch" : ""}` ``
- `:20217` — byte-exact: `{ label: "Known Customer", value: 40, icon: "\u2B50", reason: "Existing customer \u2014 warm relationship, proven budget" },`
- `:20223` — byte-exact: `<button key={p.label} onClick={e=>{e.stopPropagation();const t=intelModalTarget;setIntelAdjustments(…`
- `:20236` — byte-exact: `{[-30,-25,-20,-15,-10,-5,5,10,15,20,25,30,40].map(v=>(`

**Decisions (Joe, 9/15):** Known Customer → label with flag on (no `+40` modifier); `sanitizeForPrompt` is defined before `:1797` — function declarations hoist safely; `buildAccountContextBlock` may be inserted above the same anchor.

---

## Standing rules for every commit in this order

1. **Anti-fabrication is P0. Empty beats wrong.** This order is the one that adds prompt text. Every added sentence must *narrow* what the model may assert, never widen it. The four blocks below are the only prompt text permitted; paste them **verbatim** — no paraphrase, no "improvements."
2. **Typed fields are facts and are cited `[seller-provided]`; uploads are excerpts and are cited `[uploaded doc]`; neither may be extended by inference.** This sentence is in the prompt (Commit 1) and is the rule for the code too.
3. **Identity contamination guard stays intact.** Nothing here touches `identityAnchor` (`:2587-2596`), P1 search strategy, or enrichment. Parent-aware research is WO-E3.
4. **Zero regression contract.** With the flag off, or with the flag on and no fields set, every prompt string is **byte-identical** to post-E1 (which is byte-identical to pre-E1). Proven with the E1 prompt tap.
5. **Feature flag `cc_account_context`, default OFF.** All prompt blocks return `""` when the flag is off — even if a member somehow carries fields.
6. **No scoring changes.** Commit 3 groups and labels; it does not alter any score, sort key, or the queue. `fitScoring.js` and `scoreFit` are untouched.
7. **Known Customer retirement is Joe's decision (9/15).** It applies only when the flag is on. Persisted `+40` modifiers from older sessions continue to render and clamp exactly as today.
8. **Re-verify every FROM anchor** against current `staging`; on byte drift add `> ⚠ ANCHOR DRIFT:` and continue. Never rewrite the code block.
9. **Do not attribute Claude on GitHub.**
10. After each staged diff, run the `diff-reviewer` subagent and report PASS / CONCERNS / BLOCK with file:line.

---

## Context

E1 captured `relationship`, `parentCompany`, `unit`, `currentScope`, `targetOffer` on the member and made the cache and brief signature aware of them. Nothing reads them yet. Today an existing-customer brief is written as a cold approach: "why us" argues credibility, discovery asks "who is the incumbent," outreach opens with "your reality," and a typed target offer never reaches the solution architect (`member.product` has no consumer). Meanwhile the **Known Customer** preset (`:20217`) adds `+40` to the fit score — a thumb on a scale that does not measure expansion fit — and the ranking cannot tell a customer from a prospect without opening the modal.

This order (a) injects one gated ACCOUNT CONTEXT block into every prompt surface that shapes narrative — brief micro-calls, Play, RIVER hypothesis, solution architect, Milton — with the anti-fabrication wording from the review; (b) turns Known Customer into a label; (c) groups existing customers in the ranking. **No prompt for a member without fields changes by a byte.**

---

## Commit 1 — `buildAccountContextBlock()` + injection into the brief base prompt and Milton; caveat carry-through

Files: `src/App.jsx`

**(a) The block builder — the only prompt text in this order.** Insert immediately **ABOVE** this comment line (E1 inserted its helpers above the same line; this lands below them, above the comment).
FROM anchor (verified byte-exact, `src/App.jsx:1797`):
```
// Stable djb2 hash over the seller's uploaded docs + free-form ICP notes.
```
INSERT ABOVE (anchor line unchanged):
```
// ── ACCOUNT CONTEXT PROMPT BLOCK (WO-E2) ─────────────────────────────────────
// Returns "" when the flag is off or the member carries no account-context fields,
// so every consumer is byte-identical to pre-E2 for today's users. Wording is
// reviewed (AdversarialReview §1.1 H1/H2/H4) — do not paraphrase.
function buildAccountContextBlock(member = {}, catalogNames = []) {
  if (!accountCtxOn()) return "";
  const existing = member.relationship === "existing";
  const scope = (member.currentScope || "").slice(0, 600).trim();
  const offer = (member.targetOffer || "").slice(0, 120).trim();
  if (!existing && !scope && !offer) return "";
  const s = (v) => sanitizeForPrompt(v || "");
  const inCatalog = offer && catalogNames.map(n => String(n).toLowerCase().trim()).includes(offer.toLowerCase());
  let out = `ACCOUNT CONTEXT (seller-provided — treat every line as fact, cite it as [seller-provided], and do NOT extend it by inference):\n`;
  if (existing) {
    out += `RELATIONSHIP: ${s(member.company)} is an EXISTING CUSTOMER of the seller.\n`;
    out += scope
      ? `CURRENT SCOPE (what the seller does for them today): "${s(scope)}"\n`
      : `CURRENT SCOPE: not provided.\n`;
    out += `RULES FOR AN EXISTING CUSTOMER:\n`
      + `- The ONLY facts known about this relationship are in CURRENT SCOPE. Do not invent meetings, contract terms, contacts, satisfaction, tenure, or history. Where a section needs a relationship fact that is not supplied, write "[confirm with seller]".\n`
      + `- Credibility is established: "why us" becomes "why more of us" — argue scope and terms, not capability.\n`
      + `- The seller is the incumbent for CURRENT SCOPE only. For the TARGET OFFER, identify who (if anyone) holds that scope today; never propose displacing the seller's own work, and do not ask "who is the incumbent?" about work the seller already does.\n`
      + `- Outreach opens warm and specific — reference CURRENT SCOPE in the first sentence — never "your reality" cold framing.\n`;
  }
  if (offer) {
    out += `TARGET OFFER (what the seller wants to sell here): "${s(offer)}"${inCatalog ? " [catalog product]" : " [offer not in catalog — capabilities unverified]"}\n`;
    out += `RULES FOR THE TARGET OFFER:\n`
      + `- Anchor the solution mapping, recommendation, and play on this offer. Propose no commercial terms outside it.\n`
      + (inCatalog
          ? `- Its capabilities are ONLY those the seller proof pack supports for this product.\n`
          : `- This offer is a LABEL, not a specification. Map it to the nearest catalog product and say so; if none matches, say "no catalog match" and list only capabilities the proof pack supports. Do not invent features.\n`);
  }
  return out + `\n`;
}
```
- `sanitizeForPrompt` is defined earlier in the module (used at `:2486`). If it is defined **after** `:1797` at HEAD, **STOP and report** (hoisting of function declarations makes this fine; a `const` would not be).

**(b) Inject into the brief base prompt.** `baseLight` feeds every micro-call (`:2513-2516`), so one insertion covers p1–p9. FROM anchor (post-E1 text at `src/App.jsx:2605-2606`):
```
    identityAnchor +
    enrichmentCtx +
```
TO:
```
    identityAnchor +
    buildAccountContextBlock(member, products.filter(p=>p?.name?.trim()).map(p=>p.name.trim())) +
    enrichmentCtx +
```
- `products` is a `generateBrief` parameter (`:2485`). `member` is the first parameter.
- **DO NOT** change `identityAnchor`, `enrichmentCtx`, or anything else in `baseLight`/`baseFull`.

**(c) Caveat carry-through for uploaded numbers (H5).** FROM anchor (verified byte-exact, `src/App.jsx:2621-2624`):
```
    (accountDocs.length > 0
      ? `TARGET-SPECIFIC INTEL (uploaded by the user — these are documents FROM or ABOUT ${co}. Treat as high-priority context. Address their specific requirements, questions, and priorities throughout the brief):\n` +
        accountDocs.map(d => sanitizeForPrompt(d.label) + ": " + sanitizeForPrompt(d.content.slice(0, 800))).join("\n") + "\n\n"
      : "");
```
TO:
```
    (accountDocs.length > 0
      ? `TARGET-SPECIFIC INTEL (uploaded by the user — these are documents FROM or ABOUT ${co}. Treat as high-priority context. Address their specific requirements, questions, and priorities throughout the brief):\n` +
        accountDocs.map(d => sanitizeForPrompt(d.label) + ": " + sanitizeForPrompt(d.content.slice(0, 800))).join("\n") + "\n" +
        (accountCtxOn() ? `Cite facts from these documents as [uploaded doc]. Quantitative claims keep the document's own caveats; a change in an index or a trend is a question to ask, not a conclusion to state.\n` : "") + "\n"
      : "");
```
- The `800` literal is **not** changed here (backlog row, Joe 9/15). The only difference with the flag off is `"\n" + "" + "\n"` vs `"\n\n"` — identical bytes.

**(d) Milton sees the same facts.** FROM anchor (verified byte-exact, `src/App.jsx:13415`):
```
      contactRole ? `Contact role: ${sanitizeForPrompt(contactRole)}` : "",
```
TO:
```
      contactRole ? `Contact role: ${sanitizeForPrompt(contactRole)}` : "",
      // WO-E2: account context (flag-gated; "" when absent)
      buildAccountContextBlock(selectedAccount || {}, (products||[]).filter(p=>p?.name?.trim()).map(p=>p.name.trim())).trim(),
```
- The array is `.filter(Boolean).join("\n")`-ed at `:13428`, so an empty string is dropped exactly like the other conditionals.

---

## Commit 2 — The Play, the RIVER hypothesis, the solution architect

Files: `src/App.jsx`

**(a) Play prompt gains an optional `accountCtx` and carries it into the validator corpus (so scope-derived numbers are not stripped as "unsourced" — Check 7).**

FROM anchor (verified byte-exact, `src/App.jsx:1476`):
```
function buildPlayPrompt(targetCompany, targetDomain, sellerICP, brief, fitScore, solutionFit = null) {
```
TO:
```
function buildPlayPrompt(targetCompany, targetDomain, sellerICP, brief, fitScore, solutionFit = null, accountCtx = "") {
```
FROM anchor (verified byte-exact, `src/App.jsx:1539`):
```
${sellerDesc} · products:${catalog} · customers:${customers}
```
TO:
```
${sellerDesc} · products:${catalog} · customers:${customers}
${accountCtx ? `[ACCOUNT CONTEXT — seller-provided]\n${accountCtx}` : ""}
```
FROM anchor (verified byte-exact, `src/App.jsx:1587`):
```
function validatePlay(play, targetCompany, targetDomain, brief, sellerICP) {
```
TO:
```
function validatePlay(play, targetCompany, targetDomain, brief, sellerICP, accountCtx = "") {
```
FROM anchor (verified byte-exact, `src/App.jsx:1693-1694`):
```
    JSON.stringify(sellerICP?.icp?.verifiedCustomers||[]),
  ].filter(Boolean).join(" ");
```
TO:
```
    JSON.stringify(sellerICP?.icp?.verifiedCustomers||[]),
    // WO-E2: seller-provided account context is a legitimate source for numbers in the play
    accountCtx,
  ].filter(Boolean).join(" ");
```
Call sites in `buildThePlay`. FROM anchor (verified byte-exact, `src/App.jsx:9431`):
```
      const prompt = buildPlayPrompt(targetCompany, targetDomain, sellerICP, brief, fitScore, solutionFit);
```
TO:
```
      const _acctCtx = buildAccountContextBlock(selectedAccount || {}, (sellerICP?.icp?.productCatalog || []).map(p => typeof p === "string" ? p : p?.name || ""));
      const prompt = buildPlayPrompt(targetCompany, targetDomain, sellerICP, brief, fitScore, solutionFit, _acctCtx);
```
- Then find the **single** `validatePlay(` call inside `buildThePlay` (below `:9440`) and append `, _acctCtx` as its last argument. If there is more than one call site, or it is outside `buildThePlay`, **STOP and report.**
- Note the catalog source differs from Commit 1 on purpose: the Play already uses `sellerICP.icp.productCatalog` (`:1481`); the brief uses the `products` state. Both are the seller's catalog; do not unify them in this order.

**(b) RIVER hypothesis.** `buildRiverHypo(briefData, member)` already receives the member. FROM anchor (verified byte-exact, `src/App.jsx:11829-11830`):
```
    const co = member.company;
    const snapshot = (briefData.companySnapshot || "").slice(0,350);
```
TO:
```
    const co = member.company;
    const accountCtx = buildAccountContextBlock(member, (products||[]).filter(p=>p?.name?.trim()).map(p=>p.name.trim())); // WO-E2
    const snapshot = (briefData.companySnapshot || "").slice(0,350);
```
- Then locate the point in `buildRiverHypo` where the prompt string is assembled (it contains `sellerCtx` from `:11840` and the `snapshot`/`theme` variables) and append `${accountCtx}` immediately after the seller-context segment. Show the exact lines in the diff. If the assembly is not a single template/concat expression, **STOP and report.**

**(c) Solution architect — both prompt variants.** FROM anchor (verified byte-exact, `src/App.jsx:12227-12228` — pre-call variant; the `\n\n` on the second line makes it unique):
```
        `OUTCOMES SOUGHT: ${selectedOutcomes.join(", ")||"Not defined"}\n`+
        `BRIEFING COMPLETENESS: ${confidence}%\n\n`+
```
TO:
```
        `OUTCOMES SOUGHT: ${selectedOutcomes.join(", ")||"Not defined"}\n`+
        buildAccountContextBlock(selectedAccount || {}, (products||[]).filter(p=>p?.name?.trim()).map(p=>p.name.trim())) +
        `BRIEFING COMPLETENESS: ${confidence}%\n\n`+
```
FROM anchor (verified byte-exact, `src/App.jsx:12267-12268` — post-call variant; single `\n` on the second line):
```
        `OUTCOMES SOUGHT: ${selectedOutcomes.join(", ")||"Not defined"}\n`+
        `BRIEFING COMPLETENESS: ${confidence}%\n`+
```
TO:
```
        `OUTCOMES SOUGHT: ${selectedOutcomes.join(", ")||"Not defined"}\n`+
        buildAccountContextBlock(selectedAccount || {}, (products||[]).filter(p=>p?.name?.trim()).map(p=>p.name.trim())) +
        `BRIEFING COMPLETENESS: ${confidence}%\n`+
```
- Two variants, one edit each; say so in the diff summary. WO-C Commit 1 edits `:12399` (a different line) — no overlap.
- **DO NOT** touch `saExecPerspectives`, the competitive-context lines, or `confidence`.

---

## Commit 3 — Fit ranking: group existing customers, chip, parent subline, Stretch suppression, unit tooltip (DOM only)

Files: `src/App.jsx`

**(a) Partition in the render, not in state (X6).** The queue and sort are untouched; the only new DOM is a header row when at least one member is existing. FROM anchor (verified byte-exact, `src/App.jsx:17035-17036`):
```
                      return _fitRows;
                    })().map((m,i)=>{
```
TO:
```
                      // WO-E2: group existing customers first (flag-gated; no header when none are flagged).
                      // Sort order inside each group is unchanged. Rows carry _grp for the header logic below.
                      if(acctCtxEnabled && _fitRows.some(r=>r.relationship==="existing")){
                        const ex=_fitRows.filter(r=>r.relationship==="existing"), nw=_fitRows.filter(r=>r.relationship!=="existing");
                        return [...ex.map(r=>({...r,_grp:"existing"})),...nw.map(r=>({...r,_grp:"new"}))];
                      }
                      return _fitRows;
                    })().map((m,i,arr)=>{
```
Then, inside the returned fragment for each row, render the header **before** the `<tr key={i}` at `:17040`. FROM anchor (verified byte-exact, `src/App.jsx:17039-17040`):
```
                      return(
                        <tr key={i} style={{cursor:"pointer",background:disqualified[m.company]?"#fef2f2":inQueue?"var(--bg-1)":"",transition:"background 0.1s",opacity:disqualified[m.company]?0.5:1}}
```
TO:
```
                      const _hdr = m._grp && (i===0 || arr[i-1]._grp!==m._grp)
                        ? (<tr key={`hdr-${m._grp}`}><td colSpan={7} style={{padding:"10px 6px 4px",fontSize:10,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:m._grp==="existing"?"var(--tan-0)":"var(--ink-2)",borderBottom:"1px solid var(--line-0)"}}>
                            {m._grp==="existing"?"Expansion · existing customers":"New logo"}<span style={{fontWeight:600,color:"var(--ink-3)",letterSpacing:0,textTransform:"none",marginLeft:6}}>{arr.filter(r=>r._grp===m._grp).length}</span>
                            {m._grp==="existing" && <div style={{fontSize:10.5,fontWeight:500,letterSpacing:0,textTransform:"none",color:"var(--ink-3)",marginTop:2}}>Fit score is how well the target offer fits — not whether they'll buy from you; they already do.</div>}
                          </td></tr>)
                        : null;
                      return [_hdr,(
                        <tr key={i} style={{cursor:"pointer",background:disqualified[m.company]?"#fef2f2":inQueue?"var(--bg-1)":"",transition:"background 0.1s",opacity:disqualified[m.company]?0.5:1}}
```
- An array of keyed elements is returned (not a fragment). `_hdr` is `null` or a keyed `<tr>`; find the row's closing `</tr>` (the one that ends the `return(` opened at `:17039`) and change the trailing `);` to `)];`. Show it in the diff. If the closing cannot be located unambiguously, **STOP and report.**
- The table has 7 columns (`:17009-17015`); `colSpan={7}` must match — verify.

**(b) Chip + parent subline.** FROM anchor (verified byte-exact, `src/App.jsx:17052-17053`):
```
                                <div>{m.company}</div>
                                {m.company_url&&<div style={{fontSize:11,color:"var(--ink-3)",fontWeight:400}}>🌐 {m.company_url}</div>}
```
TO:
```
                                <div>{m.company}{acctCtxEnabled&&m.relationship==="existing"&&<span style={{marginLeft:6,fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:20,background:"#F8ECE4",color:"var(--tan-0)",border:"1px solid #BD694066",verticalAlign:"middle"}}>Existing</span>}</div>
                                {m.company_url&&<div style={{fontSize:11,color:"var(--ink-3)",fontWeight:400}}>🌐 {m.company_url}</div>}
                                {acctCtxEnabled&&m.parentCompany&&<div style={{fontSize:11,color:"var(--ink-3)",fontWeight:400}} title="Fit is scored on the parent's firmographics — read it as a signal, not a verdict.">↳ {m.parentCompany}{m.unit&&m.unit!==m.company?` · ${m.unit}`:""} · scored on parent firmographics</div>}
```

**(c) Stretch suppression on the expansion group (C4 / mockup).** Two identical predicates. FROM anchor (verified byte-exact, `src/App.jsx:17073`, inside the `title=` attribute — **the same title text also exists at `:4940` in a different table; edit only `:17073`**, identified by the following line `:17074` reading `{(()=>{`):
```
fitScores[m.company].score < 65 ? "Stretch target — may be viable with additional relationship context or intel" : ""
```
TO:
```
(fitScores[m.company].score < 65 && !(acctCtxEnabled && m.relationship==="existing")) ? "Stretch target — may be viable with additional relationship context or intel" : ""
```
FROM anchor (verified byte-exact, `src/App.jsx:17081`):
```
                                    : `${fs.score}% · ${fs.label}${fs.score < 65 ? " · Stretch" : ""}`;
```
TO:
```
                                    : `${fs.score}% · ${fs.label}${(fs.score < 65 && !(acctCtxEnabled && m.relationship==="existing")) ? " · Stretch" : ""}`;
```
- **DO NOT** change the score arithmetic at `:17076`, the intel button (`:17087-17093`), DQ, Review →, or the queue checkbox.

---

## Commit 4 — Known Customer becomes a label; the `+40` button goes (flag-gated)

Files: `src/App.jsx`

**(a) Preset semantics.** FROM anchor (verified byte-exact, `src/App.jsx:20217`):
```
                  { label: "Known Customer", value: 40, icon: "\u2B50", reason: "Existing customer \u2014 warm relationship, proven budget" },
```
TO:
```
                  ...(acctCtxEnabled
                    ? [{ label: "Existing customer (label, no score change)", value: null, icon: "\u2B50", reason: "", setRelationship: true }]
                    : [{ label: "Known Customer", value: 40, icon: "⭐", reason: "Existing customer — warm relationship, proven budget" }]),
```
FROM anchor (verified byte-exact, `src/App.jsx:20223`):
```
                  <button key={p.label} onClick={e=>{e.stopPropagation();const t=intelModalTarget;setIntelAdjustments(prev=>({...prev,[t]:{...(prev[t]||{}),modifier:p.value,reason:p.reason}}));}}
```
TO:
```
                  <button key={p.label} onClick={e=>{e.stopPropagation();const t=intelModalTarget;
                      if(p.setRelationship){ updateMemberField(t,{relationship:"existing"}); trackUserEdit("intel","relationship","", "existing", t); return; } // WO-E2: label only, no modifier
                      setIntelAdjustments(prev=>({...prev,[t]:{...(prev[t]||{}),modifier:p.value,reason:p.reason}}));}}
```
- The three selected-state style expressions on `:20225-20227` compare `intelAdjustments[intelModalTarget]?.modifier===p.value`; with `value: null` they render unselected, which is correct. Add a selected style for the label preset only if it is a one-line change: `(p.setRelationship && (accountQueue.find(m=>m.company===intelModalTarget)||{}).relationship==="existing")` — optional; skip if it grows beyond the button's existing style ternaries.
- `trackUserEdit(type, field, oldValue, newValue, target)` is the existing signature used at `:20270`; verify argument order at HEAD.
- **DO NOT** touch the Warm Intro / Active Eval / Signed Competitor / Budget Freeze presets, the reason textarea, Remove/Cancel/Save, `validateInput`.

**(b) Drop `+40` from the modifier list (flag-gated).** FROM anchor (verified byte-exact, `src/App.jsx:20236`):
```
                {[-30,-25,-20,-15,-10,-5,5,10,15,20,25,30,40].map(v=>(
```
TO:
```
                {(acctCtxEnabled?[-30,-25,-20,-15,-10,-5,5,10,15,20,25,30]:[-30,-25,-20,-15,-10,-5,5,10,15,20,25,30,40]).map(v=>(
```
- A session that already saved `modifier: 40` still renders `+40` on the button at `:17092` and clamps at `:17076` — the display code is untouched.

**(c) Release note (in the PR body):** "With account context enabled, 'Known Customer' no longer changes the fit score; it marks the account as an existing customer, which groups it under *Expansion* in the ranking and changes how the brief, play, and outreach are written. Saved +40 adjustments from earlier sessions are unchanged." Also annotate **F-047** in the backlog: (a) Known Customer → superseded by design; (b) ICP edits not re-scoring → Flow Phase 2; (c) "corrections carry forward" copy → replaced by the Context-used strip (WO-E3).

---

## QA gate (before Joe pushes)

**Offline / free tiers:** `npm run test:lint`, `npm run test:backtest`, `npm run lint` pass. Do **not** run `test:golden*`.

**Regression contract (E1 prompt tap):**
1. Flag **off**, fixture *Cirium → Southwest Airlines* through Brief + Play + SA pre-call: capture with the tap. Diff against the E1 baseline → **byte-identical.**
2. Flag **on**, same fixture, no fields set → **byte-identical.**
3. Flag **on**, fixture `Crest / crest.com`, Existing, scope *"Packaging artwork for two product lines since 2024 · contact is the brand coordinator"*, target offer = a catalog product → every captured prompt (brief micro-calls, Play, hypothesis, SA, Milton) contains exactly one `ACCOUNT CONTEXT` block; the Play prompt contains `[ACCOUNT CONTEXT — seller-provided]`.

**Anti-fabrication checks on the flag-on fixture (read the outputs, not just the prompts):**
- Brief and Play contain **no** relationship facts beyond the scope text — no invented meetings, tenure, contract terms, or contacts; any gap reads `[confirm with seller]` (H1).
- Outreach email's first sentence references the current scope (warm open), not "your reality."
- Free-text offer not in catalog (e.g. *"Innovation Capacity Agreement"*) → SA output says "no catalog match" or names the nearest catalog product, and lists no capability absent from the proof pack (H2).
- Existing customer whose target-offer scope is plausibly held by a competitor (fixture: seller does packaging; offer = "reformulation support"; scope names a competitor doing reformulation today) → displacement reasoning is present and aimed at that competitor, never at the seller's own packaging work (H4).
- Upload one doc containing "index 48 (down from 100 in 2022)" → brief phrases it as a question/movement, not "stopped" (H5).
- Play validator: with the scope above, `validatePlay` does **not** strip "two product lines" / "2024" (Check 7 corpus includes `accountCtx`).

**Live on staging.cambree.ai, flag on:**
- Step 3 shows `Expansion · existing customers` header with the sub-caption, then `New logo`; scores identical to flag-off; queue numbering unchanged; no header when nothing is flagged.
- Unit rows show `↳ Parent · scored on parent firmographics`; the Stretch hint is absent on expansion rows and present on new-logo rows < 65.
- Add Intel: preset reads *Existing customer (label, no score change)*; clicking it flips the row into the Expansion group with no score change; `+40` absent; a session saved earlier with `+40` still shows `+40`.
- Flag off: modal and ranking identical to today.

**Golden-run gate:** the `test:golden` fixtures are all new-logo, no fields — Commit 1–2 must not change their prompts (tap diff is the proof). Do not run the paid tier for this order.

## Blast radius
Every prompt surface: `generateBrief` base (all micro-calls), `buildPlayPrompt` + `validatePlay`, `buildRiverHypo`, `buildSolutionFit` (both variants), Milton context. Step 3 render; Add Intel modal. No auth, billing, RLS, migration, or scoring code. New React state: none.

## Rollback
Runtime: flag off → every block returns `""`, preset and modifier list revert to today's, ranking ungrouped. Code: single revert of the branch merge commit. Cached briefs built with account context carry `_acctFp ≠ "0"` and will be regenerated by older code only if their `_ctxFp`/version already required it — otherwise they serve as-is, which is acceptable (they are correct briefs for that context).

## Explicitly OUT of scope
- Parent-aware identification, P1 dual-site research, exec-pipeline gate, PARENT CONTEXT block, "Context used" strip → **WO-E3**.
- Raising the 800 / 400 account-doc excerpt literals → backlog row.
- Expansion-scoped fit scoring (narrowing Option C product context to `targetOffer`) → deferred until the golden set can detect drift.
- Any copy change to "your corrections carry forward" beyond the release note → WO-E3's strip replaces it.
- Replacing `alert()` (F-026), the generated brand menu, `target_parent` column.
