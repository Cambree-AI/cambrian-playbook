// api/_provision.js — shared trial-org provisioning (underscore file: not routed)
//
// Creates a trial org + invitation row and sends the invite email, for flows
// that approve an access request: promo auto-approve (issue #2) now, the
// admin Approve queue (issue #3) next. Mirrors the new-user path in
// api/invite.js — keep the two in sync if the invitation flow changes.

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbFetch(path, method = "GET", body = null) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
  };
  if (method === "POST") headers.Prefer = "return=representation";
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === "DELETE" || r.status === 204) return null;
  return r.json().catch(() => null);
}

// Send the Supabase auth invite email carrying the invitation token.
// Falls back to a password-recovery email if the auth user already exists
// from a prior partial invite (same handling as api/invite.js).
async function sendInviteEmail(email, invitationToken) {
  const authRes = await fetch(`${SB_URL}/auth/v1/invite`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, data: { invitation_token: invitationToken } }),
  });
  if (authRes.status < 400) return { emailSent: true, action: "invited" };

  const authData = await authRes.json().catch(() => ({}));
  if (authRes.status === 422 || (authData.msg || "").includes("already been registered")) {
    try {
      await fetch(`${SB_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      return { emailSent: true, action: "recovery_sent" };
    } catch {}
  }
  console.warn("[provision] Auth invite failed:", authRes.status, JSON.stringify(authData));
  return { emailSent: false, action: "email_failed" };
}

/**
 * Provision access for an approved requester: trial org + invitation + email.
 * The requester becomes admin of their own org so they can invite teammates.
 *
 * Returns { ok: true, orgId, invitationId, emailSent, action }
 *      or { ok: false, reason } — caller should fall back to the manual queue.
 */
export async function provisionTrialAccess({ email, name, company, invitedBy = "system", promoCode = null }) {
  if (!SB_URL || !SB_KEY) return { ok: false, reason: "not_configured" };
  const cleanEmail = email.trim().toLowerCase();

  // Already a full user → nothing to provision; needs a human look.
  const existing = await sbFetch(`users?email=eq.${encodeURIComponent(cleanEmail)}&select=id,org_id`);
  if (Array.isArray(existing) && existing.length > 0) return { ok: false, reason: "existing_user" };

  // Unaccepted, unexpired invitation from an earlier approval → don't create a
  // second org; re-send the email with the existing token.
  const pending = await sbFetch(
    `invitations?email=eq.${encodeURIComponent(cleanEmail)}&accepted_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,org_id,token&limit=1`
  );
  if (Array.isArray(pending) && pending.length > 0) {
    const { emailSent, action } = await sendInviteEmail(cleanEmail, pending[0].token);
    return { ok: true, orgId: pending[0].org_id, invitationId: pending[0].id, emailSent, action: `resent_${action}` };
  }

  // Fresh trial org (plan/run limits come from column defaults, as in
  // _usage.js). The admitting promo code is stamped on the org — checkout
  // verifies run-pack eligibility against it (migration 034). Conditional so
  // non-promo callers (issue #3 admin approval) never touch the column.
  const orgName = (company || name || cleanEmail).trim();
  const created = await sbFetch("orgs", "POST",
    promoCode ? { name: orgName, promo_code: promoCode } : { name: orgName });
  const orgId = Array.isArray(created) ? created[0]?.id : created?.id;
  if (!orgId) {
    console.warn("[provision] Org creation failed:", JSON.stringify(created));
    return { ok: false, reason: "org_create_failed" };
  }

  const invResult = await sbFetch("invitations", "POST", {
    org_id: orgId,
    email: cleanEmail,
    role: "admin",
    invited_by: invitedBy,
  });
  const inv = Array.isArray(invResult) ? invResult[0] : invResult;
  if (!inv?.token) {
    console.warn("[provision] Invitation creation failed:", JSON.stringify(invResult));
    // Don't leave an orphan org with no members and no way in
    await sbFetch(`orgs?id=eq.${orgId}`, "DELETE").catch(() => {});
    return { ok: false, reason: "invitation_failed" };
  }

  const { emailSent, action } = await sendInviteEmail(cleanEmail, inv.token);
  return { ok: true, orgId, invitationId: inv.id, emailSent, action };
}
