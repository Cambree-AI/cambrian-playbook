// ── ICP FAILURE HANDLING — pure state logic for buildSellerICP (issue #111) ──
// Extracted from App.jsx so the failure-classification and state-transition
// rules are unit-testable (tests/icp-stream/failure.test.js). This module is
// LIVE — App.jsx imports it. No React, no DOM.
//
// The #111 bug: when ICP Pass 2 returned null with no recognised error type,
// no setSellerICP call fired, sellerICP stayed null (or _loading:true from
// partial streaming), and setIcpLoading(false) revealed the "Build ICP Now"
// empty state instead of an error card with a Regenerate path.

// Maps the last stream diagnostic (window.__cambreeDiag entry) to a support
// code appended to the user-facing message, so prod users can report WHY
// without DevTools. TRUNC = max_tokens cutoff; PARSE = JSON present but
// unreadable; EMPTY = stream ended with no JSON at all.
export function icpErrorCode(diag) {
  if (diag?.reason === "parse") return diag?.stopReason === "max_tokens" ? " [E-ICP-TRUNC]" : " [E-ICP-PARSE]";
  if (diag?.reason === "no-json") return " [E-ICP-EMPTY]";
  return "";
}

// Single state transition for every ICP build failure. Rules:
// (1) a complete prior ICP (has .icp, not _loading) is preserved and annotated
//     with _warning — never wiped;
// (2) a partial (_loading:true) or null becomes an _error card — _loading is
//     ALWAYS stripped so a render gate always matches (no dead blank state);
// (3) the result therefore always renders either the annotated ICP panel or
//     the error card with its Regenerate button.
export function icpFailureState(prev, message) {
  if (prev && !prev._loading && prev.icp) return { ...prev, _warning: message };
  const { _loading, ...rest } = prev || {};
  return { ...rest, _error: message };
}

// Classifies the Pass-2 result when streamAI returned null or an error object.
// EVERY branch yields a message — the err === undefined hole (issue #111)
// previously fell through with no state update at all.
// kind: "limit" is terminal (upgrade required); everything else is retryable
// via Regenerate.
export function classifyIcpPhase2Error(err) {
  if (err?.type === "usage_limit_exceeded" || err?.type === "max_limit_exceeded") {
    return { kind: "limit", message: "You've reached your plan limit. Upgrade to continue building ICPs." };
  }
  if (err?.type === "unavailable" || err?.type === "overloaded_error") {
    return { kind: "overloaded", message: "Our AI engine is temporarily overloaded. Click Regenerate ICP in a moment to retry." };
  }
  if (!err) {
    // null return with no error object: clean stream end whose JSON did not
    // parse (see window.__cambreeDiag). The original #111 path.
    return { kind: "empty", message: "ICP build didn't complete — the response couldn't be read. Click Regenerate ICP to retry." };
  }
  // A defined error type this ladder doesn't recognise (e.g. rate_limit_error,
  // invalid_request_error). Say so — don't call it "busy".
  return { kind: "unrecognized", message: `ICP build failed (${String(err.type || "error")}). Click Regenerate ICP to retry.` };
}
