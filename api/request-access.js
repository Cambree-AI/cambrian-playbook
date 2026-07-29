// api/request-access.js
//
// Invite-only beta: handles "Request access" form submissions.
// Inserts the request into access_requests and emails the founder via Resend.
// Does NOT create any auth account — self-service signup is disabled.

import { isAllowedOrigin, checkRateLimit } from "./_guard.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FOUNDER_EMAIL = "joe@cambree.ai";
const FROM_ADDR = "Cambree <noreply@cambree.ai>";

if (!RESEND_API_KEY) console.warn("[request-access] RESEND_API_KEY not set — founder email disabled");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Origin not allowed" });

  // Rate limit per IP (reuses the shared sliding-window bucket from _guard.js)
  const xff = req.headers["x-forwarded-for"];
  const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
           || (xff ? xff.split(",").pop().trim() : "")
           || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) return res.status(429).json({ error: "Too many requests" });

  const { name, email, company, note } = req.body || {};
  if (!name || !email || !company) return res.status(400).json({ error: "Name, email, and company are required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Invalid email format" });
  if (name.length > 200 || email.length > 254 || company.length > 200 || (note && note.length > 2000)) {
    return res.status(400).json({ error: "Input too long" });
  }

  const created_at = new Date().toISOString();

  // Idempotency: if the same email was already submitted within the last 15 minutes, return
  // success without inserting a duplicate row or re-sending the founder notification email.
  const idempotencyWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  try {
    const dupCheck = await fetch(
      `${SB_URL}/rest/v1/access_requests?email=eq.${encodeURIComponent(email.trim())}&created_at=gte.${encodeURIComponent(idempotencyWindow)}&select=id&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (dupCheck.ok) {
      const rows = await dupCheck.json();
      if (Array.isArray(rows) && rows.length > 0) {
        return res.json({ ok: true, message: "Request received. We review every request and send invites personally." });
      }
    }
  } catch (e) { console.warn("[request-access] Idempotency check failed:", e.message); }

  // 1. Insert the request row
  try {
    await fetch(`${SB_URL}/rest/v1/access_requests`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name, email, company, note: note || null, status: "pending", created_at }),
    });
  } catch (e) {
    console.warn("[request-access] Failed to insert request:", e.message);
  }

  // 2. Email the founder via Resend — fail gracefully (still 200 to the user)
  if (RESEND_API_KEY) {
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
            `When:    ${created_at}\n\n` +
            `Send them an invite from Supabase Auth if approved.`,
        }),
      });
      if (!r.ok) console.warn("[request-access] Resend responded", r.status, await r.text().catch(() => ""));
    } catch (e) {
      console.warn("[request-access] Resend call failed:", e.message);
    }
  }

  // Always succeed for the user once validated — email/DB failures are logged, not surfaced.
  return res.json({ ok: true, message: "Request received. We review every request and send invites personally." });
}
