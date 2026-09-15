# CC WORK ORDER E1 — Account context: data model, capture, and staleness plumbing (expansion & multi-brand, part 1 of 3)

Authored: 2026-09-15 · Preflight base: `staging` @ `c8d15a7` · Repo `/Users/joe/Projects/cambrian-playbook`
Rules (for implementation — CC does not execute these): **one logical change per commit.** Stage → `git diff --cached` → **STOP for Joe's approval.** Joe owns all commits, pushes and deploys.
Issue: **#178** · Branch (implementation): `feature/issue-178-account-context-capture`. Cut from `staging` after WO-A + Amendment 1 merges.
Design + evidence: `02_DesignRecord/AdversarialReview_and_Decisions.md` (risk IDs H/C/X/D cited below), mockup `02_DesignRecord/Mockup_TodayVsProposed.html`, diff `02_DesignRecord/VisualDiff.md`.
**Sequencing:** lands **after** WO-A + WO-A Amendment 1 merge (Commit 4 here anchors on the amended cache read/write). May land before or after WO-C; it does not touch the Build Brief gate.

Anchor verification status (re-verified against `origin/staging` HEAD `aff7537`, 2026-09-15):
- `:1797` — byte-exact: `// Stable djb2 hash over the seller's uploaded docs + free-form ICP notes.`
- `:5522` — byte-exact: `const setStep=(n)=>{…};`
- `:5657` — byte-exact: `const getBriefSig = () => JSON.stringify([…contactRole]);`
- `:5676` — byte-exact: `const[mapping,setMapping]=useState({company:"",…geography:""});`
- `:5767` — byte-exact: `const solConEnabled = (()=>{…})();`
- `:6120-6121` — byte-exact: product / outcome auto-map lines
- `:9740` — byte-exact: `const companiesStr = needsId.map(…).join("\n");`
- `:9749` — byte-exact: `` `Companies (Name|URL):\n${companiesStr}\n\n` + ``
- `:9851-9858` — byte-exact: `const members = entries.map(e => ({…}));`
- `:10023` — **⚠ ANCHOR DRIFT**: stated as `:10023` in the order; at HEAD `aff7537` this line contains code inside `retryExecSearch`. `const pickAccount = async (member, overrideSellerUrl, forceRebuild = false) => {` is now at **line 10025** (+2). Code string matches byte-for-byte.
- `:16842` — byte-exact: `onBlur={()=>{if(entry.name.trim()&&!entry.url.trim()) suggestUrl(entry.name, i);}}`
- `:16899` — byte-exact: field list array literal opening
- `:402-408` — byte-exact: `buildCohorts` variable declarations + push
- `:1217-1218` — byte-exact: `async function streamAI(` + `const sleep = ms => …`
- `:1412-1413` — byte-exact: `async function callAI(` + `const d = await claudeFetch({`
- `:17374-17376` — byte-exact: Deal context column comment + div + Deal Context label

**Note:** Commit 4b/4c anchors reference WO-A Amendment 1's TO text (the `_parent`/`_unit` lines and the `parentMatches` admission condition). These are contingent on WO-A Amendment 1 being applied first. Verify against the actual state of the implementation branch, not the staging snapshot.

---

## Standing rules for every commit in this order

1. **Anti-fabrication is P0. Empty beats wrong.** Nothing in this order may add a prompt path that lets the model state a fact the user did not type or a source did not return. This order adds *no prompt text* (that is WO-E2); it must not change any prompt string by even one byte.
2. **Identity contamination is the recurring failure mode.** A brand/unit row must never inherit its parent's domain as `company_url` (rule C3). Name-only identification of a unit is a contamination vector (C2) — this order records the parent so WO-E3 can use it; it does not change identification.
3. **Zero regression contract.** A member with none of the new fields set — and the whole product with the flag off — must produce: the same member object shape (plus undefined keys), the same fit score, the same Step 3/4 DOM, and **byte-identical prompt strings**. Commit 4 installs the tap that proves it.
4. **Feature flag, default OFF.** Everything user-visible is gated on `localStorage["cc_account_context"] === "on"`. Joe flips it on staging for QA. Rollout by org id is a later order (WO-D pattern).
5. **Nothing customer-specific.** Every field has a non-CPG use case. Do not add anything that names a customer, a data vendor, or a vertical.
6. **No scoring changes.** `src/lib/fitScoring.js`, `scoreFit`, the competitor rule at `~6420`, and Option C weights are not touched.
7. **No migrations.** Members persist inside `cohorts[]` in the session blob; new keys ride along. New cache keys go in `account_outputs.data` (jsonb).
8. **Re-verify every FROM anchor** against current `staging` before editing. On byte drift, add `> ⚠ ANCHOR DRIFT:` with the current text and line, and continue; Joe decides. Never rewrite the code block.
9. **Do not attribute Claude on GitHub** (commits, PR bodies, comments).
10. After each staged diff, run the `diff-reviewer` subagent and report PASS / CONCERNS / BLOCK with file:line before Joe looks.

---

## Context

Cambree treats every target as a cold new logo. The only "existing customer" signal today is the **Known Customer** preset in the Add Intel modal (`:20217`), which is a `+40` score modifier that reaches the fit display and Milton (`:13426`) but **never** `generateBrief`, the Play, the hypothesis, or outreach. Users selling into multi-brand parents (P&G brands, Inspire-owned QSR chains, Oracle Health under Oracle) have no way to say *which* unit they mean; and "what we sell them" has a CSV column (`product`, auto-mapped at `:6120`) that nothing downstream reads.

This order adds five optional fields to the account object and captures them at entry (Quick Entry, CSV) and at Step 4, and fixes two staleness bugs the fields would otherwise expose: the brief cache decision ignores account-level context (`:10093`, review B2) and `getBriefSig` (`:5657`, review B3) does not include the new fields. It changes **no prompt** and **no score**.

Fields on `member` (all optional; absent ⇒ today's behavior):

| Field | Type | Rule |
|---|---|---|
| `relationship` | `"new" \| "existing"` | absent = new. Normalized on import. |
| `parentCompany` | string | name as typed; `parentDomain` derived if the user typed a domain |
| `parentDomain` | string | derived only; **never** copied into `company_url` (C3) |
| `unit` | string | brand / division / category. When set with a parent, `company = unit` (the unique key). **Immutable after entry** (X3). |
| `currentScope` | string ≤ 600 chars | free text; only meaningful when `relationship = "existing"` |
| `targetOffer` | string | catalog product name, or free text (treated as a label, not a spec — H2, enforced in WO-E2) |

---

## Commit 1 — Flag, helpers, single member setter, Quick Entry capture

Files: `src/App.jsx`

**(a) Module-level flag + normalizer + account fingerprint.** Insert the block below immediately **ABOVE** this comment line.
FROM anchor (verified byte-exact, `src/App.jsx:1797`):
```
// Stable djb2 hash over the seller's uploaded docs + free-form ICP notes.
```
INSERT ABOVE (leave the anchor line unchanged):
```
// ── ACCOUNT CONTEXT (WO-E1) ──────────────────────────────────────────────────
// Flag: localStorage cc_account_context = "on" enables capture UI + prompt blocks.
// Default OFF. With the flag off, every helper below returns the no-fields value,
// so prompts, scores and DOM are byte-identical to pre-E1 behavior.
function accountCtxOn() { try { return localStorage.getItem("cc_account_context") === "on"; } catch { return false; } }
// Import normalizer: CRM exports say "Customer", "Client", "Existing", "Current", "Yes";
// anything else (Prospect, Churned, Former, blank) is a new logo for this pass.
function normalizeRelationship(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "new";
  return /^(existing|existing customer|customer|client|current|active|yes|true|1)$/.test(s) ? "existing" : "new";
}
// Account-level fingerprint (review B2 / $4): relationship, parent, unit, scope, offer,
// and the account docs' names+lengths. "0" = no account context. Compared on cache read
// beside _ctxFp; absent on old rows → treated as "0" → old rows keep serving for no-field runs.
function acctFingerprint(member = {}, accountDocs = []) {
  const parts = [
    member.relationship === "existing" ? "existing" : "",
    member.parentCompany || "", member.unit || "", (member.currentScope || "").slice(0, 600), member.targetOffer || "",
    (accountDocs || []).map(d => d.name + ":" + (d.content || "").length).join("|"),
  ];
  const src = parts.join("§");
  if (src === "§§§§§") return "0";
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
```

**(b) Component flag alias.** FROM anchor (verified byte-exact, `src/App.jsx:5767`):
```
  const solConEnabled = (() => { try { return localStorage.getItem("cc_sol_consolidation") !== "off"; } catch { return true; } })();
```
TO:
```
  const solConEnabled = (() => { try { return localStorage.getItem("cc_sol_consolidation") !== "off"; } catch { return true; } })();
  const acctCtxEnabled = accountCtxOn(); // WO-E1: default OFF; Joe flips on staging for QA
```

**(c) Single member setter (review X2).** `selectedAccount` is a spread copy of a cohort member (`:17044` `return [...prev,{...m}]`), and `accountQueue` holds more copies. Every write to the new fields must go through one function that updates all three. Insert immediately **AFTER** this line.
FROM anchor (verified byte-exact, `src/App.jsx:5522`):
```
  const setStep=(n)=>{const prev=_step;_setStep(n);window.scrollTo({top:0,behavior:"smooth"});logJourney("step_change",{from:prev,to:n},prev,n);};
```
INSERT AFTER:
```
  // WO-E1: the ONLY write path for account-context fields. Updates the cohort member,
  // the queue copy, and selectedAccount in one go (they are separate object copies).
  // `unit` and `company` are deliberately not settable here — the company key is immutable after entry (X3).
  const updateMemberField = (company, patch) => {
    const allowed = ["relationship","parentCompany","parentDomain","currentScope","targetOffer"];
    const safe = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => allowed.includes(k)));
    if (!company || !Object.keys(safe).length) return;
    setCohorts(prev => prev.map(c => ({ ...c, members: c.members.map(m => m.company === company ? { ...m, ...safe } : m) })));
    setAccountQueue(prev => prev.map(m => m.company === company ? { ...m, ...safe } : m));
    setSelectedAccount(prev => (prev && prev.company === company) ? { ...prev, ...safe } : prev);
    Object.keys(safe).forEach(field => logJourney("account_ctx_set", { company, field, existing: safe.relationship === "existing" || undefined }));
  };
```
- `setAccountQueue` and `setSelectedAccount` exist (`:17041`, `:17105`). If either name differs at HEAD, **STOP and report.**

**(d) Quick Entry — capture at entry, with rule C3.**
Row state gains `relationship`, `parent`, `unit`. Existing literals `{name:"",url:""}` at `:16846`, `:16857`, `:16876`, `:16880` are **left untouched** (absent = new logo).

Render the toggle and the disclosure only when `acctCtxEnabled`. FROM anchor (verified byte-exact, `src/App.jsx:16842`):
```
                      onBlur={()=>{if(entry.name.trim()&&!entry.url.trim()) suggestUrl(entry.name, i);}}
```
TO:
```
                      onBlur={()=>{if(entry.name.trim()&&!entry.url.trim()&&!(entry.parent||"").trim()) suggestUrl(entry.name, i);}}
```
(C3: a unit under a parent must not get an auto-suggested domain — a wrong site is worse than none; the parent supplies research context in WO-E3.)

Then, inside the same row `<div>` (the one opened at `:16835`), **after** the URL `<div style={{flex:1,position:"relative"}}>…</div>` block and **before** the `{quickEntries.length>1&&(` remove button (`:16867`), insert:
```
                    {acctCtxEnabled && (<>
                      <span role="group" aria-label="Relationship" style={{display:"inline-flex",border:"1.5px solid var(--line-0)",borderRadius:"var(--r-pill)",overflow:"hidden",fontSize:10,fontWeight:700}}>
                        {[["new","New logo"],["existing","Existing"]].map(([v,l])=>(
                          <button key={v} type="button" onClick={()=>setQuickEntries(prev=>prev.map((x,j)=>j===i?{...x,relationship:v}:x))}
                            style={{padding:"3px 8px",border:"none",cursor:"pointer",background:(entry.relationship||"new")===v?"var(--ink-0)":"transparent",color:(entry.relationship||"new")===v?"var(--surface)":"var(--ink-2)"}}>{l}</button>
                        ))}
                      </span>
                      <button type="button" className="btn btn-secondary btn-sm" style={{fontSize:10}}
                        onClick={()=>setQuickEntries(prev=>prev.map((x,j)=>j===i?{...x,_showParent:!x._showParent}:x))}>
                        {entry._showParent ? "− parent / brand" : "＋ parent / brand"}
                      </button>
                      {entry._showParent && (
                        <div style={{flexBasis:"100%",display:"flex",gap:8,paddingLeft:38,marginTop:-2}}>
                          <input type="text" value={entry.parent||""} placeholder="Parent company (name or domain)" style={{flex:"0 0 240px",fontSize:12}}
                            onChange={e=>setQuickEntries(prev=>prev.map((x,j)=>j===i?{...x,parent:e.target.value}:x))}/>
                          <input type="text" value={entry.unit||""} placeholder="Brand / division / category" style={{flex:"0 0 240px",fontSize:12}}
                            onChange={e=>setQuickEntries(prev=>prev.map((x,j)=>j===i?{...x,unit:e.target.value}:x))}/>
                          <span style={{fontSize:10.5,color:"var(--ink-3)",alignSelf:"center"}}>Targeting a brand or division inside a bigger company? Name both so the brief researches the right one.</span>
                        </div>
                      )}
                    </>)}
```
- If the URL `<div>` block's closing line cannot be identified unambiguously, **STOP and report** with the surrounding lines.

**(e) Quick Entry → members.** FROM anchor (verified byte-exact, `src/App.jsx:9851-9858`):
```
    const members = entries.map(e => ({
      company: e.name.trim(),
      company_url: (e.url || e._suggested || "").trim(),
      ind: "",
      employees: "",
      publicPrivate: "",
      acv: 0, src: (sellerICP?.marketCategory || "Imported Accounts"), outcome: "",
    }));
```
TO:
```
    const members = entries.map(e => {
      // WO-E1: a unit under a parent is keyed by the unit name; the parent is metadata (C3, X3).
      const parent = (e.parent || "").trim();
      const unit   = (e.unit || "").trim();
      const parentDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parent.replace(/^https?:\/\//,"").replace(/^www\./,"")) ? parent.replace(/^https?:\/\//,"").replace(/^www\./,"").toLowerCase() : "";
      const company = (parent && unit) ? unit : e.name.trim();
      return {
        company,
        company_url: parent ? (e.url || "").trim() : (e.url || e._suggested || "").trim(), // C3: never auto-suggest a domain for a parented row
        ind: "",
        employees: "",
        publicPrivate: "",
        acv: 0, src: (sellerICP?.marketCategory || "Imported Accounts"), outcome: "",
        ...(accountCtxOn() && e.relationship === "existing" ? { relationship: "existing" } : {}),
        ...(accountCtxOn() && parent ? { parentCompany: parent, ...(parentDomain ? { parentDomain } : {}), ...(unit ? { unit } : {}) } : {}),
      };
    });
```
- **Duplicate-key guard (X4):** immediately after `members` is built, add:
```
    const _dupes = members.map(m => m.company).filter((c, i, a) => a.indexOf(c) !== i);
    if (_dupes.length) { alert(`Two rows share the name "${_dupes[0]}". Give each brand/division a distinct name (e.g. "${_dupes[0]} (${members.find(m=>m.company===_dupes[0])?.parentCompany||"parent"})").`); return; }
```
  (`alert` is acceptable here — F-026 tracks replacing native dialogs; do not build a new modal.)
- The `syntheticRows` block at `:9859-9863` is display-only for the mapping card; leave it unchanged.
- DO NOT change `enrichAndScore`, `setStep(3)`, or the cohort object.

**Commit 1 diff summary CC must state:** with the flag off, `members` objects are byte-identical to today (verify by diffing `JSON.stringify(members)` for two name-only entries before/after).

---

## Commit 2 — CSV import: four optional mapping rows, auto-map, normalizer, preview count

Files: `src/App.jsx`

**(a) Mapping state.** FROM anchor (verified byte-exact, `src/App.jsx:5676`):
```
  const[mapping,setMapping]=useState({company:"",industry:"",acv:"0",lead_source:"",close_date:"",product:"",outcome:"",company_url:"",employees:"",public_private:"",geography:""});
```
TO:
```
  const[mapping,setMapping]=useState({company:"",industry:"",acv:"0",lead_source:"",close_date:"",product:"",outcome:"",company_url:"",employees:"",public_private:"",geography:"",relationship:"",parent:"",unit:"",current_scope:""});
```

**(b) Auto-map.** FROM anchor (verified byte-exact, `src/App.jsx:6120-6121`):
```
      if(hn.includes("product")||hn.includes("solution"))am.product=h;
      if(hn.includes("outcome")||hn.includes("goal"))am.outcome=h;
```
TO:
```
      if(hn.includes("product")||hn.includes("solution"))am.product=h;
      if(hn.includes("outcome")||hn.includes("goal"))am.outcome=h;
      // WO-E1: optional account-context columns (flag-gated — never auto-map when off)
      if(accountCtxOn()){
        if(hn.includes("relationship")||hn==="status"||hn==="type"||hn.includes("customerstatus")||hn.includes("existing"))am.relationship=h;
        if(hn.includes("parent")||hn.includes("ultimateparent"))am.parent=h;
        if(hn.includes("brand")||hn.includes("division")||hn.includes("businessunit")||hn==="unit"||hn.includes("category"))am.unit=h;
        if(hn.includes("scope")||hn.includes("currentscope")||hn.includes("whatwedo"))am.current_scope=h;
      }
```
- `n()` strips spaces/underscores (`:6112`), so `"Customer Status"` → `customerstatus`. Keep `hn==="status"` / `hn==="type"` exact-match to avoid grabbing `lead_status`-style columns.

**(c) Field list on the mapping card.** FROM anchor (verified byte-exact, `src/App.jsx:16899`):
```
                    {[{key:"company",label:"Company / Account",req:true},{key:"industry",label:"Industry / Vertical",req:true},{key:"lead_source",label:"Lead Source",req:true},{key:"company_url",label:"Company Website URL"},{key:"employees",label:"Employee Count"},{key:"public_private",label:"Public / Private"},{key:"geography",label:"Domestic / International"},{key:"close_date",label:"Close Date"},{key:"product",label:"Product / Solution"},{key:"outcome",label:"Customer Outcome"},].map(f=>(
```
TO:
```
                    {[{key:"company",label:"Company / Account",req:true},{key:"industry",label:"Industry / Vertical",req:true},{key:"lead_source",label:"Lead Source",req:true},{key:"company_url",label:"Company Website URL"},{key:"employees",label:"Employee Count"},{key:"public_private",label:"Public / Private"},{key:"geography",label:"Domestic / International"},{key:"close_date",label:"Close Date"},{key:"product",label:acctCtxEnabled?"Product / Solution → Target offer":"Product / Solution"},{key:"outcome",label:"Customer Outcome"},...(acctCtxEnabled?[{key:"relationship",label:"Relationship (new / existing)"},{key:"parent",label:"Parent Company"},{key:"unit",label:"Brand / Division / Category"},{key:"current_scope",label:"Current Scope (what we do today)"}]:[])].map(f=>(
```

**(d) `buildCohorts` — read the columns into the member.** FROM anchor (verified byte-exact, `src/App.jsx:402-408`):
```
          product  = get(row,"product"),
          company_url   = get(row,"company_url") || "",
          employees     = get(row,"employees")   || "",
          publicPrivate = get(row,"public_private") || "",
          geography     = get(row,"geography") || "";
    if(!groups[band]) groups[band]=[];
    groups[band].push({row,ind,band,src,outcome,company,product,company_url,employees,publicPrivate,geography});
```
TO:
```
          product  = get(row,"product"),
          company_url   = get(row,"company_url") || "",
          employees     = get(row,"employees")   || "",
          publicPrivate = get(row,"public_private") || "",
          geography     = get(row,"geography") || "",
          // WO-E1: account context (only when the flag is on AND the column was mapped)
          _rel     = accountCtxOn() && mapping.relationship ? normalizeRelationship(get(row,"relationship")) : "",
          _parent  = accountCtxOn() ? get(row,"parent") : "",
          _unit    = accountCtxOn() ? get(row,"unit") : "",
          _scope   = accountCtxOn() ? get(row,"current_scope").slice(0,600) : "";
    if(!groups[band]) groups[band]=[];
    groups[band].push({row,ind,band,src,outcome,company:(_parent&&_unit)?_unit:company,product,company_url,employees,publicPrivate,geography,
      ...(_rel==="existing"?{relationship:"existing"}:{}),
      ...(_parent?{parentCompany:_parent,...(_unit?{unit:_unit}:{})}:{}),
      ...(_scope?{currentScope:_scope}:{}),
      ...(accountCtxOn()&&product?{targetOffer:product}:{})});
```
- `product` already flows into the member today (`:408`); `targetOffer` mirrors it only when the flag is on, so WO-E2's consumer is flag-gated end to end. **DO NOT** remove `product` from the push.
- C3 applies: a CSV row with a parent keeps whatever `company_url` the CSV supplied (the user's data), but nothing derives one.

**(e) Preview count (review X7).** In the Preview card (`:16910-16918`), after the `<table className="tbl">…</table>` and inside `.tbl-wrap`'s parent card, add — flag-gated:
```
                  {acctCtxEnabled && (mapping.relationship||mapping.parent) && (()=>{
                    const ex = mapping.relationship ? rows.filter(r=>normalizeRelationship(r[mapping.relationship])==="existing").length : 0;
                    const pa = mapping.parent ? rows.filter(r=>(r[mapping.parent]||"").toString().trim()).length : 0;
                    return <div style={{fontSize:12,color:"var(--ink-2)",marginTop:8}}>{ex} row{ex===1?"":"s"} → Existing customer · {pa} row{pa===1?"":"s"} have a parent · everything else → New logo</div>;
                  })()}
```
- If the Preview card's structure at HEAD differs from `:16910-16918`, **STOP and report.**
- DO NOT change `goToCohorts`, the F-049 junk-row behavior, or `getOutcomeTheme`.

---

## Commit 3 — Step 4: `AccountContextPanel` (optional, self-contained, flag-gated)

Files: `src/App.jsx`

One component so WO-D can move it without re-plumbing (review D4). It renders **above** the existing Deal Context fields and requires nothing. It never renders when the flag is off.

**(a) Component.** Insert immediately **ABOVE** the `pickAccount` declaration (WO-A also inserts its `briefIdentityMismatch` helper above the same line — place this block **above WO-A's helper** so both remain contiguous with `pickAccount`).
Anchor (verified byte-exact at `c8d15a7`; at HEAD `aff7537` now at **line 10025** — +2; WO-A inserts above it — re-verify):
```
  const pickAccount = async (member, overrideSellerUrl, forceRebuild = false) => {
```
INSERT ABOVE:
```
  // WO-E1: Account context (optional) — the edit surface for fields captured at entry.
  // Writes only through updateMemberField. `unit` / company are not editable here (X3).
  const AccountContextPanel = ({ member }) => {
    if (!acctCtxEnabled || !member) return null;
    const rel = member.relationship === "existing" ? "existing" : "new";
    const catalog = (products || []).filter(p => p?.name?.trim()).map(p => p.name.trim());
    const offerInCatalog = catalog.includes(member.targetOffer || "");
    return (
      <div style={{marginBottom:12,paddingBottom:10,borderBottom:"1px dashed var(--line-1)"}}>
        <div style={{fontSize:10,fontWeight:700,color:"var(--ink-2)",textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:8}}>Account context <span style={{fontWeight:600,textTransform:"none",letterSpacing:0,color:"var(--ink-3)"}}>· optional — it works without it</span></div>
        <div style={{marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--ink-1)",marginBottom:4}}>Relationship</div>
          <span role="group" aria-label="Relationship" style={{display:"inline-flex",border:"1.5px solid var(--line-0)",borderRadius:"var(--r-pill)",overflow:"hidden",fontSize:11,fontWeight:700}}>
            {[["new","New logo"],["existing","Existing customer"]].map(([v,l])=>(
              <button key={v} type="button" onClick={()=>updateMemberField(member.company,{relationship:v})}
                style={{padding:"4px 10px",border:"none",cursor:"pointer",background:rel===v?"var(--ink-0)":"transparent",color:rel===v?"var(--surface)":"var(--ink-2)"}}>{l}</button>
            ))}
          </span>
          {member.parentCompany && <div style={{fontSize:10.5,color:"var(--ink-3)",marginTop:4}}>↳ {member.parentCompany}{member.unit?` · ${member.unit}`:""} — set at entry; to rename a brand, remove and re-add the row.</div>}
        </div>
        {rel==="existing" && (
          <div style={{marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--ink-1)",marginBottom:4}}>Current scope — what we do for them today</div>
            <textarea value={member.currentScope||""} maxLength={600} placeholder="e.g. Packaging artwork for two product lines since 2024 · contact is the brand coordinator"
              onChange={e=>updateMemberField(member.company,{currentScope:e.target.value.slice(0,600)})}
              style={{width:"100%",minHeight:56,padding:8,borderRadius:8,border:"1.5px solid var(--line-0)",fontSize:12.5,fontFamily:"var(--font-sans)",resize:"vertical",boxSizing:"border-box"}}/>
          </div>
        )}
        <div style={{marginBottom:4}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--ink-1)",marginBottom:4}}>Target offer — what we want to sell them</div>
          <select value={offerInCatalog ? member.targetOffer : ""} style={{fontSize:13,width:"100%"}}
            onChange={e=>updateMemberField(member.company,{targetOffer:e.target.value})}>
            <option value="">— pick from your product catalog —</option>
            {catalog.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
          <input type="text" value={offerInCatalog ? "" : (member.targetOffer||"")} placeholder="…or describe it (treated as a label — capabilities come from your catalog)"
            onChange={e=>updateMemberField(member.company,{targetOffer:e.target.value.slice(0,120)})}
            style={{width:"100%",fontSize:12,marginTop:5}}/>
        </div>
        <div style={{fontSize:10.5,color:"var(--ink-3)",marginTop:6,lineHeight:1.45}}>Text you type here is treated as fact and cited as seller-provided. Uploaded documents are excerpted — the first 800 characters of each are used.</div>
      </div>
    );
  };
```
- `products` is the seller catalog state (`:15371` "Product / Solution Catalog"; consumed as `products.filter(p=>p.name.trim())` at `:2499`). If the state name differs at HEAD, **STOP and report.**
- The "first 800 characters" figure is the literal at `:2623`. If a later order raises it, update this string in that order.

**(b) Mount it.** FROM anchor (verified byte-exact, `src/App.jsx:17374-17376`):
```
                  {/* Deal context column */}
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--ink-2)",textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:10}}>Deal Context</div>
```
TO:
```
                  {/* Deal context column */}
                  <div>
                    <AccountContextPanel member={sa} />
                    <div style={{fontSize:10,fontWeight:700,color:"var(--ink-2)",textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:10}}>Deal Context</div>
```
- `sa` is `selectedAccount` in this scope (`:17209`). Because `updateMemberField` also updates `selectedAccount`, the panel re-renders from the same object.
- DO NOT touch Deal Value, Revenue Classification, the outcomes picker, or the Build Brief button/gate (WO-C owns `:17450-17458`).

---

## Commit 4 — Staleness plumbing + prompt tap for the regression contract

Files: `src/App.jsx`

**(a) `getBriefSig` (review B3 / X1).** FROM anchor (verified byte-exact, `src/App.jsx:5657`):
```
  const getBriefSig = () => JSON.stringify([selectedAccount?.company, sellerICP?.marketCategory, icpEdits.length, contactRole]);
```
TO:
```
  const getBriefSig = () => JSON.stringify([selectedAccount?.company, sellerICP?.marketCategory, icpEdits.length, contactRole, acctFingerprint(selectedAccount, accountDocs)]);
```
- For a member with no fields and no account docs, `acctFingerprint` returns `"0"` — the signature gains one constant element; regeneration behavior is unchanged for today's users.

**(b) Cache write stamps `_acctFp`.** Apply on top of WO-A Amendment 1. FROM anchor (Amendment 1's TO text at `:11721-11724` — **contingent on WO-A Amendment 1 being applied first**):
```
            _ctxFp: ctxFingerprint(sellerDocs, sellerICPInput), // #65: cache read rejects on mismatch
            _parent: (member.parentCompany || "").slice(0, 120) || undefined, // WO-A/1: identity of the parent this brief was built under
            _unit:   (member.unit || "").slice(0, 120) || undefined,
```
TO:
```
            _ctxFp: ctxFingerprint(sellerDocs, sellerICPInput), // #65: cache read rejects on mismatch
            _parent: (member.parentCompany || "").slice(0, 120) || undefined, // WO-A/1: identity of the parent this brief was built under
            _unit:   (member.unit || "").slice(0, 120) || undefined,
            _acctFp: acctFingerprint(member, accountDocs), // WO-E1: relationship/scope/offer/parent/docs — read rejects on mismatch
            _relationship: member.relationship === "existing" ? "existing" : undefined, // dataset: expansion vs new-logo briefs
            _targetOffer:  (member.targetOffer || "").slice(0, 120) || undefined,
```
- `accountDocs` must be in scope at the write site (it is passed into `generateBrief` at `:10609` and the write happens inside the brief flow). If it is not in scope at HEAD, **STOP and report** rather than threading a new parameter in this commit.

**(c) Cache read compares `_acctFp`.** FROM anchor (Amendment 1's TO text following `:10093` — **contingent on WO-A Amendment 1 being applied first**):
```
              const parentMatches = ((cd._parent || "") === (member.parentCompany || ""));
```
TO:
```
              const parentMatches = ((cd._parent || "") === (member.parentCompany || ""));
              // WO-E1 (B2): a brief built without this account context must not serve a run that has it (and vice versa).
              const acctFpMatches = (cd._acctFp || "0") === acctFingerprint(member, accountDocs);
              if (!acctFpMatches) console.log(`[brief-cache] Account-context fp mismatch for ${co} (cached "${cd._acctFp || "0"}") — regenerating`);
```
and extend the admission line by one term:
```
              if (ageDays < 7 && hasCritical && cachePromptVersion >= BRIEF_CACHE_VERSION && ctxFpMatches && !identityMismatch && parentMatches && acctFpMatches) {
```
- **DO NOT** bump `BRIEF_CACHE_VERSION` (Joe's decision 9/15 — a bump rebuilds every org's briefs).

**(d) Prompt tap — the instrument for the zero-regression contract.** Two one-line inserts, no behavior when the tap is undefined.
FROM anchor (verified byte-exact, `src/App.jsx:1412-1413`):
```
async function callAI(prompt, { maxTokens = 5500, skipJsonSuffix = false, model: modelOverride = null, system: systemOverride = null } = {}){
  const d = await claudeFetch({
```
TO:
```
async function callAI(prompt, { maxTokens = 5500, skipJsonSuffix = false, model: modelOverride = null, system: systemOverride = null } = {}){
  try { if (typeof window !== "undefined" && typeof window.__cambreePromptTap === "function") window.__cambreePromptTap({ kind: "callAI", prompt, system: systemOverride }); } catch { /* QA tap only */ }
  const d = await claudeFetch({
```
FROM anchor (verified byte-exact, `src/App.jsx:1217-1218`):
```
async function streamAI(prompt, onChunk, maxTok=2000, { model = null, signal = null, system = null } = {}) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
```
TO:
```
async function streamAI(prompt, onChunk, maxTok=2000, { model = null, signal = null, system = null } = {}) {
  try { if (typeof window !== "undefined" && typeof window.__cambreePromptTap === "function") window.__cambreePromptTap({ kind: "streamAI", prompt, system }); } catch { /* QA tap only */ }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
```
- The tap is never set by product code. QA sets it from the console (see gate). Nothing is logged, stored, or sent when it is undefined.

---

## QA gate (before Joe pushes)

**Offline / free tiers**
- `npm run test:lint` and `npm run test:backtest` pass. Do **not** run `test:golden*` (paid; not a drift net yet).
- `npm run lint` clean.

**Regression contract — prompt snapshot (the point of Commit 4d)**
1. On staging with the flag **off**, before merging this branch: in the console run
   `window.__p=[];window.__cambreePromptTap=x=>window.__p.push(x.kind+"\n"+(x.system||"")+"\n"+x.prompt);` then run the fixture session *Cirium → Southwest Airlines* (Quick Entry, name + URL, one outcome) through Brief + Play. Save `JSON.stringify(window.__p)` as `baseline.json`.
2. Repeat on the branch with the flag **off**. Diff → **must be byte-identical.**
3. Repeat on the branch with the flag **on** but no fields set. Diff → **must be byte-identical** (E1 adds no prompt text).
4. Old session restore: open a session saved before this branch → members have no new keys; Step 3/4 render as today; `acctFingerprint` returns `"0"`.

**Live on staging.cambree.ai, flag on**
- Quick Entry: row 1 `Nestlé / nestle.com` New logo; row 2 `Crest / crest.com` Existing + parent `Procter & Gamble`, unit `Crest`; row 3 name `Oral Care`, parent `Procter & Gamble`, no URL → `company_url` stays **empty** (no auto-suggest); duplicate-name alert fires if two rows are both named `Oral Care`.
- CSV with columns `Company, Website, Industry, Lead Source, Customer Status, Parent Company, Brand, Product` → mapping card shows four new rows auto-mapped; preview line reads the correct counts; `Perform Account Analysis` produces members with the fields; a CSV **without** those columns maps exactly as today.
- Step 4: panel shows above Deal Context; toggling Existing reveals scope; picking a catalog product sets `targetOffer`; typing free text sets it as a label; editing any field changes `getBriefSig` (confirm via React DevTools or a `console.log` you remove before commit).
- Cache: build a brief for `Crest` with no fields; set Existing + scope; return to Brief → console shows `Account-context fp mismatch … regenerating`. Same account with fields unchanged → cache serves.
- `session_journey` has `account_ctx_set` rows with `field` values for each edit.

**Golden-run gate:** not applicable to E1 (no prompt or scoring change). The prompt-snapshot diff above is the gate.

## Blast radius
`goToQuickBrief`, `buildCohorts`, the mapping card, Step 4 render, `getBriefSig` (drives brief regeneration), the brief cache read/write in `pickAccount`'s path, `callAI` / `streamAI` (one no-op line each). No auth, billing, RLS, or migration. New React state: none (fields live on existing member objects); `clearSession` (`:5465`) already resets `cohorts`, `selectedAccount`, `rows`.

## Rollback
Runtime: flag is default OFF — nothing renders, nothing is captured, prompts unchanged. Code: single revert of the branch merge commit. Cache rows written with `_acctFp` / `_relationship` / `_targetOffer` are harmless to prior code (unknown keys ignored). Sessions saved with the new member keys load in prior code unchanged.

## Explicitly OUT of scope
- Any prompt text, including the relationship / target-offer / parent blocks and the caveat line → **WO-E2**.
- Step 3 grouping, chips, Stretch suppression, Known Customer preset change, dropping +40 → **WO-E2**.
- Parent-aware identification / P1 research / exec-pipeline gate / "Context used" strip → **WO-E3**.
- Raising the 800 / 400 account-doc excerpt literals (`:2623`, `:11601`) → backlog row (Joe, 9/15).
- Expansion-scoped fit scoring; a generated "pick a brand" menu; a `target_parent` column; replacing `alert()`.
