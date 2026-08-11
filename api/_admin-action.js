// api/admin-action.js
//
// Superuser admin actions: password reset, resend invite, etc.
// POST with admin JWT + action payload.

import { isAllowedOrigin, verifyJwt, decodeJwtPayload, checkRateLimit } from "./_guard.js";
import { provisionTrialAccess } from "./_provision.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL;
if (!SUPERUSER_EMAIL) console.warn("[admin-action] SUPERUSER_EMAIL not set — all admin actions will be rejected");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sbFetch(path, method = "GET", body = null) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
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
  if (req.method !== "POST") return res.status(405).end();
  if (!SB_KEY) return res.status(500).json({ error: "Not configured" });

  // Origin check
  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Origin not allowed" });

  // Rate limiting
  const xff = req.headers["x-forwarded-for"];
  const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
           || (xff ? xff.split(",").pop().trim() : "")
           || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) return res.status(429).json({ error: "Too many requests" });

  // Verify JWT
  if (!await verifyJwt(req)) return res.status(401).json({ error: "Authentication required" });
  const authToken = (req.headers.authorization || "").slice(7);
  const payload = decodeJwtPayload(authToken);
  if (!payload?.sub || !UUID_RE.test(payload.sub)) return res.status(401).json({ error: "Authentication required" });

  // Verify superuser — email must match SUPERUSER_EMAIL
  const userRes = await sbFetch(`users?id=eq.${payload.sub}&select=email`);
  const callerEmail = userRes?.[0]?.email;
  if (!SUPERUSER_EMAIL || callerEmail?.toLowerCase() !== SUPERUSER_EMAIL.toLowerCase()) return res.status(403).json({ error: "Forbidden" });

  const { action, email, userId, orgId } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });
  // Validate any userId/orgId from request body to prevent PostgREST injection
  if (userId && !UUID_RE.test(userId)) return res.status(400).json({ error: "Invalid userId format" });
  if (orgId && !UUID_RE.test(orgId)) return res.status(400).json({ error: "Invalid orgId format" });

  try {
    if (action === "reset_password") {
      // Send password recovery email via Supabase Auth admin API
      const r = await fetch(`${SB_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (r.ok) return res.json({ ok: true, message: `Password reset sent to ${email}` });
      const d = await r.json();
      return res.status(400).json({ error: d.error_description || d.msg || "Failed to send reset" });
    }

    if (action === "resend_invite") {
      // DISABLED — email sending requires explicit opt-in to prevent spam.
      // Admin should use the invite link instead.
      return res.json({ ok: false, error: "Email sending is disabled. Use the invite link to share directly." });
    }

    if (action === "delete_user") {
      const { userId } = req.body || {};
      if (!userId) return res.status(400).json({ error: "userId required" });

      // 1. Delete from public.users table
      await fetch(`${SB_URL}/rest/v1/users?id=eq.${userId}`, {
        method: "DELETE",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });

      // 2. Delete from Supabase Auth (auth.users)
      const authRes = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      });

      if (authRes.ok || authRes.status === 404) {
        console.log(`[admin] Deleted user ${userId} (${email})`);
        return res.json({ ok: true, message: `Deleted ${email}` });
      }
      const d = await authRes.json();
      return res.status(400).json({ error: d.error_description || d.msg || "Failed to delete auth user" });
    }

    if (action === "delete_org") {
      const { orgId } = req.body || {};
      if (!orgId) return res.status(400).json({ error: "orgId required" });

      // 1. Unassign all members from this org
      await fetch(`${SB_URL}/rest/v1/users?org_id=eq.${orgId}`, {
        method: "PATCH",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ org_id: null }),
      });

      // 2. Delete pending invitations for this org
      await fetch(`${SB_URL}/rest/v1/invitations?org_id=eq.${orgId}`, {
        method: "DELETE",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });

      // 3. Delete the org
      const delRes = await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}`, {
        method: "DELETE",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });

      if (delRes.ok) {
        console.log(`[admin] Deleted org ${orgId}`);
        return res.json({ ok: true, message: `Org deleted` });
      }
      return res.status(400).json({ error: "Failed to delete org" });
    }

    if (action === "update_user") {
      const { userId, fields } = req.body || {};
      if (!userId || !fields) return res.status(400).json({ error: "userId and fields required" });
      // Only allow safe fields
      const allowed = ["role", "org_id", "name"];
      const patch = {};
      for (const k of allowed) { if (k in fields) patch[k] = fields[k]; }
      if (!Object.keys(patch).length) return res.status(400).json({ error: "No valid fields" });

      const r = await fetch(`${SB_URL}/rest/v1/users?id=eq.${userId}`, {
        method: "PATCH",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (r.ok) return res.json({ ok: true, message: `Updated ${email}` });
      return res.status(400).json({ error: "Failed to update user" });
    }

    if (action === "update_org") {
      const { orgId, fields } = req.body || {};
      if (!orgId || !fields) return res.status(400).json({ error: "orgId and fields required" });
      const allowed = ["name", "seller_url", "plan", "run_limit", "max_run_limit", "run_count", "max_run_count"];
      const patch = {};
      for (const k of allowed) { if (k in fields) patch[k] = fields[k]; }
      if (!Object.keys(patch).length) return res.status(400).json({ error: "No valid fields" });

      // Validate seller_url is a reasonable domain
      if (patch.seller_url && !/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(\/.*)?$/.test(patch.seller_url.replace(/^https?:\/\//, ""))) {
        return res.status(400).json({ error: "seller_url must be a valid domain" });
      }
      // Sanitize string fields against XSS
      if (patch.name) patch.name = String(patch.name).replace(/<[^>]*>/g, "").slice(0, 200);
      // DB constraint only allows trial/paid/suspended — map tier names
      if (patch.plan && !["trial", "paid", "suspended"].includes(patch.plan)) patch.plan = "paid";

      const r = await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}`, {
        method: "PATCH",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (r.ok) return res.json({ ok: true, message: `Updated org` });
      const errData = await r.json().catch(() => ({}));
      return res.status(400).json({ error: errData?.message || "Failed to update org" });
    }

    if (action === "create_org") {
      const { orgData } = req.body || {};
      if (!orgData?.name) return res.status(400).json({ error: "Org name required" });
      // DB constraint only allows trial/paid/suspended — map tier names to 'paid'
      if (orgData.plan && !["trial", "paid", "suspended"].includes(orgData.plan)) orgData.plan = "paid";
      const r = await fetch(`${SB_URL}/rest/v1/orgs`, {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(orgData),
      });
      const d = await r.json();
      console.log("[admin] create_org response:", r.status, JSON.stringify(d));
      if (d?.[0]?.id) return res.json({ ok: true, message: `Created "${orgData.name}"`, orgId: d[0].id });
      return res.status(400).json({ error: d?.message || d?.error || d?.details || `Failed to create org (${r.status})` });
    }

    if (action === "approve_access_request" || action === "dismiss_access_request") {
      const { requestId, reason } = req.body || {};
      if (!requestId) return res.status(400).json({ error: "requestId required" });
      if (!UUID_RE.test(requestId)) return res.status(400).json({ error: "Invalid requestId format" });

      const isApprove = action === "approve_access_request";
      const patch = isApprove
        ? { status: "approved", approved_via: "manual", approved_by: callerEmail, approved_at: new Date().toISOString() }
        : {
            status: "dismissed",
            dismissed_reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null,
            // approved_by/approved_at double as the generic "actioned by/at"
            // audit pair on dismissals (see migration 035).
            approved_by: callerEmail,
            approved_at: new Date().toISOString(),
          };

      // Conditional claim: only a 'pending' row transitions. A double-click or
      // concurrent tab matches zero rows and no-ops, so exactly one org and
      // one email can ever result from a single request row.
      const claimRes = await fetch(`${SB_URL}/rest/v1/access_requests?id=eq.${requestId}&status=eq.pending`, {
        method: "PATCH",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      const claimed = await claimRes.json().catch(() => null);
      if (!claimRes.ok) return res.status(400).json({ error: claimed?.message || "Failed to update request" });
      if (!Array.isArray(claimed) || claimed.length === 0) {
        return res.json({ ok: true, noop: true, message: "Request was already actioned" });
      }
      const row = claimed[0];

      if (!isApprove) {
        console.log(`[admin] Dismissed access request ${requestId} (${row.email})`);
        return res.json({ ok: true, message: `Dismissed request from ${row.email}` });
      }

      // Approve: trial org + invitation + welcome email — same shared path as
      // promo auto-approve. The claim above is the idempotency gate.
      const prov = await provisionTrialAccess({ email: row.email, name: row.name, company: row.company, invitedBy: callerEmail });
      if (prov.ok) {
        console.log(`[admin] Approved access request ${requestId} (${row.email}) — org ${prov.orgId}, ${prov.action}`);
        return res.json({ ok: true, message: `Approved ${row.email} — invite ${prov.emailSent ? "sent" : "NOT sent (check logs)"}` });
      }

      // Provisioning refused (existing user, etc.) — release the claim so the
      // row returns to the queue instead of being stuck 'approved' with no org.
      await fetch(`${SB_URL}/rest/v1/access_requests?id=eq.${requestId}&status=eq.approved`, {
        method: "PATCH",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ status: "pending", approved_via: null, approved_by: null, approved_at: null }),
      }).catch(() => {});
      console.warn(`[admin] Approve of ${requestId} (${row.email}) failed provisioning: ${prov.reason}`);
      return res.status(400).json({ error: `Provisioning failed: ${prov.reason}` });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("[admin-action] Error:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
