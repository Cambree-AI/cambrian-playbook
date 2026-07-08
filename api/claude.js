import { guard, MODEL_FALLBACK, checkGuestLimit, incrementGuestUsage, getGuestRemaining } from "./_guard.js";
import { extractUserId, checkOrgUsage, incrementUsage, incrementMaxUsage, logTokenUsage, extractTrackingContext } from "./_usage.js";

// Vercel function timeout — Opus calls can take 30-60s, default is 10s
export const config = { maxDuration: 120 };

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
  const body = await guard(req, res, { stream: false });
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
  // Server determines billability, not client headers (prevents billing bypass).
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
        const errType = usage.reason === "max_not_available" ? "max_not_available"
          : usage.reason === "max_limit_exceeded" ? "max_limit_exceeded"
          : "usage_limit_exceeded";
        return res.status(402).json({
          error: { type: errType, message: usage.message || `Monthly token limit reached` },
          run_count: usage.run_count,
          run_limit: usage.run_limit,
          max_run_count: usage.max_run_count,
          max_run_limit: usage.max_run_limit,
        });
      }
      usageOrgId = usage.org_id;
      isMaxRun = isBillableMax;
    }
  }

  let response = await callAnthropic(body);
  let usedFallback = false;

  // Log non-200 from Anthropic for debugging
  if (!response.ok && response.status !== 529) {
    const errBody = await response.clone().text().catch(() => "");
    console.error(`[claude] Anthropic ${response.status} for model=${body.model}:`, errBody.slice(0, 500));
  }

  if (response.status === 529 && MODEL_FALLBACK[body.model]) {
    const fallbackModel = MODEL_FALLBACK[body.model];
    console.log(`[fallback] ${body.model} -> ${fallbackModel} (529 from Anthropic)`);
    response = await callAnthropic({ ...body, model: fallbackModel });
    usedFallback = true;
    res.setHeader("x-fallback-model", fallbackModel);
  }

  // Guard against non-JSON responses (Anthropic 500/503 returns HTML)
  if (!response.ok && response.status !== 529) {
    const errBody = await response.text().catch(() => "");
    console.error(`[claude] Anthropic error ${response.status}:`, errBody.slice(0, 500));
    try {
      const parsed = JSON.parse(errBody);
      return res.status(response.status).json(parsed);
    } catch {
      return res.status(response.status).json({ error: { type: "upstream_error", message: `AI service returned ${response.status}` } });
    }
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    console.error("[claude] Failed to parse Anthropic response as JSON:", parseErr.message);
    return res.status(502).json({ error: { type: "parse_error", message: "AI service returned an unparseable response" } });
  }

  if (usedFallback) {
    data._fallbackModel = res.getHeader("x-fallback-model");
  }

  // Log token usage for cost tracking
  if (response.status >= 200 && response.status < 300 && data.usage) {
    const userId = extractUserId(req);
    const webSearches = (data.content || []).filter(b => b.type === "web_search_tool_result").length;
    const tracking = extractTrackingContext(req);
    logTokenUsage({
      userId,
      orgId: usageOrgId,
      model: data.model || body.model,
      inputTokens: (data.usage.input_tokens || 0) + (data.usage.cache_creation_input_tokens || 0) + (data.usage.cache_read_input_tokens || 0),
      outputTokens: data.usage.output_tokens || 0,
      cacheReadTokens: data.usage.cache_read_input_tokens || 0,
      cacheCreationTokens: data.usage.cache_creation_input_tokens || 0,
      webSearches,
      endpoint: "claude",
      ...tracking,
    });
  }

  // Increment usage after successful response
  if (usageOrgId && response.status >= 200 && response.status < 300) {
    if (isMaxRun) {
      incrementMaxUsage(usageOrgId).catch(() => {});
    } else {
      incrementUsage(usageOrgId).catch(() => {});
    }
  }

  res.status(response.status).json(data);
}
