# CC WORK ORDER C — Flow redesign, Phase 1a: deal context optional · instrumentation · waiting-state copy · the Verdict line

Authored: 2026-09-14 · Preflight base: cut from `staging` · repo `/Users/joe/Projects/cambrian-playbook` · anchors verified against `b573fed`
Rules (for Hare's implementation — CC does not execute these): **one logical change per commit.** Stage → `git diff --cached` → **STOP for Joe's approval.** Joe owns all commits, pushes and deploys.
Issue: file as **"Flow Phase 1a: optional deal context, journey instrumentation, waiting-state copy, verdict line (R-28 / R-32 / R-31 / R-40)"**, branch `feature/issue-161-flow-phase1a`.
Design + evidence: `~/Desktop/Cambree/02_Product/Specs/Cambree_Flow_Redesign_2026-09-14.md` (§3 accuracy gate, §5.3 skeleton rules, §8 measurement, §11 verdict). Mock: `~/Desktop/Cambrian_V2/Cambree_Flow_Mockup_2026-09-14.html` (screen 3).

Anchor verification status (re-verified against `origin/staging` HEAD, 2026-09-14): all code strings match byte-for-byte. Line numbers have drifted by +2 to +19 from the `b573fed` baseline — see drift notes inline.

**Not in this order:** the seller-profile card, auto-open, the control variant (R-29 / R-30 / R-33). Those are **WO-D**, and they wait on (a) WO-A merging (F-037 cache identity) and (b) 14 days of the instrumentation in Commit 2 to give a baseline. Do not start them here.

---

## Context

The production funnel (`session_journey`, 45 d, Joe/Hare excluded) shows 27 of 28 external sessions that clear Step 1 reach the Brief; the only pre-Brief leak is Step 1 (median dwell **7.3 min**). The Brief page itself gets "where do I put my energy?" (Jack), "so overwhelmed" (Holly), "calm one-pager" (Ian). This order ships the four changes that are safe *today*, need no step renumbering, and touch no scoring/ordering logic:

1. **Deal context optional** — the fields are already optional in substance (`dealValue`/`dealClassification` reach only Milton, `13411-13412`; `selectedOutcomes` has a six-value default at `2502-2506` plus the universal-imperatives assertion at `2507`). The whole gate is one `disabled` prop.
2. **Instrumentation** — the journey table logs only `step_change`, `account_selected`, `brief_generated`, `session_saved`. Nothing about ICP edits, fit-check inputs, time-to-Play, or brief identity. WO-D cannot be judged without these.
3. **Waiting-state copy** — pending sections say *what they are waiting for*, so the wait reads as the anti-fabrication story instead of dead time.
4. **The Verdict line** — one sourced sentence at the top of the Play card answering "should I care, and why?", condensed only from sections that already exist. Modelled on the Quick Take call at `10700-10768` and validated the same way.

---

## Commit 1 — Deal context is optional (R-28)

Files: `src/App.jsx`

- **Remove the gate.** FROM anchor (verified byte-exact, `src/App.jsx:17433-17440`):

> ⚠ ANCHOR DRIFT: block starts at **17452** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
                  <button className="btn btn-primary btn-lg" style={{width:"100%",justifyContent:"center"}}
                    disabled={selectedOutcomes.length===0}
                    onClick={()=>pickAccount(sa)}>
                    Build Brief → {selectedOutcomes.length>0 ? `(${selectedOutcomes.length} outcome${selectedOutcomes.length>1?"s":""})` : ""}
                  </button>
                  {selectedOutcomes.length===0 && (
                    <div style={{fontSize:11,color:"var(--ink-3)",textAlign:"center",marginTop:6}}>Select at least one outcome to continue</div>
                  )}
  ```
  TO:
  ```
                  <button className="btn btn-primary btn-lg" style={{width:"100%",justifyContent:"center"}}
                    onClick={()=>pickAccount(sa)}>
                    Build Brief → {selectedOutcomes.length>0 ? `(${selectedOutcomes.length} outcome${selectedOutcomes.length>1?"s":""})` : ""}
                  </button>
                  {selectedOutcomes.length===0 && (
                    <div style={{fontSize:11,color:"var(--ink-3)",textAlign:"center",marginTop:6}}>Optional. Cambree already pulls the signals, scores the fit, and picks the most likely solution on its own. Add deal size, the outcome you're chasing, or who you're meeting, and the Play gets sharper. It works without it.</div>
                  )}
  ```

- **Guard the one unguarded read.** FROM anchor (verified byte-exact, `src/App.jsx:12399`):

> ⚠ ANCHOR DRIFT: line is at **12401** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
        `Cohort: ${selectedCohort?.name} | Outcomes: ${selectedOutcomes.join(", ")}\n`+
  ```
  TO:
  ```
        `Cohort: ${selectedCohort?.name} | Outcomes: ${selectedOutcomes.join(", ")||"Not defined"}\n`+
  ```

- **DO NOT** touch the six-outcome default at `2502-2506`, the `universalCtx` at `2507`, the `buildSolutionFit` prompts at `12225`/`12265` (already say "Not defined"), or `contactRole`'s place in `getBriefSig` (`5655`). **DO NOT** remove the deal-context UI — it stays, un-gated. The section heading on the Step-4 panel may gain the word "(optional)"; nothing else in that panel changes.

---

## Commit 2 — Journey instrumentation (R-32)

Files: `src/App.jsx`

`logJourney(action, detail, stepFrom, stepTo)` is defined at `5505-5521` and POSTs to `session_journey`. Add five events. Every call must be fire-and-forget (it already is) and must never throw if a value is missing.

- **(a) Fit check inputs** — proves or disproves the "scored before the ICP existed" failure. FROM anchor (verified byte-exact, `src/App.jsx:6373-6376`):

> ⚠ ANCHOR DRIFT: block starts at **6375** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
    const scoreFit = async(members, sellerCtx) => {
      if(!members?.length) { console.warn("[scoreFit] No members, skipping"); return; }
      console.log(`[scoreFit] Starting for ${members.length} members, sellerCtx: "${(sellerCtx||"").slice(0,60)}..."`);
      setFitScoring(true);
  ```
  TO:
  ```
    const scoreFit = async(members, sellerCtx) => {
      if(!members?.length) { console.warn("[scoreFit] No members, skipping"); return; }
      console.log(`[scoreFit] Starting for ${members.length} members, sellerCtx: "${(sellerCtx||"").slice(0,60)}..."`);
      // R-32: record what the ICP looked like at scoring time — icp_loading:true here is the §3 race
      logJourney("fit_check_started", {
        members: members.length,
        icp_loading: !!icpLoading,
        catalog_n: (sellerICP?.icp?.productCatalog || []).length,
        customers_n: (sellerICP?.icp?.customerExamples || []).filter(Boolean).length,
        competitors_n: (sellerICP?.icp?.competitiveAlternatives || []).length,
      });
      setFitScoring(true);
  ```

- **(b) Brief first paint.** FROM anchor (verified byte-exact, `src/App.jsx:10625-10627`):

> ⚠ ANCHOR DRIFT: line is at **10627** in current `origin/staging` HEAD. Code text is byte-identical.
> **Precondition note:** `briefStart` is declared at **10642** (2 lines after the anchor in staging) — i.e. *after* `setBrief(skeleton)`. This is consistent with the spec's precondition check. Hare must move `const briefStart = Date.now();` to immediately above `setBrief(skeleton)` and delete the later declaration. Confirm no reference to `briefStart` exists between those two positions before moving; if so, STOP and report.

  ```
      setBrief(skeleton);
      setBriefLoading(false);
      setBriefStatus("");
  ```
  TO:
  ```
      setBrief(skeleton);
      logJourney("brief_first_paint", { company: (member.company || "").slice(0, 200), ms: Date.now() - briefStart });
      setBriefLoading(false);
      setBriefStatus("");
  ```

- **(c) Play rendered.** FROM anchor (verified byte-exact, `src/App.jsx:9453-9456`):

> ⚠ ANCHOR DRIFT: block starts at **9455** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
        setThePlay(validated);
        setPlayState(validatedState || "full");
        playBuiltFromSigRef.current = _playInputSig(brief);
        console.log(`[ThePlay] Built — state:${validatedState || "full"} target:${targetCompany} buyerSig:${playBuiltFromSigRef.current}`);
  ```
  TO:
  ```
        setThePlay(validated);
        setPlayState(validatedState || "full");
        playBuiltFromSigRef.current = _playInputSig(brief);
        logJourney("play_rendered", { company: (targetCompany || "").slice(0, 200), state: validatedState || "full", ms_since_session: Date.now() - dsSessionStart.current });
        console.log(`[ThePlay] Built — state:${validatedState || "full"} target:${targetCompany} buyerSig:${playBuiltFromSigRef.current}`);
  ```

- **(d) ICP confirm** — the Step-1 → Step-2 click, with dwell and whether the user edited anything. FROM anchor (verified byte-exact, `src/App.jsx:16546-16550`):

> ⚠ ANCHOR DRIFT: block starts at **16564** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
                <button className="btn btn-primary btn-lg"
                  onClick={()=>setStep(2)}
                  disabled={!sellerICP&&!icpLoading}>
                  {icpLoading&&!sellerICP?"Building ICP...":"Add Prospects / Target Companies →"}
                </button>
  ```
  TO:
  ```
                <button className="btn btn-primary btn-lg"
                  onClick={()=>{ logJourney("icp_confirm", { edited: (icpEdits||[]).length > 0, edit_n: (icpEdits||[]).length, icp_loading: !!icpLoading, catalog_n: (sellerICP?.icp?.productCatalog||[]).length, customers_n: (sellerICP?.icp?.customerExamples||[]).filter(Boolean).length }); setStep(2); }}
                  disabled={!sellerICP&&!icpLoading}>
                  {icpLoading&&!sellerICP?"Building ICP...":"Add Prospects / Target Companies →"}
                </button>
  ```
  (Dwell is derivable in SQL from the preceding `step_change` to 1 — do not add a timer.)

- **(e) Brief identity mismatch** — only if WO-A has merged and `briefIdentityMismatch` exists at the cache boundary. If it exists, add `logJourney("brief_identity_mismatch", { company: co, reason: identityMismatch })` immediately after its `console.error`. If WO-A has **not** merged, skip (e) and say so in the diff summary; do not implement the gate here.

- **DO NOT** add any event that fires per render or per keystroke. **DO NOT** log ICP field *contents* — counts and booleans only (the table is org-visible telemetry, not a place for seller data).

---

## Commit 3 — Waiting-state copy (R-31)

Files: `src/App.jsx`

Every pending section label becomes *what it is waiting for*. Find each render site by its existing loading-state string and change **only the string** — no structure, no styling.

- The overview placeholder. FROM anchor (verified byte-exact, `src/App.jsx:2968`):

> ⚠ ANCHOR DRIFT: no drift — line is at **2968** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
      companySnapshot: `Researching ${co}...`,
  ```
  TO:
  ```
      companySnapshot: `Researching ${co} — reading filings, news and the company site…`,
  ```
  **CC must confirm** that the `LOADING_STUB = /^Researching /i` test at `9552` (Play quorum) and the `hasOverview` check still match this new string. They match on the prefix `Researching `, so they should; verify with a grep for `/^Researching /` and any other literal comparison to `Researching ${co}...` before staging. If any exact-match comparison exists, **STOP and report** rather than changing it.

- Then, for the section loading states rendered under `brief._loadingSections?.<key>` (overview `18378-18395`, and the sibling blocks for `strategy`, `solutions`, `live`, `roles`, `deepIntel`, `executives` — CC locates each by grepping `_loadingSections?.` and reading the adjacent placeholder text), replace generic placeholder copy with the following, **verbatim**:

  | Section | Waiting copy |
  |---|---|
  | overview | Reading the company's own filings and site… |
  | executives | Verifying leadership against sourced pages… |
  | strategy | Matching what you sell to what they're doing… |
  | solutions | Mapping your product catalog to their situation… |
  | live | Pulling headlines and buying signals… |
  | roles | Reading open positions… |
  | deepIntel | Financials, competitors, board — sourced or left blank… |
  | (the Play, `playState==="building"`) | Building your play from the sourced brief — we don't write until we have the source. |

  The fit score slot on the Step-3 table and the account hero must never show a number while `fitScoring` is true. If a placeholder number exists (e.g. the `?? 50` default in the sort at `17190` is fine — it's sort-only — but any *rendered* `50` or `—%` is not), replace the rendered text with `scoring…`. CC lists every site touched in the diff summary.

- **DO NOT** change section order, collapse state, or any logic. This commit is strings only. If a string change requires touching a comparison, that is a signal to stop.

---

## Commit 4 — The Verdict line (R-40)

Files: `src/App.jsx`

One sentence at the top of the Play card. **Condensed only from sections that already exist and are already source-tagged.** Same call shape and same fabrication guard as the Quick Take at `10700-10768`. Three registers keyed to the fit label. Rendered empty when its sources are empty.

- **Generate it as a sibling of the Quick Take.** Insert immediately AFTER the Quick Take `callAI(...).then(...).catch(() => {});` block — i.e. after the line (verified byte-exact, `src/App.jsx:10760`):

> ⚠ ANCHOR DRIFT: this `}).catch(() => {});` is at **10768** in current `origin/staging` HEAD. Immediately following it (10771) is `// ── onlineSentiment synthesis (fresh build) ──`. Code text is byte-identical.

  ```
          }).catch(() => {});
  ```
  that closes the TL;DR call (CC confirms it is the one preceded by `setBrief(prev => prev ? { ...prev, tldr: cleaned } : prev);` at `10759`), and BEFORE the `// ── onlineSentiment synthesis (fresh build) ──` comment at `10762`. Insert:
  ```
          // ── R-40: the Verdict line — one sourced sentence: "should I care, and why?"
          // Condensed ONLY from strategicTheme + sellerOpportunity + the top signal. Never a new fact.
          {
            const fs = fitScores?.[co];
            const label = fs?.label || "";
            const isComp = !!fs?.isCompetitor || fs?.score === 0;
            const topSignal = (current.recentSignals||[]).filter(Boolean).map(s => typeof s === "string" ? s : (s?.signal || s?.text || "")).find(Boolean) || "";
            const verdictSources = [current.strategicTheme, current.sellerOpportunity, topSignal].filter(Boolean).join("\n");
            if (!isComp && verdictSources.length > 80) {
              const register = label === "Strong Fit"
                ? `REGISTER: Strong fit. Open with "Worth your time —" and give the ONE reason: the buyer's situation first, then why the seller closes that gap.`
                : label === "Potential Fit"
                ? `REGISTER: Potential fit. Open with "Worth a look, if" and name the condition that makes it real, then the angle that works if it is. Two sentences maximum.`
                : `REGISTER: Poor fit. Open with "Probably not —" and name the mismatch plainly, then the one thing that would change it.`;
              callAI(
                `You are a senior sales strategist. Write the VERDICT LINE for a rep about to prospect ${co}.\n\n` +
                `SOURCE (you may use ONLY facts, names and numbers that appear here — nothing else):\n${verdictSources.slice(0, 1500)}\n\n` +
                `${register}\n` +
                `RULES: 40 words maximum. Buyer's situation before seller's relevance. No adjectives that are not in the source. No statistics that are not in the source. Plain prose, no bullet, no label.\n` +
                `Return ONLY raw JSON: {"verdictLine":"..."}`,
                { maxTokens: 150 }
              ).then(r => {
                let v = (r?.verdictLine || "").trim();
                if (!v) return;
                // Same guard class as the Play's Check 7: every number in the verdict must exist in its sources.
                const srcLower = verdictSources.toLowerCase();
                const nums = v.match(/\d[\d,.]*%?/g) || [];
                if (nums.some(n => !srcLower.includes(n.toLowerCase()))) { console.warn("[verdict] stripped — unsourced number"); return; }
                if (v.split(/\s+/).length > 44) { console.warn("[verdict] stripped — too long"); return; }
                setBrief(prev => prev ? { ...prev, verdictLine: v } : prev);
              }).catch(() => {});
            }
          }
  ```
  **CC must confirm** `co`, `current`, `fitScores` and `callAI` are all in scope at that point (they are for the Quick Take block directly above; `fitScores` is component state). If `fitScores` is not reachable inside the `setBrief` updater, hoist `const fs = fitScores?.[member.company];` to just above `allDone.then(` at `10704` and reference it. Note the proper-noun check in spec §11 is deferred: numbers are validated here; a name check needs a tokenizer that isn't in the file and is out of scope for this commit — say so in the diff summary.

- **Persist it with the brief.** FROM anchor (verified byte-exact, `src/App.jsx:11717`):

> ⚠ ANCHOR DRIFT: line is at **11719** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
              tldr: current.tldr,
  ```
  TO:
  ```
              tldr: current.tldr,
              verdictLine: current.verdictLine,
  ```

- **Render it at the top of the Play card**, above Situation. FROM anchor (verified byte-exact, `src/App.jsx:17578`):

> ⚠ ANCHOR DRIFT: line is at **17596** in current `origin/staging` HEAD. Code text is byte-identical.

  ```
                        {play.situation&&<div style={rowStyle}><span style={labStyle}>Situation</span><span style={{fontSize:13,color:V.txt}}>{play.situation}</span></div>}
  ```
  TO:
  ```
                        {brief?.verdictLine&&<div style={{...rowStyle,marginBottom:10}}><span style={labStyle}>Verdict</span><span style={{fontSize:14,color:V.txt,fontWeight:600,lineHeight:1.5}}>{brief.verdictLine}</span></div>}
                        {play.situation&&<div style={rowStyle}><span style={labStyle}>Situation</span><span style={{fontSize:13,color:V.txt}}>{play.situation}</span></div>}
  ```
  **CC must confirm** `brief` is in scope in that render block (it is used two lines up via `fitDrift`/`fitScores` — verify) and that `rowStyle`/`labStyle`/`V` are the same objects used by the Situation row.

- **DO NOT** add the verdict to the Play prompt, the Play object, or `validatePlay` — it is a *brief* field, generated after the consistency validator, exactly like `tldr`. **DO NOT** render it on the Step-3 table or the account hero in this commit. **DO NOT** generate it for competitors (the badge does the talking) or when the sources are under 80 chars (empty beats wrong).

---

## QA gate (before Joe pushes)

Offline / free:
- `npm run lint` · `npm run test:lint` · `npm run test:backtest`
- Grep gate for Commit 3: `grep -n "Researching \${" src/App.jsx` and `grep -n "/^Researching /" src/App.jsx` — every match must still be prefix-compatible.

Live on **staging.cambree.ai**:
1. **Commit 1.** Pick an account with **zero** outcomes selected → Build Brief is enabled → brief builds → the SA section says "OUTCOMES SOUGHT: Not defined" → post-call prompt shows "Outcomes: Not defined". Then repeat with two outcomes selected and confirm they appear as before.
2. **Commit 2.** Run one full session; query `session_journey` for that `session_id`: expect exactly one `fit_check_started` (with `icp_loading:false` on the normal path), one `icp_confirm`, one `brief_first_paint` with `ms` < 1500, and one `play_rendered`. **Also** run the §3 race deliberately: enter the seller URL and paste targets fast enough that scoring fires before the ICP finishes; confirm `fit_check_started` records `icp_loading:true` and `customers_n:0`. That row is the proof the instrumentation works — and the baseline for WO-D.
3. **Commit 3.** Watch a cold-cache brief build: every pending section shows its "waiting for…" copy; no rendered fit number appears while `fitScoring` is true; the Play quorum still fires (console `[ThePlay] Data quorum met`).
4. **Commit 4.** Three runs: a Strong account (Cirium → Southwest works, 79), a Potential account, a Poor one. Verdict line renders with the right register; ≤40 words; every number in it exists in Strategic Theme / Why You·Why Now / top signal. Run a competitor (Cirium → FlightAware): **no verdict line.** Reload the saved session: the verdict persists (Commit 4's cache write).

Golden-run gate:
- `npm run test:golden` (**ask Joe — live API, costs money**). Include **Stripe** and **Boeing**. No scoring changes are made in this order, so any score delta is a regression — reject on any correctly-scored target moving.

## Blast radius

- Commit 1: the Step-4 panel and the post-call prompt only. Every other consumer already handles empty.
- Commit 2: telemetry writes (fire-and-forget, `.catch(() => {})`). Zero product behaviour change. `session_journey` row volume rises by ~4 per session.
- Commit 3: strings only. The one real risk is the `Researching ` prefix contract at `9552`; the grep gate covers it.
- Commit 4: one extra Haiku call (~150 tokens) per brief after `allDone`; one new field on the brief object and in the cache payload. It runs in the same post-validator window as Quick Take, so it does not add concurrency to the p1–p9 waves. Nothing touches scoring, the Play prompt, or `validatePlay`.
- Nothing here touches auth, billing, RLS, migrations or the Anthropic proxy — `/security-review` is not required.

## Rollback

Single revert of the branch merge. No schema change (the `session_journey` `detail` column is `jsonb`; new `action` values need no migration). No data written that must be undone. Each commit is independently revertible; Commit 4 can be neutralised by making the `verdictSources.length > 80` guard `false`.

## Explicitly OUT of scope

- **R-29 seller-profile card, R-30 auto-open, R-33 control variant → WO-D**, after WO-A merges and 14 days of Commit-2 data exist.
- **R-34 re-score on ICP change / regenerate** (the F-047 fix), R-35 backfill re-trigger, R-36 auto-persist all ICP edits — Phase 2.
- Any step renumbering (R-39), Milton `stepGuide` copy, the command-palette labels.
- The verdict's proper-noun validator and its use in the one-pager export / HubSpot push — follow-ons once the line exists.
- The pitch-deck factual nits surfaced by the competitor research (Reevo "seed" → "back"; Highspot+Seismic now one company) — deck, not code.
