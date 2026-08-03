// src/components/UserDashboard.jsx — Full-page dashboard for regular users
// Combines OrgPanel (team, invites, settings) and ReportPanel (analytics, insights)
// into a single two-column layout using admin-* CSS classes from App.css.

import React, { useState, useEffect, useMemo } from "react";
import { fetchOrgMembers, fetchOrgInvitations, sbPatch } from "../lib/org.js";
import { timeAgo } from "../lib/utils.js";

// ── Sortable column header component ──
function SortTh({ sortKey, sortDir, onSort, colKey, children, style }) {
  const active = sortKey === colKey;
  return (
    <th
      style={{ cursor: "pointer", userSelect: "none", ...(active ? { color: "var(--ink-0)", fontWeight: 800, background: "rgba(0,0,0,0.02)" } : {}), ...style }}
      onClick={() => onSort(colKey)}
    >
      {children}{" "}
      <span style={{ color: "var(--ink-2)", fontSize: 10 }}>{active ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</span>
    </th>
  );
}

// ── HubSpotSection (CRM integration) ──
function HubSpotSection({ sbToken, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!sbToken) return;
    fetch("/api/hubspot", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
      body: JSON.stringify({ action: "status" }) })
      .then(r => r.json()).then(s => { setStatus(s); onStatusChange?.(s); }).catch(() => setStatus({ connected: false }));
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
      .then(() => { setStatus({ connected: false }); onStatusChange?.({ connected: false }); })
      .finally(() => setDisconnecting(false));
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>CRM Integration</div>
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

// ── ReferralWidget ──
function ReferralWidget({ sbToken }) {
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!sbToken) return;
    fetch("/api/referral", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
      body: JSON.stringify({ action: "get_referral_info" }) })
      .then(r => r.json()).then(d => { if (d.ok) setInfo(d); }).catch(() => {});
  }, [sbToken]);
  if (!info) return <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Loading referral info...</div>;
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

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const ROLE_META = {
  admin: { label: "Admin", color: "var(--navy)", bg: "var(--navy-bg)" },
  manager: { label: "Manager", color: "var(--amber)", bg: "var(--amber-bg)" },
  rep: { label: "Rep", color: "var(--green)", bg: "var(--green-bg)" },
};
const r = (role) => ROLE_META[role] || ROLE_META.rep;

// Lazy import OrgPanel for no-org users
import OrgPanel from "./OrgPanel.jsx";

export default function UserDashboard({ orgCtx, setOrgCtx, sbUser, sbToken, savedSessions, onClose, onHubspotChange }) {
  // If user has no org, show the simplified OrgPanel (has "Create Organization" flow)
  if (!orgCtx) return <OrgPanel orgCtx={orgCtx} setOrgCtx={setOrgCtx} sbUser={sbUser} sbToken={sbToken} onClose={onClose} />;

  const [tab, setTab] = useState("dashboard");

  // ── Team data ──
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [teamSessions, setTeamSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionFilter, setSessionFilter] = useState("");

  // ── Invite state ──
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("rep");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkEmails, setBulkEmails] = useState("");

  // ── Settings state ──
  const [orgName, setOrgName] = useState(orgCtx?.name || "");
  const [orgSellerUrl, setOrgSellerUrl] = useState(orgCtx?.seller_url || "");

  // ── UI state ──
  const [confirmAction, setConfirmAction] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);

  // ── Sort state for Team Members table ──
  const [teamSortKey, setTeamSortKey] = useState(null);
  const [teamSortDir, setTeamSortDir] = useState("asc");
  const onTeamSort = (key) => {
    if (teamSortKey === key) setTeamSortDir(d => d === "asc" ? "desc" : "asc");
    else { setTeamSortKey(key); setTeamSortDir("asc"); }
  };
  // ── Sort state for Sessions table ──
  const [udSessionSortKey, setUdSessionSortKey] = useState(null);
  const [udSessionSortDir, setUdSessionSortDir] = useState("asc");
  const onUdSessionSort = (key) => {
    if (udSessionSortKey === key) setUdSessionSortDir(d => d === "asc" ? "desc" : "asc");
    else { setUdSessionSortKey(key); setUdSessionSortDir("asc"); }
  };

  const isAdmin = orgCtx?.userRole === "admin";
  const isManager = orgCtx?.userRole === "manager";
  const canViewTeam = isAdmin || isManager;

  // ── Load team data on mount ──
  useEffect(() => {
    if (!orgCtx?.id || !sbToken) return;
    if (canViewTeam) {
      fetchOrgMembers(orgCtx.id, sbToken).then(setMembers);
      fetchOrgInvitations(orgCtx.id, sbToken).then(setInvitations);
    }
  }, [orgCtx?.id, sbToken, canViewTeam]);

  // ── Load team sessions when Sessions tab is selected ──
  const loadTeamSessions = async () => {
    if (!canViewTeam) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/sessions?select=id,name,seller_url,updated_at,created_at,user_id&order=updated_at.desc&limit=200`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${sbToken}` } }
      );
      const rows = await res.json();
      setTeamSessions(Array.isArray(rows) ? rows : []);
    } catch { setTeamSessions([]); }
    setSessionsLoading(false);
  };

  useEffect(() => {
    if ((tab === "team" || tab === "sessions" || tab === "insights") && canViewTeam && teamSessions.length === 0) loadTeamSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, canViewTeam]);

  // ── Close dot menu on outside click ──
  useEffect(() => {
    if (openMenu === null) return;
    const handler = () => setOpenMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openMenu]);

  // ── Helpers ──
  const memberName = (userId) => {
    const m = members.find(m => m.id === userId);
    return m ? (m.name || m.email) : userId?.slice(0, 8);
  };
  const memberLastActive = (userId) => {
    const s = teamSessions.filter(s => s.user_id === userId).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
    return s?.updated_at || null;
  };

  const usagePct = Math.min(100, Math.round((orgCtx?.run_count || 0) / (orgCtx?.run_limit || 5) * 100));
  const usageColor = (orgCtx?.run_count || 0) >= (orgCtx?.run_limit || 5)
    ? "var(--red)"
    : (orgCtx?.run_count || 0) >= (orgCtx?.run_limit || 5) * 0.8
      ? "var(--amber)"
      : "var(--green)";

  // ── Generic sort comparator for tables ──
  const sortRows = (rows, key, dir, opts = {}) => {
    if (!key) return rows;
    const dateKeys = opts.dateKeys || {};
    return [...rows].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (dateKeys[key] || /date|login|created|updated|active/i.test(key)) {
        const ta = new Date(av).getTime() || 0, tb = new Date(bv).getTime() || 0;
        return dir === "asc" ? ta - tb : tb - ta;
      }
      if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
      const sa = String(av).toLowerCase(), sb = String(bv).toLowerCase();
      return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  };

  // ── Settings actions ──
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

  // ── Invite actions ──
  const APP_URL = import.meta.env.VITE_APP_URL || "https://www.cambree.ai";
  const getInviteLink = (token) => `${APP_URL}?token=${token}`;
  const copyInviteLink = (token) => {
    navigator.clipboard.writeText(getInviteLink(token));
    setInviteMsg("Invite link copied to clipboard");
    setTimeout(() => setInviteMsg(""), 3000);
  };

  const sendInvite = async (emailOverride) => {
    const email = emailOverride || inviteEmail.trim();
    if (!email || !isAdmin) return;
    setInviteLoading(true);
    if (!emailOverride) setInviteMsg("");
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
        body: JSON.stringify({ email: email.toLowerCase(), role: inviteRole }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.email_sent === false) {
          setInviteMsg("Invitation created -- use the invite link to share directly.");
        } else {
          setInviteMsg("Invitation sent to " + email);
        }
        if (!emailOverride) setInviteEmail("");
        fetchOrgInvitations(orgCtx.id, sbToken).then(setInvitations);
        return true;
      } else {
        setInviteMsg("Error: " + (data.error || "Failed to send invitation"));
        return false;
      }
    } catch (e) {
      setInviteMsg("Error: " + e.message);
      return false;
    } finally {
      setInviteLoading(false);
    }
  };

  const sendBulkInvites = async () => {
    const emails = bulkEmails.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
    if (!emails.length) { setInviteMsg("No valid emails found. Enter one per line."); return; }
    setInviteLoading(true);
    setInviteMsg("");
    let sent = 0, failed = 0;
    for (const email of emails) {
      const ok = await sendInvite(email);
      if (ok) sent++; else failed++;
    }
    setInviteMsg(`Bulk invite complete: ${sent} sent${failed ? `, ${failed} failed` : ""}`);
    setBulkEmails("");
    setInviteLoading(false);
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
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${sbToken}` },
    });
    fetchOrgInvitations(orgCtx.id, sbToken).then(setInvitations);
  };

  const resendInvite = async (inv) => {
    if (!isAdmin) return;
    setInviteLoading(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
        body: JSON.stringify({ email: inv.email, role: inv.role }),
      });
      const data = await res.json();
      setInviteMsg(data.ok ? `Re-sent to ${inv.email}` : "Error: " + (data.error || "Failed"));
    } catch { setInviteMsg("Error resending"); }
    setInviteLoading(false);
    setTimeout(() => setInviteMsg(""), 4000);
  };

  // ── Toast state for Insights export buttons ──
  const [insightsToast, setInsightsToast] = useState("");
  const showInsightsToast = (msg) => { setInsightsToast(msg); setTimeout(() => setInsightsToast(""), 3500); };

  // ── Analytics (from ReportPanel) ──
  const analytics = useMemo(() => {
    const sessions = savedSessions || [];
    const now = Date.now();
    const totalSessions = sessions.length;
    const activeLast7d = sessions.filter(s => (now - new Date(s.updated_at).getTime()) < 604800000).length;

    const dealRoutes = { FAST_TRACK: 0, NURTURE: 0, DISQUALIFY: 0 };
    let totalDeals = 0;
    const icpEdits = {};
    const intelAdj = [];
    const companiesScored = new Set();
    let briefsGenerated = 0;
    let crmPushes = 0;
    let dealsAdvanced = 0;
    const fitBuckets = { strong: 0, potential: 0, poor: 0 }; // 75+, 55-74, 0-54
    let icpLastUpdated = null;
    let icpFieldsEditedThisSession = 0;

    sessions.forEach(s => {
      const d = s.data;
      if (!d) return;

      // Brief generated = session has brief data
      if (d.brief || d.selectedAccount) briefsGenerated++;

      // CRM pushes (track via celebration marker or postCall push)
      if (d.postCall?.pushedToCrm || d.hubspotPushed) crmPushes++;

      // Deal routing
      if (d.postCall?.dealRoute) {
        dealRoutes[d.postCall.dealRoute] = (dealRoutes[d.postCall.dealRoute] || 0) + 1;
        totalDeals++;
        if (d.postCall.dealRoute === "FAST_TRACK") dealsAdvanced++;
      }

      // Fit scores - count by bucket
      if (d.fitScores) {
        Object.entries(d.fitScores).forEach(([co, fs]) => {
          companiesScored.add(co);
          const score = fs?.score ?? 0;
          if (score >= 75) fitBuckets.strong++;
          else if (score >= 55) fitBuckets.potential++;
          else fitBuckets.poor++;
        });
      }

      // ICP edits
      const edits = d.icpEdits || [];
      edits.forEach(e => {
        icpEdits[e.field] = (icpEdits[e.field] || 0) + 1;
        if (e.timestamp) {
          const t = new Date(e.timestamp);
          if (!icpLastUpdated || t > icpLastUpdated) icpLastUpdated = t;
        }
      });

      // Intel adjustments
      Object.entries(d.intelAdjustments || {}).forEach(([co, adj]) => {
        intelAdj.push({ company: co, modifier: adj.modifier, reason: adj.reason });
      });
    });

    // ICP fields edited in most recent session
    const lastSession = sessions[0];
    if (lastSession?.data?.icpEdits) {
      icpFieldsEditedThisSession = lastSession.data.icpEdits.length;
    }

    const topEditedFields = Object.entries(icpEdits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([field, count]) => ({ field, count }));

    const mostEditedField = topEditedFields.length > 0 ? topEditedFields[0].field : null;

    return {
      totalSessions,
      activeLast7d,
      dealRoutes,
      totalDeals,
      fastTrackRate: totalDeals > 0 ? Math.round(dealRoutes.FAST_TRACK / totalDeals * 100) : 0,
      disqualifyRate: totalDeals > 0 ? Math.round(dealRoutes.DISQUALIFY / totalDeals * 100) : 0,
      topEditedFields,
      intelAdj,
      // New: Insights panel data
      prospectsScored: companiesScored.size,
      briefsGenerated,
      crmPushes,
      dealsAdvanced,
      fitBuckets,
      icpLastUpdated,
      icpFieldsEditedThisSession,
      mostEditedField,
    };
  }, [savedSessions]);

  // ── Sidebar nav ──
  const navGroups = [
    {
      label: "OVERVIEW",
      items: [{ id: "dashboard", label: "Dashboard" }],
    },
    {
      label: "MY COMPANY",
      items: [
        { id: "team", label: "Team", show: canViewTeam },
        { id: "settings", label: "Settings", show: true },
      ].filter(i => i.show),
    },
    {
      label: "ANALYTICS",
      items: [
        { id: "sessions", label: "Sessions", show: canViewTeam },
        { id: "insights", label: "Insights", show: true },
      ].filter(i => i.show),
    },
  ];

  // Flat list of all visible nav items for mobile tabs
  const allNavItems = navGroups.flatMap(g => g.items);

  return (
    <div className="admin-shell">
      {/* ── Mobile tab bar (replaces sidebar on ≤768px) ── */}
      <div className="admin-mobile-tabs">
        {allNavItems.map(item => (
          <button key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="admin-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "Lora,serif", fontSize: 18, fontWeight: 700, color: "var(--ink-0)" }}>
            {orgCtx?.name || "Your Organization"}
          </div>
          <span className="admin-badge" style={{
            background: isAdmin ? "var(--navy-bg)" : isManager ? "var(--amber-bg)" : "var(--green-bg)",
            color: isAdmin ? "var(--navy)" : isManager ? "var(--amber)" : "var(--green)",
            fontSize: 9, letterSpacing: "0.5px", textTransform: "uppercase",
          }}>
            {isAdmin ? "Admin" : isManager ? "Manager" : "Rep"}
          </span>
          {orgCtx?.plan && (
            <span className="admin-badge" style={{
              background: orgCtx.plan === "paid" ? "var(--green-bg)" : "var(--amber-bg)",
              color: orgCtx.plan === "paid" ? "var(--green)" : "var(--amber)",
            }}>
              {orgCtx.plan}
            </span>
          )}
        </div>
        <button onClick={onClose}
          style={{ padding: "6px 16px", borderRadius: 8, border: "1.5px solid var(--ink-0)", background: "var(--ink-0)", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--surface)" }}>
          &larr; Back to App
        </button>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div className="admin-body">
        {/* Sidebar */}
        <nav className="admin-sidebar">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && <div className="admin-sidebar-group">{group.label}</div>}
              {group.items.map(item => (
                <button key={item.id}
                  className={`admin-sidebar-item${tab === item.id ? " active" : ""}`}
                  onClick={() => setTab(item.id)}>
                  {item.label}
                  {item.count !== undefined && <span className="admin-sidebar-count">{item.count}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Main content */}
        <main className="admin-content">

          {/* ═══ DASHBOARD ═══ */}
          {tab === "dashboard" && (
            <div>
              <div className="admin-section-title">Dashboard</div>
              <div className="admin-section-sub">Your organization at a glance</div>

              {/* Loading skeleton — prevents blank flash on first render */}
              {!savedSessions && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 0" }}>
                  {[85, 70, 60, 90].map((w, i) => (
                    <div key={i} style={{ height: 14, width: w + "%", background: "var(--bg-2)", borderRadius: 6, animation: "pulse 1.5s infinite" }} />
                  ))}
                </div>
              )}

              {/* Metric cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
                <div className="admin-metric">
                  <div className="admin-metric-num" style={{ color: usageColor }}>{orgCtx?.run_count || 0}/{orgCtx?.run_limit || 5}</div>
                  <div className="admin-metric-label">Runs Used</div>
                </div>
                <div className="admin-metric">
                  <div className="admin-metric-num" style={{ color: "var(--ink-0)" }}>{analytics.totalSessions}</div>
                  <div className="admin-metric-label">Sessions</div>
                </div>
                <div className="admin-metric">
                  <div className="admin-metric-num" style={{ color: "var(--green)" }}>{analytics.activeLast7d}</div>
                  <div className="admin-metric-label">Active This Week</div>
                </div>
                <div className="admin-metric">
                  <div className="admin-metric-num" style={{ color: "var(--navy)" }}>{members.length || 1}</div>
                  <div className="admin-metric-label">Team Members</div>
                </div>
              </div>

              {/* Run usage progress bar */}
              <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-0)" }}>Run Usage This Month</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: usageColor }}>{orgCtx?.run_count || 0} / {orgCtx?.run_limit || 5}</div>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--bg-2)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, transition: "width 0.3s", background: usageColor, width: usagePct + "%" }} />
                </div>
              </div>

              {/* Recent sessions table */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Recent Sessions</div>
                {(savedSessions || []).length > 0 ? (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Seller URL</th>
                        <th>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(savedSessions || []).slice(0, 8).map(s => {
                        const isRecent = (Date.now() - new Date(s.updated_at).getTime()) < 86400000;
                        return (
                          <tr key={s.id}>
                            <td>
                              <div style={{ fontWeight: 700, color: "var(--ink-0)", fontSize: 13 }}>{s.name || "Untitled"}</div>
                            </td>
                            <td style={{ color: "var(--ink-3)", fontSize: 11 }}>{s.seller_url || "--"}</td>
                            <td>
                              <div style={{ fontWeight: 600, color: isRecent ? "var(--green)" : "var(--ink-1)", fontSize: 12 }}>{timeAgo(s.updated_at)}</div>
                              <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 1 }}>{new Date(s.updated_at).toLocaleDateString()}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: "24px 0" }}>
                    No sessions yet. Run your first brief to see it here.
                  </div>
                )}
              </div>

              {/* Referral widget */}
              <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Refer & Earn</div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 8 }}>
                  Share your referral link. When someone signs up and runs their first brief, your org gets <strong>+1 bonus run</strong> (up to 5/month).
                </div>
                <ReferralWidget sbToken={sbToken} />
              </div>
            </div>
          )}

          {/* ═══ TEAM ═══ */}
          {tab === "team" && canViewTeam && (
            <div>
              <div className="admin-section-title">Team</div>
              <div className="admin-section-sub">{members.length} member{members.length !== 1 ? "s" : ""} in your organization</div>

              <table className="admin-table">
                <thead>
                  <tr>
                    <SortTh sortKey={teamSortKey} sortDir={teamSortDir} onSort={onTeamSort} colKey="name">Name / Email</SortTh>
                    <SortTh sortKey={teamSortKey} sortDir={teamSortDir} onSort={onTeamSort} colKey="role">Role</SortTh>
                    <th>Status</th>
                    <SortTh sortKey={teamSortKey} sortDir={teamSortDir} onSort={onTeamSort} colKey="_lastActive">Last Active</SortTh>
                    {isAdmin && <th style={{ width: 40 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {sortRows(members.map(m => ({ ...m, _lastActive: memberLastActive(m.id) })), teamSortKey, teamSortDir, { dateKeys: { _lastActive: true } }).map(m => {
                    const lastActive = m._lastActive;
                    const status = lastActive ? "Active" : "Never active";
                    return (
                      <tr key={m.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--ink-0)" }}>
                            {m.name || m.email?.split("@")[0]}
                            {m.id === sbUser?.id && <span style={{ fontSize: 9, color: "var(--ink-3)", fontWeight: 400, marginLeft: 4 }}>(you)</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.email}</div>
                        </td>
                        <td>
                          {isAdmin && m.id !== sbUser?.id ? (
                            <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                              style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "1px solid var(--line-0)", fontWeight: 600, cursor: "pointer", background: r(m.role).bg, color: r(m.role).color }}>
                              <option value="rep">Rep</option>
                              <option value="manager">Manager</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className="admin-badge" style={{ background: r(m.role).bg, color: r(m.role).color }}>
                              {r(m.role).label}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="admin-badge" style={{
                            background: lastActive ? "var(--green-bg)" : "var(--bg-2)",
                            color: lastActive ? "var(--green)" : "var(--ink-3)",
                          }}>
                            {status}
                          </span>
                        </td>
                        <td>
                          {lastActive ? (
                            <>
                              <div style={{ fontWeight: 600, color: "var(--ink-1)", fontSize: 12 }}>{timeAgo(lastActive)}</div>
                              <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 1 }}>{new Date(lastActive).toLocaleDateString()}</div>
                            </>
                          ) : <span style={{ color: "var(--ink-3)" }}>--</span>}
                        </td>
                        {isAdmin && (
                          <td style={{ position: "relative" }}>
                            {m.id !== sbUser?.id && (
                              <>
                                <button className="admin-dot-menu" aria-label="Actions" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === m.id ? null : m.id); }}>
                                  &#8943;
                                </button>
                                {openMenu === m.id && (
                                  <div className="admin-action-menu">
                                    <button className="admin-action-item danger"
                                      onClick={() => { setConfirmAction({ type: "remove", userId: m.id, name: m.name || m.email }); setOpenMenu(null); }}>
                                      Remove from org
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {members.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: "24px 0" }}>No team members found.</div>
              )}

              {/* ── Invite section (merged into Team tab) ── */}
              {isAdmin && (<>
              <div style={{ borderTop: "1.5px solid var(--line-0)", marginTop: 24, paddingTop: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-0)", marginBottom: 4 }}>Invite Team Members</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>Add colleagues to your organization</div>

              {/* Mode toggle */}
              <div style={{ display: "flex", gap: 0, border: "1.5px solid var(--line-0)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                <button onClick={() => setBulkMode(false)}
                  style={{ flex: 1, padding: "8px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                    background: !bulkMode ? "var(--ink-0)" : "var(--surface)", color: !bulkMode ? "var(--surface)" : "var(--ink-2)" }}>
                  Single Invite
                </button>
                <button onClick={() => setBulkMode(true)}
                  style={{ flex: 1, padding: "8px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                    background: bulkMode ? "var(--ink-0)" : "var(--surface)", color: bulkMode ? "var(--surface)" : "var(--ink-2)" }}>
                  Bulk Invite
                </button>
              </div>

              {/* Single invite */}
              {!bulkMode && (
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
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
                    <button onClick={() => sendInvite()} disabled={inviteLoading || !inviteEmail.trim()}
                      style={{ padding: "9px 20px", borderRadius: 8, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: inviteLoading || !inviteEmail.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
                      {inviteLoading ? "Sending..." : "Send Invite"}
                    </button>
                  </div>
                </div>
              )}

              {/* Bulk invite */}
              {bulkMode && (
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", marginBottom: 6 }}>Enter email addresses (one per line, or comma-separated)</div>
                  <textarea value={bulkEmails} onChange={e => setBulkEmails(e.target.value)}
                    placeholder={"alice@company.com\nbob@company.com\ncharlie@company.com"}
                    rows={6} style={{ width: "100%", fontSize: 13, padding: "10px 14px", border: "1.5px solid var(--line-0)", borderRadius: 8, boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit", resize: "vertical" }}
                    onKeyDown={e => e.stopPropagation()} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                      style={{ fontSize: 13, padding: "9px 12px", border: "1.5px solid var(--line-0)", borderRadius: 8 }}>
                      <option value="rep">Rep</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <div style={{ flex: 1, fontSize: 11, color: "var(--ink-3)" }}>
                      {bulkEmails.split(/[\n,;]+/).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim())).length} valid emails
                    </div>
                    <button onClick={sendBulkInvites} disabled={inviteLoading || !bulkEmails.trim()}
                      style={{ padding: "9px 20px", borderRadius: 8, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: inviteLoading || !bulkEmails.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
                      {inviteLoading ? "Sending..." : "Send All"}
                    </button>
                  </div>
                </div>
              )}

              {inviteMsg && (
                <div style={{ fontSize: 12, color: inviteMsg.startsWith("Error") ? "var(--red)" : "var(--green)", fontWeight: 600, padding: "8px 12px", background: inviteMsg.startsWith("Error") ? "var(--red-bg)" : "var(--green-bg)", borderRadius: 8, marginBottom: 16 }}>
                  {inviteMsg}
                </div>
              )}

              {/* Pending invitations */}
              {invitations.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                    Pending Invitations ({invitations.length})
                  </div>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Expires</th>
                        <th style={{ width: 160 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ fontWeight: 600, color: "var(--ink-0)" }}>{inv.email}</td>
                          <td>
                            <span className="admin-badge" style={{ background: r(inv.role).bg, color: r(inv.role).color }}>
                              {r(inv.role).label}
                            </span>
                          </td>
                          <td style={{ color: "var(--ink-3)", fontSize: 11 }}>{new Date(inv.expires_at).toLocaleDateString()}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => copyInviteLink(inv.token)}
                                style={{ fontSize: 10, color: "var(--navy)", background: "var(--navy-bg)", border: "1px solid var(--navy)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                                Copy link
                              </button>
                              <button onClick={() => resendInvite(inv)} disabled={inviteLoading}
                                style={{ fontSize: 10, color: "var(--ink-1)", background: "none", border: "1px solid var(--line-0)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                                Resend
                              </button>
                              <button onClick={() => revokeInvite(inv.id)}
                                style={{ fontSize: 10, color: "var(--red)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "3px 4px" }}>
                                Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {invitations.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", padding: 16 }}>
                  No pending invitations. Invite your team -- they will thank you after their first brief.
                </div>
              )}
              </div>
              </>)}
            </div>
          )}

          {tab === "team" && !canViewTeam && (
            <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: "40px 0" }}>
              Team visibility is a manager or admin perk. Ask your admin to level you up if you need it.
            </div>
          )}

          {/* ═══ SETTINGS ═══ */}
          {tab === "settings" && (
            <div>
              <div className="admin-section-title">Settings</div>
              <div className="admin-section-sub">Organization details and plan information</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Organization Details card */}
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "18px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Organization Details</div>

                  {/* Company name */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Company Name</div>
                    {isAdmin ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={orgName} onChange={e => setOrgName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveOrgName(); e.stopPropagation(); }}
                          style={{ flex: 1, fontSize: 14, padding: "8px 12px", border: "1.5px solid var(--line-0)", borderRadius: 8, background: "var(--surface)" }} />
                        <button onClick={saveOrgName}
                          style={{ padding: "8px 16px", borderRadius: 8, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, color: "var(--ink-1)" }}>{orgCtx?.name || "--"}</div>
                    )}
                  </div>

                  {/* Company website */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>Company Website</div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6 }}>Pre-fills new sessions and helps match new teammates automatically</div>
                    {isAdmin ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={orgSellerUrl} onChange={e => setOrgSellerUrl(e.target.value)} placeholder="https://yourcompany.com"
                          style={{ flex: 1, fontSize: 13, padding: "8px 12px", border: "1.5px solid var(--line-0)", borderRadius: 8, background: "var(--surface)" }}
                          onKeyDown={e => { if (e.key === "Enter") saveOrgSellerUrl(); e.stopPropagation(); }} />
                        <button onClick={saveOrgSellerUrl}
                          style={{ padding: "8px 16px", borderRadius: 8, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--ink-1)" }}>{orgCtx?.seller_url || "Not set"}</div>
                    )}
                  </div>
                </div>

                {/* Plan & Usage card */}
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "18px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Plan & Usage</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                    {/* Your role */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 5 }}>Your Role</div>
                      <span className="admin-badge" style={{ background: r(orgCtx?.userRole).bg, color: r(orgCtx?.userRole).color, fontSize: 10, padding: "3px 10px" }}>
                        {r(orgCtx?.userRole).label}
                      </span>
                    </div>

                    {/* Plan */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 5 }}>Plan</div>
                      <span className="admin-badge" style={{
                        background: orgCtx?.plan === "paid" ? "var(--green-bg)" : "var(--amber-bg)",
                        color: orgCtx?.plan === "paid" ? "var(--green)" : "var(--amber)",
                        fontSize: 10, padding: "3px 10px",
                      }}>
                        {orgCtx?.plan || "trial"}
                      </span>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                        {orgCtx?.run_limit || 5} runs/month
                      </div>
                    </div>
                  </div>

                  {/* Run usage */}
                  <div style={{ background: "var(--surface)", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-0)" }}>Run Usage</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: usageColor }}>{orgCtx?.run_count || 0} / {orgCtx?.run_limit || 5}</div>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "var(--bg-2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, transition: "width 0.3s", background: usageColor, width: usagePct + "%" }} />
                    </div>
                  </div>
                </div>

                {/* CRM Integration card */}
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "18px 20px" }}>
                  <HubSpotSection sbToken={sbToken} onStatusChange={onHubspotChange} />
                </div>

                {/* Refer & Earn card */}
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "18px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Refer & Earn</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 8 }}>
                    Share your referral link. When someone signs up and runs their first brief, your org gets <strong>+1 bonus run</strong> (up to 5/month).
                  </div>
                  <ReferralWidget sbToken={sbToken} />
                </div>

                {/* Contact */}
                <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6, borderTop: "1px solid var(--line-0)", paddingTop: 12 }}>
                  Need help? <a href="mailto:info@cambree.ai" style={{ color: "var(--tan-0)" }}>info@cambree.ai</a>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SESSIONS ═══ */}
          {tab === "sessions" && canViewTeam && (
            <div>
              <div className="admin-section-title">Sessions</div>
              <div className="admin-section-sub">All team sessions across your organization</div>

              {/* Filter by member */}
              {members.length > 1 && (
                <div className="admin-filters">
                  <select value={sessionFilter} onChange={e => setSessionFilter(e.target.value)}
                    style={{ color: sessionFilter ? "var(--ink-0)" : "var(--ink-3)" }}>
                    <option value="">All team members ({teamSessions.length})</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.name || m.email} ({teamSessions.filter(s => s.user_id === m.id).length})</option>
                    ))}
                  </select>
                </div>
              )}

              {sessionsLoading && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "20px 0" }}>
                  {[85, 70, 90, 65, 80].map((w, i) => (
                    <div key={i} style={{ height: 14, width: w + "%", background: "var(--bg-2)", borderRadius: 6, animation: "pulse 1.5s infinite" }} />
                  ))}
                </div>
              )}

              {!sessionsLoading && teamSessions.length > 0 && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 20 }}></th>
                      <SortTh sortKey={udSessionSortKey} sortDir={udSessionSortDir} onSort={onUdSessionSort} colKey="name">Session</SortTh>
                      <SortTh sortKey={udSessionSortKey} sortDir={udSessionSortDir} onSort={onUdSessionSort} colKey="user_id">User</SortTh>
                      <th>Seller URL</th>
                      <SortTh sortKey={udSessionSortKey} sortDir={udSessionSortDir} onSort={onUdSessionSort} colKey="updated_at" style={{ width: 130 }}>Last Updated</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sortRows(teamSessions
                      .filter(s => !sessionFilter || s.user_id === sessionFilter), udSessionSortKey, udSessionSortDir, { dateKeys: { updated_at: true, created_at: true } })
                      .map(s => {
                        const isRecent = (Date.now() - new Date(s.updated_at).getTime()) < 86400000;
                        const member = members.find(m => m.id === s.user_id);
                        return (
                          <tr key={s.id}>
                            <td style={{ textAlign: "center", width: 24 }}>
                              {isRecent && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 4px var(--green)" }} />}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: "var(--ink-0)", fontSize: 13 }}>{s.name || "Untitled"}</div>
                              {s.seller_url && <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 1 }}>{s.seller_url}</div>}
                            </td>
                            <td>
                              <div style={{ fontSize: 12, color: "var(--ink-1)", fontWeight: 600 }}>{member?.name || member?.email || "Unknown"}</div>
                              {member?.role && (
                                <span className="admin-badge" style={{ background: r(member.role).bg, color: r(member.role).color, marginTop: 2 }}>
                                  {r(member.role).label}
                                </span>
                              )}
                            </td>
                            <td style={{ color: "var(--ink-3)", fontSize: 11 }}>{s.seller_url || "--"}</td>
                            <td>
                              <div style={{ fontWeight: 600, color: isRecent ? "var(--green)" : "var(--ink-1)", fontSize: 12 }}>{timeAgo(s.updated_at)}</div>
                              <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 1 }}>{new Date(s.updated_at).toLocaleDateString()}</div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}

              {!sessionsLoading && teamSessions.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: "24px 0" }}>
                  No team sessions yet. Once your team starts running briefs, every session appears here.
                </div>
              )}
            </div>
          )}

          {tab === "sessions" && !canViewTeam && (
            <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: "40px 0" }}>
              Team session visibility requires a manager or admin role.
            </div>
          )}

          {/* ═══ INSIGHTS ═══ */}
          {tab === "insights" && (() => {
            const fitTotal = analytics.fitBuckets.strong + analytics.fitBuckets.potential + analytics.fitBuckets.poor;
            const fitMaxCount = Math.max(analytics.fitBuckets.strong, analytics.fitBuckets.potential, analytics.fitBuckets.poor, 1);
            return (
            <div>
              <div className="admin-section-title">Insights</div>
              <div className="admin-section-sub">Org-level analytics for your revenue team</div>

              {/* ── 1. Pipeline Overview ── */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Pipeline Overview</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                  {[
                    { label: "Prospects Scored", value: analytics.prospectsScored, color: "var(--ink-0)" },
                    { label: "Briefs Generated", value: analytics.briefsGenerated, color: "var(--navy)" },
                    { label: "Pushed to CRM", value: analytics.crmPushes, color: "var(--amber)" },
                    { label: "Deals Advanced", value: analytics.dealsAdvanced, color: "var(--green)" },
                  ].map(m => (
                    <div key={m.label} className="admin-metric">
                      <div className="admin-metric-num" style={{ color: m.color }}>{m.value}</div>
                      <div className="admin-metric-label">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── 2. Fit Score Distribution ── */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Fit Score Distribution</div>
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "16px 20px" }}>
                  {fitTotal === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: "12px 0" }}>
                      No fit scores yet. Run briefs and score prospects to see the distribution.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {[
                        { label: "Strong Fit (75+)", count: analytics.fitBuckets.strong, color: "var(--green)" },
                        { label: "Potential Fit (55-74)", count: analytics.fitBuckets.potential, color: "var(--amber)" },
                        { label: "Poor Fit (0-54)", count: analytics.fitBuckets.poor, color: "var(--red)" },
                      ].map(bucket => {
                        const barWidth = Math.max(2, Math.round((bucket.count / fitMaxCount) * 100));
                        return (
                          <div key={bucket.label}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)" }}>{bucket.label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: bucket.color }}>{bucket.count}</span>
                            </div>
                            <svg width="100%" height="14" style={{ display: "block" }}>
                              <rect x="0" y="2" width="100%" height="10" rx="5" fill="var(--bg-2)" />
                              <rect x="0" y="2" width={barWidth + "%"} height="10" rx="5" fill={bucket.color} style={{ transition: "width 0.4s ease" }} />
                            </svg>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right", marginTop: 2 }}>
                        {fitTotal} prospect{fitTotal !== 1 ? "s" : ""} scored across all sessions
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── 3. Team Activity (admin/manager only) ── */}
              {canViewTeam && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Team Activity</div>
                  <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "16px 20px" }}>
                    {members.length > 0 ? (
                      <>
                        <table className="admin-table" style={{ marginBottom: 10 }}>
                          <thead>
                            <tr>
                              <th>Team Member</th>
                              <th>Briefs This Month</th>
                              <th>Sessions</th>
                              <th>Last Active</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map(m => {
                              const now = Date.now();
                              const thirtyDaysAgo = now - 2592000000;
                              const memberSessions = teamSessions.filter(s => s.user_id === m.id);
                              const briefsThisMonth = memberSessions.filter(s => new Date(s.updated_at).getTime() > thirtyDaysAgo).length;
                              const lastActive = memberLastActive(m.id);
                              return (
                                <tr key={m.id}>
                                  <td>
                                    <div style={{ fontWeight: 600, color: "var(--ink-0)", fontSize: 13 }}>
                                      {m.name || m.email?.split("@")[0]}
                                      {m.id === sbUser?.id && <span style={{ fontSize: 9, color: "var(--ink-3)", fontWeight: 400, marginLeft: 4 }}>(you)</span>}
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{m.email}</div>
                                  </td>
                                  <td style={{ fontWeight: 700, color: briefsThisMonth > 0 ? "var(--green)" : "var(--ink-3)", fontSize: 13 }}>
                                    {briefsThisMonth}
                                  </td>
                                  <td style={{ fontWeight: 600, color: "var(--ink-1)", fontSize: 13 }}>
                                    {memberSessions.length}
                                  </td>
                                  <td>
                                    {lastActive ? (
                                      <>
                                        <div style={{ fontWeight: 600, color: "var(--ink-1)", fontSize: 12 }}>{timeAgo(lastActive)}</div>
                                        <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 1 }}>{new Date(lastActive).toLocaleDateString()}</div>
                                      </>
                                    ) : <span style={{ color: "var(--ink-3)", fontSize: 12 }}>--</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div style={{ fontSize: 11, color: "var(--ink-3)", fontStyle: "italic" }}>
                          Feature adoption data coming soon
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: "12px 0" }}>
                        Team member data loading...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── 4. Export Center ── */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Export Center</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  {[
                    { id: "prospects", title: "Export Scored Prospects", desc: "All prospects with fit scores, labels, and reasoning", icon: "\u{1F3AF}" },
                    { id: "briefs", title: "Export Brief History", desc: "Full brief output for every session in your org", icon: "\u{1F4CB}" },
                    { id: "edits", title: "Export Edit History", desc: "ICP edits, intel adjustments, and field corrections", icon: "\u{270F}\u{FE0F}" },
                    { id: "intel", title: "Export Competitive Intel", desc: "Competitive intelligence collected across all sessions", icon: "\u{1F50D}" },
                  ].map(exp => (
                    <button key={exp.id}
                      onClick={() => showInsightsToast("Export coming soon -- data collection in progress")}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
                        background: "var(--bg-1)", border: "1.5px solid var(--line-0)", borderRadius: 10,
                        padding: "16px 18px", cursor: "pointer", textAlign: "left",
                        transition: "border-color 0.15s, box-shadow 0.15s",
                      }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = "var(--tan-0)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = "var(--line-0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <div style={{ fontSize: 22 }}>{exp.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-0)" }}>{exp.title}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>{exp.desc}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", marginTop: 4 }}>Download CSV</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── 5. ICP Health Check ── */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>ICP Health Check</div>
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "16px 20px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 5 }}>ICP Last Updated</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: analytics.icpLastUpdated ? "var(--ink-0)" : "var(--ink-3)" }}>
                        {analytics.icpLastUpdated ? analytics.icpLastUpdated.toLocaleDateString() : "Never"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 5 }}>Fields Edited (Last Session)</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: analytics.icpFieldsEditedThisSession > 0 ? "var(--ink-0)" : "var(--ink-3)" }}>
                        {analytics.icpFieldsEditedThisSession}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 5 }}>Most Edited Field</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: analytics.mostEditedField ? "var(--amber)" : "var(--ink-3)" }}>
                        {analytics.mostEditedField || "None yet"}
                      </div>
                    </div>
                  </div>
                  {analytics.topEditedFields.length > 0 && (
                    <div style={{ marginTop: 16, borderTop: "1px solid var(--line-0)", paddingTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 8 }}>
                        Top Corrected Fields
                        <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>-- helps us improve accuracy</span>
                      </div>
                      {analytics.topEditedFields.slice(0, 5).map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: i < Math.min(analytics.topEditedFields.length, 5) - 1 ? "1px solid var(--line-0)" : "none" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-0)", flex: 1 }}>{f.field}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ height: 6, borderRadius: 3, background: "var(--amber)", width: Math.min(120, f.count * 20) }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", minWidth: 24, textAlign: "right" }}>{f.count}x</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Toast notification */}
              {insightsToast && <div className="admin-toast">{insightsToast}</div>}
            </div>
            );
          })()}

        </main>
      </div>

      {/* ── Confirm dialog ── */}
      {confirmAction && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: "24px 28px", maxWidth: 380, width: "90%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>Warning</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>
              Remove {confirmAction.name}?
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 20 }}>
              They will lose access to this organization's sessions, data, and runs. This action can be reversed by re-inviting them.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmAction(null)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid var(--line-0)", background: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--ink-2)" }}>Cancel</button>
              <button onClick={() => removeUser(confirmAction.userId)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "var(--red)", color: "var(--surface)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
