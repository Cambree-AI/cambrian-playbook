// ── ICP STREAM CORE — SSE transport + JSON recovery for streamAI (issue #111) ─
// Extracted from App.jsx so the stream failure paths can be unit-tested against
// a mocked /api/claude-stream response (tests/icp-stream/) with no live API call.
// This module is LIVE — App.jsx imports it (like fitScoring.js). Keep it free of
// React/DOM/network dependencies: pure functions plus the web-streams reader.

// ── CITATION STRIPPER — web_search returns <cite index="...">text</cite> tags ─
// Strip them globally from any AI response value before it enters state.
export function stripCitations(text) {
  if (typeof text === "string") return text.replace(/<\/?cite[^>]*>/g, "");
  if (Array.isArray(text)) return text.map(stripCitations);
  if (text && typeof text === "object") {
    const out = {};
    for (const [k, v] of Object.entries(text)) out[k] = stripCitations(v);
    return out;
  }
  return text;
}

// Repairs the most common model-JSON defect: unescaped control characters and
// stray double-quotes inside string values. Walks char-by-char tracking string
// state; a quote inside a string only terminates it when followed by a
// structural character (, } ] : or end).
export function repairJSON(s) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (inStr) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      if (ch === '"') {
        let j = i + 1;
        while (j < s.length) {
          if (s[j] === "\n" || s[j] === "\r" || s[j] === " " || s[j] === "\t") { j++; continue; }
          if (s[j] === "\\") { j += 2; continue; }
          break;
        }
        const nxt = j < s.length ? s[j] : "";
        if (nxt === "," || nxt === "}" || nxt === "]" || nxt === ":" || nxt === "") { inStr = false; out += ch; }
        else { out += '\\"'; }
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') { inStr = true; out += ch; continue; }
      out += ch;
    }
  }
  return out;
}

// Presentation cleanup applied to streamed text before it reaches onChunk or
// the final parse: cite tags, markdown fences, thinking tags.
export function cleanStreamText(text) {
  return text
    .replace(/<\/?cite[^>]*>/g, "")
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/<\/?thinking>/g, "");
}

// Reads an Anthropic SSE body (a ReadableStream) to completion.
// Captures message_delta so callers can distinguish max_tokens truncation from
// a parse failure — before issue #111 stop_reason was silently discarded.
// Throws on reader errors (including AbortError) — the caller owns that policy.
export async function consumeClaudeSse(body, onChunk) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let stopReason = null, outputTokens = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        if (event.type === "message_delta") {
          stopReason = event.delta?.stop_reason ?? stopReason;
          outputTokens = event.usage?.output_tokens ?? outputTokens;
        }
        if (event.type === "content_block_delta" && event.delta?.text) {
          fullText += event.delta.text;
          onChunk(cleanStreamText(fullText));
        }
      } catch { /* non-critical */ }
    }
  }
  return { fullText, stopReason, outputTokens };
}

// Final parse of the accumulated stream text: raw → sanitized → repaired.
// Returns { data } on success, or { failure } describing WHY it could not be
// read — reason "parse" (JSON present but unreadable, e.g. truncation) or
// "no-json" (no {...} at all). The failure object feeds the diag ring buffer
// and the [E-ICP-*] user-facing error codes.
export function parseStreamJson(fullText) {
  const cleaned = cleanStreamText(fullText).trim();
  const fb = cleaned.indexOf("{");
  const lb = cleaned.lastIndexOf("}");
  if (fb >= 0 && lb > fb) {
    const candidate = cleaned.slice(fb, lb + 1);
    try { return { data: stripCitations(JSON.parse(candidate)) }; } catch { /* try sanitize */ }
    const san = candidate
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/[…]/g, "...")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/,\s*([}\]])/g, "$1");
    try { return { data: stripCitations(JSON.parse(san)) }; } catch { /* try repair */ }
    try { return { data: stripCitations(JSON.parse(repairJSON(san))) }; }
    catch (e) {
      return { failure: { reason: "parse", parseError: e?.message, textLen: fullText.length, tail: (san || "").slice(-160) } };
    }
  }
  return { failure: { reason: "no-json", textLen: fullText.length, tail: fullText.slice(-160) } };
}
