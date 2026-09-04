#!/usr/bin/env node
/* global process */
// tests/icp-stream/failure.test.js — regression tests for issue #111 (state layer).
//
// The bug: ICP Pass 2 returning null with no recognised error type left
// sellerICP untouched → "Build ICP Now" empty state instead of an error card.
// These tests pin the two invariants that prevent it:
//   1. classifyIcpPhase2Error yields a message for EVERY input — including
//      err === undefined (the #111 hole) and unrecognised error types.
//   2. icpFailureState never returns a dead state: the result always renders
//      either the annotated ICP panel (complete prior ICP + _warning) or the
//      error card (_error, _loading always stripped).
//
// Pure functions, no network, no DOM. Usage: node tests/icp-stream/failure.test.js

import { icpErrorCode, icpFailureState, classifyIcpPhase2Error } from "../../src/lib/icpFailure.js";
import { consumeClaudeSse, parseStreamJson } from "../../src/lib/icpStream.js";
import { claudeTextEvents, mockClaudeStreamResponse } from "./mock-claude-stream.js";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

// Mirrors the App.jsx render gates for the ICP area of Step 2.
// Pre-#111, a state could match NONE of these (null/partial sellerICP with
// icpLoading false) → the misleading "Build ICP Now" empty state.
function rendersSomethingActionable(sellerICP) {
  const errorCard = !!(sellerICP?._error && !sellerICP?.icp);       // red card + Regenerate
  const icpPanel = !!(sellerICP?.icp && !sellerICP?._loading);      // ICP panel (± _warning banner)
  return errorCard || icpPanel;
}

console.log("\n── classifyIcpPhase2Error covers every branch ──────────────────");
{
  const r = classifyIcpPhase2Error(undefined);
  assert(r.kind === "empty" && r.message.includes("Regenerate"), "err undefined (the #111 hole) → retryable message");
  assert(classifyIcpPhase2Error(null).kind === "empty", "err null → same branch");
}
{
  assert(classifyIcpPhase2Error({ type: "usage_limit_exceeded" }).kind === "limit", "usage_limit_exceeded → limit");
  assert(classifyIcpPhase2Error({ type: "max_limit_exceeded" }).kind === "limit", "max_limit_exceeded → limit");
  assert(classifyIcpPhase2Error({ type: "usage_limit_exceeded" }).message.includes("plan limit"), "limit message mentions plan limit");
}
{
  assert(classifyIcpPhase2Error({ type: "overloaded_error" }).kind === "overloaded", "overloaded_error → overloaded");
  assert(classifyIcpPhase2Error({ type: "unavailable" }).kind === "overloaded", "unavailable → overloaded");
}
{
  const r = classifyIcpPhase2Error({ type: "rate_limit_error" });
  assert(r.kind === "unrecognized" && r.message.includes("rate_limit_error"), "unrecognised type surfaces its type string");
  assert(classifyIcpPhase2Error({}).message.includes("(error)"), "error object without type → generic 'error' label");
  assert(classifyIcpPhase2Error({ type: "invalid_request_error" }).message.includes("Regenerate"), "unrecognised type still offers Regenerate");
}
{
  // Exhaustive: every input yields a non-empty message. No silent fall-through.
  const inputs = [undefined, null, {}, { type: "" }, { type: "anything_else" }, { type: "usage_limit_exceeded" }, { type: "overloaded_error" }];
  assert(inputs.every(e => (classifyIcpPhase2Error(e).message || "").length > 10), "every input produces a message (no silent fall-through)");
}

console.log("\n── icpErrorCode maps diagnostics to support codes ──────────────");
{
  assert(icpErrorCode({ reason: "parse", stopReason: "max_tokens" }) === " [E-ICP-TRUNC]", "parse + max_tokens → TRUNC");
  assert(icpErrorCode({ reason: "parse", stopReason: "end_turn" }) === " [E-ICP-PARSE]", "parse + end_turn → PARSE");
  assert(icpErrorCode({ reason: "parse" }) === " [E-ICP-PARSE]", "parse + no stopReason → PARSE");
  assert(icpErrorCode({ reason: "no-json" }) === " [E-ICP-EMPTY]", "no-json → EMPTY");
  assert(icpErrorCode(null) === "", "no diagnostic → no code");
  assert(icpErrorCode(undefined) === "", "undefined diagnostic → no code");
}

console.log("\n── icpFailureState never produces a dead state ─────────────────");
const MSG = "ICP build didn't complete — the response couldn't be read. Click Regenerate ICP to retry.";
{
  const next = icpFailureState(null, MSG);
  assert(next._error === MSG, "prev null → error card state");
  assert(!("_loading" in next), "prev null → no _loading key");
  assert(rendersSomethingActionable(next), "prev null → renders error card (was: empty state, #111)");
}
{
  const partial = { _loading: true, sellerDescription: "Acme is a B2B analytics platform", marketCategory: "Analytics" };
  const next = icpFailureState(partial, MSG);
  assert(next._error === MSG, "partial (_loading) → error card state");
  assert(!("_loading" in next), "partial → _loading ALWAYS stripped");
  assert(next.sellerDescription === partial.sellerDescription, "partial fields preserved for diagnostics");
  assert(rendersSomethingActionable(next), "partial → renders error card (was: invisible partial, #111 secondary)");
}
{
  const complete = { sellerName: "Acme", icp: { industries: ["SaaS"] }, sellerDescription: "..." };
  const next = icpFailureState(complete, MSG + " [E-ICP-TRUNC]");
  assert(next._warning === MSG + " [E-ICP-TRUNC]", "complete prior ICP → annotated with _warning");
  assert(!next._error, "complete prior ICP → NOT downgraded to error card");
  assert(next.icp === complete.icp, "complete prior ICP → data preserved, never wiped");
  assert(rendersSomethingActionable(next), "complete prior ICP → still renders the ICP panel");
}
{
  // A prior ICP that is mid-regeneration (_loading:true but has .icp from a
  // previous build) must become an error card, not stay invisible.
  const regenerating = { _loading: true, icp: { industries: ["SaaS"] }, sellerName: "Acme" };
  const next = icpFailureState(regenerating, MSG);
  assert(!("_loading" in next), "regenerating prior ICP → _loading stripped");
  assert(rendersSomethingActionable(next), "regenerating prior ICP → renders something actionable");
}
{
  // Invariant sweep across representative prev shapes.
  const prevs = [null, undefined, {}, { _loading: true }, { _error: "old error" }, { _warning: "old warning" },
    { _loading: true, sellerDescription: "x" }, { sellerName: "A", icp: {} }, { sellerName: "A", icp: {}, _warning: "w" }];
  assert(prevs.every(p => rendersSomethingActionable(icpFailureState(p, MSG))), "INVARIANT: every prev shape → an actionable render state");
  assert(prevs.every(p => !("_loading" in icpFailureState(p, MSG))), "INVARIANT: _loading never survives a failure");
}

console.log("\n── end-to-end: mocked truncated stream → user-facing state ─────");
{
  // Full #111 chain with the mocked live service: truncated stream → parse
  // failure → diag → error code → state. This is the scenario from the issue
  // repro (thin web-search results / new domain).
  const truncated = '{"sellerName": "Acme", "icp": {"industries": ["SaaS"]}, "desc": "cut off he';
  const response = mockClaudeStreamResponse(claudeTextEvents(truncated, { stopReason: "max_tokens", outputTokens: 6500 }));
  const streamed = await consumeClaudeSse(response.body, () => {});
  const parsed = parseStreamJson(streamed.fullText);
  assert(!!parsed.failure, "truncated stream fails parse");
  const diag = { ...parsed.failure, stopReason: streamed.stopReason }; // what recordStreamDiag stores
  const msg = classifyIcpPhase2Error(undefined).message + icpErrorCode(diag); // streamAI returned null, no error object
  const state = icpFailureState(null, msg);
  assert(state._error?.includes("[E-ICP-TRUNC]"), "user sees the TRUNC support code");
  assert(state._error?.includes("Regenerate"), "user sees a Regenerate path");
  assert(rendersSomethingActionable(state), "end-to-end: error card renders, never the empty state");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
