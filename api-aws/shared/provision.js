// api-aws/shared/provision.js
/* global process */
//
// Trial-org provisioning for the AWS Lambda endpoints — the port of
// api/_provision.js (issue #87). Used by request-access now; the admin
// Approve queue reuses it when api/admin.js ports.
//
// KEEP IN SYNC with api/_provision.js until the Vercel copy is
// decommissioned: org/invitation shapes and the email fallback chain must
// stay identical so provisioning behaves the same on either platform.
//
// Platform difference: env vars are read lazily (per call) instead of at
// module scope — SUPABASE_SERVICE_KEY and RESEND_API_KEY arrive via Secrets
// Manager at cold start (shared/secrets.js), after module init.

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_KEY || "";
const resendKey = () => process.env.RESEND_API_KEY || "";
const FROM_ADDR = "Cambree <noreply@cambree.ai>";

async function sbFetch(path, method = "GET", body = null) {
  const headers = {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    "Content-Type": "application/json",
  };
  if (method === "POST") headers.Prefer = "return=representation";
  const r = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
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
  const SB_URL = supabaseUrl();
  const SB_KEY = serviceKey();
  const authRes = await fetch(`${SB_URL}/auth/v1/invite`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, data: { invitation_token: invitationToken } }),
  });
  if (authRes.status < 400) return { emailSent: true, action: "invited" };

  const authData = await authRes.json().catch(() => ({}));
  if (authRes.status === 422 || (authData.msg || "").includes("already been registered")) {
    // Auth account already exists (prior partial invite). A bare recovery
    // email reads as an out-of-the-blue "reset your password" — send a
    // contextual approval email with an admin-generated recovery link when
    // Resend is available, and fall back to the plain recovery template.
    try {
      if (resendKey()) {
        const linkRes = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
          method: "POST",
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "recovery", email }),
        });
        const linkData = await linkRes.json().catch(() => ({}));
        const actionLink = linkData?.action_link;
        if (actionLink) {
          const mailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey()}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: FROM_ADDR,
              to: email,
              subject: "Your Cambree access is approved — sign in",
              text:
                `Good news — your Cambree access request is approved.\n\n` +
                `You already have an account with this address, so use the link below to set your password and sign in:\n\n` +
                `${actionLink}\n\n` +
                `If you have questions, just reply to this email.\n\n` +
                `— The Cambree team`,
            }),
          });
          if (mailRes.ok) return { emailSent: true, action: "existing_account_email" };
          console.warn("[provision] Existing-account Resend failed:", mailRes.status);
        }
      }
      await fetch(`${SB_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      return { emailSent: true, action: "recovery_sent" };
    } catch { /* fall through to email_failed */ }
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
export async function provisionTrialAccess({ email, name, company, invitedBy = "system", promoCode = null, referredBy = null }) {
  if (!supabaseUrl() || !serviceKey()) return { ok: false, reason: "not_configured" };
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

  // Fresh trial org. The admitting promo code is stamped on the org — checkout
  // verifies run-pack eligibility against it (migration 034). Conditional so
  // non-promo callers (issue #3 admin approval) never touch the column.
  // Every new trial gets 10 free runs — the promo funnel (10 free → $45/mo half-off
  // → Starter) applies to all signups, promo code or not (issue #151).
  const orgName = (company || name || cleanEmail).trim();
  const created = await sbFetch("orgs", "POST",
    promoCode ? { name: orgName, promo_code: promoCode, run_limit: 10 } : { name: orgName, run_limit: 10 });
  const orgId = Array.isArray(created) ? created[0]?.id : created?.id;
  if (!orgId) {
    console.warn("[provision] Org creation failed:", JSON.stringify(created));
    return { ok: false, reason: "org_create_failed" };
  }

  // referred_by (migration 039) is copied onto the users row by the
  // auto_provision trigger at signup — server-side referral attribution
  // that survives the email hop (issue #154).
  const invResult = await sbFetch("invitations", "POST", {
    org_id: orgId,
    email: cleanEmail,
    role: "admin",
    invited_by: invitedBy,
    ...(referredBy ? { referred_by: referredBy } : {}),
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
