#!/usr/bin/env node
/* global process */
// tests/icp-stream/stream.test.js — regression tests for issue #111 (stream layer).
//
// Exercises src/lib/icpStream.js against a MOCKED /api/claude-stream service
// (tests/icp-stream/mock-claude-stream.js) — real ReadableStream + SSE framing,
// no network, no Anthropic spend. Covers:
//   - happy path: chunked JSON parses; progressive onChunk text is cleaned
//   - message_delta capture: stop_reason / output_tokens no longer discarded
//   - max_tokens truncation → failure reason "parse" (feeds [E-ICP-TRUNC])
//   - prose-only / empty output → failure reason "no-json" ([E-ICP-EMPTY])
//   - recovery ladder: markdown fences, smart quotes, trailing commas,
//     unescaped newlines, cite tags
//
// Usage: node tests/icp-stream/stream.test.js   (exit 0 = green)

import { consumeClaudeSse, parseStreamJson, cleanStreamText, stripCitations, repairJSON } from "../../src/lib/icpStream.js";
import { claudeTextEvents, mockClaudeStreamService, mockClaudeStreamResponse } from "./mock-claude-stream.js";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

// Drives the same path streamAI takes after opening the response: consume the
// SSE body, then run the JSON recovery ladder.
async function runStream(events, opts = {}) {
  const service = mockClaudeStreamService(events, opts);
  const response = await service("/api/claude-stream", { method: "POST", body: JSON.stringify({ model: "claude-sonnet-4-6" }) });
  const chunks = [];
  const streamed = await consumeClaudeSse(response.body, (t) => chunks.push(t));
  return { streamed, parsed: parseStreamJson(streamed.fullText), chunks, service };
}

const GOOD_ICP = { sellerName: "Acme Analytics", sellerDescription: "B2B analytics platform", icp: { industries: ["SaaS"], companySize: "200-1000" } };

console.log("\n── happy path ──────────────────────────────────────────────────");
{
  const { streamed, parsed, chunks } = await runStream(claudeTextEvents(JSON.stringify(GOOD_ICP)));
  assert(parsed.data && !parsed.failure, "valid JSON stream → data, no failure");
  assert(parsed.data?.sellerName === "Acme Analytics", "parsed object carries sellerName");
  assert(parsed.data?.icp?.industries?.[0] === "SaaS", "nested icp fields survive");
  assert(streamed.stopReason === "end_turn", "message_delta stop_reason captured (was discarded pre-#111)");
  assert(streamed.outputTokens === 250, "message_delta output_tokens captured");
  assert(chunks.length > 1, "onChunk fired progressively across SSE deltas");
  assert(chunks[chunks.length - 1].includes("Acme Analytics"), "final onChunk text contains full payload");
}

{
  // Byte chunks misaligned with SSE frames — 1-byte chunks is the worst case.
  const { parsed } = await runStream(claudeTextEvents(JSON.stringify(GOOD_ICP), { pieces: 3 }), { chunkSize: 1 });
  assert(parsed.data?.sellerName === "Acme Analytics", "1-byte transport chunks reassemble correctly");
}

console.log("\n── truncation (max_tokens) → reason 'parse' ────────────────────");
{
  // Cut mid-string after a nested object closed, so a '}' exists but the
  // candidate slice is unparseable — the exact #111 production shape.
  const truncated = '{"sellerName": "Acme Analytics", "icp": {"industries": ["SaaS"]}, "sellerDescription": "B2B analytics pla';
  const { streamed, parsed } = await runStream(claudeTextEvents(truncated, { stopReason: "max_tokens", outputTokens: 6500 }));
  assert(!parsed.data && parsed.failure, "truncated JSON → failure, not silent null");
  assert(parsed.failure?.reason === "parse", "failure reason is 'parse'");
  assert(streamed.stopReason === "max_tokens", "stop_reason 'max_tokens' captured for diagnosis");
  assert(typeof parsed.failure?.tail === "string" && parsed.failure.tail.length > 0, "failure carries a tail excerpt for diagnostics");
  assert(parsed.failure?.textLen === truncated.length, "failure records text length");
}

console.log("\n── empty / prose-only → reason 'no-json' ───────────────────────");
{
  const { parsed } = await runStream(claudeTextEvents("I could not find enough information about this company to build an ICP."));
  assert(parsed.failure?.reason === "no-json", "prose-only response → 'no-json'");
}
{
  // Stream that produced no text at all (e.g. thin web-search results).
  const { streamed, parsed } = await runStream(claudeTextEvents("", { pieces: 1 }));
  assert(streamed.fullText === "", "empty stream yields empty fullText");
  assert(parsed.failure?.reason === "no-json", "empty stream → 'no-json'");
}

console.log("\n── JSON recovery ladder ────────────────────────────────────────");
{
  const fenced = "```json\n" + JSON.stringify(GOOD_ICP) + "\n```";
  const { parsed } = await runStream(claudeTextEvents(fenced));
  assert(parsed.data?.sellerName === "Acme Analytics", "markdown-fenced JSON recovered");
}
{
  const smart = '{"sellerName": "Acme “Analytics”", "note": "AI—driven", "list": ["a", "b",]}';
  const { parsed } = await runStream(claudeTextEvents(smart));
  assert(parsed.data && parsed.data.list?.length === 2, "smart quotes + trailing comma sanitized");
}
{
  const withNewline = '{"sellerName": "Acme", "sellerDescription": "line one\nline two"}';
  // Raw newline inside a JSON string — only repairJSON can save this.
  const { parsed } = await runStream(claudeTextEvents(withNewline, { pieces: 2 }));
  assert(parsed.data?.sellerDescription?.includes("line one"), "unescaped newline in string repaired");
}
{
  const cited = '{"sellerName": "<cite index="1">Acme Analytics</cite>", "icp": {}}';
  const { parsed } = await runStream(claudeTextEvents(cited));
  assert(parsed.data?.sellerName === "Acme Analytics", "cite tags stripped from parsed values");
}
{
  // Garbage interleaved in the transport (comment lines, blank keepalives)
  // must not corrupt the accumulated text.
  const events = claudeTextEvents(JSON.stringify(GOOD_ICP), { pieces: 2 });
  const response = mockClaudeStreamResponse(events, { extraRaw: ": keepalive\n\ndata: {not json}\n\n" });
  const streamed = await consumeClaudeSse(response.body, () => {});
  const parsed = parseStreamJson(streamed.fullText);
  assert(parsed.data?.sellerName === "Acme Analytics", "keepalives and malformed data lines ignored");
}

console.log("\n── helper units ────────────────────────────────────────────────");
{
  assert(cleanStreamText("<thinking></thinking>```json\n{}```") === "{}", "cleanStreamText strips fences and thinking tags");
  assert(stripCitations({ a: ['<cite index="2">x</cite>'] }).a[0] === "x", "stripCitations recurses arrays/objects");
  const repaired = repairJSON('{"k": "a\tb"}');
  assert(JSON.parse(repaired).k === "a\\tb".replace("\\t", "\t"), "repairJSON escapes tabs inside strings");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
