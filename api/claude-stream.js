import { guard, MODEL_FALLBACK, checkGuestLimit, incrementGuestUsage, getGuestRemaining } from "./_guard.js";
import { extractUserId, checkOrgUsage, incrementUsage, incrementMaxUsage, logTokenUsage, extractTrackingContext } from "./_usage.js";

export const config = { maxDuration: 300 };

const ANTHROPIC_HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": process.env.ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "prompt-caching-2024-07-31",
};

async function callAnthropic(body) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: ANTHROPIC_HEADERS,
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  const body = await guard(req, res, { stream: true });
  if (!body) return;

  // Guest usage limit — 3 calls total
  if (req._isGuest) {
    const xff = req.headers["x-forwarded-for"];
    const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
             || (xff ? xff.split(",").pop().trim() : "")
             || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
    if (!checkGuestLimit(ip)) {
      return res.status(402).json({
        error: { type: "guest_limit_exceeded", message: "You've used your free tokens. Create a free account to continue." },
        guest_remaining: 0,
      });
    }
    incrementGuestUsage(ip);
    const remaining = getGuestRemaining(ip);
    res.setHeader("x-guest-remaining", String(remaining));
  }

  // Usage limit enforcement — ALWAYS check for authenticated users.
  const isBillableMax = req.headers["x-billable-max"] === "1";
  const isBillableRun = req.headers["x-billable-run"] === "1";
  let usageOrgId = null;
  let isMaxRun = false;

  // Meter one run per play: only the client-designated billable call checks + increments.
  // Sub-calls of the same brief skip metering, so a limit hit never aborts a brief mid-flight.
  if (!req._isGuest && (isBillableRun || isBillableMax)) {
    const userId = extractUserId(req);
    if (userId) {
      const usage = await checkOrgUsage(userId, { isMax: isBillableMax });
      if (!usage.allowed) {
        return res.status(402).json({
          error: { type: usage.reason || "usage_limit_exceeded", message: usage.message || "Monthly token limit reached" },
          run_count: usage.run_count, run_limit: usage.run_limit,
          max_run_count: usage.max_run_count, max_run_limit: usage.max_run_limit,
        });
      }
      usageOrgId = usage.org_id;
      isMaxRun = isBillableMax;
    }
  }

  let response = await callAnthropic(body);

  // Server-side fallback on 529 — same behavior as api/claude.js. Has to
  // happen BEFORE we start writing the SSE stream to the client; once we
  // start streaming we can't switch models mid-flight.
  if (response.status === 529 && MODEL_FALLBACK[body.model]) {
    const fallbackModel = MODEL_FALLBACK[body.model];
    console.log(`[fallback-stream] ${body.model} -> ${fallbackModel} (529 from Anthropic)`);
    response = await callAnthropic({ ...body, model: fallbackModel });
    res.setHeader("x-fallback-model", fallbackModel);
  }

  // Propagate upstream backoff guidance — the client retry ladder honors Retry-After
  const _retryAfter = response.headers.get("retry-after");
  if (_retryAfter) res.setHeader("Retry-After", _retryAfter);

  // Only stream and bill on successful Anthropic responses
  if (response.status < 200 || response.status >= 300) {
    const errBody = await response.text().catch(() => "");
    console.error(`[claude-stream] Anthropic error ${response.status}:`, errBody.slice(0, 500));
    try {
      const parsed = JSON.parse(errBody);
      res.status(response.status).json(parsed);
    } catch {
      res.status(response.status).json({ error: { type: "upstream_error", message: `AI service returned ${response.status}` } });
    }
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamedText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    streamedText += chunk;
    res.write(chunk);
  }

  // Parse token usage from SSE stream for cost tracking
  const userId = extractUserId(req);
  try {
    // Extract usage from message_start and message_delta events
    const msgStart = streamedText.match(/"message_start".*?"usage"\s*:\s*(\{[^}]+\})/);
    const msgDelta = streamedText.match(/"message_delta".*?"usage"\s*:\s*(\{[^}]+\})/);
    const startUsage = msgStart ? JSON.parse(msgStart[1]) : {};
    const deltaUsage = msgDelta ? JSON.parse(msgDelta[1]) : {};
    const modelMatch = streamedText.match(/"model"\s*:\s*"([^"]+)"/);
    const cacheReadTokens = startUsage.cache_read_input_tokens || 0;
    const cacheCreationTokens = startUsage.cache_creation_input_tokens || 0;
    const inputTokens = (startUsage.input_tokens || 0) + cacheCreationTokens + cacheReadTokens;
    const outputTokens = deltaUsage.output_tokens || startUsage.output_tokens || 0;
    // Count web search results in streamed content
    const webSearchCount = (streamedText.match(/"web_search_tool_result"/g) || []).length;
    if (inputTokens || outputTokens) {
      const tracking = extractTrackingContext(req);
      logTokenUsage({
        userId,
        orgId: usageOrgId,
        model: modelMatch?.[1] || body.model,
        inputTokens, outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        webSearches: webSearchCount,
        endpoint: "claude-stream",
        ...tracking,
      });
    }
  } catch {} // best-effort — don't fail the stream

  // Increment usage only after successful stream (2xx verified above)
  if (usageOrgId) {
    if (isMaxRun) {
      incrementMaxUsage(usageOrgId).catch(() => {});
    } else {
      incrementUsage(usageOrgId).catch(() => {});
    }
  }

  res.end();
}
