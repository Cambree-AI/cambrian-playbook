// api/invite.js — Send org invitations
//
// POST { email, role } with admin JWT → creates invitation row +
// sends Supabase invite email with acceptance link.

import { applyCors, isAllowedOrigin, verifyJwt, decodeJwtPayload } from "./_guard.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = process.env.VITE_APP_URL || "https://www.cambriancatalyst.ai";

// Stricter rate limit for invites — 10 per minute per IP
const inviteRateBuckets = new Map();
function checkInviteRateLimit(ip) {
  const now = Date.now();
  const bucket = inviteRateBuckets.get(ip);
  if (!bucket || (now - bucket.windowStart) > 60_000) {
    inviteRateBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  bucket.count++;
  return bucket.count <= 10;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function sbFetch(path, method = "GET", body = null, token = SB_KEY) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (method === "POST") headers.Prefer = "return=representation";
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  if (req.method !== "POST") return res.status(405).end();
  if (!SB_KEY) return res.status(500).json({ error: "Server not configured for invitations" });

  // Origin check
  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "origin not allowed" });

  // Rate limiting — strict for invite endpoint (email bombing prevention)
  const xff = req.headers["x-forwarded-for"];
  const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
           || (xff ? xff.split(",").pop().trim() : "")
           || req.headers["x-real-ip"]
           || req.socket?.remoteAddress || "unknown";
  if (!checkInviteRateLimit(ip)) {
    return res.status(429).json({ error: "Too many invitations — try again in a minute" });
  }

  // Verify caller identity — use consolidated JWT verification from _guard.js
  if (!await verifyJwt(req)) return res.status(401).json({ error: "Authentication required" });
  const authToken = (req.headers.authorization || "").slice(7);
  const payload = decodeJwtPayload(authToken);
  if (!payload?.sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) return res.status(401).json({ error: "Authentication required" });

  const { email, role, orgId: overrideOrgId } = req.body || {};
  if (!email || !EMAIL_RE.test(email.trim())) return res.status(400).json({ error: "Valid email required (user@domain.tld)" });
  if (role && !["rep", "manager", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });

  // Verify the caller is an admin of their org (or superuser for cross-org invites)
  const users = await sbFetch(`users?id=eq.${payload.sub}&select=org_id,role,email`);
  const caller = users?.[0];
  const isSuperuser = process.env.SUPERUSER_EMAIL && caller?.email?.toLowerCase() === process.env.SUPERUSER_EMAIL.toLowerCase();

  // Superuser can specify any orgId; regular admins use their own org
  const targetOrgId = (isSuperuser && overrideOrgId) ? overrideOrgId : caller?.org_id;

  if (!targetOrgId) return res.status(403).json({ error: "You must belong to an organization" });
  if (!isSuperuser && caller.role !== "admin") return res.status(403).json({ error: "Only admins can invite users" });

  const cleanEmail = email.trim().toLowerCase();

  // ── ROUTE 1: User already exists in our system ──────────────────────
  const existingUsers = await sbFetch(`users?email=eq.${encodeURIComponent(cleanEmail)}&select=id,org_id,role`);
  const existingUser = existingUsers?.[0];

  if (existingUser) {
    // User exists — are they already in this org?
    if (existingUser.org_id === targetOrgId) {
      // Already in the org — send a password reset so they can get back in
      try {
        await fetch(`${SB_URL}/auth/v1/recover`, {
          method: "POST",
          headers: { apikey: SB_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail }),
        });
      } catch {}
      return res.json({ ok: true, action: "password_reset", email_sent: true,
        note: `${cleanEmail} is already a member. Sent a password reset link so they can get back in.` });
    }

    // User exists but in a different org (or no org) — move them to this org and send reset
    await fetch(`${SB_URL}/rest/v1/users?id=eq.${existingUser.id}`, {
      method: "PATCH",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ org_id: targetOrgId, role: role || existingUser.role || "rep" }),
    });
    try {
      await fetch(`${SB_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
    } catch {}
    return res.json({ ok: true, action: "reassigned_and_reset", email_sent: true,
      note: `${cleanEmail} already had an account. Moved to your org and sent a password reset link.` });
  }

  // ── ROUTE 2: New user — create invitation ──────────────────────────
  // Delete any stale PENDING invitations (not accepted ones — keep history)
  await fetch(`${SB_URL}/rest/v1/invitations?org_id=eq.${targetOrgId}&email=eq.${encodeURIComponent(cleanEmail)}&accepted_at=is.null`, {
    method: "DELETE",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });

  // Create fresh invitation record
  const invResult = await sbFetch("invitations", "POST", {
    org_id: targetOrgId,
    email: cleanEmail,
    role: role || "rep",
    invited_by: payload.sub,
  });

  if (invResult?.code || invResult?.message) {
    // Might be UNIQUE constraint from an accepted invite — clean up and retry
    if (invResult.code === "23505" || (invResult.message || "").includes("duplicate")) {
      await fetch(`${SB_URL}/rest/v1/invitations?org_id=eq.${targetOrgId}&email=eq.${encodeURIComponent(cleanEmail)}`, {
        method: "DELETE",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      const retryResult = await sbFetch("invitations", "POST", {
        org_id: targetOrgId, email: cleanEmail, role: role || "rep", invited_by: payload.sub,
      });
      if (retryResult?.code || retryResult?.message) {
        console.warn("[invite] Retry failed:", JSON.stringify(retryResult));
        return res.status(400).json({ error: `Failed to create invitation: ${retryResult.message || retryResult.code}` });
      }
      Object.assign(invResult, retryResult);
    } else {
      console.warn("[invite] Failed to create invitation:", JSON.stringify(invResult));
      return res.status(400).json({ error: `Failed to create invitation: ${invResult.message || invResult.code || "unknown error"}` });
    }
  }

  const token = (Array.isArray(invResult) ? invResult[0] : invResult)?.token;
  if (!token) return res.status(500).json({ error: "Failed to generate invitation token" });

  // Send invite email — Supabase creates the auth user and sends the magic link
  const skipEmail = req.body?.skipEmail === true;

  if (!skipEmail) {
    try {
      const authRes = await fetch(`${SB_URL}/auth/v1/invite`, {
        method: "POST",
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: cleanEmail,
          data: { invitation_token: token },
        }),
      });
      const authData = await authRes.json();

      if (authRes.status >= 400) {
        // User might already exist in auth.users from a prior invite — send recovery instead
        if (authRes.status === 422 || (authData.msg || "").includes("already been registered")) {
          try {
            await fetch(`${SB_URL}/auth/v1/recover`, {
              method: "POST",
              headers: { apikey: SB_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ email: cleanEmail }),
            });
          } catch {}
          return res.json({ ok: true, invitation_id: (Array.isArray(invResult) ? invResult[0] : invResult).id,
            email_sent: true, action: "recovery_sent",
            note: `${cleanEmail} already had a partial account. Sent a password reset link instead.` });
        }
        console.warn("[invite] Supabase auth invite failed:", authData);
        return res.json({ ok: true, invitation_id: (Array.isArray(invResult) ? invResult[0] : invResult).id,
          email_sent: false, note: "Invitation created but email failed. Share the invite link directly." });
      }
    } catch (e) {
      console.warn("[invite] Email send error:", e.message);
    }
    res.json({ ok: true, invitation_id: (Array.isArray(invResult) ? invResult[0] : invResult).id, email_sent: true });
  } else {
    res.json({ ok: true, invitation_id: (Array.isArray(invResult) ? invResult[0] : invResult).id,
      email_sent: false, note: "Invitation created — use the invite link to share directly. No email was sent." });
  }
}
