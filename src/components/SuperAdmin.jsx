// src/components/SuperAdmin.jsx — Reporting dashboard (formerly Super Admin)
// Locked to superuser email only. Shows engagement metrics across all users.

import React, { useState, useEffect, useRef } from "react";
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

const SUPERUSER_EMAIL = "itsjoegalano@gmail.com";
const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function SuperAdmin({ sbUser, sbToken, orgCtx, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview"); // overview | users | activity | urls
  const [plans, setPlans] = useState([
    { id: "trial", name: "Trial", tokens: 3, maxTokens: 0, price: 0, costPerToken: 1.16 },
    { id: "starter", name: "Starter", tokens: 25, maxTokens: 5, price: 99, costPerToken: 1.16 },
    { id: "pro", name: "Pro", tokens: 100, maxTokens: 20, price: 349, costPerToken: 1.16 },
    { id: "team", name: "Team", tokens: 250, maxTokens: 50, price: 799, costPerToken: 1.16 },
    { id: "enterprise", name: "Enterprise", tokens: 1000, maxTokens: 200, price: 2500, costPerToken: 1.16 },
  ]);
  const [planSaveMsg, setPlanSaveMsg] = useState("");
  // ── GLOBAL FILTERS ──
  const [dateRange, setDateRange] = useState("all"); // today | 7d | 30d | 90d | all
  const [userTypeFilter, setUserTypeFilter] = useState("all"); // all | authenticated | guest
  const [roleFilter, setRoleFilter] = useState(""); // "" | admin | manager | rep
  const [planFilter, setPlanFilter] = useState(""); // "" | trial | paid | enterprise | suspended
  const [userStatusFilter, setUserStatusFilter] = useState(""); // "" | orphan | never_active | new_7d
  const [searchQuery, setSearchQuery] = useState("");
  const isSuperuser = sbUser?.email === SUPERUSER_EMAIL || orgCtx?.userRole === "admin";

  const [refreshing, setRefreshing] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const [menuContext, setMenuContext] = useState(null); // { userId, email, name, orgId, role, isSuperuserRow }
  const cleanupRef = useRef(null);
  const [expandedSession, setExpandedSession] = useState(null);

  // ── Access-request queue state (issue #3) ──
  const [requestBusy, setRequestBusy] = useState(null); // request id being actioned
  const [removedRequests, setRemovedRequests] = useState([]); // optimistic removals, rolled back on error

  // ── Sort state for Members table ──
  const [memberSortKey, setMemberSortKey] = useState(null);
  const [memberSortDir, setMemberSortDir] = useState("asc");
  const onMemberSort = (key) => {
    if (memberSortKey === key) setMemberSortDir(d => d === "asc" ? "desc" : "asc");
    else { setMemberSortKey(key); setMemberSortDir("asc"); }
  };
  // ── Sort state for Sessions table ──
  const [sessionSortKey, setSessionSortKey] = useState(null);
  const [sessionSortDir, setSessionSortDir] = useState("asc");
  const onSessionSort = (key) => {
    if (sessionSortKey === key) setSessionSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSessionSortKey(key); setSessionSortDir("asc"); }
  };

  const fetchData = (showSpinner) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    fetch("/api/admin", {
      headers: { Authorization: `Bearer ${sbToken}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setError(""); }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  const initialLoadRef = React.useRef(true);
  useEffect(() => {
    if (!isSuperuser) return;
    // Only show full-page spinner on first load — subsequent refreshes
    // (e.g., sbToken change) use the subtle refresh indicator instead.
    fetchData(initialLoadRef.current);
    initialLoadRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbToken]);

  // Close action menu on click outside
  useEffect(() => {
    if (openMenu === null) return;
    // Delay adding the listener so the current click event doesn't immediately close the menu
    const timer = setTimeout(() => {
      const handler = (e) => {
        // Don't close if clicking inside the menu itself
        if (e.target.closest && e.target.closest(".admin-action-menu")) return;
        setOpenMenu(null);
      };
      document.addEventListener("click", handler);
      // Store for cleanup
      cleanupRef.current = () => document.removeEventListener("click", handler);
    }, 10);
    return () => { clearTimeout(timer); cleanupRef.current?.(); };
  }, [openMenu]);

  // Superuser check — after all hooks
  if (!isSuperuser) return null;

  if (loading) return (
    <div className="admin-shell" style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 40, fontSize: 14 }}>Loading analytics...</div>
    </div>
  );

  if (error) return (
    <div className="admin-shell" style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 40 }}>
        <div style={{ color: "var(--red)", marginBottom: 12 }}>Error: {error}</div>
        <button onClick={onClose} className="btn btn-secondary">Close</button>
      </div>
    </div>
  );

  if (!data) return null;

  const s = data.summary;
  // Prefer server-side aggregated costs (exact) over client-side (row-limited)
  const dbTotal = data.dbCosts?.total || null;
  const c = dbTotal ? {
    cost: Number(dbTotal.cost_total) || 0,
    cost_ceiling: Number(dbTotal.cost_ceiling) || 0,
    cache_savings: Number(dbTotal.cache_savings) || 0,
    api_calls: dbTotal.api_calls || 0,
    input_tokens: Number(dbTotal.input_tokens) || 0,
    output_tokens: Number(dbTotal.output_tokens) || 0,
    cache_read_tokens: Number(dbTotal.cache_read_tokens) || 0,
    cache_creation_tokens: Number(dbTotal.cache_creation_tokens) || 0,
    web_searches: dbTotal.web_searches || 0,
  } : (data.costs?.total || {});
  const l = data.learnings || {};

  // ── Filter helpers ──
  const dateRangeCutoff = () => {
    const now = Date.now();
    if (dateRange === "today") return now - 86400000;
    if (dateRange === "7d") return now - 7 * 86400000;
    if (dateRange === "30d") return now - 30 * 86400000;
    if (dateRange === "90d") return now - 90 * 86400000;
    return 0; // "all"
  };
  const cutoff = dateRangeCutoff();
  const inDateRange = (dateStr) => !dateStr || dateRange === "all" || new Date(dateStr).getTime() >= cutoff;
  const matchesSearch = (u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.org_name || "").toLowerCase().includes(q);
  };

  // Filtered datasets
  const filteredUsers = (data.users || []).filter(u => {
    if (userTypeFilter === "guest") return false; // guests aren't in users table
    if (roleFilter && u.role !== roleFilter) return false;
    if (planFilter && u.org_plan !== planFilter) return false;
    if (userStatusFilter === "orphan" && u.org_id) return false;
    if (userStatusFilter === "never_active" && u.last_active) return false;
    if (userStatusFilter === "new_7d" && u.created_at && (Date.now() - new Date(u.created_at).getTime()) > 604800000) return false;
    if (!matchesSearch(u)) return false;
    // Date range filter: only exclude users who HAVE activity outside the range
    // Users with no activity always pass (they're filtered via status filter instead)
    if (dateRange !== "all" && u.last_active && !inDateRange(u.last_active)) return false;
    return true;
  });
  const filteredActivity = (data.recent_activity || []).filter(a => {
    if (!inDateRange(a.updated_at)) return false;
    if (userTypeFilter === "guest") return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(a.user_name || "").toLowerCase().includes(q) && !(a.user_email || "").toLowerCase().includes(q) && !(a.session_name || "").toLowerCase().includes(q) && !(a.seller_url || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const filteredCostsByUser = (data.costs?.by_user || []).filter(u => {
    if (userTypeFilter === "guest" && u.user_id !== "guest") return false;
    if (userTypeFilter === "authenticated" && u.user_id === "guest") return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(u.user_name || "").toLowerCase().includes(q) && !(u.user_email || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const filteredCostsByDay = (data.costs?.by_day || []).filter(d => {
    if (dateRange === "all") return true;
    return new Date(d.day).getTime() >= cutoff;
  });
  const filteredOrgs = (data.orgs || []).filter(o => {
    if (planFilter && o.plan !== planFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(o.name || "").toLowerCase().includes(q) && !(o.seller_url || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const hasActiveFilters = dateRange !== "all" || userTypeFilter !== "all" || roleFilter || planFilter || userStatusFilter || searchQuery;

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

  const applyPlanToOrg = async (orgId, planId) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    try {
      await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}`, {
        method: "PATCH",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${sbToken}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ plan: plan.id, run_limit: plan.tokens, max_run_limit: plan.maxTokens }),
      });
      setPlanSaveMsg(`Applied "${plan.name}" to org ${orgId}`);
      setTimeout(() => setPlanSaveMsg(""), 3000);
    } catch { setPlanSaveMsg("Error applying plan"); }
  };

  // ── Access-request queue (issue #3) ──
  const pendingRequests = (data.access_requests || []).filter(rq => !removedRequests.includes(rq.id));
  const actOnRequest = async (rq, action, reason) => {
    setRequestBusy(rq.id);
    setRemovedRequests(prev => [...prev, rq.id]); // optimistic removal
    try {
      const r = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
        body: JSON.stringify({ action, requestId: rq.id, email: rq.email, ...(reason ? { reason } : {}) }),
      });
      const d = await r.json();
      if (d.ok) {
        setPlanSaveMsg(d.message || "Done");
        setTimeout(() => fetchData(false), 500);
      } else {
        setRemovedRequests(prev => prev.filter(id => id !== rq.id)); // rollback
        setPlanSaveMsg(`Error: ${d.error || "Action failed"}`);
      }
    } catch {
      setRemovedRequests(prev => prev.filter(id => id !== rq.id)); // rollback
      setPlanSaveMsg("Failed to update request");
    }
    setRequestBusy(null);
    setTimeout(() => setPlanSaveMsg(""), 4000);
  };

  // ── Sidebar nav config ──
  const navGroups = [
    {
      items: [{ id: "overview", label: "Overview", sub: "Key metrics at a glance" }],
    },
    {
      label: "PEOPLE",
      items: [
        { id: "users", label: "Users", count: s.total_users, sub: "Accounts, roles, activity" },
        { id: "requests", label: "Access Requests", count: pendingRequests.length, sub: "Approve or dismiss beta requests" },
        { id: "orgs", label: "Organizations", count: s.total_orgs, sub: "Teams, plans, run limits" },
      ],
    },
    {
      label: "ANALYTICS",
      items: [
        { id: "sessions", label: "Sessions", count: s.total_sessions, sub: "Briefs, pipeline, depth" },
        { id: "costs", label: "API Costs", count: `$${(c.cost || 0).toFixed(2)}${dbTotal ? "" : "*"}`, sub: "Spend by user, model, day" },
        { id: "activity", label: "Activity", sub: "Companies researched" },
      ],
    },
    {
      label: "SYSTEM",
      items: [
        { id: "usage", label: "Usage", sub: "Env status, per-org tokens" },
        { id: "pricing", label: "Pricing", sub: "Plans, margins, revenue" },
        { id: "learnings", label: "Learnings", sub: "Edits, routing, patterns" },
        { id: "intelligence", label: "Intelligence", sub: "Accuracy, calibration, KLs" },
        { id: "urls", label: "URLs", count: s.unique_seller_urls },
      ],
    },
  ];

  // ── Render filters per section ──
  const renderFilters = () => {
    const clearBtn = hasActiveFilters && (
      <button onClick={() => { setDateRange("all"); setUserTypeFilter("all"); setRoleFilter(""); setPlanFilter(""); setUserStatusFilter(""); setSearchQuery(""); }}
        style={{ fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: "1.5px solid var(--amber)", background: "var(--surface)", color: "var(--amber)", cursor: "pointer", whiteSpace: "nowrap" }}>
        Clear filters
      </button>
    );

    if (tab === "users") {
      const orphanCount = (data.users || []).filter(u => !u.org_id).length;
      const neverActiveCount = (data.users || []).filter(u => !u.last_active).length;
      const newCount = (data.users || []).filter(u => u.created_at && (Date.now() - new Date(u.created_at).getTime()) < 604800000).length;
      return (
        <div className="admin-filters">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search members..."
            onKeyDown={e => e.stopPropagation()} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">Any role</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="rep">Rep</option>
          </select>
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
            <option value="">Any plan</option>
            <option value="trial">Trial</option>
            <option value="paid">Paid</option>
            <option value="enterprise">Enterprise</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={userStatusFilter} onChange={e => setUserStatusFilter(e.target.value)}>
            <option value="">Any status</option>
            <option value="orphan">No org ({orphanCount})</option>
            <option value="never_active">Never active ({neverActiveCount})</option>
            <option value="new_7d">Joined last 7d ({newCount})</option>
          </select>
          {clearBtn}
          {hasActiveFilters && <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>{filteredUsers.length} of {data.users.length}</span>}
        </div>
      );
    }
    if (tab === "orgs") {
      return (
        <div className="admin-filters">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search organizations..."
            onKeyDown={e => e.stopPropagation()} />
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
            <option value="">Any plan</option>
            <option value="trial">Trial</option>
            <option value="paid">Paid</option>
            <option value="enterprise">Enterprise</option>
            <option value="suspended">Suspended</option>
          </select>
          {clearBtn}
          {hasActiveFilters && <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>{filteredOrgs.length} of {data.orgs.length}</span>}
        </div>
      );
    }
    if (tab === "sessions" || tab === "activity") {
      return (
        <div className="admin-filters">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search sessions..."
            onKeyDown={e => e.stopPropagation()} />
          <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          {clearBtn}
          {hasActiveFilters && <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>{filteredActivity.length} activities</span>}
        </div>
      );
    }
    if (tab === "costs") {
      return (
        <div className="admin-filters">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search costs..."
            onKeyDown={e => e.stopPropagation()} />
          <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <select value={userTypeFilter} onChange={e => setUserTypeFilter(e.target.value)}>
            <option value="all">All users</option>
            <option value="authenticated">Authenticated</option>
            <option value="guest">Guests only</option>
          </select>
          {clearBtn}
        </div>
      );
    }
    if (tab === "urls") {
      return (
        <div className="admin-filters">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search URLs..."
            onKeyDown={e => e.stopPropagation()} />
        </div>
      );
    }
    return null;
  };

  // Flat list of all nav items for mobile tabs
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
          <div style={{ fontFamily: "Lora,serif", fontSize: 18, fontWeight: 700, color: "var(--ink-0)" }}>Reporting</div>
          <span className="admin-badge" style={{ background: "var(--violet-bg)", color: "var(--violet)", fontSize: 9, letterSpacing: "0.5px", textTransform: "uppercase" }}>Admin</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => fetchData(false)} disabled={refreshing}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line-0)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--ink-2)" }}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button onClick={onClose}
            style={{ padding: "6px 16px", borderRadius: 8, border: "1.5px solid var(--ink-0)", background: "var(--ink-0)", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--surface)" }}>
            &larr; Back to App
          </button>
        </div>
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
                  <span style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:1}}>
                    <span style={{display:"flex",alignItems:"center",gap:6,width:"100%"}}>
                      {item.label}
                      {item.count !== undefined && <span className="admin-sidebar-count">{item.count}</span>}
                    </span>
                    {item.sub && <span style={{fontSize:9,color:"var(--ink-3)",fontWeight:400,lineHeight:1.2}}>{item.sub}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Main content */}
        <main className="admin-content">
          {renderFilters()}

          {/* ═══ OVERVIEW ═══ */}
          {tab === "overview" && (
            <div>
              {/* Primary metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Users", value: s.total_users, color: "var(--navy)", click: () => setTab("users") },
                  { label: "Active Today", value: s.active_today, color: "var(--green)" },
                  { label: "Active This Week", value: s.active_this_week, color: "var(--amber)" },
                  { label: "Sessions", value: s.total_sessions, color: "var(--ink-0)", click: () => setTab("sessions") },
                  { label: "Runs Used", value: s.total_runs, color: "var(--tan-0)" },
                  { label: "Cost", value: `$${(c.cost || 0).toFixed(2)}`, color: "var(--ink-0)", click: () => setTab("costs") },
                ].map(m => (
                  <div key={m.label} className="admin-metric" style={{ cursor: m.click ? "pointer" : "default" }} onClick={m.click}>
                    <div className="admin-metric-num" style={{ color: m.color }}>{m.value}</div>
                    <div className="admin-metric-label">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Cost breakdown — daily spend visibility */}
              {(()=>{
                const logs = data.usageLogs || [];
                const now = new Date();
                const todayStr = now.toISOString().slice(0,10);
                const weekAgo = new Date(now - 7*86400000).toISOString();
                const monthAgo = new Date(now - 30*86400000).toISOString();
                const costPerToken = (model, input, output) => {
                  const rates = { "claude-opus-4-6": [15,75], "claude-sonnet-4-6": [3,15], "claude-sonnet-4-5-20250929": [3,15], "claude-sonnet-4-5": [3,15], "claude-haiku-4-5-20251001": [0.8,4] };
                  const [iRate, oRate] = rates[model] || [1,5];
                  return (input/1e6)*iRate + (output/1e6)*oRate;
                };
                const calcCost = (logs) => logs.reduce((sum, l) => sum + costPerToken(l.model, l.input_tokens||0, l.output_tokens||0) + (l.web_searches||0)*0.01, 0);
                const todayLogs = logs.filter(l => l.created_at?.slice(0,10) === todayStr);
                const weekLogs = logs.filter(l => l.created_at >= weekAgo);
                const monthLogs = logs.filter(l => l.created_at >= monthAgo);
                const todayCost = calcCost(todayLogs);
                const weekCost = calcCost(weekLogs);
                const monthCost = calcCost(monthLogs);
                // Model breakdown for this week
                const byModel = {};
                weekLogs.forEach(l => { const m = (l.model||"unknown").split("-").slice(-2).join("-"); byModel[m] = (byModel[m]||0) + costPerToken(l.model, l.input_tokens||0, l.output_tokens||0); });
                const modelEntries = Object.entries(byModel).sort((a,b) => b[1]-a[1]);
                const maxModelCost = modelEntries.length ? modelEntries[0][1] : 1;
                return (
                <div style={{ background: "var(--surface)", border: "1px solid var(--line-0)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>API Cost Breakdown</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: todayCost > 10 ? "var(--red)" : todayCost > 5 ? "var(--amber)" : "var(--green)", fontFamily: "Lora,serif" }}>${todayCost.toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>Today</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-0)", fontFamily: "Lora,serif" }}>${weekCost.toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>This Week</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-0)", fontFamily: "Lora,serif" }}>${monthCost.toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>This Month</div>
                    </div>
                  </div>
                  {modelEntries.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 }}>By Model (this week)</div>
                      {modelEntries.map(([model, cost]) => (
                        <div key={model} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-2)", width: 60, textAlign: "right" }}>{model}</div>
                          <div style={{ flex: 1, height: 8, background: "var(--bg-2)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(cost/maxModelCost)*100}%`, background: model.includes("opus") ? "var(--tan-0)" : model.includes("sonnet") ? "var(--navy)" : "var(--green)", borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-1)", width: 50 }}>${cost.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* Quick insights */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {/* Attention items */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--line-0)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 8 }}>Needs Attention</div>
                  {(() => {
                    const neverActive = (data.users || []).filter(u => !u.last_active).length;
                    const atLimit = (data.orgs || []).filter(o => o.run_count >= o.run_limit && o.run_limit > 0).length;
                    const personalOrgs = (data.orgs || []).filter(o => !o.seller_url && o.member_count <= 1).length;
                    const items = [];
                    if (pendingRequests.length > 0) items.push({ text: `${pendingRequests.length} access request${pendingRequests.length > 1 ? "s" : ""} awaiting review`, color: "var(--amber)", click: () => setTab("requests") });
                    const orphanUsers = (data.users || []).filter(u => !u.org_id).length;
                    if (orphanUsers > 0) items.push({ text: `${orphanUsers} users without an organization`, color: "var(--red)", click: () => { setUserStatusFilter("orphan"); setTab("users"); } });
                    if (neverActive > 0) items.push({ text: `${neverActive} users never active`, color: "var(--amber)", click: () => { setUserStatusFilter("never_active"); setTab("users"); } });
                    if (atLimit > 0) items.push({ text: `${atLimit} orgs at run limit`, color: "var(--red)", click: () => setTab("orgs") });
                    if (personalOrgs > 0) items.push({ text: `${personalOrgs} personal workspaces to clean up`, color: "var(--ink-2)", click: () => setTab("orgs") });
                    if (s.guest_api_calls > 0) items.push({ text: `${s.guest_api_calls} guest API calls`, color: "var(--ink-3)", click: () => setTab("activity") });
                    return items.length > 0 ? items.map((item, i) => (
                      <div key={i} onClick={item.click} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", cursor: "pointer", fontSize: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                        <span style={{ color: "var(--ink-1)" }}>{item.text}</span>
                      </div>
                    )) : <div style={{ fontSize: 12, color: "var(--ink-3)" }}>All clear</div>;
                  })()}
                </div>

                {/* Pipeline funnel mini */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--line-0)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 8 }}>Pipeline</div>
                  {data.sessionFunnel && [
                    { label: "ICP Built", value: data.sessionFunnel.with_icp, total: data.sessionFunnel.total, color: "var(--navy)" },
                    { label: "Brief Generated", value: data.sessionFunnel.with_brief, total: data.sessionFunnel.total, color: "var(--green)" },
                    { label: "Hypothesis", value: data.sessionFunnel.with_hypothesis, total: data.sessionFunnel.total, color: "var(--amber)" },
                    { label: "Post-Call", value: data.sessionFunnel.with_post_call, total: data.sessionFunnel.total, color: "var(--violet)" },
                  ].map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12 }}>
                      <span style={{ width: 70, color: "var(--ink-2)", fontSize: 11 }}>{step.label}</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--bg-2)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, background: step.color, width: step.total > 0 ? `${Math.round(step.value / step.total * 100)}%` : "0%" }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-1)", width: 30, textAlign: "right" }}>{step.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent activity — as a table, not a list */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 8 }}>Recent Activity</div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>User</th>
                    <th>Researching</th>
                    <th>Depth</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_activity.slice(0, 15).map((a, i) => {
                    const displayName = a.session_name === "Untitled" || a.session_name === "research-only"
                      ? (a.selected_account || a.seller_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "Quick Brief")
                      : a.session_name;
                    const depthDots = [a.hasICP, a.hasBrief, a.hasHypo, a.hasPostCall, a.hasSolutionFit];
                    const depthLabels = ["I", "B", "H", "P", "S"];
                    return (
                      <tr key={i}>
                        <td>
                          <span style={{ fontWeight: 700, color: "var(--ink-0)", fontSize: 13 }}>{displayName}</span>
                        </td>
                        <td style={{ fontSize: 11, color: "var(--ink-2)" }}>{a.user_name}</td>
                        <td style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          {a.seller_url === "research-only" ? (a.selected_account || "Quick Brief") : (a.seller_url?.replace(/^https?:\/\//, "") || "—")}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 2 }}>
                            {depthDots.map((filled, j) => (
                              <span key={j} style={{
                                width: 14, height: 14, borderRadius: 3, fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                                background: filled ? "var(--green)" : "var(--bg-2)", color: filled ? "var(--surface)" : "var(--ink-3)"
                              }}>{depthLabels[j]}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{timeAgo(a.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ SESSIONS ═══ */}
          {tab === "sessions" && (
            <div>
              {/* Session funnel */}
              {data.sessionFunnel && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>Pipeline Funnel</div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                    {[
                      { label: "Sessions", value: data.sessionFunnel.total, color: "var(--ink-0)" },
                      { label: "Built ICP", value: data.sessionFunnel.with_icp, color: "var(--navy)" },
                      { label: "Generated Brief", value: data.sessionFunnel.with_brief, color: "var(--green)" },
                      { label: "Hypothesis", value: data.sessionFunnel.with_hypothesis, color: "var(--amber)" },
                      { label: "Post-Call", value: data.sessionFunnel.with_post_call, color: "var(--violet)" },
                      { label: "Solution Fit", value: data.sessionFunnel.with_solution_fit, color: "var(--red)" },
                    ].map((step, i) => {
                      const pct = data.sessionFunnel.total > 0 ? Math.round(step.value / data.sessionFunnel.total * 100) : 0;
                      return (
                        <div key={i} style={{ flex: 1, textAlign: "center" }}>
                          <div style={{ height: 40, background: "var(--bg-2)", borderRadius: 6, position: "relative", overflow: "hidden", marginBottom: 4 }}>
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${pct}%`, background: step.color, borderRadius: 6, opacity: 0.2 }} />
                            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 16, fontWeight: 700, color: step.color, fontFamily: "Lora,serif" }}>{step.value}</div>
                          </div>
                          <div style={{ fontSize: 9, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase" }}>{step.label}</div>
                          <div style={{ fontSize: 9, color: "var(--ink-3)" }}>{pct}%</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Aggregate stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {[
                      { label: "Companies Scored", value: data.sessionFunnel.total_companies_scored, color: "var(--green)" },
                      { label: "Companies Queued", value: data.sessionFunnel.total_companies_queued, color: "var(--navy)" },
                      { label: "Avg per Session", value: data.sessionFunnel.avg_companies_per_session, color: "var(--ink-0)" },
                      { label: "Fast Track", value: data.sessionFunnel.deal_routes?.fast_track || 0, color: "var(--green)" },
                      { label: "Nurture", value: data.sessionFunnel.deal_routes?.nurture || 0, color: "var(--amber)" },
                      { label: "Disqualify", value: data.sessionFunnel.deal_routes?.disqualify || 0, color: "var(--red)" },
                    ].map(m => (
                      <div key={m.label} className="admin-metric">
                        <div className="admin-metric-num" style={{ color: m.color, fontSize: 20 }}>{m.value}</div>
                        <div className="admin-metric-label">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Top industries */}
                  {data.sessionFunnel.top_industries?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Top Industries Researched</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {data.sessionFunnel.top_industries.map((ind, i) => (
                          <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--navy-bg)", color: "var(--navy)", fontWeight: 600 }}>
                            {ind.industry} ({ind.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Seller stages */}
                  {data.sessionFunnel.top_seller_stages?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Seller Stages</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {data.sessionFunnel.top_seller_stages.map((st, i) => (
                          <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--green-bg)", color: "var(--green)", fontWeight: 600 }}>
                            {st.stage} ({st.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Uploaded documents across all sessions */}
              {(()=>{
                const allDocs = filteredActivity.filter(a => a.docs?.length > 0 || a.products?.length > 0 || a.proof_points?.length > 0);
                return allDocs.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                      Uploaded Content ({allDocs.reduce((s,a) => s + (a.docs?.length||0) + (a.products?.length||0) + (a.proof_points?.length||0), 0)} items across {allDocs.length} sessions)
                    </div>
                    <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid var(--line-0)", borderRadius: 8 }}>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Name</th>
                            <th>Preview</th>
                            <th>User</th>
                            <th>Session</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allDocs.flatMap(a => [
                            ...(a.docs||[]).map((d,i) => ({ type: "Doc", name: d.label, preview: d.contentPreview, user: a.user_name, session: a.session_name, key: `doc-${a.id}-${i}` })),
                            ...(a.products||[]).map((p,i) => ({ type: "Product", name: p.name, preview: p.description, user: a.user_name, session: a.session_name, key: `prod-${a.id}-${i}` })),
                            ...(a.proof_points||[]).map((pp,i) => ({ type: pp.type, name: pp.label || pp.type, preview: pp.content, user: a.user_name, session: a.session_name, key: `pp-${a.id}-${i}` })),
                          ]).map(row => (
                            <tr key={row.key}>
                              <td style={{ whiteSpace: "nowrap", color: "var(--tan-0)", fontWeight: 600 }}>{row.type}</td>
                              <td style={{ fontWeight: 600, color: "var(--ink-0)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</td>
                              <td style={{ color: row.preview?.startsWith("[PDF") ? "var(--amber)" : "var(--ink-3)", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.preview || "\u2014"}</td>
                              <td style={{ color: "var(--ink-2)" }}>{row.user}</td>
                              <td style={{ color: "var(--ink-3)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.session}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* All sessions table */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                All Sessions {hasActiveFilters && <span style={{ fontWeight: 400, color: "var(--amber)" }}>({filteredActivity.length} of {data.recent_activity.length})</span>}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="admin-table" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <SortTh sortKey={sessionSortKey} sortDir={sessionSortDir} onSort={onSessionSort} colKey="session_name">Session</SortTh>
                      <SortTh sortKey={sessionSortKey} sortDir={sessionSortDir} onSort={onSessionSort} colKey="user_name">User</SortTh>
                      <th>Seller</th>
                      <th>Depth</th>
                      <th>Accounts</th>
                      <th>Route</th>
                      <SortTh sortKey={sessionSortKey} sortDir={sessionSortDir} onSort={onSessionSort} colKey="updated_at">Updated</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sortRows(filteredActivity, sessionSortKey, sessionSortDir, { dateKeys: { updated_at: true } }).map((a, i) => {
                      const depthDots = [a.hasICP, a.hasBrief, a.hasHypo, a.hasPostCall, a.hasSolutionFit];
                      const depthLabels = ["ICP", "Brief", "Hypo", "Post", "SA"];
                      const isExpanded = expandedSession === a.id;
                      return (
                        <React.Fragment key={i}>
                        <tr onClick={() => setExpandedSession(isExpanded ? null : a.id)} style={{ cursor: "pointer", background: isExpanded ? "var(--green-bg)" : undefined }}>
                          <td>
                            <div style={{ fontWeight: 700, color: "var(--ink-0)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                              <span style={{ fontSize: 10, marginRight: 4, transition: "transform 0.2s", display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                              {a.session_name}
                            </div>
                            {a.selected_account && <div style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 14 }}>Target: {a.selected_account}</div>}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--ink-0)" }}>{a.user_name?.split(" ")[0] || "\u2014"}</div>
                            <div style={{ fontSize: 9, color: "var(--ink-3)" }}>{a.user_role}</div>
                          </td>
                          <td>
                            <div style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-1)" }}>{a.seller_url || "\u2014"}</div>
                            {a.products_count > 0 && <div style={{ fontSize: 9, color: "var(--ink-3)" }}>{a.products_count} products &middot; {a.docs_count} docs</div>}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 2 }}>
                              {depthDots.map((filled, j) => (
                                <span key={j} title={depthLabels[j]} style={{
                                  width: 14, height: 14, borderRadius: 3, fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                                  background: filled ? "var(--green)" : "var(--bg-2)", color: filled ? "var(--surface)" : "var(--ink-3)"
                                }}>{depthLabels[j][0]}</span>
                              ))}
                            </div>
                            {a.gates_filled > 0 && <div style={{ fontSize: 9, color: "var(--ink-3)", marginTop: 2 }}>{a.gates_filled}G {a.discovery_filled}D</div>}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ fontWeight: 700, color: "var(--ink-0)" }}>{a.companies_scored > 0 ? a.companies_scored : "\u2014"}</div>
                            {a.companies_queued > 0 && <div style={{ fontSize: 9, color: "var(--ink-3)" }}>{a.companies_queued} queued</div>}
                          </td>
                          <td>
                            {a.deal_route ? (
                              <span className="admin-badge" style={{
                                background: a.deal_route === "FAST_TRACK" ? "var(--green-bg)" : a.deal_route === "NURTURE" ? "var(--amber-bg)" : "var(--red-bg)",
                                color: a.deal_route === "FAST_TRACK" ? "var(--green)" : a.deal_route === "NURTURE" ? "var(--amber)" : "var(--red)",
                              }}>{a.deal_route.replace("_", " ")}</span>
                            ) : <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{"\u2014"}</span>}
                            {a.deal_value && <div style={{ fontSize: 9, color: "var(--ink-3)", marginTop: 2 }}>${Number(a.deal_value).toLocaleString()}</div>}
                          </td>
                          <td style={{ fontSize: 10, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                            {timeAgo(a.updated_at)}
                            {a.milton_messages > 0 && <div style={{ fontSize: 9, color: "var(--red)" }}>{a.milton_messages} Milton</div>}
                          </td>
                        </tr>
                        {/* ── EXPANDED SESSION DETAIL ── */}
                        {isExpanded && (
                          <tr><td colSpan={7} style={{ padding: 0, background: "var(--bg-0)" }}>
                            <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 12 }}>
                              {/* Left column — Brief Intel */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Brief Intelligence</div>
                                {a.brief_tldr?.topFinding && (
                                  <div style={{ background: "var(--surface)", border: "1px solid var(--line-0)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tan-0)", marginBottom: 6 }}>QUICK TAKE</div>
                                    <div style={{ fontSize: 11, color: "var(--ink-0)", lineHeight: 1.5, marginBottom: 4 }}><strong>Finding:</strong> {a.brief_tldr.topFinding}</div>
                                    <div style={{ fontSize: 11, color: "var(--ink-0)", lineHeight: 1.5, marginBottom: 4 }}><strong>Opportunity:</strong> {a.brief_tldr.topOpportunity}</div>
                                    <div style={{ fontSize: 11, color: "var(--ink-0)", lineHeight: 1.5 }}><strong>Risk:</strong> {a.brief_tldr.topRisk}</div>
                                  </div>
                                )}
                                {a.brief_snapshot && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", marginBottom: 3 }}>COMPANY SNAPSHOT</div>
                                    <div style={{ fontSize: 11, color: "var(--ink-1)", lineHeight: 1.6 }}>{a.brief_snapshot}</div>
                                  </div>
                                )}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                                  {[
                                    ["Revenue", a.brief_revenue],
                                    ["Employees", a.brief_employees],
                                    ["HQ", a.brief_hq],
                                    ["Ownership", a.brief_ownership],
                                  ].filter(([,v]) => v).map(([label, val]) => (
                                    <div key={label} style={{ fontSize: 11 }}><strong style={{ color: "var(--ink-2)" }}>{label}:</strong> <span style={{ color: "var(--ink-0)" }}>{val}</span></div>
                                  ))}
                                </div>
                                {a.brief_funding && (
                                  <div style={{ fontSize: 11, color: "var(--ink-1)", lineHeight: 1.5, marginBottom: 10 }}>
                                    <strong style={{ color: "var(--ink-2)" }}>Funding:</strong> {a.brief_funding}
                                  </div>
                                )}
                                {a.brief_executives?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", marginBottom: 4 }}>EXECUTIVES ({a.brief_executives.length})</div>
                                    {a.brief_executives.map((e, j) => (
                                      <div key={j} style={{ fontSize: 11, color: "var(--ink-0)", marginBottom: 2 }}><strong>{e.name}</strong> — {e.title}</div>
                                    ))}
                                  </div>
                                )}
                                {a.brief_headlines?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", marginBottom: 4 }}>HEADLINES ({a.brief_headlines.length})</div>
                                    {a.brief_headlines.map((h, j) => (
                                      <div key={j} style={{ fontSize: 11, color: "var(--ink-1)", lineHeight: 1.5, marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid var(--tan-2)" }}>{h}</div>
                                    ))}
                                  </div>
                                )}
                                {a.brief_strategic_theme && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", marginBottom: 3 }}>STRATEGIC THEME</div>
                                    <div style={{ fontSize: 11, color: "var(--ink-1)", lineHeight: 1.6, fontStyle: "italic" }}>{a.brief_strategic_theme}</div>
                                  </div>
                                )}
                                {a.brief_opening_angle && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", marginBottom: 3 }}>OPENING ANGLE</div>
                                    <div style={{ fontSize: 11, color: "var(--ink-0)", lineHeight: 1.6 }}>{a.brief_opening_angle}</div>
                                  </div>
                                )}
                                {a.brief_five_questions?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", marginBottom: 4 }}>5 QUESTIONS TO ASK</div>
                                    {a.brief_five_questions.map((q, j) => (
                                      <div key={j} style={{ fontSize: 11, color: "var(--ink-0)", lineHeight: 1.5, marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid var(--green)" }}>
                                        <strong>{j + 1}.</strong> {q.question}
                                        {q.rationale && <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 1 }}>Why: {q.rationale}</div>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Right column — ICP, Hypothesis, Docs, Fit Scores */}
                              <div>
                                {(a.icp_industries?.length > 0 || a.icp_personas?.length > 0) && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>ICP Configuration</div>
                                    {a.icp_industries?.length > 0 && <div style={{ fontSize: 11, marginBottom: 4 }}><strong style={{ color: "var(--ink-2)" }}>Industries:</strong> {a.icp_industries.join(", ")}</div>}
                                    {a.icp_personas?.length > 0 && <div style={{ fontSize: 11, marginBottom: 4 }}><strong style={{ color: "var(--ink-2)" }}>Personas:</strong> {a.icp_personas.join(", ")}</div>}
                                    {a.icp_company_sizes?.length > 0 && <div style={{ fontSize: 11, marginBottom: 4 }}><strong style={{ color: "var(--ink-2)" }}>Company sizes:</strong> {a.icp_company_sizes.join(", ")}</div>}
                                    {a.icp_edits > 0 && <div style={{ fontSize: 11, color: "var(--green)" }}>{a.icp_edits} manual edits applied</div>}
                                  </div>
                                )}
                                {a.hypothesis_reality && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Call Prep Hypothesis</div>
                                    {["reality", "impact", "vision", "entry", "route"].map(stage => {
                                      const val = a[`hypothesis_${stage}`];
                                      if (!val) return null;
                                      return <div key={stage} style={{ fontSize: 11, color: "var(--ink-1)", lineHeight: 1.5, marginBottom: 6 }}><strong style={{ color: "var(--ink-0)", textTransform: "uppercase" }}>{stage}:</strong> {val.slice(0, 200)}{val.length > 200 ? "..." : ""}</div>;
                                    })}
                                  </div>
                                )}
                                {a.docs?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Uploaded Documents ({a.docs.length})</div>
                                    {a.docs.map((d, j) => (
                                      <div key={j} style={{ background: "var(--surface)", border: "1px solid var(--line-0)", borderRadius: 6, padding: "10px 12px", marginBottom: 6 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-0)" }}>{d.label}</span>
                                          {d.charCount > 0 && <span style={{ fontSize: 9, color: "var(--ink-3)", background: "var(--bg-2)", borderRadius: 4, padding: "1px 5px" }}>{d.charCount > 1000 ? Math.round(d.charCount / 1000) + "K chars" : d.charCount + " chars"}</span>}
                                          {d.isBinary && <span style={{ fontSize: 9, color: "var(--amber)", background: "var(--amber-bg)", borderRadius: 4, padding: "1px 5px" }}>PDF/Binary</span>}
                                        </div>
                                        <div style={{ fontSize: 11, color: d.isBinary ? "var(--ink-3)" : "var(--ink-1)", lineHeight: 1.6, maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{d.contentPreview || "No preview available"}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {a.products?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Products ({a.products.length})</div>
                                    {a.products.map((p, j) => (
                                      <div key={j} style={{ fontSize: 11, marginBottom: 3 }}><strong style={{ color: "var(--ink-0)" }}>{p.name}</strong>{p.description ? ` — ${p.description}` : ""}</div>
                                    ))}
                                  </div>
                                )}
                                {a.account_docs?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Account Intel ({a.account_docs.length})</div>
                                    {a.account_docs.map((d, j) => (
                                      <div key={j} style={{ background: "var(--navy-bg)", border: "1px solid var(--navy)", borderRadius: 6, padding: "10px 12px", marginBottom: 6 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)" }}>{d.label}</span>
                                          {d.charCount > 0 && <span style={{ fontSize: 9, color: "var(--ink-3)", background: "var(--bg-2)", borderRadius: 4, padding: "1px 5px" }}>{d.charCount > 1000 ? Math.round(d.charCount / 1000) + "K chars" : d.charCount + " chars"}</span>}
                                        </div>
                                        <div style={{ fontSize: 11, color: "var(--ink-1)", lineHeight: 1.6, maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{d.contentPreview || "No preview"}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {a.fit_scores?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Fit Scores ({a.fit_scores.length} companies)</div>
                                    <div style={{ maxHeight: 200, overflow: "auto" }}>
                                      {a.fit_scores.map((f, j) => (
                                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 3 }}>
                                          <span style={{ fontWeight: 700, color: f.score >= 70 ? "var(--green)" : f.score >= 40 ? "var(--amber)" : "var(--red)", minWidth: 30 }}>{f.score || "—"}</span>
                                          <span style={{ fontWeight: 600, color: "var(--ink-0)" }}>{f.company}</span>
                                          {f.reason && <span style={{ color: "var(--ink-3)", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.reason}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {a.brief_competitors?.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>COMPETITORS</div>
                                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                      {a.brief_competitors.map((c, j) => <span key={j} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "var(--red-bg)", color: "var(--red)", fontWeight: 600 }}>{c}</span>)}
                                    </div>
                                  </div>
                                )}
                                {a.brief_elevator_pitch && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>ELEVATOR PITCH</div>
                                    <div style={{ fontSize: 11, color: "var(--ink-0)", lineHeight: 1.6, fontStyle: "italic", background: "var(--green-bg)", border: "1px solid var(--green)", borderRadius: 6, padding: "8px 10px" }}>"{a.brief_elevator_pitch}"</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td></tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredActivity.length === 0 && <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: 20 }}>No sessions match the current filters.</div>}
            </div>
          )}

          {/* ═══ MEMBERS (users tab) ═══ */}
          {tab === "users" && (
            <div>
              {/* Invite form */}
              <div className="admin-filters" style={{ background: "var(--bg-1)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", whiteSpace: "nowrap" }}>Invite &rarr;</span>
                <input id="sa-invite-email" placeholder="email@company.com" type="email"
                  onKeyDown={e => e.stopPropagation()} />
                <select id="sa-invite-org" defaultValue="">
                  <option value="" disabled>Org...</option>
                  {data.orgs.filter(o => o.seller_url || o.member_count > 1).sort((a,b) => (a.name||"").localeCompare(b.name||"")).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  {data.orgs.filter(o => !o.seller_url && o.member_count <= 1).length > 0 && <optgroup label="Personal">
                    {data.orgs.filter(o => !o.seller_url && o.member_count <= 1).sort((a,b) => (a.name||"").localeCompare(b.name||"")).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </optgroup>}
                </select>
                <select id="sa-invite-role" defaultValue="rep">
                  <option value="rep">Rep</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                <button onClick={async () => {
                  const email = document.getElementById("sa-invite-email")?.value?.trim();
                  const orgId = document.getElementById("sa-invite-org")?.value;
                  const role = document.getElementById("sa-invite-role")?.value || "rep";
                  if (!email || !orgId) { setPlanSaveMsg("Email and org required"); setTimeout(() => setPlanSaveMsg(""), 3000); return; }
                  try {
                    const r = await fetch("/api/invite", {
                      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                      body: JSON.stringify({ email, role, orgId }),
                    });
                    const d = await r.json();
                    setPlanSaveMsg(d.ok ? `Invited ${email} to org` : `Error: ${d.error}`);
                    if (d.ok) document.getElementById("sa-invite-email").value = "";
                  } catch { setPlanSaveMsg("Failed to invite"); }
                  setTimeout(() => setPlanSaveMsg(""), 4000);
                }}
                  style={{ padding: "6px 14px", borderRadius: 6, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  Send Invite
                </button>
              </div>

              {/* Members table */}
              <table className="admin-table">
                <thead>
                  <tr>
                    <SortTh sortKey={memberSortKey} sortDir={memberSortDir} onSort={onMemberSort} colKey="name">Name / Email</SortTh>
                    <SortTh sortKey={memberSortKey} sortDir={memberSortDir} onSort={onMemberSort} colKey="role">Role</SortTh>
                    <SortTh sortKey={memberSortKey} sortDir={memberSortDir} onSort={onMemberSort} colKey="org_name">Organization</SortTh>
                    <th>Status</th>
                    <SortTh sortKey={memberSortKey} sortDir={memberSortDir} onSort={onMemberSort} colKey="created_at">Joined</SortTh>
                    <SortTh sortKey={memberSortKey} sortDir={memberSortDir} onSort={onMemberSort} colKey="last_active">Last Active</SortTh>
                    <th style={{textAlign:"center"}}>Sessions</th>
                    <th style={{textAlign:"center"}}>Briefs</th>
                    <th>Researched</th>
                    <th style={{ width: 50 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortRows(filteredUsers, memberSortKey, memberSortDir, { dateKeys: { last_active: true, created_at: true } }).map(u => {
                    const adminAction = async (action, extra = {}) => {
                      try {
                        const r = await fetch("/api/admin", {
                          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                          body: JSON.stringify({ action, email: u.email, userId: u.id, ...extra }),
                        });
                        const d = await r.json();
                        setPlanSaveMsg(d.ok ? d.message || `${action} done` : `Error: ${d.error}`);
                      } catch { setPlanSaveMsg(`Failed: ${action}`); }
                      setTimeout(() => setPlanSaveMsg(""), 4000);
                    };
                    const patchUser = async (fields, msg) => {
                      try {
                        const r = await fetch("/api/admin", {
                          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                          body: JSON.stringify({ action: "update_user", userId: u.id, email: u.email, fields }),
                        });
                        const d = await r.json();
                        setPlanSaveMsg(d.ok ? msg : `Error: ${d.error}`);
                      } catch { setPlanSaveMsg("Failed to save"); }
                      setTimeout(() => setPlanSaveMsg(""), 3000);
                      setTimeout(fetchData, 500);
                    };

                    const companyOrgs = data.orgs.filter(o => o.seller_url || o.member_count > 1).sort((a,b) => (a.name||"").localeCompare(b.name||""));
                    const personalOrgs = data.orgs.filter(o => !o.seller_url && o.member_count <= 1).sort((a,b) => (a.name||"").localeCompare(b.name||""));

                    return (
                      <tr key={u.id} style={{
                        ...(u.email === SUPERUSER_EMAIL ? { background: "var(--bg-1)" } : {}),
                        ...(!u.org_id ? { borderLeft: "3px solid var(--red, #c33)" } : {}),
                        ...(!u.last_active && u.org_id ? { opacity: 0.7 } : {}),
                      }}>
                        <td>
                          <div style={{ fontWeight: 700, color: "var(--ink-0)", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                            {u.name || u.email?.split("@")[0]}
                            {u.email === SUPERUSER_EMAIL && <span className="admin-badge" style={{ background: "var(--violet-bg)", color: "var(--violet)" }}>SUPER</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{u.email}</div>
                        </td>
                        <td>
                          {(() => {
                            const rm = { admin: { bg: "var(--navy-bg)", border: "var(--navy)" }, manager: { bg: "var(--amber-bg)", border: "var(--amber)" }, rep: { bg: "var(--green-bg)", border: "var(--green)" } };
                            const rs = rm[u.role] || rm.rep;
                            return (
                              <select value={u.role || "rep"} onChange={e => patchUser({ role: e.target.value }, `${u.email} \u2192 ${e.target.value}`)}
                                style={{ background: rs.bg, borderColor: rs.border, color: rs.border, fontWeight: 700 }}>
                                <option value="rep">Rep</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Admin</option>
                              </select>
                            );
                          })()}
                        </td>
                        <td>
                          <select value={u.org_id || ""} onChange={e => patchUser({ org_id: e.target.value || null }, `${u.email} \u2192 ${e.target.value ? data.orgs.find(o => o.id === e.target.value)?.name : "no org"}`)}>
                            <option value="">No org</option>
                            {companyOrgs.length > 0 && <optgroup label="Companies">
                              {companyOrgs.map(o => <option key={o.id} value={o.id}>{o.name}{o.seller_url ? ` \u00b7 ${o.seller_url.replace(/^https?:\/\//, "")}` : ""} ({o.plan})</option>)}
                            </optgroup>}
                            {personalOrgs.length > 0 && <optgroup label="Personal Workspaces">
                              {personalOrgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.plan})</option>)}
                            </optgroup>}
                          </select>
                        </td>
                        <td>
                          {(() => {
                            const now = Date.now();
                            const la = u.last_active ? new Date(u.last_active).getTime() : 0;
                            const noOrg = !u.org_id;
                            if (!la && noOrg) return <span className="admin-badge" style={{ background: "var(--red-bg,#fee)", color: "var(--red,#c33)", border: "1px solid var(--red,#c33)" }}>No org</span>;
                            if (!la) return <span className="admin-badge" style={{ background: "var(--bg-2)", color: "var(--ink-3)" }}>Never active</span>;
                            if (now - la < 86400000) return <span className="admin-badge" style={{ background: "var(--green-bg)", color: "var(--green)" }}>Active today</span>;
                            if (now - la < 604800000) return <span className="admin-badge" style={{ background: "var(--blue-bg,#e8f0fe)", color: "var(--blue,#1a73e8)" }}>This week</span>;
                            if (now - la < 2592000000) return <span className="admin-badge" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>This month</span>;
                            return <span className="admin-badge" style={{ background: "var(--bg-2)", color: "var(--ink-3)" }}>Inactive 30d+</span>;
                          })()}
                        </td>
                        <td style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "\u2014"}
                        </td>
                        <td style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                          {u.last_active ? timeAgo(u.last_active) : u.last_login ? timeAgo(u.last_login) : "\u2014"}
                        </td>
                        <td style={{ fontSize: 12, textAlign: "center", fontWeight: 600, color: u.session_count > 0 ? "var(--ink-0)" : "var(--ink-3)" }}>
                          {u.session_count || 0}
                        </td>
                        <td style={{ fontSize: 12, textAlign: "center", fontWeight: 600, color: u.brief_count > 0 ? "var(--green)" : "var(--ink-3)" }}>
                          {u.brief_count || 0}
                        </td>
                        <td style={{ fontSize: 10 }}>
                          {(() => {
                            const userCompanies = (data.usage || []).filter(x => x.user_id === u.id && x.target_company);
                            if (!userCompanies.length) return <span style={{ color: "var(--ink-3)" }}>—</span>;
                            const unique = [...new Set(userCompanies.map(x => x.target_company))];
                            return (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                {unique.slice(0, 5).map((co, j) => (
                                  <span key={j} style={{ background: "var(--navy-bg)", color: "var(--navy)", padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 600 }}>{co}</span>
                                ))}
                                {unique.length > 5 && <span style={{ color: "var(--ink-3)", fontSize: 9 }}>+{unique.length - 5}</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td>
                          <button className="admin-dot-menu" aria-label="Actions" onClick={e => {
                            e.stopPropagation();
                            if (openMenu === u.id) { setOpenMenu(null); return; }
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            setMenuContext({ userId: u.id, email: u.email, name: u.name, orgId: u.org_id, role: u.role, isSuperuserRow: u.email === SUPERUSER_EMAIL });
                            setOpenMenu(u.id);
                          }}>
                            &#x22EF;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredUsers.length === 0 && <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: 20 }}>No members match the current filters.</div>}
            </div>
          )}

          {/* ═══ ACCESS REQUESTS ═══ */}
          {tab === "requests" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                Pending Access Requests ({pendingRequests.length})
              </div>
              {pendingRequests.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: 20 }}>No pending access requests.</div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name / Email</th>
                      <th>Company</th>
                      <th>Note</th>
                      <th>Requested</th>
                      <th style={{ width: 170 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map(rq => {
                      const busy = requestBusy === rq.id;
                      return (
                        <tr key={rq.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: "var(--ink-0)", fontSize: 13 }}>{rq.name}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{rq.email}</div>
                          </td>
                          <td style={{ color: "var(--ink-1)", fontSize: 12 }}>{rq.company}</td>
                          <td style={{ fontSize: 11, color: "var(--ink-2)", maxWidth: 260 }}>
                            {rq.note || "—"}
                            {rq.promo_code && <div style={{ fontSize: 9, color: "var(--amber)", fontWeight: 600, marginTop: 2 }}>Code: {rq.promo_code}</div>}
                          </td>
                          <td style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }} title={rq.created_at}>{timeAgo(rq.created_at)}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button disabled={busy} onClick={() => actOnRequest(rq, "approve_access_request")}
                                style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "var(--green)", color: "var(--surface)", fontSize: 11, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                                {busy ? "Working..." : "Approve"}
                              </button>
                              <button disabled={busy} onClick={() => {
                                const reason = window.prompt(`Dismiss the request from ${rq.email}? No email will be sent.\n\nOptional reason (OK to confirm, Cancel to abort):`);
                                if (reason === null) return; // cancelled
                                actOnRequest(rq, "dismiss_access_request", reason.trim());
                              }}
                                style={{ padding: "5px 12px", borderRadius: 6, border: "1.5px solid var(--red)", background: "var(--surface)", color: "var(--red)", fontSize: 11, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                                Dismiss
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ═══ ORGANIZATIONS ═══ */}
          {tab === "orgs" && (
            <div>
              {/* ── Create New Org ── */}
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", whiteSpace: "nowrap" }}>New Org →</span>
                  <input id="sa-new-org-name" placeholder="Company name" onKeyDown={e => e.stopPropagation()}
                    style={{ flex: "1 1 140px", fontSize: 12, padding: "6px 10px", border: "1.5px solid var(--line-0)", borderRadius: 6, background: "var(--surface)" }} />
                  <input id="sa-new-org-url" placeholder="company.com (optional)" onKeyDown={e => e.stopPropagation()}
                    style={{ flex: "1 1 140px", fontSize: 12, padding: "6px 10px", border: "1.5px solid var(--line-0)", borderRadius: 6, background: "var(--surface)" }} />
                  <select id="sa-new-org-plan" defaultValue="trial"
                    style={{ fontSize: 11, padding: "6px 8px", border: "1.5px solid var(--line-0)", borderRadius: 6, background: "var(--surface)" }}>
                    <option value="trial">Trial (3 runs)</option>
                    <option value="starter">Starter (25)</option>
                    <option value="pro">Pro (100)</option>
                    <option value="team">Team (250)</option>
                    <option value="enterprise">Enterprise (1K)</option>
                  </select>
                  <button onClick={async () => {
                    const name = document.getElementById("sa-new-org-name")?.value?.trim();
                    if (!name) { setPlanSaveMsg("Org name required"); setTimeout(() => setPlanSaveMsg(""), 3000); return; }
                    const url = document.getElementById("sa-new-org-url")?.value?.trim();
                    const plan = document.getElementById("sa-new-org-plan")?.value || "trial";
                    const limits = { trial: { run_limit: 3, max_run_limit: 0 }, starter: { run_limit: 25, max_run_limit: 5 }, pro: { run_limit: 100, max_run_limit: 20 }, team: { run_limit: 250, max_run_limit: 50 }, enterprise: { run_limit: 1000, max_run_limit: 200 } };
                    const body = { name, plan, ...(limits[plan] || {}) };
                    if (url) body.seller_url = url.startsWith("http") ? url : `https://${url}`;
                    try {
                      const r = await fetch("/api/admin", {
                        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                        body: JSON.stringify({ action: "create_org", email: "org", orgData: body }),
                      });
                      const d = await r.json();
                      if (d.ok) {
                        setPlanSaveMsg(`✓ Created org "${name}"`);
                        document.getElementById("sa-new-org-name").value = "";
                        document.getElementById("sa-new-org-url").value = "";
                        setTimeout(fetchData, 500);
                      } else { setPlanSaveMsg(`Error: ${d.error}`); }
                    } catch { setPlanSaveMsg("Failed to create org"); }
                    setTimeout(() => setPlanSaveMsg(""), 3000);
                  }}
                    style={{ padding: "6px 14px", borderRadius: 6, background: "var(--ink-0)", color: "var(--surface)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    Create
                  </button>
                </div>
              </div>

              {/* ── Company Organizations ── */}
              {(() => {
                const companyOrgs = filteredOrgs.filter(o => o.seller_url || o.member_count > 1).sort((a,b) => (a.name||"").localeCompare(b.name||""));
                return companyOrgs.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tan-0)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Company Organizations ({companyOrgs.length})</div>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Plan</th>
                          <th>Website</th>
                          <th>Runs</th>
                          <th>Members</th>
                          <th style={{ width: 50 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companyOrgs.map(o => {
                          const members = data.users.filter(u => u.org_id === o.id);
                          const patchOrg = async (fields, msg) => {
                            try {
                              const r = await fetch("/api/admin", {
                                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                                body: JSON.stringify({ action: "update_org", orgId: o.id, email: "org", fields }),
                              });
                              const d = await r.json();
                              setPlanSaveMsg(d.ok ? msg : `Error: ${d.error}`);
                            } catch { setPlanSaveMsg("Failed to save"); }
                            setTimeout(() => setPlanSaveMsg(""), 3000);
                            setTimeout(fetchData, 500);
                          };
                          const menuKey = `org-${o.id}`;
                          return (
                            <tr key={o.id}>
                              <td>
                                <input defaultValue={o.name}
                                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== o.name) patchOrg({ name: v }, `✓ Renamed to ${v}`); }}
                                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); e.stopPropagation(); }}
                                  style={{ border: "1px solid var(--line-0)", background: "var(--surface)", fontWeight: 600, fontSize: 13, width: "100%", padding: "4px 8px", borderRadius: 4, color: "var(--ink-0)" }} />
                              </td>
                              <td>
                                {(() => {
                                  const pm = { trial: { bg: "var(--amber-bg)", border: "var(--amber)" }, starter: { bg: "var(--green-bg)", border: "var(--green)" }, pro: { bg: "var(--green-bg)", border: "var(--green)" }, team: { bg: "var(--navy-bg)", border: "var(--navy)" }, enterprise: { bg: "var(--violet-bg)", border: "var(--violet)" }, paid: { bg: "var(--green-bg)", border: "var(--green)" }, suspended: { bg: "var(--red-bg)", border: "var(--red)" } };
                                  const ps = pm[o.plan] || pm.trial;
                                  return (
                                <select defaultValue={o.plan} onChange={e => {
                                  const plan = e.target.value;
                                  const limits = { trial: { run_limit: 3, max_run_limit: 0 }, starter: { run_limit: 25, max_run_limit: 5 }, pro: { run_limit: 100, max_run_limit: 20 }, team: { run_limit: 250, max_run_limit: 50 }, enterprise: { run_limit: 1000, max_run_limit: 200 } };
                                  patchOrg({ plan, ...(limits[plan] || {}) }, `${o.name} \u2192 ${plan}${limits[plan]?.run_limit ? ` (${limits[plan].run_limit} runs)` : ""}`);
                                }} style={{ background: ps.bg, borderColor: ps.border, color: ps.border, fontWeight: 700 }}>
                                  <option value="trial">Trial</option>
                                  <option value="starter">Starter</option>
                                  <option value="pro">Pro</option>
                                  <option value="team">Team</option>
                                  <option value="enterprise">Enterprise</option>
                                  <option value="paid">Paid</option>
                                  <option value="suspended">Suspended</option>
                                </select>
                                  );
                                })()}
                              </td>
                              <td>
                                <input defaultValue={o.seller_url || ""} placeholder="https://company.com"
                                  onBlur={e => { const v = e.target.value.trim(); if (v !== (o.seller_url || "")) patchOrg({ seller_url: v || null }, `✓ Website → ${v || "cleared"}`); }}
                                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); e.stopPropagation(); }}
                                  style={{ border: "1px solid var(--line-0)", background: "var(--surface)", fontSize: 11, width: "100%", padding: "4px 8px", borderRadius: 4, color: "var(--ink-1)" }} />
                              </td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: o.run_count >= o.run_limit ? "var(--red)" : "var(--ink-0)" }}>{o.run_count}</span>
                                  <span style={{ color: "var(--ink-3)", fontSize: 11 }}>/{o.run_limit}</span>
                                  {o.run_count >= o.run_limit && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--red)", background: "var(--red-bg)", padding: "1px 6px", borderRadius: 4 }}>LIMIT</span>}
                                  {o.run_count > 0 && (
                                    <button onClick={() => patchOrg({ run_count: 0, max_run_count: 0 }, `${o.name} runs reset to 0`)}
                                      title="Reset runs to 0"
                                      style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, border: "1px solid var(--amber)", background: "var(--amber-bg)", color: "var(--amber)", cursor: "pointer", marginLeft: 2 }}>
                                      Reset
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td style={{ textAlign: "center", fontWeight: 600 }}>{members.length}</td>
                              <td style={{ position: "relative" }}>
                                <button className="admin-dot-menu" aria-label="Actions" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === menuKey ? null : menuKey); }}>
                                  &#x22EF;
                                </button>
                                {openMenu === menuKey && (
                                  <div className="admin-action-menu" onClick={e => e.stopPropagation()}>
                                    <button className="admin-action-item" onClick={() => { patchOrg({ run_count: 0, max_run_count: 0 }, `${o.name} runs reset to 0`); setOpenMenu(null); }}>
                                      Reset Runs
                                    </button>
                                    <button className="admin-action-item danger" onClick={async () => {
                                      const msg = members.length > 0
                                        ? `Delete "${o.name}"? ${members.length} member${members.length > 1 ? "s" : ""} will be unassigned.`
                                        : `Delete "${o.name}"?`;
                                      if (!window.confirm(msg)) return;
                                      try {
                                        const r = await fetch("/api/admin", {
                                          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                                          body: JSON.stringify({ action: "delete_org", orgId: o.id, email: "org" }),
                                        });
                                        const d = await r.json();
                                        setPlanSaveMsg(d.ok ? `Deleted ${o.name}` : `Error: ${d.error}`);
                                      } catch { setPlanSaveMsg("Failed to delete org"); }
                                      setTimeout(fetchData, 1000);
                                      setOpenMenu(null);
                                    }}>
                                      Delete Org
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* ── Personal Workspaces ── */}
              {(() => {
                const personalOrgs = filteredOrgs.filter(o => !o.seller_url && o.member_count <= 1).sort((a,b) => (a.name||"").localeCompare(b.name||""));
                const companyOrgList = (data.orgs || []).filter(o => o.seller_url || o.member_count > 1);
                const patchOrgApi = async (orgId, fields, msg) => {
                  try {
                    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                      body: JSON.stringify({ action: "update_org", orgId, email: "org", fields }) });
                    const d = await r.json();
                    setPlanSaveMsg(d.ok ? msg : `Error: ${d.error}`);
                  } catch { setPlanSaveMsg("Failed"); }
                  setTimeout(() => setPlanSaveMsg(""), 3000); setTimeout(fetchData, 500);
                };
                const moveUserToOrg = async (userId, email, targetOrgId, targetOrgName) => {
                  try {
                    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                      body: JSON.stringify({ action: "update_user", userId, email, fields: { org_id: targetOrgId } }) });
                    const d = await r.json();
                    setPlanSaveMsg(d.ok ? `✓ Moved ${email} → ${targetOrgName}` : `Error: ${d.error}`);
                  } catch { setPlanSaveMsg("Failed"); }
                  setTimeout(() => setPlanSaveMsg(""), 3000); setTimeout(fetchData, 500);
                };
                return personalOrgs.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
                      Personal Workspaces ({personalOrgs.length})
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>Move users to a company org, or add a website to convert a workspace into a company org.</span>
                      {personalOrgs.filter(o => o.run_count === 0).length > 0 && (
                        <button onClick={async () => {
                          const unused = personalOrgs.filter(o => o.run_count === 0);
                          if (!window.confirm(`Clean up ${unused.length} unused workspace${unused.length > 1 ? "s" : ""}? Users will be unassigned (they can create or join an org later).`)) return;
                          setPlanSaveMsg("Cleaning up...");
                          let cleaned = 0;
                          for (const o of unused) {
                            try {
                              const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` }, body: JSON.stringify({ action: "delete_org", orgId: o.id, email: "cleanup" }) });
                              const d = await r.json();
                              if (d.ok) cleaned++;
                            } catch {}
                          }
                          setPlanSaveMsg(`Cleaned up ${cleaned} workspace${cleaned > 1 ? "s" : ""}`);
                          setTimeout(fetchData, 500); setTimeout(() => setPlanSaveMsg(""), 4000);
                        }} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--red)", background: "var(--red-bg)", color: "var(--red)", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                          Clean Up {personalOrgs.filter(o => o.run_count === 0).length} Unused
                        </button>
                      )}
                    </div>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Member</th>
                          <th>Move to Company Org</th>
                          <th>Or Set Website</th>
                          <th style={{ width: 60 }}>Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {personalOrgs.map(o => {
                          const members = data.users.filter(u => u.org_id === o.id);
                          const member = members[0];
                          return (
                            <tr key={o.id}>
                              <td style={{ fontWeight: 600, color: "var(--ink-1)" }}>{o.name}</td>
                              <td style={{ fontSize: 11, color: "var(--ink-3)" }}>
                                {member ? (member.name || member.email?.split("@")[0]) : "Empty"}
                                {member?.email && <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{member.email}</div>}
                              </td>
                              <td>
                                {member && companyOrgList.length > 0 ? (
                                  <select defaultValue="" onChange={e => {
                                    const targetId = e.target.value;
                                    if (!targetId) return;
                                    const targetOrg = companyOrgList.find(co => co.id === targetId);
                                    moveUserToOrg(member.id, member.email, targetId, targetOrg?.name || "org");
                                  }} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4 }}>
                                    <option value="">Move to...</option>
                                    {companyOrgList.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
                                  </select>
                                ) : <span style={{ fontSize: 10, color: "var(--ink-3)" }}>—</span>}
                              </td>
                              <td>
                                <input placeholder="company.com" style={{ fontSize: 11, padding: "3px 6px", border: "1px solid var(--line-0)", borderRadius: 4, width: 120 }}
                                  onBlur={e => { const v = e.target.value.trim(); if (v) patchOrgApi(o.id, { seller_url: v.startsWith("http") ? v : `https://${v}` }, `✓ ${o.name} → company org (${v})`); }}
                                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); e.stopPropagation(); }} />
                              </td>
                              <td>
                                <button style={{ fontSize: 10, padding: "2px 8px", border: "1px solid var(--red)", borderRadius: 4, background: "var(--red-bg)", color: "var(--red)", cursor: "pointer", fontWeight: 600 }}
                                  onClick={async () => {
                                    if (!window.confirm(`Delete "${o.name}"?${members.length > 0 ? ` ${members.length} member(s) will be unassigned.` : ""}`)) return;
                                    try {
                                      const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` }, body: JSON.stringify({ action: "delete_org", orgId: o.id, email: "org" }) });
                                      const d = await r.json();
                                      setPlanSaveMsg(d.ok ? `✓ Deleted ${o.name}` : `Error: ${d.error}`);
                                    } catch { setPlanSaveMsg("Failed"); }
                                    setTimeout(fetchData, 1000);
                                  }}>
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {filteredOrgs.length === 0 && <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: 20 }}>No orgs match the current filters.</div>}
            </div>
          )}

          {/* ═══ COSTS ═══ */}
          {tab === "costs" && data.costs && (
            <div>
              <div className="admin-section-title">API Costs (Anthropic)</div>
              <div className="admin-section-sub">
                {dbTotal ? "Exact costs from database — includes cache token pricing." : "Ceiling estimate — actual costs are lower due to prompt caching."}
                {" "}These are COGS on the P&L.
              </div>

              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  { label: dbTotal ? "Actual API Cost" : "API Cost (ceiling)", value: `$${(c.cost || 0).toFixed(2)}`, color: "var(--red)" },
                  ...(dbTotal && c.cost_ceiling > 0 ? [{ label: "Before Cache Savings", value: `$${c.cost_ceiling.toFixed(2)}`, color: "var(--ink-3)" }] : []),
                  ...(dbTotal && c.cache_savings > 0 ? [{ label: "Cache Savings", value: `-$${c.cache_savings.toFixed(2)}`, color: "var(--green)" }] : []),
                  ...(!dbTotal ? [{ label: "Est. Actual (w/ cache)", value: `$${(c.cost * 0.7).toFixed(2)}`, color: "var(--green)" }] : []),
                  { label: "API Calls", value: (c.api_calls || 0).toLocaleString(), color: "var(--navy)" },
                  { label: "Input Tokens", value: `${((c.input_tokens || 0) / 1000).toFixed(0)}K`, color: "var(--ink-1)" },
                  { label: "Output Tokens", value: `${((c.output_tokens || 0) / 1000).toFixed(0)}K`, color: "var(--ink-1)" },
                  ...(c.cache_read_tokens > 0 ? [{ label: "Cache Reads", value: `${(c.cache_read_tokens / 1000).toFixed(0)}K`, color: "var(--green)" }] : []),
                  { label: "Web Searches", value: c.web_searches || 0, color: "var(--violet)" },
                ].map(m => (
                  <div key={m.label} className="admin-metric">
                    <div className="admin-metric-num" style={{ color: m.color, fontSize: 22 }}>{m.value}</div>
                    <div className="admin-metric-label">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Cost by user */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Cost by User</div>
              <table className="admin-table" style={{ marginBottom: 20 }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Cost</th>
                    <th>Calls</th>
                    <th>Input</th>
                    <th>Output</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCostsByUser.map((u, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{u.user_name}</div>
                        {u.user_email && <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{u.user_email}</div>}
                      </td>
                      <td style={{ fontWeight: 700, color: "var(--ink-0)" }}>${u.cost.toFixed(3)}</td>
                      <td>{u.calls}</td>
                      <td style={{ fontSize: 11, color: "var(--ink-3)" }}>{(u.input / 1000).toFixed(1)}K</td>
                      <td style={{ fontSize: 11, color: "var(--ink-3)" }}>{(u.output / 1000).toFixed(1)}K</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cost by model */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Cost by Model</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                {(data.costs.by_model || []).map((m, i) => (
                  <div key={i} className="admin-metric" style={{ minWidth: 180, textAlign: "left" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-0)", marginBottom: 4 }}>{m.model}</div>
                    <div className="admin-metric-num" style={{ color: m.model.includes("opus") ? "var(--violet)" : "var(--green)", fontSize: 18 }}>${m.cost.toFixed(3)}</div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{m.calls} calls &middot; {(m.input / 1000).toFixed(0)}K in &middot; {(m.output / 1000).toFixed(0)}K out</div>
                  </div>
                ))}
              </div>

              {/* Cost by day */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Daily Cost</div>
              {filteredCostsByDay.slice(0, 30).map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line-0)" }}>
                  <div style={{ fontSize: 12, color: "var(--ink-1)", width: 90, fontWeight: 600 }}>{d.day}</div>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--bg-2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "var(--green)", width: Math.min(100, c.cost > 0 ? (d.cost / c.cost * 100 * (data.costs.by_day || []).length) : 0) + "%" }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, width: 60, textAlign: "right" }}>${d.cost.toFixed(3)}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-3)", width: 50, textAlign: "right" }}>{d.calls} calls</div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ ACTIVITY ═══ */}
          {tab === "activity" && (
            <div>
              {/* Guest activity summary */}
              {data.guestActivity?.total_calls > 0 && (
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Guest Sessions (unauthenticated)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
                    <div className="admin-metric" style={{ background: "var(--surface)" }}>
                      <div className="admin-metric-num" style={{ fontSize: 22 }}>{data.guestActivity.total_calls}</div>
                      <div className="admin-metric-label">API Calls</div>
                    </div>
                    <div className="admin-metric" style={{ background: "var(--surface)" }}>
                      <div className="admin-metric-num" style={{ color: "var(--amber)", fontSize: 22 }}>${data.guestActivity.total_cost?.toFixed(2) || "0.00"}</div>
                      <div className="admin-metric-label">Cost</div>
                    </div>
                  </div>
                  {data.guestActivity.by_endpoint?.length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--ink-2)", marginBottom: 6 }}>
                      <strong>By endpoint:</strong> {data.guestActivity.by_endpoint.map(e => `${e.endpoint} (${e.count})`).join(" \u00b7 ")}
                    </div>
                  )}
                  {data.guestActivity.by_day?.length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                      <strong>Recent days:</strong> {data.guestActivity.by_day.slice(0, 7).map(d => `${d.day.slice(5)} (${d.count})`).join(" \u00b7 ")}
                    </div>
                  )}
                </div>
              )}

              {/* Companies Researched — detailed per-request tracking */}
              {(() => {
                const usageWithCompany = (data.usage || []).filter(u => u.target_company);
                if (!usageWithCompany.length) return null;
                // Group by target company
                const byCompany = {};
                usageWithCompany.forEach(u => {
                  const co = u.target_company;
                  if (!byCompany[co]) byCompany[co] = { company: co, calls: 0, tokens: 0, cost: 0, users: new Set(), sellerUrls: new Set(), briefTypes: new Set(), lastUsed: u.created_at };
                  byCompany[co].calls++;
                  const inp = (u.input_tokens || 0); const out = (u.output_tokens || 0);
                  byCompany[co].tokens += inp + out;
                  // Approximate cost (Haiku pricing)
                  byCompany[co].cost += (inp * 1.0 + out * 5.0) / 1_000_000;
                  if (u.user_id) byCompany[co].users.add(u.user_id);
                  if (u.seller_url) byCompany[co].sellerUrls.add(u.seller_url);
                  if (u.brief_type) byCompany[co].briefTypes.add(u.brief_type);
                  if (new Date(u.created_at) > new Date(byCompany[co].lastUsed)) byCompany[co].lastUsed = u.created_at;
                });
                const sorted = Object.values(byCompany).sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
                const userMap = {};
                (data.users || []).forEach(u => { userMap[u.id] = u.name || u.email || u.id; });
                return (
                  <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>
                      Companies Researched ({sorted.length})
                    </div>
                    <div className="tbl-wrap" style={{ maxHeight: 400, overflow: "auto" }}>
                      <table className="admin-table" style={{ fontSize: 11 }}>
                        <thead><tr>
                          <th>Company</th>
                          <th>Briefs</th>
                          <th>Tokens</th>
                          <th>Cost</th>
                          <th>Researchers</th>
                          <th>Seller Org</th>
                          <th>Type</th>
                          <th>Last</th>
                        </tr></thead>
                        <tbody>
                          {sorted.slice(0, 100).map((c, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600, color: "var(--ink-0)" }}>{c.company}</td>
                              <td>{c.calls}</td>
                              <td>{c.tokens > 1000 ? Math.round(c.tokens / 1000) + "K" : c.tokens}</td>
                              <td style={{ color: "var(--amber)" }}>${c.cost.toFixed(2)}</td>
                              <td>{[...c.users].map(uid => userMap[uid] || uid.slice(0, 8)).join(", ")}</td>
                              <td style={{ fontSize: 10, color: "var(--ink-2)" }}>{[...c.sellerUrls].join(", ") || "—"}</td>
                              <td><span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: [...c.briefTypes].includes("full-brief") ? "var(--green-bg)" : "var(--navy-bg)", color: [...c.briefTypes].includes("full-brief") ? "var(--green)" : "var(--navy)", fontWeight: 600 }}>{[...c.briefTypes].join(", ") || "—"}</span></td>
                              <td style={{ fontSize: 10, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{timeAgo(c.lastUsed)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Authenticated user activity */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                Authenticated Activity {hasActiveFilters && <span style={{ fontWeight: 400, color: "var(--amber)" }}>({filteredActivity.length} of {data.recent_activity.length})</span>}
              </div>
              {filteredActivity.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line-0)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: (Date.now() - new Date(a.updated_at).getTime()) < 86400000 ? "var(--green)" : "var(--line-0)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>{a.session_name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      <span style={{ fontWeight: 600, color: "var(--ink-1)" }}>{a.user_name}</span>
                      {a.user_email && <span> ({a.user_email})</span>}
                      {a.seller_url && <span> &middot; {a.seller_url}</span>}
                      {a.milton_messages > 0 && <span style={{ color: "var(--red)" }}> &middot; {a.milton_messages} Milton msgs</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{timeAgo(a.updated_at)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ USAGE ═══ */}
          {tab === "usage" && (
            <div>
              {/* Environment status */}
              {data.environment && (
                <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Environment</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                    {[
                      { label: "Guest Mode", value: data.environment.guest_mode, ok: data.environment.guest_mode === "disabled" },
                      { label: "Environment", value: data.environment.environment, ok: data.environment.environment === "production" },
                      { label: "JWT Secret", value: data.environment.jwt_secret_set ? "Set" : "MISSING", ok: data.environment.jwt_secret_set },
                      { label: "API Key", value: data.environment.api_key_set ? "Set" : "MISSING", ok: data.environment.api_key_set },
                    ].map(e => (
                      <div key={e.label} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: e.ok ? "var(--green-bg)" : "var(--red-bg)", color: e.ok ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                        {e.label}: {e.value}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-org usage */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>Usage by Organization</div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Org</th>
                    <th>Plan</th>
                    <th>Members</th>
                    <th>Tokens</th>
                    <th>Max Tokens</th>
                    <th>Seller URL</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.sort((a, b) => (b.run_count || 0) - (a.run_count || 0)).map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{o.name}</td>
                      <td>
                        <span className="admin-badge" style={{
                          background: o.plan === "paid" ? "var(--green-bg)" : o.plan === "suspended" ? "var(--red-bg)" : "var(--amber-bg)",
                          color: o.plan === "paid" ? "var(--green)" : o.plan === "suspended" ? "var(--red)" : "var(--amber)",
                        }}>{o.plan}</span>
                      </td>
                      <td>{o.member_count}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{o.run_count}</span>
                        <span style={{ color: "var(--ink-3)" }}>/{o.run_limit}</span>
                        {o.run_count >= o.run_limit && <span style={{ color: "var(--red)", fontWeight: 700, marginLeft: 4 }}>LIMIT</span>}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--violet)" }}>{o.max_run_count}</span>
                        <span style={{ color: "var(--ink-3)" }}>/{o.max_run_limit}</span>
                      </td>
                      <td style={{ fontSize: 11, color: "var(--ink-3)" }}>{o.seller_url || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ display: "flex", gap: 16, marginTop: 16, padding: "12px 16px", background: "var(--bg-1)", borderRadius: 10 }}>
                <div><span style={{ fontSize: 20, fontWeight: 700, fontFamily: "Lora,serif" }}>{s.total_runs}</span> <span style={{ fontSize: 11, color: "var(--ink-3)" }}>total tokens</span></div>
                <div><span style={{ fontSize: 20, fontWeight: 700, fontFamily: "Lora,serif", color: "var(--violet)" }}>{s.total_max_runs}</span> <span style={{ fontSize: 11, color: "var(--ink-3)" }}>tokens</span></div>
                <div><span style={{ fontSize: 20, fontWeight: 700, fontFamily: "Lora,serif" }}>{s.total_orgs}</span> <span style={{ fontSize: 11, color: "var(--ink-3)" }}>orgs</span></div>
              </div>
            </div>
          )}

          {/* ═══ PRICING ═══ */}
          {tab === "pricing" && (
            <div>
              {/* Plan configuration table */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Plan Configuration</div>
              <table className="admin-table" style={{ marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Tokens/mo</th>
                    <th>Max Tokens</th>
                    <th>Price/mo</th>
                    <th>Your Cost</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan, i) => {
                    const cost = plan.tokens * plan.costPerToken;
                    const margin = plan.price > 0 ? Math.round((1 - cost / plan.price) * 100) : -100;
                    return (
                      <tr key={plan.id}>
                        <td>
                          <input value={plan.name} onChange={e => setPlans(p => p.map((pl, j) => j === i ? { ...pl, name: e.target.value } : pl))}
                            style={{ border: "none", background: "transparent", fontWeight: 600, fontSize: 13, width: 100, outline: "none" }} />
                        </td>
                        <td>
                          <input type="number" value={plan.tokens} onChange={e => setPlans(p => p.map((pl, j) => j === i ? { ...pl, tokens: Number(e.target.value) } : pl))}
                            style={{ width: 60, border: "1px solid var(--line-0)", borderRadius: 4, padding: "3px 6px", fontSize: 12 }} />
                        </td>
                        <td>
                          <input type="number" value={plan.maxTokens} onChange={e => setPlans(p => p.map((pl, j) => j === i ? { ...pl, maxTokens: Number(e.target.value) } : pl))}
                            style={{ width: 60, border: "1px solid var(--line-0)", borderRadius: 4, padding: "3px 6px", fontSize: 12, color: "var(--violet)" }} />
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>$</span>
                            <input type="number" value={plan.price} onChange={e => setPlans(p => p.map((pl, j) => j === i ? { ...pl, price: Number(e.target.value) } : pl))}
                              style={{ width: 70, border: "1px solid var(--line-0)", borderRadius: 4, padding: "3px 6px", fontSize: 12 }} />
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, color: "var(--ink-1)" }}>
                          ${cost.toFixed(0)}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, fontSize: 13, color: margin > 70 ? "var(--green)" : margin > 50 ? "var(--amber)" : margin > 0 ? "var(--red)" : "var(--red)" }}>
                            {plan.price > 0 ? `${margin}%` : "Free"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button onClick={() => setPlans(p => [...p, { id: `custom-${Date.now()}`, name: "Custom", tokens: 50, maxTokens: 10, price: 199, costPerToken: 0.20 }])}
                style={{ fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 8, border: "1.5px solid var(--line-0)", background: "var(--surface)", cursor: "pointer", color: "var(--ink-2)" }}>
                + Add Plan
              </button>

              {/* Margin visualization */}
              <div style={{ marginTop: 20, fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>Margin by Plan</div>
              {plans.filter(p => p.price > 0).map(plan => {
                const cost = plan.tokens * plan.costPerToken;
                const margin = Math.round((1 - cost / plan.price) * 100);
                return (
                  <div key={plan.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line-0)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-0)", width: 80 }}>{plan.name}</div>
                    <div style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--bg-2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 5, background: margin > 70 ? "var(--green)" : margin > 50 ? "var(--amber)" : "var(--red)", width: Math.max(0, margin) + "%" }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, width: 40, textAlign: "right", color: margin > 70 ? "var(--green)" : margin > 50 ? "var(--amber)" : "var(--red)" }}>{margin}%</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", width: 100, textAlign: "right" }}>${plan.price} - ${cost.toFixed(0)} = ${(plan.price - cost).toFixed(0)}</div>
                  </div>
                );
              })}

              {/* Apply plan to org */}
              <div style={{ marginTop: 20, fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>Apply Plan to Organization</div>
              {data.orgs.map(o => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-0)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      Current: {o.plan} &middot; {o.run_count}/{o.run_limit} tokens &middot; {o.max_run_count}/{o.max_run_limit} max
                    </div>
                  </div>
                  <select defaultValue={o.plan}
                    onChange={e => applyPlanToOrg(o.id, e.target.value)}
                    style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1.5px solid var(--line-0)" }}>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tokens} tokens, ${p.price}/mo)</option>)}
                  </select>
                </div>
              ))}

              {/* Revenue projections */}
              <div style={{ marginTop: 20, fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>Revenue Projections</div>
              <div style={{ background: "var(--bg-1)", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                  {[10, 25, 50, 100].map(users => {
                    const avgPrice = plans.filter(p => p.price > 0).reduce((s, p) => s + p.price, 0) / plans.filter(p => p.price > 0).length;
                    const avgCost = plans.filter(p => p.price > 0).reduce((s, p) => s + p.tokens * p.costPerToken, 0) / plans.filter(p => p.price > 0).length;
                    const mrr = Math.round(users * avgPrice * 0.6); // assume 60% on avg paid plan
                    const cost = Math.round(users * avgCost * 0.6);
                    return (
                      <div key={users} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 4 }}>{users} users</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--green)", fontFamily: "Lora,serif" }}>${(mrr / 1000).toFixed(1)}K</div>
                        <div style={{ fontSize: 10, color: "var(--ink-3)" }}>MRR</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", marginTop: 4 }}>${((mrr - cost) / 1000).toFixed(1)}K gross</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═══ LEARNINGS ═══ */}
          {tab === "learnings" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Sessions Analyzed", value: l.sessions_analyzed || 0, color: "var(--ink-0)" },
                  { label: "Fast Track Rate", value: `${l.fastTrackRate || 0}%`, color: "var(--green)" },
                  { label: "Disqualify Rate", value: `${l.disqualifyRate || 0}%`, color: "var(--red)" },
                  { label: "Avg Gate Completion", value: `${l.avgGateCompletion || 0}%`, color: "var(--navy)" },
                ].map(m => (
                  <div key={m.label} className="admin-metric">
                    <div className="admin-metric-num" style={{ color: m.color, fontSize: 22 }}>{m.value}</div>
                    <div className="admin-metric-label">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Top edited ICP fields */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                Most Corrected ICP Fields
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6, color: "var(--ink-3)" }}>Fields users edit most often -- signals where AI output needs improvement</span>
              </div>
              {(l.topEditedFields || []).length > 0 ? (
                <div style={{ marginBottom: 20 }}>
                  {(l.topEditedFields || []).map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line-0)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-0)", flex: 1 }}>{f.field}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ height: 6, borderRadius: 3, background: "var(--amber)", width: Math.min(200, f.count * 20) }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)" }}>{f.count}x</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 20 }}>No ICP edits recorded yet.</div>
              )}

              {/* Deal routing distribution */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Deal Routing Distribution</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Fast Track", count: l.dealRoutes?.FAST_TRACK || 0, color: "var(--green)", bg: "var(--green-bg)" },
                  { label: "Nurture", count: l.dealRoutes?.NURTURE || 0, color: "var(--amber)", bg: "var(--amber-bg)" },
                  { label: "Disqualify", count: l.dealRoutes?.DISQUALIFY || 0, color: "var(--red)", bg: "var(--red-bg)" },
                ].map(r => (
                  <div key={r.label} style={{ flex: 1, background: r.bg, borderRadius: 10, padding: "12px 14px", textAlign: "center", border: `1px solid ${r.color}33` }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: r.color, fontFamily: "Lora,serif" }}>{r.count}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: r.color }}>{r.label}</div>
                  </div>
                ))}
              </div>

              {/* Intel adjustments */}
              {(l.intelAdjustments || []).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                    Intel Adjustments
                    <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6, color: "var(--ink-3)" }}>Insider knowledge users are adding to fit scores</span>
                  </div>
                  {(l.intelAdjustments || []).slice(0, 20).map((adj, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line-0)", fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: "var(--ink-0)", minWidth: 120 }}>{adj.company}</span>
                      <span style={{ fontWeight: 700, color: adj.modifier > 0 ? "var(--green)" : "var(--red)", minWidth: 40 }}>{adj.modifier > 0 ? "+" : ""}{adj.modifier}</span>
                      <span style={{ color: "var(--ink-3)", flex: 1 }}>{adj.reason || "\u2014"}</span>
                      <span style={{ color: "var(--ink-3)", fontSize: 10 }}>{adj.user}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ INTELLIGENCE ═══ */}
          {tab === "intelligence" && (
            <div>
              {(() => {
                const intel = data.intelligence || {};

                // Full list of 31 knowledge layers for the KL effectiveness table
                const ALL_KL_NAMES = [
                  "Payments", "Real Estate", "Banking", "Healthcare SaaS", "AI/ML",
                  "Fintech", "Rewards & Incentives", "QSR", "BaaS", "Charitable Giving",
                  "Medical Payments", "SMB & Mid-Market", "Insurance", "Executive Perspectives",
                  "Approval Gates", "Retail", "Professional Services", "Manufacturing",
                  "PE Holdco", "Digital Incentives Platforms", "Cannabis", "Crypto & Stablecoin",
                  "Gaming", "Prediction Markets", "Investor Intelligence", "B2B Sales",
                  "OKR/KPI", "Compliance", "Accounting & Finance",
                  "Competitive Injection", "Discovery Scorecard",
                ];

                return (
                  <>
                    {/* ── 1. Model Accuracy ── */}
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ background: "var(--navy)", color: "var(--surface)", padding: "8px 14px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" }}>
                        Model Accuracy
                      </div>
                      <div style={{ border: "1px solid var(--line-0)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 16 }}>
                        <div className="admin-metric" style={{ display: "inline-block", marginBottom: 16 }}>
                          <div className="admin-metric-num" style={{ color: intel.modelAccuracy?.overall != null ? "var(--green)" : "var(--ink-3)", fontSize: 28 }}>
                            {intel.modelAccuracy?.overall != null ? `${intel.modelAccuracy.overall}%` : "--%"}
                          </div>
                          <div className="admin-metric-label">Prediction Accuracy</div>
                        </div>
                        {intel.modelAccuracy?.byCategory?.length > 0 ? (
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Market Category</th>
                                <th>Predictions</th>
                                <th>Correct</th>
                                <th>Accuracy %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {intel.modelAccuracy.byCategory.map((row, i) => (
                                <tr key={i}>
                                  <td style={{ fontWeight: 600, color: "var(--ink-0)" }}>{row.category}</td>
                                  <td>{row.predictions}</td>
                                  <td style={{ color: "var(--green)", fontWeight: 600 }}>{row.correct}</td>
                                  <td>
                                    <span style={{ fontWeight: 700, color: row.accuracy >= 70 ? "var(--green)" : row.accuracy >= 50 ? "var(--amber)" : "var(--red)" }}>
                                      {row.accuracy}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>
                            Data populates as users complete deal cycles
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── 2. Scoring Calibration ── */}
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ background: "var(--navy)", color: "var(--surface)", padding: "8px 14px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" }}>
                        Scoring Calibration
                      </div>
                      <div style={{ border: "1px solid var(--line-0)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                          <div className="admin-metric">
                            <div className="admin-metric-num" style={{ color: intel.scoringCalibration?.avgScoreAdvanced != null ? "var(--green)" : "var(--ink-3)", fontSize: 24 }}>
                              {intel.scoringCalibration?.avgScoreAdvanced != null ? intel.scoringCalibration.avgScoreAdvanced : "--"}
                            </div>
                            <div className="admin-metric-label">Avg Score &rarr; Advanced</div>
                          </div>
                          <div className="admin-metric">
                            <div className="admin-metric-num" style={{ color: intel.scoringCalibration?.avgScoreDQ != null ? "var(--red)" : "var(--ink-3)", fontSize: 24 }}>
                              {intel.scoringCalibration?.avgScoreDQ != null ? intel.scoringCalibration.avgScoreDQ : "--"}
                            </div>
                            <div className="admin-metric-label">Avg Score &rarr; DQ'd</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ink-2)", fontStyle: "italic" }}>
                          When these numbers are far apart, the model is discriminating well
                        </div>
                      </div>
                    </div>

                    {/* ── 3. Knowledge Layer Effectiveness ── */}
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ background: "var(--navy)", color: "var(--surface)", padding: "8px 14px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" }}>
                        Knowledge Layer Effectiveness
                      </div>
                      <div style={{ border: "1px solid var(--line-0)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 16 }}>
                        <div style={{ maxHeight: 400, overflow: "auto" }}>
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>KL Name</th>
                                <th>Times Injected</th>
                                <th>Sections Influenced</th>
                                <th>User Corrections</th>
                                <th>Deals Advanced</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                // Merge real data with the full KL list
                                const realData = {};
                                (intel.klEffectiveness || []).forEach(r => { realData[r.name] = r; });
                                const merged = ALL_KL_NAMES.map(name => {
                                  const d = realData[name] || realData[name.toLowerCase()] || {};
                                  return {
                                    name,
                                    injected: d.injected || 0,
                                    avgSectionsInfluenced: d.avgSectionsInfluenced || 0,
                                    corrections: d.corrections || 0,
                                    correctionRate: d.correctionRate || 0,
                                    advanced: d.advanced || 0,
                                  };
                                });
                                // Also include any real data entries not in the static list
                                (intel.klEffectiveness || []).forEach(r => {
                                  if (!ALL_KL_NAMES.some(n => n === r.name || n.toLowerCase() === r.name)) {
                                    merged.push(r);
                                  }
                                });
                                // Sort: KLs with data first (by correction rate desc), then zeros
                                merged.sort((a, b) => {
                                  if (a.injected > 0 && b.injected === 0) return -1;
                                  if (a.injected === 0 && b.injected > 0) return 1;
                                  return b.correctionRate - a.correctionRate || b.injected - a.injected;
                                });
                                return merged.map((row, i) => (
                                  <tr key={i} style={{ opacity: row.injected === 0 ? 0.5 : 1 }}>
                                    <td style={{ fontWeight: 600, color: "var(--ink-0)" }}>{row.name}</td>
                                    <td>{row.injected || "—"}</td>
                                    <td>{row.avgSectionsInfluenced || "—"}</td>
                                    <td>
                                      {row.corrections > 0 ? (
                                        <span style={{ color: "var(--amber)", fontWeight: 700 }}>{row.corrections} ({row.correctionRate}%)</span>
                                      ) : "—"}
                                    </td>
                                    <td>
                                      {row.advanced > 0 ? (
                                        <span style={{ color: "var(--green)", fontWeight: 700 }}>{row.advanced}</span>
                                      ) : "—"}
                                    </td>
                                  </tr>
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* ── 4. Edit Trends ── */}
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ background: "var(--navy)", color: "var(--surface)", padding: "8px 14px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" }}>
                        Edit Trends
                      </div>
                      <div style={{ border: "1px solid var(--line-0)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 16 }}>
                        {intel.editTrends?.length > 0 ? (
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Field Name</th>
                                <th>Times Edited</th>
                                <th>Top Market Category</th>
                                <th>Direction</th>
                              </tr>
                            </thead>
                            <tbody>
                              {intel.editTrends.map((row, i) => (
                                <tr key={i}>
                                  <td style={{ fontWeight: 600, color: "var(--ink-0)" }}>{row.field}</td>
                                  <td>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <div style={{ height: 6, borderRadius: 3, background: "var(--amber)", width: Math.min(120, row.count * 8) }} />
                                      <span style={{ fontWeight: 700, color: "var(--amber)" }}>{row.count}</span>
                                    </div>
                                  </td>
                                  <td style={{ color: "var(--ink-2)" }}>{row.topCategory}</td>
                                  <td>
                                    <span className="admin-badge" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>
                                      {row.direction}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>
                            No edits logged yet
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10, fontStyle: "italic" }}>
                          Fields edited most frequently = where the AI needs improvement
                        </div>
                      </div>
                    </div>

                    {/* ── 5. Competitor Intel Coverage ── */}
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ background: "var(--navy)", color: "var(--surface)", padding: "8px 14px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" }}>
                        Competitor Intel Coverage
                      </div>
                      <div style={{ border: "1px solid var(--line-0)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 16 }}>
                        {intel.competitorCoverage?.length > 0 ? (
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Market Category</th>
                                <th>Competitors Mapped</th>
                                <th>Verified Relationships</th>
                                <th>Citations</th>
                              </tr>
                            </thead>
                            <tbody>
                              {intel.competitorCoverage.map((row, i) => (
                                <tr key={i}>
                                  <td style={{ fontWeight: 600, color: "var(--ink-0)" }}>{row.category}</td>
                                  <td style={{ fontWeight: 700, color: "var(--navy)" }}>{row.competitorsMapped}</td>
                                  <td>
                                    {row.verified > 0 ? (
                                      <span style={{ color: "var(--green)", fontWeight: 700 }}>{row.verified}</span>
                                    ) : <span style={{ color: "var(--ink-3)" }}>0</span>}
                                  </td>
                                  <td>{row.citations}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>
                            No competitor intel data yet
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10, fontStyle: "italic" }}>
                          Grows with every ICP build. Each verified relationship is a prospect source.
                        </div>
                      </div>
                    </div>

                    {/* ── 6. Conversion Funnel ── */}
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ background: "var(--navy)", color: "var(--surface)", padding: "8px 14px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" }}>
                        Conversion Funnel
                      </div>
                      <div style={{ border: "1px solid var(--line-0)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 16 }}>
                        {(() => {
                          const f = intel.conversionFunnel;
                          const steps = [
                            { label: "Generated", value: f?.generated, color: "var(--ink-0)" },
                            { label: "Viewed", value: f?.viewed, color: "var(--navy)" },
                            { label: "Briefed", value: f?.briefed, color: "var(--green)" },
                            { label: "Pushed CRM", value: f?.pushed_crm, color: "var(--amber)" },
                            { label: "Advanced", value: f?.advanced, color: "var(--violet)" },
                          ];
                          const maxVal = Math.max(...steps.map(s => s.value || 0), 1);
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {steps.map((step, i) => {
                                const val = step.value != null ? step.value : null;
                                const pct = val != null && maxVal > 0 ? (val / maxVal * 100) : 0;
                                return (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 90, fontSize: 11, fontWeight: 600, color: "var(--ink-2)", textAlign: "right" }}>{step.label}</div>
                                    <div style={{ flex: 1, height: 24, borderRadius: 6, background: "var(--bg-2)", overflow: "hidden", position: "relative" }}>
                                      <div style={{ height: "100%", borderRadius: 6, background: step.color, width: val != null ? `${Math.max(pct, 2)}%` : "0%", opacity: 0.25, transition: "width 0.3s" }} />
                                      <div style={{ position: "absolute", top: 0, left: 8, height: "100%", display: "flex", alignItems: "center", fontSize: 12, fontWeight: 700, color: step.color }}>
                                        {val != null ? val.toLocaleString() : "--"}
                                      </div>
                                    </div>
                                    {i < steps.length - 1 && (
                                      <div style={{ fontSize: 14, color: "var(--ink-3)" }}>&darr;</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* ── 7. Brief Quality ── */}
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ background: "var(--navy)", color: "var(--surface)", padding: "8px 14px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" }}>
                        Brief Quality
                      </div>
                      <div style={{ border: "1px solid var(--line-0)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                          <div className="admin-metric">
                            <div className="admin-metric-num" style={{ color: intel.briefQuality?.avgSectionsComplete != null ? "var(--green)" : "var(--ink-3)", fontSize: 24 }}>
                              {intel.briefQuality?.avgSectionsComplete != null ? `${intel.briefQuality.avgSectionsComplete}/10` : "--/10"}
                            </div>
                            <div className="admin-metric-label">Avg Sections Complete</div>
                          </div>
                          <div className="admin-metric">
                            <div className="admin-metric-num" style={{ color: intel.briefQuality?.avgEditRate != null ? "var(--amber)" : "var(--ink-3)", fontSize: 24 }}>
                              {intel.briefQuality?.avgEditRate != null ? `${intel.briefQuality.avgEditRate}%` : "--%"}
                            </div>
                            <div className="admin-metric-label">Avg Edit Rate</div>
                          </div>
                          <div className="admin-metric">
                            <div className="admin-metric-num" style={{ color: intel.briefQuality?.crmPushRate != null ? "var(--navy)" : "var(--ink-3)", fontSize: 24 }}>
                              {intel.briefQuality?.crmPushRate != null ? `${intel.briefQuality.crmPushRate}%` : "--%"}
                            </div>
                            <div className="admin-metric-label">CRM Push Rate</div>
                          </div>
                        </div>
                        {intel.briefQuality?.totalBriefs > 0 && (
                          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10 }}>
                            Based on {intel.briefQuality.totalBriefs} brief{intel.briefQuality.totalBriefs !== 1 ? "s" : ""} with quality signals
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* ═══ SELLER URLS ═══ */}
          {tab === "urls" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>
                All Seller URLs Being Researched ({data.seller_urls.length})
              </div>
              {data.seller_urls.map((url, i) => {
                const sessionCount = data.recent_activity.filter(a => a.seller_url === url).length;
                const users = [...new Set(data.recent_activity.filter(a => a.seller_url === url).map(a => a.user_name))];
                return (
                  <div key={i} style={{ padding: "8px 12px", background: "var(--bg-1)", borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>{url}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {sessionCount} session{sessionCount !== 1 ? "s" : ""} &middot; {users.join(", ")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Toast */}
      {planSaveMsg && <div className="admin-toast">{planSaveMsg}</div>}

      {/* Action menu — rendered outside all tables/scroll containers as a portal */}
      {openMenu && menuPos && menuContext && (
        <div className="admin-action-menu" style={{ position: "fixed", top: menuPos.top, right: menuPos.right, left: "auto", zIndex: 99999 }}
          onClick={e => e.stopPropagation()}>
          <button className="admin-action-item" onClick={() => {
            fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
              body: JSON.stringify({ action: "reset_password", email: menuContext.email, userId: menuContext.userId }) })
              .then(r => r.json()).then(d => setPlanSaveMsg(d.ok ? d.message || "Password reset sent" : `Error: ${d.error}`))
              .catch(() => setPlanSaveMsg("Failed"));
            setTimeout(() => setPlanSaveMsg(""), 4000);
            setOpenMenu(null);
          }}>Reset Password</button>
          <button className="admin-action-item" onClick={() => {
            const targetEmail = window.prompt(`Clone ${menuContext.name || menuContext.email}'s setup to a new user.\n\nEnter the new user's email:`);
            if (!targetEmail || !targetEmail.includes("@")) { setOpenMenu(null); return; }
            const target = data.users?.find(tu => tu.email?.toLowerCase() === targetEmail.toLowerCase());
            if (target) {
              fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                body: JSON.stringify({ action: "update_user", userId: target.id, email: target.email, fields: { org_id: menuContext.orgId, role: menuContext.role } }) })
                .then(r => r.json()).then(d => { setPlanSaveMsg(d.ok ? `Cloned → ${targetEmail}` : `Error: ${d.error}`); setTimeout(fetchData, 500); })
                .catch(() => setPlanSaveMsg("Clone failed"));
            } else { setPlanSaveMsg(`User ${targetEmail} not found — they need to sign up first.`); }
            setTimeout(() => setPlanSaveMsg(""), 4000);
            setOpenMenu(null);
          }}>Clone Setup to User</button>
          <button className="admin-action-item" onClick={() => {
            navigator.clipboard?.writeText(`${window.location.origin}?ref=admin`);
            setPlanSaveMsg("Signup link copied");
            setTimeout(() => setPlanSaveMsg(""), 3000);
            setOpenMenu(null);
          }}>Copy Invite Link</button>
          <button className="admin-action-item" onClick={() => {
            fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
              body: JSON.stringify({ email: menuContext.email, role: menuContext.role }) })
              .then(r => r.json()).then(d => setPlanSaveMsg(d.ok ? (d.note || `Sent to ${menuContext.email}`) : `Error: ${d.error}`))
              .catch(() => setPlanSaveMsg("Failed"));
            setTimeout(() => setPlanSaveMsg(""), 5000);
            setOpenMenu(null);
          }}>Resend Invite</button>
          {!menuContext.isSuperuserRow && (
            <button className="admin-action-item danger" onClick={async () => {
              if (!window.confirm(`Delete ${menuContext.email}? This removes their account permanently.`)) { setOpenMenu(null); return; }
              try {
                const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbToken}` },
                  body: JSON.stringify({ action: "delete_user", userId: menuContext.userId, email: menuContext.email }) });
                const d = await r.json();
                setPlanSaveMsg(d.ok ? `Deleted ${menuContext.email}` : `Error: ${d.error}`);
                if (d.ok) setTimeout(fetchData, 1500);
              } catch { setPlanSaveMsg("Failed to delete"); }
              setTimeout(() => setPlanSaveMsg(""), 4000);
              setOpenMenu(null);
            }}>Delete User</button>
          )}
        </div>
      )}
    </div>
  );
}
