// src/components/OrgPanel.jsx
// Organization settings, team management, and user account panel.
// Renders as a slide-out drawer from the header.
// 3 tabs for org members (Team, Invite, Settings).
// No-org users see a simplified account panel with "Create Organization".

import React, { useState, useEffect } from "react";
import { fetchOrgMembers, fetchOrgInvitations, sbPatch } from "../lib/org.js";
import { timeAgo } from "../lib/utils.js";

// ── Sub-components ─────────────────────────────────────────────────────

function ReferralWidget({ sbToken }) {
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!sbToken) return;
    fetch("/api/referral", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
      body: JSON.stringify({ action: "get_referral_info" }) })
      .then(r => r.json()).then(d => { if (d.ok) setInfo(d); }).catch(() => {});
  }, [sbToken]);
  if (!info) return null;
  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        <input readOnly value={info.referral_link} style={{ flex: 1, fontSize: 11, padding: "6px 10px", border: "1.5px solid var(--line-0)", borderRadius: 6, background: "var(--bg-1)", color: "var(--ink-1)" }} />
        <button onClick={() => { navigator.clipboard.writeText(info.referral_link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1.5px solid var(--tan-0)", background: copied ? "var(--green-bg)" : "var(--surface)", color: copied ? "var(--green)" : "var(--tan-0)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          {copied ? "Copied" : "Copy Link"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--ink-2)" }}>
        <span><strong style={{ color: "var(--ink-0)" }}>{info.total_referred}</strong> referred</span>
        <span><strong style={{ color: "var(--green)" }}>{info.total_rewarded}</strong> earned runs</span>
        <span><strong style={{ color: "var(--tan-0)" }}>{info.bonus_runs_this_month}</strong>/{info.bonus_cap} bonus this month</span>
      </div>
    </div>
  );
}

function HubSpotSection({ sbToken }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!sbToken) return;
    fetch("/api/hubspot", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
      body: JSON.stringify({ action: "status" }) })
      .then(r => r.json()).then(setStatus).catch(() => setStatus({ connected: false }));
  }, [sbToken]);

  const startConnect = () => {
    setLoading(true);
    fetch("/api/hubspot", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
      body: JSON.stringify({ action: "start" }) })
      .then(r => r.json())
      .then(d => { if (d.url) window.location.href = d.url; else setLoading(false); })
      .catch(() => setLoading(false));
  };

  const disconnect = () => {
    if (!confirm("Disconnect HubSpot? You can reconnect anytime.")) return;
    setDisconnecting(true);
    fetch("/api/hubspot", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
      body: JSON.stringify({ action: "disconnect" }) })
      .then(() => setStatus({ connected: false }))
      .finally(() => setDisconnecting(false));
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>CRM Integration</div>
      {status?.connected ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "var(--ink-1)" }}>Connected to HubSpot{status.portalId ? ` (${status.portalId})` : ""}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6, marginBottom: 6 }}>
            Push briefs, deal routes, and CRM notes directly from any brief or post-call screen.
          </div>
          <button onClick={disconnect} disabled={disconnecting}
            style={{ padding: "5px 12px", borderRadius: 6, border: "1.5px solid var(--line-0)", background: "var(--surface)", color: "var(--ink-2)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 8 }}>
            Connect HubSpot to push briefs, deal routes, and CRM notes directly — no downloads, no copy-paste.
          </div>
          <button onClick={startConnect} disabled={loading || status === null}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#ff7a59", color: "#fff", fontSize: 12, fontWeight: 700, cursor: loading ? "wait" : "pointer", opacity: (loading || status === null) ? 0.6 : 1 }}>
            {loading ? "Connecting..." : status === null ? "Loading..." : "Connect HubSpot"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Role config ────────────────────────────────────────────────────────
const ROLE_META = {
  admin:   { label: "Admin",   color: "var(--navy)",  bg: "var(--navy-bg)" },
  manager: { label: "Manager", color: "var(--amber)", bg: "var(--amber-bg)" },
  rep:     { label: "Rep",     color: "var(--green)", bg: "var(--green-bg)" },
};
const r = (role) => ROLE_META[role] || ROLE_META.rep;

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Main component ─────────────────────────────────────────────────────

export default function OrgPanel({ orgCtx, setOrgCtx, sbUser, sbToken, onClose }) {
  const hasOrg = !!orgCtx?.id;
  const [tab, setTab] = useState(hasOrg ? "team" : "settings");
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("rep");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [orgName, setOrgName] = useState(orgCtx?.name || "");
  const [orgSellerUrl, setOrgSellerUrl] = useState(orgCtx?.seller_url || "");
  const [confirmAction, setConfirmAction] = useState(null);

  // Create org state (for users without an org)
  const [createOrgName, setCreateOrgName] = useState("");
  const [createOrgUrl, setCreateOrgUrl] = useState("");
  const [createOrgLoading, setCreateOrgLoading] = useState(false);
  const [createOrgMsg, setCreateOrgMsg] = useState("");

  const isAdmin = orgCtx?.userRole === "admin";
  const canViewTeam = isAdmin || orgCtx?.userRole === "manager";

  useEffect(() => {
    if (!orgCtx?.id || !sbToken || !canViewTeam) return;
    fetchOrgMembers(orgCtx.id, sbToken).then(setMembers);
    fetchOrgInvitations(orgCtx.id, sbToken).then(setInvitations);
  }, [orgCtx?.id, sbToken, canViewTeam]);

  // ── Org actions ──────────────────────────────────────────────────────
  const saveOrgName = async () => {
    if (!orgName.trim() || !isAdmin) return;
    const result = await sbPatch(`orgs?id=eq.${orgCtx.id}`, sbToken, { name: orgName.trim() });
    if (result?.[0]) setOrgCtx(prev => ({ ...prev, name: orgName.trim() }));
  };

  const saveOrgSellerUrl = async () => {
    if (!isAdmin) return;
    const result = await sbPatch(`orgs?id=eq.${orgCtx.id}`, sbToken, { seller_url: orgSellerUrl.trim() });
    if (result?.[0]) setOrgCtx(prev => ({ ...prev, seller_url: orgSellerUrl.trim() }));
  };

  const changeRole = async (userId, newRole) => {
    if (!isAdmin) return;
    await sbPatch(`users?id=eq.${userId}`, sbToken, { role: newRole });
    fetchOrgMembers(orgCtx.id, sbToken).then(setMembers);
  };

  const removeUser = async (userId) => {
    if (!isAdmin) return;
    await sbPatch(`users?id=eq.${userId}`, sbToken, { org_id: null, role: "rep" });
    fetchOrgMembers(orgCtx.id, sbToken).then(setMembers);
    setConfirmAction(null);
  };

  const revokeInvite = async (invId) => {
    if (!isAdmin) return;
    await fetch(`${SB_URL}/rest/v1/invitations?id=eq.${invId}`, {
      method: "DELETE", headers: { apikey: SB_KEY, Authorization: `Bearer ${sbToken}` },
    });
    fetchOrgInvitations(orgCtx.id, sbToken).then(setInvitations);
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !isAdmin) return;
    setInviteLoading(true); setInviteMsg("");
    try {
      const res = await fetch("/api/invite", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json();
      if (data.ok) {
        setInviteMsg(data.email_sent === false ? "Invitation created — copy the invite link below and share it directly." : `Invite sent to ${email}. They'll receive an email with a link to set their password.`);
        setInviteEmail("");
        fetchOrgInvitations(orgCtx.id, sbToken).then(setInvitations);
      } else {
        setInviteMsg("Error: " + (data.error || "Failed"));
      }
    } catch (e) { setInviteMsg("Error: " + e.message); }
    setInviteLoading(false);
  };

  const resendInvite = async (inv) => {
    if (!isAdmin) return;
    setInviteLoading(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
        body: JSON.stringify({ email: inv.email, role: inv.role }),
      });
      const data = await res.json();
      setInviteMsg(data.ok ? `Re-sent to ${inv.email}` : "Error: " + (data.error || "Failed"));
    } catch { setInviteMsg("Error resending"); }
    setInviteLoading(false);
    setTimeout(() => setInviteMsg(""), 4000);
  };

  // ── Create org (for users without one) ───────────────────────────────
  const createOrg = async () => {
    if (!createOrgName.trim()) { setCreateOrgMsg("Company name is required"); return; }
    setCreateOrgLoading(true); setCreateOrgMsg("");
    try {
      const url = createOrgUrl.trim();
      const sellerUrl = url ? (url.startsWith("http") ? url : `https://${url}`) : null;
      const res = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
        body: JSON.stringify({ action: "create_org", email: sbUser?.email, orgData: { name: createOrgName.trim(), seller_url: sellerUrl, plan: "trial" } }),
      });
      const data = await res.json();
      if (data.ok && data.orgId) {
        // Assign self to the new org as admin
        await sbPatch(`users?id=eq.${sbUser.id}`, sbToken, { org_id: data.orgId, role: "admin" });
        setCreateOrgMsg("Organization created!");
        // Reload org context
        setTimeout(() => window.location.reload(), 800);
      } else {
        setCreateOrgMsg("Error: " + (data.error || "Failed to create"));
      }
    } catch (e) { setCreateOrgMsg("Error: " + e.message); }
    setCreateOrgLoading(false);
  };

  const APP_URL = import.meta.env.VITE_APP_URL || "https://www.cambree.ai";
  const getInviteLink = (token) => `${APP_URL}?token=${token}`;
  const copyInviteLink = (token) => {
    navigator.clipboard.writeText(getInviteLink(token));
    setInviteMsg("Invite link copied");
    setTimeout(() => setInviteMsg(""), 3000);
  };

  // ── Tabs ─────────────────────────────────────────────────────────────
  const tabs = hasOrg ? [
    { id: "team", label: `Team (${members.length})`, show: canViewTeam },
    { id: "invite", label: `Invite${invitations.length ? ` (${invitations.length})` : ""}`, show: isAdmin },
    { id: "settings", label: "Settings", show: true },
  ].filter(t => t.show) : [{ id: "settings", label: "Settings", show: true }];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)" }} />

      <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} style={{
        position: "relative", zIndex: 1, width: "min(480px, 94vw)", background: "var(--surface)",
        borderLeft: "1px solid var(--line-0)", display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.1)", overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-0)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "Lora,serif", fontSize: 17, fontWeight: 700, color: "var(--ink-0)" }}>
              {hasOrg ? orgCtx.name || "Your Organization" : "Your Account"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
              {hasOrg ? (
                <>
                  {members.length === 1 ? "Just you" : `${members.length} members`}
                  {orgCtx?.plan && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: orgCtx.plan === "paid" ? "var(--green-bg)" : "var(--amber-bg)", color: orgCtx.plan === "paid" ? "var(--green)" : "var(--amber)" }}>{orgCtx.plan}</span>}
                </>
              ) : (
                <span>{sbUser?.email}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--ink-2)", padding: "4px 8px" }}>x</button>
        </div>

        {/* Tabs */}
        {tabs.length > 1 && (
          <div style={{ display: "flex", borderBottom: "1px solid var(--line-0)", padding: "0 16px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  padding: "10px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  background: "none", border: "none", fontFamily: "inherit",
                  color: tab === t.id ? "var(--ink-0)" : "var(--ink-3)",
                  borderBottom: tab === t.id ? "2.5px solid var(--tan-0)" : "2.5px solid transparent",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

          {/* ═══ TEAM TAB ═══ */}
          {tab === "team" && hasOrg && canViewTeam && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {members.map(m => (
                <div key={m.id} style={{
                  background: m.id === sbUser?.id ? "var(--bg-1)" : "var(--surface)",
                  border: "1px solid var(--line-0)", borderRadius: 10, padding: "10px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", background: r(m.role).bg, color: r(m.role).color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, fontFamily: "Lora,serif", flexShrink: 0,
                    }}>
                      {(m.name || m.email || "").split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || ".."}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {m.name || m.email?.split("@")[0]}
                        {m.id === sbUser?.id && <span style={{ fontSize: 9, color: "var(--ink-3)", fontWeight: 400 }}>(you)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.email}</div>
                    </div>

                    {/* Role + actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {isAdmin && m.id !== sbUser?.id ? (
                        <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                          style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line-0)", background: r(m.role).bg, color: r(m.role).color, fontWeight: 700 }}>
                          <option value="rep">Rep</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: r(m.role).bg, color: r(m.role).color }}>{r(m.role).label}</span>
                      )}
                      {isAdmin && m.id !== sbUser?.id && (
                        <button onClick={() => setConfirmAction({ type: "remove", userId: m.id, name: m.name || m.email })}
                          style={{ fontSize: 10, color: "var(--red)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Run usage */}
              <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Runs This Month</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-0)" }}>{orgCtx?.run_count || 0} / {orgCtx?.run_limit || 5}</div>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "var(--bg-2)", overflow: "hidden", marginTop: 6 }}>
                  <div style={{
                    height: "100%", borderRadius: 3, transition: "width 0.3s",
                    width: Math.min(100, Math.round((orgCtx?.run_count || 0) / (orgCtx?.run_limit || 5) * 100)) + "%",
                    background: (orgCtx?.run_count || 0) >= (orgCtx?.run_limit || 5) ? "var(--red)" : (orgCtx?.run_count || 0) >= (orgCtx?.run_limit || 5) * 0.8 ? "var(--amber)" : "var(--green)",
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* ═══ INVITE TAB ═══ */}
          {tab === "invite" && hasOrg && isAdmin && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Invite form */}
              <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "14px 16px" }}>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com" type="email"
                  style={{ width: "100%", fontSize: 14, padding: "10px 14px", border: "1.5px solid var(--line-0)", borderRadius: 8, boxSizing: "border-box", marginBottom: 10 }}
                  onKeyDown={e => { if (e.key === "Enter") sendInvite(); e.stopPropagation(); }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    style={{ fontSize: 13, padding: "9px 12px", border: "1.5px solid var(--line-0)", borderRadius: 8, flex: 1 }}>
                    <option value="rep">Rep</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={sendInvite} disabled={inviteLoading || !inviteEmail.trim()}
                    style={{ padding: "9px 20px", borderRadius: 8, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: inviteLoading || !inviteEmail.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
                    {inviteLoading ? "Sending..." : "Send Invite"}
                  </button>
                </div>
              </div>

              {inviteMsg && (
                <div style={{ fontSize: 12, fontWeight: 600, padding: "8px 12px", borderRadius: 8, color: inviteMsg.startsWith("Error") ? "var(--red)" : "var(--green)", background: inviteMsg.startsWith("Error") ? "var(--red-bg)" : "var(--green-bg)" }}>
                  {inviteMsg}
                </div>
              )}

              {/* Pending invitations */}
              {invitations.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                    Pending ({invitations.length})
                  </div>
                  {invitations.map(inv => (
                    <div key={inv.id} style={{ background: "var(--amber-bg)", border: "1px solid var(--amber)", borderRadius: 8, marginBottom: 6, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>{inv.email}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{r(inv.role).label} · expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => copyInviteLink(inv.token)} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--navy)", background: "var(--navy-bg)", color: "var(--navy)", cursor: "pointer", fontWeight: 600 }}>Link</button>
                        <button onClick={() => resendInvite(inv)} disabled={inviteLoading} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--line-0)", background: "none", color: "var(--ink-1)", cursor: "pointer", fontWeight: 600 }}>Resend</button>
                        <button onClick={() => revokeInvite(inv.id)} style={{ fontSize: 10, padding: "3px 4px", border: "none", background: "none", color: "var(--red)", cursor: "pointer", fontWeight: 600 }}>Revoke</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {invitations.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", padding: 12 }}>No pending invitations.</div>
              )}
            </div>
          )}

          {/* ═══ SETTINGS TAB ═══ */}
          {tab === "settings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* No-org state: Create Organization */}
              {!hasOrg && (
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "16px 18px", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", marginBottom: 6 }}>Create an Organization</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 12 }}>
                    Organizations share runs, sessions, and team features. Create one to invite your team and unlock the full platform.
                  </div>
                  <input value={createOrgName} onChange={e => setCreateOrgName(e.target.value)} placeholder="Company name"
                    style={{ width: "100%", fontSize: 14, padding: "10px 14px", border: "1.5px solid var(--line-0)", borderRadius: 8, boxSizing: "border-box", marginBottom: 8 }}
                    onKeyDown={e => e.stopPropagation()} />
                  <input value={createOrgUrl} onChange={e => setCreateOrgUrl(e.target.value)} placeholder="company.com (optional)"
                    style={{ width: "100%", fontSize: 13, padding: "9px 14px", border: "1.5px solid var(--line-0)", borderRadius: 8, boxSizing: "border-box", marginBottom: 10 }}
                    onKeyDown={e => { if (e.key === "Enter") createOrg(); e.stopPropagation(); }} />
                  <button onClick={createOrg} disabled={createOrgLoading || !createOrgName.trim()}
                    style={{ padding: "10px 24px", borderRadius: 8, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: createOrgLoading || !createOrgName.trim() ? 0.5 : 1, width: "100%" }}>
                    {createOrgLoading ? "Creating..." : "Create Organization"}
                  </button>
                  {createOrgMsg && (
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: createOrgMsg.startsWith("Error") ? "var(--red)" : "var(--green)" }}>
                      {createOrgMsg}
                    </div>
                  )}
                </div>
              )}

              {/* Org settings (only if user has an org) */}
              {hasOrg && (
                <>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 5 }}>Company Name</div>
                    {isAdmin ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={orgName} onChange={e => setOrgName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveOrgName(); e.stopPropagation(); }}
                          style={{ flex: 1, fontSize: 14, padding: "8px 12px", border: "1.5px solid var(--line-0)", borderRadius: 8 }} />
                        <button onClick={saveOrgName} style={{ padding: "8px 16px", borderRadius: 8, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, color: "var(--ink-1)" }}>{orgCtx?.name}</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>Company Website</div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6 }}>Pre-fills new sessions and helps match new teammates</div>
                    {isAdmin ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={orgSellerUrl} onChange={e => setOrgSellerUrl(e.target.value)} placeholder="https://yourcompany.com"
                          style={{ flex: 1, fontSize: 13, padding: "8px 12px", border: "1.5px solid var(--line-0)", borderRadius: 8 }}
                          onKeyDown={e => { if (e.key === "Enter") saveOrgSellerUrl(); e.stopPropagation(); }} />
                        <button onClick={saveOrgSellerUrl} style={{ padding: "8px 16px", borderRadius: 8, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--ink-1)" }}>{orgCtx?.seller_url || "Not set"}</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 5 }}>Plan</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: orgCtx?.plan === "paid" ? "var(--green-bg)" : "var(--amber-bg)", color: orgCtx?.plan === "paid" ? "var(--green)" : "var(--amber)" }}>
                        {orgCtx?.plan || "trial"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{orgCtx?.run_limit || 5} runs/month</span>
                    </div>
                  </div>
                </>
              )}

              {/* CRM Integration — available to all users */}
              <div style={{ borderTop: hasOrg ? "1px solid var(--line-0)" : "none", paddingTop: hasOrg ? 12 : 0 }}>
                <HubSpotSection sbToken={sbToken} />
              </div>

              {/* Refer & Earn */}
              <div style={{ borderTop: "1px solid var(--line-0)", paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Refer & Earn</div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 8 }}>
                  Share your referral link. When someone signs up and runs their first brief, your org gets <strong>+1 bonus run</strong> (up to 5/month).
                </div>
                <ReferralWidget sbToken={sbToken} />
              </div>

              <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6, borderTop: "1px solid var(--line-0)", paddingTop: 12 }}>
                Need help? <a href="mailto:info@cambree.ai" style={{ color: "var(--tan-0)" }}>info@cambree.ai</a>
              </div>
            </div>
          )}

          {/* Non-admin on team/invite tabs */}
          {!canViewTeam && tab === "team" && (
            <div style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", padding: 20 }}>
              Team visibility requires a manager or admin role.
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
          <div style={{ background: "var(--surface)", borderRadius: 12, padding: "24px 28px", maxWidth: 360, width: "90%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>Remove {confirmAction.name}?</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 20 }}>
              They'll lose access to this organization. You can re-invite them later.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmAction(null)} style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid var(--line-0)", background: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--ink-2)" }}>Cancel</button>
              <button onClick={() => removeUser(confirmAction.userId)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "var(--red)", color: "var(--surface)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
