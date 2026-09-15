// api-aws/fetch/index.js
/* global process, Buffer */
//
// AWS port of api/fetch.js (issue #87) — server-side rendered page fetch
// (HANDOFF_06). PRIMARY exec source: fetches and renders company leadership
// pages to populate verifiedPersons with real current executive names.
// Logic is a line-for-line copy of the Vercel handler wrapped in the shared
// adapter; keep the two in sync until the Vercel copy is removed in the
// final conversion issue. Parity is asserted by tests/api-aws/fetch.test.js;
// the full SSRF suite also runs against the shared/fetch-ssrf.js copy
// (tests/fetch-ssrf/ssrf.test.js --module=api-aws) as this port's gate.
//
// Contract:
//   POST { url: "https://…/leadership", render: "auto" | "never" | "always" }
//   Success 200: { url, finalUrl, httpStatus, renderUsed, title, text,
//                  contentChars, truncated, fetchedAt, cached }
//   Any failure 200: { ok: false, reason, url } — NEVER a 500.
//   The exec engine treats ok:false as "source unavailable" → cascade continues.
//
// Security model: HANDOFF_06 §2. All SSRF validation in shared/fetch-ssrf.js.
// Redirect re-validation: each 3xx hop is SSRF-checked before following.
//
// Differences from the Vercel copy (all platform-level, issue #87 AC: no
// in-memory cross-request state):
//   - no per-IP fetch rate limiter (Map + setInterval sweep) — API Gateway
//     stage throttling covers it; the `rate_limited` response reason no
//     longer occurs on this platform
//   - no 7-day in-memory URL cache — responses never carry `cached: true`;
//     the Vercel copy's own TODO already earmarked promotion to Supabase
//   - FIRECRAWL_API_KEY arrives via Secrets Manager at cold start

import { httpAdapter } from '../shared/adapter.js';
import { applyCors, verifyJwt, isAllowedOrigin } from '../shared/guard.js';
import { loadSecrets } from '../shared/secrets.js';
import { validateUrl } from '../shared/fetch-ssrf.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const PLAIN_TIMEOUT_MS    = 4_000;   // Stage 1 abort after 4s
const RENDER_TIMEOUT_MS   = 12_000;  // Stage 2 abort after 12s
const SIZE_CAP_BYTES      = 3 * 1024 * 1024;  // 3 MB raw HTML cap
const TEXT_CAP_CHARS      = 60_000;  // returned text cap (≈ 15k tokens)
const MAX_REDIRECTS       = 3;
const THIN_THRESHOLD      = 600;     // chars of clean text below which we escalate

const ALLOWED_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml']);

// Role-language signal — a substantive leadership page must contain these
const PERSON_ROLE_RE = /\b(ceo|cfo|coo|cto|president|vice\s+president|\bvp\b|director|officer|founder|chair(?:man|woman|person)?|partner|executive)\b/i;

// SPA shell markers — page returned but JavaScript hasn't rendered yet
const SPA_MARKERS = [
  /enable\s+javascript/i,
  /javascript\s+(?:is\s+)?required/i,
  /<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i,
  /<div[^>]+id=["']app["'][^>]*>\s*<\/div>/i,
  /<noscript\b[^>]*>\s*<\/noscript>/i,
];

const USER_AGENT = 'CambrianBot/1.0 (leadership-page-reader; +https://cambriancatalyst.ai)';

// ── Stage 1: plain HTTPS fetch with manual redirect handling ─────────────────
//
// SECURITY: uses redirect:'manual' so we re-run validateUrl on every Location
// header before following. This blocks the canonical SSRF redirect bypass:
//   public-URL → 302 → http://169.254.169.254/latest/meta-data/
//
// If any hop fails SSRF validation, we stop immediately and return the reason.
// We follow at most MAX_REDIRECTS hops; excess hops → fetch_failed.
async function doPlainFetch(rawUrl) {
  let currentUrl = rawUrl;
  let hopsFollowed = 0;
  const controller = new AbortController();
  const hardStop = setTimeout(() => controller.abort(), PLAIN_TIMEOUT_MS);

  try {
    while (hopsFollowed <= MAX_REDIRECTS) {
      let resp;
      try {
        resp = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',      // ← manual: we control every redirect hop
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            // No cookies, no auth, no user-supplied headers forwarded
          },
        });
      } catch (fetchErr) {
        clearTimeout(hardStop);
        if (fetchErr?.name === 'AbortError') return { ok: false, reason: 'timeout' };
        return { ok: false, reason: 'fetch_failed', detail: fetchErr?.message };
      }

      // ── Redirect handling — re-validate EVERY hop ──────────────────────────
      // Status codes: 301 Moved / 302 Found / 303 See Other /
      //               307 Temp Redirect / 308 Perm Redirect
      if (resp.status >= 301 && resp.status <= 308) {
        if (hopsFollowed >= MAX_REDIRECTS) {
          clearTimeout(hardStop);
          return { ok: false, reason: 'fetch_failed', detail: 'too many redirects' };
        }
        const locationRaw = resp.headers.get('location');
        if (!locationRaw) {
          clearTimeout(hardStop);
          return { ok: false, reason: 'fetch_failed', detail: 'redirect with no Location' };
        }
        // Resolve relative Location URLs against the current URL
        let locationAbs;
        try { locationAbs = new URL(locationRaw, currentUrl).toString(); }
        catch {
          clearTimeout(hardStop);
          return { ok: false, reason: 'fetch_failed', detail: 'invalid redirect URL' };
        }
        // ← SSRF re-validation: blocks public→private redirect bypass
        const hopCheck = await validateUrl(locationAbs);
        if (!hopCheck.ok) {
          clearTimeout(hardStop);
          console.warn(`[/api/fetch] SSRF blocked on redirect hop ${hopsFollowed + 1} (${hopCheck.reason}): ${locationAbs}`);
          return { ok: false, reason: hopCheck.reason };
        }
        currentUrl = locationAbs;
        hopsFollowed++;
        continue;
      }

      // ── Non-redirect response ───────────────────────────────────────────────
      // Content-type: only HTML accepted
      const ctRaw = resp.headers.get('content-type') || '';
      const ctBase = ctRaw.split(';')[0].trim().toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(ctBase)) {
        clearTimeout(hardStop);
        return { ok: false, reason: 'non_html', detail: ctBase };
      }

      // Non-2xx after redirect resolution
      if (resp.status < 200 || resp.status >= 300) {
        clearTimeout(hardStop);
        return { ok: false, reason: 'fetch_failed', detail: `HTTP ${resp.status}` };
      }

      // ── Stream body with hard size cap ─────────────────────────────────────
      const reader = resp.body?.getReader();
      if (!reader) {
        clearTimeout(hardStop);
        return { ok: false, reason: 'fetch_failed', detail: 'no body' };
      }

      const chunks = [];
      let totalBytes = 0;
      let truncated = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.length) continue;
          const remaining = SIZE_CAP_BYTES - totalBytes;
          if (remaining <= 0) { truncated = true; reader.cancel(); break; }
          const chunk = remaining < value.length ? value.subarray(0, remaining) : value;
          chunks.push(chunk);
          totalBytes += chunk.length;
          if (totalBytes >= SIZE_CAP_BYTES) { truncated = true; reader.cancel(); break; }
        }
      } catch (readErr) {
        clearTimeout(hardStop);
        if (readErr?.name === 'AbortError') return { ok: false, reason: 'timeout' };
        return { ok: false, reason: 'fetch_failed', detail: readErr?.message };
      }

      clearTimeout(hardStop);
      const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8');
      return { ok: true, html, finalUrl: currentUrl, httpStatus: resp.status, truncated, contentBytes: totalBytes };
    }

    clearTimeout(hardStop);
    return { ok: false, reason: 'fetch_failed', detail: 'redirect loop' };

  } catch (e) {
    clearTimeout(hardStop);
    if (e?.name === 'AbortError') return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'fetch_failed', detail: e?.message };
  }
}

// ── HTML → clean text extraction ─────────────────────────────────────────────
// Readability-style: strip non-content elements then collapse whitespace.
// No DOM parser available in Lambda either — regex-based, same as Vercel.
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function extractText(html) {
  return html
    // Strip whole non-content blocks including their content
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    // Strip remaining tags (keep text content only)
    .replace(/<[^>]{1,4000}>/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ' '; }
    })
    // Collapse whitespace
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// A page is "thin" if it's a SPA shell or has too little leadership content
function isThin(text, html) {
  if (text.length < THIN_THRESHOLD) return true;
  if (SPA_MARKERS.some(re => re.test(html))) return true;
  // Leadership pages should contain role language — if none, not useful
  if (!PERSON_ROLE_RE.test(text)) return true;
  return false;
}

// ── Stage 2: managed render service (Firecrawl) ──────────────────────────────
// Only reached when Stage 1 returns a thin/SPA result and render !== 'never'.
// Firecrawl offloads headless Chromium to their infrastructure — reliable on
// Lambda too, no cold-start overhead on our side.
//
// Requires: FIRECRAWL_API_KEY (Secrets Manager container — never sent to client).
// If key is absent: returns render_failed → exec engine falls through to cascade.
// Cost: tagged as render-service calls in logs for the cost feed.
async function renderWithService(url) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    // DIAGNOSTIC: if Phase 0 shows "render_failed detail:no_render_service", add
    // FIRECRAWL_API_KEY to the cambree/<env>/api-env secret (api-aws/README.md).
    console.warn('[/api/fetch] Stage 2: FIRECRAWL_API_KEY not set — render unavailable. Bot-protected sites (octanner.com, linkedin.com) will not be fetchable until this key is set.');
    return { ok: false, reason: 'render_failed', detail: 'no_render_service' };
  }
  console.log(`[/api/fetch] Stage 2: Firecrawl key present (${apiKey.slice(0, 6)}…) — sending render request`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);

  try {
    const t0 = Date.now();
    const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,   // ms to wait for JS to execute
        timeout: 10000,  // Firecrawl-side timeout
      }),
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    console.log(`[/api/fetch] Stage 2 (Firecrawl) ${resp.status} in ${latencyMs}ms — cost-tagged`);

    if (!resp.ok) return { ok: false, reason: 'render_failed', detail: `firecrawl_${resp.status}` };

    const data = await resp.json();
    // Firecrawl v1 API: { success: true, data: { markdown: "…", metadata: { title: "…" } } }
    const text = (data?.data?.markdown || data?.markdown || '').trim();
    const title = (data?.data?.metadata?.title || data?.metadata?.title || '').trim();

    if (!text || text.length < 50) {
      return { ok: false, reason: 'render_failed', detail: 'empty_render' };
    }

    return { ok: true, text: text.slice(0, TEXT_CAP_CHARS), title, renderUsed: true };

  } catch (e) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'render_failed', detail: e?.message };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function fetchHandler(req, res) {
  await loadSecrets(); // populates FIRECRAWL_API_KEY / SUPABASE_JWT_SECRET on cold start
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  // All failures → { ok: false, reason, url } — never a 500 that breaks the brief.

  if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'fetch_failed' });

  const origin = req.headers.origin || req.headers.referer || '';
  if (!isAllowedOrigin(origin)) return res.status(403).json({ ok: false, reason: 'fetch_failed' });

  if (!await verifyJwt(req)) return res.status(401).json({ ok: false, reason: 'fetch_failed' });

  const { url: rawUrl, render = 'auto' } = req.body || {};
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 2048) {
    return res.status(200).json({ ok: false, reason: 'fetch_failed', url: rawUrl ?? null });
  }
  if (!['auto', 'never', 'always'].includes(render)) {
    return res.status(200).json({ ok: false, reason: 'fetch_failed', url: rawUrl });
  }

  // SSRF validation (scheme, IP-literal, DNS-resolve, blocklist)
  const ssrfCheck = await validateUrl(rawUrl);
  if (!ssrfCheck.ok) {
    console.warn(`[/api/fetch] SSRF blocked (${ssrfCheck.reason}): ${rawUrl}`);
    return res.status(200).json({ ok: false, reason: ssrfCheck.reason, url: rawUrl });
  }

  const t0 = Date.now();

  // ── Stage 1: plain HTTPS fetch + readability extraction ───────────────────
  const fetchResult = await doPlainFetch(rawUrl);
  let stage1Html = null, finalUrl = null, httpStatus = 0, truncated = false, contentBytes = 0;
  let stage1Text = "", stage1Title = "";
  const stage1Ok = fetchResult.ok;

  if (stage1Ok) {
    ({ html: stage1Html, finalUrl, httpStatus, truncated, contentBytes } = fetchResult);
    stage1Title = extractTitle(stage1Html);
    stage1Text  = extractText(stage1Html);
    const stage1Ms = Date.now() - t0;
    console.log(`[/api/fetch] Stage 1 done in ${stage1Ms}ms — ${contentBytes}B raw, ${stage1Text.length} chars clean, thin=${isThin(stage1Text, stage1Html)}`);
  } else {
    // Stage 1 failed — bot/datacenter-IP protection is the typical cause.
    // Log clearly so Phase 0 diagnostics can distinguish fetch_failed from render_failed.
    console.warn(`[/api/fetch] Stage 1 failed (${fetchResult.reason}): ${rawUrl}`);
  }

  // ── Stage 2: Firecrawl render ─────────────────────────────────────────────
  // Two escalation triggers (both blocked by render:'never'):
  //   1. Stage 1 succeeded but text is thin — SPA shell, JS-rendered content (original)
  //   2. Stage 1 failed (fetch_failed / timeout / non_html) — bot protection blocks our
  //      server IP entirely; Firecrawl routes through a browser fingerprint that passes.
  //      Bot-protected sites ALWAYS fail Stage 1 — failure must trigger render, not bail.
  // Definitive miss: the origin answered and said the path does not exist.
  // Bot protection presents as 403 / timeout / TLS refusal — never a clean 404/410 —
  // so rendering a 404 will not conjure content. Skipping Firecrawl here keeps the
  // Phase-0 direct-probe candidates (/leadership, /team, …) near-free on misses.
  const definitiveMiss = !stage1Ok
    && fetchResult.reason === 'fetch_failed'
    && /^HTTP (404|410)$/.test(fetchResult.detail || '');
  if (definitiveMiss) console.log(`[/api/fetch] Stage 1 ${fetchResult.detail} — definitive miss, skipping render escalation for ${rawUrl}`);

  const shouldEscalate = render !== 'never' && !definitiveMiss && (
    render === 'always' ||
    !stage1Ok ||                                          // hard Stage-1 failure (bot protection)
    (stage1Ok && isThin(stage1Text, stage1Html))          // existing: thin-but-ok
  );

  if (shouldEscalate) {
    const escalationReason = !stage1Ok
      ? `Stage 1 ${fetchResult.reason} (likely bot protection)`
      : `Stage 1 thin`;
    console.log(`[/api/fetch] Escalating to render — ${escalationReason} — for ${finalUrl || rawUrl}`);
    const renderResult = await renderWithService(finalUrl || rawUrl);
    if (renderResult.ok) {
      const totalMs = Date.now() - t0;
      console.log(`[/api/fetch] Stage 2 success in ${totalMs}ms total for ${rawUrl}`);
      const result = {
        ok: true, url: rawUrl, finalUrl: finalUrl || rawUrl,
        httpStatus, renderUsed: true,
        title: renderResult.title || stage1Title,
        text: renderResult.text,
        contentChars: renderResult.text.length,
        truncated: false,
        fetchedAt: new Date().toISOString(),
        cached: false,
      };
      return res.status(200).json(result);
    }

    // Stage 2 also failed
    if (!stage1Ok) {
      // Both stages failed — nothing to fall back to
      console.warn(`[/api/fetch] Both Stage 1 (${fetchResult.reason}) and Stage 2 (${renderResult.reason}) failed for ${rawUrl}`);
      return res.status(200).json({ ok: false, reason: renderResult.reason, url: rawUrl });
    }
    // Stage 1 had some text — Stage 2 failed — fall back to Stage 1 if substantial
    if (stage1Text.length < 200) {
      console.warn(`[/api/fetch] Both stages failed for ${rawUrl} — returning render_failed`);
      return res.status(200).json({ ok: false, reason: 'render_failed', url: rawUrl });
    }
    console.warn(`[/api/fetch] Stage 2 failed (${renderResult.reason}) — falling back to Stage 1 text for ${rawUrl}`);
    // Fall through to return Stage 1 text
  }

  if (!stage1Ok) {
    // render:'never' and Stage 1 failed — nothing we can do
    return res.status(200).json({ ok: false, reason: fetchResult.reason, url: rawUrl });
  }

  // ── Return Stage 1 result ──────────────────────────────────────────────────
  const totalMs = Date.now() - t0;
  console.log(`[/api/fetch] Stage 1 return in ${totalMs}ms for ${rawUrl}`);
  const cappedText = stage1Text.slice(0, TEXT_CAP_CHARS);
  const result = {
    ok: true, url: rawUrl, finalUrl,
    httpStatus, renderUsed: false,
    title: stage1Title,
    text: cappedText,
    contentChars: cappedText.length,
    truncated: truncated || stage1Text.length > TEXT_CAP_CHARS,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
  return res.status(200).json(result);
}

export const handler = httpAdapter(fetchHandler);
