// api/request-access.js
//
// Invite-only beta: handles "Request access" form submissions.
// No promo code (or an invalid one): inserts the request into access_requests
// and emails the founder via Resend — a human approves later.
// Valid promo code: provisions a trial org + invitation and sends the invite
// email in the same request, no human in the loop (issue #2). Codes live in
// the promo_codes table (migration 033) so they rotate without a deploy.
// Does NOT create any auth account directly — signup happens via the emailed
// invite link.

import { applyCors, isAllowedOrigin, checkRateLimit } from "./_guard.js";
import { provisionTrialAccess } from "./_provision.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FOUNDER_EMAIL = "joe@cambree.ai";
const FROM_ADDR = "Cambree <noreply@cambree.ai>";

if (!RESEND_API_KEY) console.warn("[request-access] RESEND_API_KEY not set — founder email disabled");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const QUEUED_MSG = "Request received. We review every request and send invites personally.";
const PROMO_MSG = "You're in! Check your email for your invite link.";
const BAD_CODE_MSG = "That code wasn't recognized, so your request has been queued for review — we'll send your invite personally.";

// Stricter bucket for promo-code attempts so codes can't be enumerated:
// 5 attempts per 15 minutes per IP. In-memory and per-instance (best effort),
// same pattern as api/invite.js. The code comparison itself happens inside
// the redeem_promo_code() SQL function via an index lookup, so response-time
// differences leak nothing useful; this limit is the real defense.
const promoAttemptBuckets = new Map();
function checkPromoAttemptLimit(ip) {
  const now = Date.now();
  const bucket = promoAttemptBuckets.get(ip);
  if (!bucket || (now - bucket.windowStart) > 15 * 60_000) {
    promoAttemptBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  bucket.count++;
  return bucket.count <= 5;
}

async function sbRest(path, method = "GET", body = null, prefer = null) {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  return fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// Atomic validate + consume via SQL (migration 033). False = invalid code.
async function redeemPromoCode(code) {
  try {
    const r = await sbRest("rpc/redeem_promo_code", "POST", { p_code: code });
    if (!r.ok) { console.warn("[request-access] redeem_promo_code failed:", r.status); return false; }
    return (await r.json()) === true;
  } catch (e) {
    console.warn("[request-access] redeem_promo_code error:", e.message);
    return false;
  }
}

async function notifyFounder({ name, email, company, note, created_at, extra }) {
  if (!RESEND_API_KEY) return;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDR,
        to: FOUNDER_EMAIL,
        reply_to: email,
        subject: `New Cambree access request — ${company}`,
        text:
          `New access request for Cambree private beta:\n\n` +
          `Name:    ${name}\n` +
          `Email:   ${email}\n` +
          `Company: ${company}\n` +
          (note ? `Note:    ${note}\n` : "") +
          (extra ? `Flag:    ${extra}\n` : "") +
          `When:    ${created_at}\n\n` +
          // A Supabase-dashboard auth invite carries no invitation_token and
          // creates no org — the user would land with broken onboarding. The
          // admin queue (or the in-app invite flow) provisions correctly.
          `Approve or dismiss it from Reporting → Access Requests in the app.`,
      }),
    });
    if (!r.ok) console.warn("[request-access] Resend responded", r.status, await r.text().catch(() => ""));
  } catch (e) {
    console.warn("[request-access] Resend call failed:", e.message);
  }
}

// Acknowledgment to the requester on the queued path — without it the manual
// path is completely silent until a human approves (issue #3 gap analysis).
async function notifyRequester({ name, email }) {
  if (!RESEND_API_KEY) return;
  const firstName = (name || "").trim().split(/\s+/)[0] || "there";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDR,
        to: email,
        subject: "We got your Cambree access request",
        text:
          `Hi ${firstName},\n\n` +
          `Thanks for requesting access to the Cambree private beta. A human reviews every request personally — ` +
          `when yours is approved you'll get an invite email from this address with a link to set up your account.\n\n` +
          `No action needed in the meantime. If you have questions, just reply to this email.\n\n` +
          `— The Cambree team`,
      }),
    });
    if (!r.ok) console.warn("[request-access] Requester ack Resend responded", r.status, await r.text().catch(() => ""));
  } catch (e) {
    console.warn("[request-access] Requester ack failed:", e.message);
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  if (req.method !== "POST") return res.status(405).end();

  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Origin not allowed" });

  // Rate limit per IP (reuses the shared sliding-window bucket from _guard.js)
  const xff = req.headers["x-forwarded-for"];
  const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
           || (xff ? xff.split(",").pop().trim() : "")
           || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) return res.status(429).json({ error: "Too many requests" });

  const { name, email, company, note, promoCode } = req.body || {};
  if (!name || !email || !company) return res.status(400).json({ error: "Name, email, and company are required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Invalid email format" });
  if (name.length > 200 || email.length > 254 || company.length > 200 || (note && note.length > 2000)) {
    return res.status(400).json({ error: "Input too long" });
  }
  const code = typeof promoCode === "string" ? promoCode.trim() : "";
  if (code.length > 64) return res.status(400).json({ error: "Input too long" });

  // Normalize: auth + users.email are lowercase, and the dedup/queue matching
  // must treat Louis.Ruiz@ and louis.ruiz@ as the same requester (observed
  // duplicate in production, 2026-08-11).
  const cleanEmail = email.trim().toLowerCase();

  const created_at = new Date().toISOString();

  // Idempotency: if the same email was already submitted within the last 15
  // minutes, return success without inserting a duplicate row, provisioning a
  // second org, or re-sending any email.
  const idempotencyWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  try {
    const dupCheck = await sbRest(
      `access_requests?email=eq.${encodeURIComponent(cleanEmail)}&created_at=gte.${encodeURIComponent(idempotencyWindow)}&select=id,status&limit=1`
    );
    if (dupCheck.ok) {
      const rows = await dupCheck.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const wasApproved = rows[0].status === "approved";
        return res.json({ ok: true, approved: wasApproved, message: wasApproved ? PROMO_MSG : QUEUED_MSG });
      }
    }
  } catch (e) { console.warn("[request-access] Idempotency check failed:", e.message); }

  // Promo path: consume a code use, then provision. A consumed use whose
  // provisioning fails falls back to the manual queue (flagged to the founder).
  let codeRedeemed = false;
  if (code) {
    if (!checkPromoAttemptLimit(ip)) return res.status(429).json({ error: "Too many code attempts — try again later" });
    codeRedeemed = await redeemPromoCode(code);
  }

  // Insert the request row (captured id is needed to mark promo approval)
  let requestId = null;
  try {
    const insRes = await sbRest("access_requests", "POST",
      { name, email: cleanEmail, company, note: note || null, status: "pending", created_at, promo_code: code || null },
      "return=representation");
    if (insRes.ok) {
      const rows = await insRes.json().catch(() => null);
      requestId = Array.isArray(rows) ? rows[0]?.id : null;
    }
  } catch (e) {
    console.warn("[request-access] Failed to insert request:", e.message);
  }

  if (codeRedeemed) {
    const prov = await provisionTrialAccess({ email: cleanEmail, name, company, invitedBy: "system:promo", promoCode: code });
    if (prov.ok) {
      if (requestId) {
        try {
          await sbRest(`access_requests?id=eq.${requestId}`, "PATCH",
            { status: "approved", approved_via: "promo", approved_at: new Date().toISOString() },
            "return=minimal");
        } catch (e) { console.warn("[request-access] Failed to mark approved:", e.message); }
      }
      return res.json({ ok: true, approved: true, message: PROMO_MSG });
    }
    // Provisioning refused (existing user, etc.) — queue for a human instead.
    console.warn("[request-access] Promo provisioning fell back to queue:", prov.reason);
    await notifyFounder({ name, email: cleanEmail, company, note, created_at, extra: `Valid promo code, but auto-provision failed (${prov.reason}) — approve manually.` });
    await notifyRequester({ name, email: cleanEmail });
    return res.json({ ok: true, approved: false, message: QUEUED_MSG });
  }

  // Manual queue path (no code, or code not recognized)
  await notifyFounder({ name, email: cleanEmail, company, note, created_at, extra: code ? "Submitted an unrecognized promo code." : null });
  await notifyRequester({ name, email: cleanEmail });

  // Always succeed for the user once validated — email/DB failures are logged, not surfaced.
  return res.json({ ok: true, approved: false, message: code ? BAD_CODE_MSG : QUEUED_MSG });
}
