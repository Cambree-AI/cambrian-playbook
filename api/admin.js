// api/admin.js — Superuser analytics dashboard
//
// GET with admin JWT → returns aggregated engagement data across all
// users, orgs, and sessions. Locked to SUPERUSER_EMAIL only.

export const config = { maxDuration: 120 };

import { applyCors, checkRateLimit, isAllowedOrigin, verifyJwt, decodeJwtPayload } from "./_guard.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL;
if (!SUPERUSER_EMAIL) console.warn("[admin] SUPERUSER_EMAIL not set — all admin access will be rejected");

async function sbFetch(path, maxRows = 10000) {
  // Supabase REST API defaults to 1000 rows. Use Range header for more.
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Range: `0-${maxRows - 1}`,
    },
  });
  return r.json();
}

import adminActionHandler, { isAdminEmail } from "./_admin-action.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  // Route POST requests to admin-action handler (consolidated to stay within Vercel 12-function limit)
  if (req.method === "POST") return adminActionHandler(req, res);
  if (req.method !== "GET") return res.status(405).end();
  if (!SB_KEY) return res.status(500).json({ error: "Not configured" });

  // Origin check
  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "origin not allowed" });

  // Rate limiting
  const xff = req.headers["x-forwarded-for"];
  const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
           || (xff ? xff.split(",").pop().trim() : "")
           || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "rate limit exceeded" });
  }

  // Verify JWT and check superuser — uses consolidated JWT from _guard.js
  if (!await verifyJwt(req)) return res.status(401).json({ error: "Authentication required" });
  const authToken = (req.headers.authorization || "").slice(7);
  const payload = decodeJwtPayload(authToken);
  if (!payload?.sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) return res.status(401).json({ error: "Authentication required" });

  // Look up the caller's email — SUPERUSER_EMAIL or the ADMIN_EMAILS allowlist
  const userRes = await sbFetch(`users?id=eq.${payload.sub}&select=email`);
  const callerEmail = userRes?.[0]?.email;
  if (!SUPERUSER_EMAIL || !isAdminEmail(callerEmail)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Pagination params for sessions/activity
  const page = Math.max(1, parseInt(req.query?.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query?.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    // Audit log — record every admin access
    try {
      await fetch(`${SB_URL}/rest/v1/api_usage_log`, {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: payload.sub, model: "admin-dashboard", input_tokens: 0, output_tokens: 0, web_searches: 0, endpoint: "admin" }),
      });
    } catch {} // Best-effort audit — don't block the response

    // Fetch total session count for pagination
    const sessionCountRes = await fetch(`${SB_URL}/rest/v1/sessions?select=id&head=true`, {
      method: "HEAD",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: "count=exact" },
    });
    const totalSessions = parseInt(sessionCountRes.headers.get("content-range")?.split("/")?.[1]) || 0;

    // Fetch all data in parallel
    // sessionIndex: lightweight query of ALL sessions (no data blob) for accurate per-user counts
    // sessions: paginated with full data blob for session detail view
    const [users, orgs, sessionIndex, sessions, usageLogs, guestLogs, dbCosts, accessRequestRows, invitationRows] = await Promise.all([
      sbFetch("users?select=id,email,name,role,org_id,created_at,last_login&order=created_at.desc"),
      sbFetch("orgs?select=id,name,seller_url,plan,run_count,run_limit,max_run_count,max_run_limit,created_at&order=created_at.desc"),
      // ALL sessions — lightweight (no data blob) for accurate user activity stats
      sbFetch("sessions?select=id,user_id,seller_url,updated_at,created_at&order=updated_at.desc"),
      // Paginated sessions WITH data blob for detail view
      sbFetch(`sessions?select=id,name,seller_url,user_id,updated_at,created_at,data&order=updated_at.desc&limit=${limit}&offset=${offset}`),
      sbFetch("api_usage_log?select=user_id,org_id,model,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,web_searches,endpoint,target_company,seller_url,brief_type,created_at&order=created_at.desc", 50000),
      sbFetch("api_usage_log?user_id=is.null&select=model,input_tokens,output_tokens,web_searches,endpoint,created_at&order=created_at.desc&limit=2000"),
      // Server-side cost aggregation (bypasses row limits)
      fetch(`${SB_URL}/rest/v1/rpc/get_cost_summary`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: "{}" }).then(r => r.json()).catch(() => null),
      // Pending beta access requests for the Approve/Dismiss queue (issue #3)
      sbFetch("access_requests?status=eq.pending&select=id,name,email,company,note,promo_code,created_at&order=created_at.desc").catch(() => []),
      // Invitation emails for "already handled" detection on the queue
      sbFetch("invitations?select=email,accepted_at").catch(() => []),
    ]);

    // PostgREST errors come back as an object, not an array — treat as empty.
    // Requests whose email already belongs to a user (or has an outstanding
    // invitation) were handled out-of-band — the queue flags them so Approve
    // isn't offered on a row that would just bounce with existing_user.
    const userEmailSet = new Set((Array.isArray(users) ? users : []).map(u => (u.email || "").toLowerCase()));
    const inviteEmailSet = new Set((Array.isArray(invitationRows) ? invitationRows : [])
      .filter(i => !i.accepted_at).map(i => (i.email || "").toLowerCase()));
    const accessRequests = (Array.isArray(accessRequestRows) ? accessRequestRows : []).map(r => ({
      ...r,
      already_user: userEmailSet.has((r.email || "").trim().toLowerCase()),
      invite_pending: inviteEmailSet.has((r.email || "").trim().toLowerCase()),
    }));

    // Build user activity map
    const now = Date.now();
    const userMap = {};
    (users || []).forEach(u => {
      userMap[u.id] = {
        email: u.email,
        name: u.name,
        role: u.role,
        org_id: u.org_id,
        created_at: u.created_at,
        last_login: u.last_login || null,
        session_count: 0,
        brief_count: 0,
        last_active: null,
        seller_urls: [],
      };
    });

    // Enrich with session index (ALL sessions — lightweight, accurate counts)
    (sessionIndex || []).forEach(s => {
      if (userMap[s.user_id]) {
        userMap[s.user_id].session_count++;
        if (!userMap[s.user_id].last_active || new Date(s.updated_at) > new Date(userMap[s.user_id].last_active)) {
          userMap[s.user_id].last_active = s.updated_at;
        }
        if (s.seller_url && !userMap[s.user_id].seller_urls.includes(s.seller_url)) {
          userMap[s.user_id].seller_urls.push(s.seller_url);
        }
      }
    });

    // Enrich with paginated session data (full data blob for detail metrics)
    let totalMiltonMessages = 0;
    (sessions || []).forEach(s => {
      const miltonCount = Number(s.data?.miltonMsgCount) || 0;
      totalMiltonMessages += miltonCount;
      if (userMap[s.user_id]) {
        if (s.data?.brief?.companySnapshot) userMap[s.user_id].brief_count++;
        userMap[s.user_id].milton_messages = (userMap[s.user_id].milton_messages || 0) + miltonCount;
      }
    });

    // Build org map
    const orgMap = {};
    (orgs || []).forEach(o => {
      orgMap[o.id] = {
        name: o.name,
        seller_url: o.seller_url,
        plan: o.plan,
        run_count: o.run_count,
        run_limit: o.run_limit,
        max_run_count: o.max_run_count,
        max_run_limit: o.max_run_limit,
        member_count: 0,
      };
    });

    // Count members per org
    (users || []).forEach(u => {
      if (u.org_id && orgMap[u.org_id]) orgMap[u.org_id].member_count++;
    });

    // Environment status
    const guestFlag = (process.env.ALLOW_GUEST || "").replace(/^["']|["']$/g, "").replace(/\\n/g, "").trim().toLowerCase();
    const envStatus = {
      guest_mode: guestFlag === "true" || guestFlag === "1" || guestFlag === "yes" ? "ENABLED" : "disabled",
      environment: process.env.VERCEL_ENV || "unknown",
      jwt_secret_set: !!process.env.SUPABASE_JWT_SECRET,
      api_key_set: !!process.env.ANTHROPIC_API_KEY,
    };

    // Summary stats
    const activeToday = Object.values(userMap).filter(u => u.last_active && (now - new Date(u.last_active).getTime()) < 86400000).length;
    const activeWeek = Object.values(userMap).filter(u => u.last_active && (now - new Date(u.last_active).getTime()) < 604800000).length;
    const totalRuns = (orgs || []).reduce((sum, o) => sum + (o.run_count || 0), 0);
    const totalMaxRuns = (orgs || []).reduce((sum, o) => sum + (o.max_run_count || 0), 0);

    // Full session detail feed — extract intelligence from every session
    const recentActivity = (sessions || []).map(s => {
      const d = s.data || {};
      const companies = (d.accountQueue || []).map(a => a?.company).filter(Boolean);
      const scoredCompanies = Object.keys(d.fitScores || {});
      const industries = [...new Set((d.cohorts || []).map(c => c.name).filter(Boolean))];
      const hasICP = !!d.sellerICP?.icp;
      const hasBrief = !!d.brief?.companySnapshot;
      const hasHypo = !!d.riverHypo?.reality;
      const hasPostCall = !!d.postCall?.dealRoute;
      const hasSolutionFit = !!d.solutionFit?.confirmedSolutions;
      const dealRoute = d.postCall?.dealRoute || null;
      const selectedAccount = d.selectedAccount?.company || null;
      const outcomeCount = (d.selectedOutcomes || []).length;
      const editCount = (d.icpEdits || []).length + (d.userEdits || []).length;
      const favCount = (d.favorites || []).length;
      const stage = d.step != null ? d.step : (d.brief ? 5 : d.sellerICP ? 1 : 0);
      const gatesFilled = d.gateAnswers ? Object.values(d.gateAnswers).filter(Boolean).length : 0;
      const discoveryFilled = d.riverData ? Object.values(d.riverData).filter(v => v?.trim()).length : 0;

      return {
        id: s.id,
        session_name: s.name || "Untitled",
        seller_url: s.seller_url || "",
        user_id: s.user_id,
        user_name: userMap[s.user_id]?.name || userMap[s.user_id]?.email || "Unknown",
        user_email: userMap[s.user_id]?.email || "",
        user_role: userMap[s.user_id]?.role || "unknown",
        updated_at: s.updated_at,
        created_at: s.created_at,
        milton_messages: Number(d.miltonMsgCount) || 0,
        // Session depth indicators
        stage,
        hasICP, hasBrief, hasHypo, hasPostCall, hasSolutionFit,
        // Content stats
        companies_queued: companies.length,
        companies_scored: scoredCompanies.length,
        industries,
        selected_account: selectedAccount,
        deal_route: dealRoute,
        deal_value: d.dealValue || null,
        outcomes: outcomeCount,
        edits: editCount,
        favorites: favCount,
        gates_filled: gatesFilled,
        discovery_filled: discoveryFilled,
        seller_stage: d.sellerStage || null,
        products_count: (d.products || []).filter(p => p?.name?.trim()).length,
        docs_count: (d.sellerDocs || []).length,
        // Uploaded document details
        docs: (d.sellerDocs || []).map(doc => {
          const raw = doc.content || "";
          // Detect binary/PDF content and show clean text only
          const isBinary = raw.startsWith("%PDF") || /[\x00-\x08\x0E-\x1F]/.test(raw.slice(0, 100));
          const cleanText = isBinary ? "" : raw.replace(/[\x00-\x1F\x7F-\x9F]/g, " ").replace(/\s+/g, " ").trim();
          return {
            label: doc.label || "Untitled",
            contentPreview: cleanText ? cleanText.slice(0, 400) : (isBinary ? "[PDF/binary file — text not extractable in preview]" : ""),
            charCount: raw.length,
            isBinary,
          };
        }),
        products: (d.products || []).filter(p => p?.name?.trim()).map(p => ({ name: p.name, description: (p.description || "").slice(0, 100) })),
        proof_points: (d.sellerProofPoints || []).map(pp => ({ type: pp.type || "unknown", label: pp.label || "", content: (pp.content || "").slice(0, 150) })),
        account_docs: (d.accountDocs || []).map(doc => {
          const raw = doc.content || "";
          const isBinary = raw.startsWith("%PDF") || /[\x00-\x08\x0E-\x1F]/.test(raw.slice(0, 100));
          const cleanText = isBinary ? "" : raw.replace(/[\x00-\x1F\x7F-\x9F]/g, " ").replace(/\s+/g, " ").trim();
          return { label: doc.label || "Untitled", contentPreview: cleanText ? cleanText.slice(0, 400) : "[Binary file]", charCount: raw.length, isBinary };
        }),
        // Brief detail (for expanded session view)
        brief_snapshot: d.brief?.companySnapshot || null,
        brief_tldr: d.brief?.tldr || null,
        brief_revenue: d.brief?.revenue || null,
        brief_employees: d.brief?.employeeCount || null,
        brief_hq: d.brief?.headquarters || null,
        brief_ownership: d.brief?.publicPrivate || null,
        brief_funding: d.brief?.fundingProfile || null,
        brief_elevator_pitch: d.brief?.elevatorPitch || null,
        brief_strategic_theme: d.brief?.strategicTheme || null,
        brief_opening_angle: d.brief?.openingAngle || null,
        brief_executives: (d.brief?.keyExecutives || []).filter(e => e?.name).map(e => ({ name: e.name, title: e.title })),
        brief_headlines: (d.brief?.recentHeadlines || []).slice(0, 5).map(h => typeof h === "string" ? h : h?.headline).filter(Boolean),
        brief_five_questions: d.brief?.fiveQuestions || null,
        brief_competitors: d.brief?.competitors || [],
        // ICP detail
        icp_industries: d.sellerICP?.icp?.industries || [],
        icp_personas: d.sellerICP?.icp?.personas || [],
        icp_company_sizes: d.sellerICP?.icp?.companySizes || [],
        icp_edits: (d.icpEdits || []).length,
        // Hypothesis text
        hypothesis_reality: d.riverHypo?.reality || null,
        hypothesis_impact: d.riverHypo?.impact || null,
        hypothesis_vision: d.riverHypo?.vision || null,
        hypothesis_entry: d.riverHypo?.entryPoints || null,
        hypothesis_route: d.riverHypo?.route || null,
        // Fit scores for all companies
        fit_scores: Object.entries(d.fitScores || {}).slice(0, 20).map(([co, s]) => ({ company: co, score: s?.score || s?.dim1, reason: (s?.reason || "").slice(0, 100) })),
      };
    });

    // All unique seller URLs being researched
    const allSellerUrls = [...new Set((sessions || []).map(s => s.seller_url).filter(Boolean))];

    // ── Cost tracking from api_usage_log ──
    // Prices per 1M tokens (Anthropic published rates, May 2026)
    // Note: input_tokens includes cache_read + cache_creation which are
    // cheaper in practice (90% discount on cache reads). These costs
    // represent a ceiling; actual costs are ~20-40% lower due to caching.
    const PRICING = {
      "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
      "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
      "claude-sonnet-4-5": { input: 3.00, output: 15.00 },
      "claude-sonnet-4-5-20250929": { input: 3.00, output: 15.00 },
      "claude-opus-4-6": { input: 15.00, output: 75.00 },
      "claude-opus-4-20250514": { input: 15.00, output: 75.00 },
    };
    const WEB_SEARCH_COST = 0.01; // $0.01 per web search invocation
    const DEFAULT_PRICING = { input: 1.00, output: 5.00 };

    const costByUser = {};
    const costByDay = {};
    const costByModel = {};
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalWebSearches = 0;
    let totalApiCalls = 0;

    (usageLogs || []).forEach(log => {
      // Skip non-API entries (admin actions, contact form, cron, etc.)
      if (!log.model || !log.input_tokens && !log.output_tokens) return;
      if (["admin-dashboard", "enterprise-inquiry", "cron-monthly-reset"].includes(log.model)) return;
      const pricing = PRICING[log.model] || DEFAULT_PRICING;
      const tokenCost = (log.input_tokens * pricing.input + log.output_tokens * pricing.output) / 1_000_000;
      const searchCost = (log.web_searches || 0) * WEB_SEARCH_COST;
      const cost = tokenCost + searchCost;
      totalCost += cost;
      totalInputTokens += log.input_tokens || 0;
      totalOutputTokens += log.output_tokens || 0;
      totalWebSearches += log.web_searches || 0;
      totalApiCalls++;

      // By user
      const uid = log.user_id || "guest";
      if (!costByUser[uid]) costByUser[uid] = { cost: 0, calls: 0, input: 0, output: 0 };
      costByUser[uid].cost += cost;
      costByUser[uid].calls++;
      costByUser[uid].input += log.input_tokens || 0;
      costByUser[uid].output += log.output_tokens || 0;

      // By day
      const day = log.created_at?.slice(0, 10) || "unknown";
      if (!costByDay[day]) costByDay[day] = { cost: 0, calls: 0 };
      costByDay[day].cost += cost;
      costByDay[day].calls++;

      // By model
      const model = log.model || "unknown";
      if (!costByModel[model]) costByModel[model] = { cost: 0, calls: 0, input: 0, output: 0 };
      costByModel[model].cost += cost;
      costByModel[model].calls++;
      costByModel[model].input += log.input_tokens || 0;
      costByModel[model].output += log.output_tokens || 0;
    });

    const costs = {
      total: { cost: totalCost, api_calls: totalApiCalls, input_tokens: totalInputTokens, output_tokens: totalOutputTokens, web_searches: totalWebSearches },
      by_user: Object.entries(costByUser).map(([uid, d]) => ({
        user_id: uid,
        user_name: userMap[uid]?.name || userMap[uid]?.email || (uid === "guest" ? "Guest" : "Unknown"),
        user_email: userMap[uid]?.email || "",
        ...d,
      })).sort((a, b) => b.cost - a.cost),
      by_day: Object.entries(costByDay).map(([day, d]) => ({ day, ...d })).sort((a, b) => b.day.localeCompare(a.day)),
      by_model: Object.entries(costByModel).map(([model, d]) => ({ model, ...d })).sort((a, b) => b.cost - a.cost),
    };

    // ── Session learnings — aggregate user behavior patterns ──
    const learnings = { icpEdits: {}, dealRoutes: { FAST_TRACK: 0, NURTURE: 0, DISQUALIFY: 0 }, avgConfidence: 0, totalDeals: 0, intelAdjustments: [], topEditedFields: [], avgGateCompletion: 0, sessions_analyzed: 0 };
    let totalConf = 0, totalGates = 0, totalGatesFilled = 0;
    (sessions || []).forEach(s => {
      const d = s.data;
      if (!d) return;
      learnings.sessions_analyzed++;
      // ICP edits — which fields do users correct most?
      (d.icpEdits || []).forEach(e => {
        learnings.icpEdits[e.field] = (learnings.icpEdits[e.field] || 0) + 1;
      });
      // Deal routes
      if (d.postCall?.dealRoute) {
        learnings.dealRoutes[d.postCall.dealRoute] = (learnings.dealRoutes[d.postCall.dealRoute] || 0) + 1;
        learnings.totalDeals++;
      }
      // Intel adjustments — what insider knowledge are users adding?
      Object.entries(d.intelAdjustments || {}).forEach(([co, adj]) => {
        learnings.intelAdjustments.push({ company: co, modifier: adj.modifier, reason: adj.reason, user: userMap[s.user_id]?.name || "Unknown" });
      });
      // Gate completion
      if (d.gateAnswers) {
        const filled = Object.values(d.gateAnswers).filter(Boolean).length;
        const total = 15; // approximate total gates across RIVER
        totalGates += total;
        totalGatesFilled += filled;
      }
    });
    // Top edited ICP fields
    learnings.topEditedFields = Object.entries(learnings.icpEdits).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([field, count]) => ({ field, count }));
    learnings.avgGateCompletion = totalGates > 0 ? Math.round(totalGatesFilled / totalGates * 100) : 0;
    // Fast track rate
    learnings.fastTrackRate = learnings.totalDeals > 0 ? Math.round(learnings.dealRoutes.FAST_TRACK / learnings.totalDeals * 100) : 0;
    learnings.disqualifyRate = learnings.totalDeals > 0 ? Math.round(learnings.dealRoutes.DISQUALIFY / learnings.totalDeals * 100) : 0;

    // ── Session funnel analytics ──
    const sessionFunnel = {
      total: recentActivity.length,
      with_icp: recentActivity.filter(s => s.hasICP).length,
      with_brief: recentActivity.filter(s => s.hasBrief).length,
      with_hypothesis: recentActivity.filter(s => s.hasHypo).length,
      with_post_call: recentActivity.filter(s => s.hasPostCall).length,
      with_solution_fit: recentActivity.filter(s => s.hasSolutionFit).length,
      total_companies_scored: recentActivity.reduce((s, a) => s + a.companies_scored, 0),
      total_companies_queued: recentActivity.reduce((s, a) => s + a.companies_queued, 0),
      avg_companies_per_session: recentActivity.length > 0 ? Math.round(recentActivity.reduce((s, a) => s + a.companies_queued, 0) / recentActivity.length * 10) / 10 : 0,
      deal_routes: { fast_track: recentActivity.filter(s => s.deal_route === "FAST_TRACK").length, nurture: recentActivity.filter(s => s.deal_route === "NURTURE").length, disqualify: recentActivity.filter(s => s.deal_route === "DISQUALIFY").length },
      top_industries: Object.entries(recentActivity.flatMap(s => s.industries).reduce((acc, ind) => { acc[ind] = (acc[ind] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([industry, count]) => ({ industry, count })),
      top_seller_stages: Object.entries(recentActivity.map(s => s.seller_stage).filter(Boolean).reduce((acc, st) => { acc[st] = (acc[st] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).map(([stage, count]) => ({ stage, count })),
    };

    // ── Guest activity from usage logs ──
    const guestActivity = {
      total_calls: (guestLogs || []).length,
      by_endpoint: {},
      by_day: {},
      total_cost: 0,
    };
    (guestLogs || []).forEach(g => {
      const ep = g.endpoint || "claude";
      guestActivity.by_endpoint[ep] = (guestActivity.by_endpoint[ep] || 0) + 1;
      const day = g.created_at?.slice(0, 10) || "unknown";
      if (!guestActivity.by_day[day]) guestActivity.by_day[day] = 0;
      guestActivity.by_day[day]++;
      const pricing = PRICING[g.model] || DEFAULT_PRICING;
      guestActivity.total_cost += ((g.input_tokens || 0) * pricing.input + (g.output_tokens || 0) * pricing.output) / 1_000_000;
    });
    guestActivity.by_endpoint = Object.entries(guestActivity.by_endpoint).map(([endpoint, count]) => ({ endpoint, count }));
    guestActivity.by_day = Object.entries(guestActivity.by_day).map(([day, count]) => ({ day, count })).sort((a, b) => b.day.localeCompare(a.day));

    // ── Data Science / Intelligence queries ──
    // These tables may not exist yet (migrations 022-024). Each query is
    // wrapped in try/catch so a missing table doesn't crash the endpoint.
    const intelligence = {};

    // Model accuracy (from model_accuracy_log)
    try {
      const malRows = await sbFetch("model_accuracy_log?select=market_category,predicted_label,prediction_correct,predicted_score&limit=5000");
      if (Array.isArray(malRows) && malRows.length > 0 && !malRows.error) {
        const byCategory = {};
        malRows.forEach(r => {
          const cat = r.market_category || "Unknown";
          if (!byCategory[cat]) byCategory[cat] = { predictions: 0, correct: 0, totalScore: 0 };
          byCategory[cat].predictions++;
          if (r.prediction_correct) byCategory[cat].correct++;
          byCategory[cat].totalScore += r.predicted_score || 0;
        });
        const totalPredictions = malRows.length;
        const totalCorrect = malRows.filter(r => r.prediction_correct).length;
        intelligence.modelAccuracy = {
          overall: totalPredictions > 0 ? Math.round(totalCorrect / totalPredictions * 100) : null,
          totalPredictions,
          totalCorrect,
          byCategory: Object.entries(byCategory).map(([cat, d]) => ({
            category: cat, predictions: d.predictions, correct: d.correct,
            accuracy: d.predictions > 0 ? Math.round(d.correct / d.predictions * 100) : 0,
          })).sort((a, b) => b.predictions - a.predictions),
        };
      } else {
        intelligence.modelAccuracy = null;
      }
    } catch { intelligence.modelAccuracy = null; }

    // Scoring calibration (from seller_profiles)
    try {
      const spRows = await sbFetch("seller_profiles?select=avg_fit_score_advanced,avg_fit_score_dq,prediction_accuracy&limit=500");
      if (Array.isArray(spRows) && spRows.length > 0 && !spRows.error) {
        const advScores = spRows.filter(r => r.avg_fit_score_advanced != null).map(r => Number(r.avg_fit_score_advanced));
        const dqScores = spRows.filter(r => r.avg_fit_score_dq != null).map(r => Number(r.avg_fit_score_dq));
        intelligence.scoringCalibration = {
          avgScoreAdvanced: advScores.length > 0 ? Math.round(advScores.reduce((a, b) => a + b, 0) / advScores.length) : null,
          avgScoreDQ: dqScores.length > 0 ? Math.round(dqScores.reduce((a, b) => a + b, 0) / dqScores.length) : null,
          sellersWithData: spRows.length,
        };
      } else {
        intelligence.scoringCalibration = null;
      }
    } catch { intelligence.scoringCalibration = null; }

    // Knowledge layer effectiveness (from kl_effectiveness)
    try {
      const kleRows = await sbFetch("kl_effectiveness?select=kl_name,sections_it_influenced,user_edited_kl_content,deal_outcome&limit=5000");
      if (Array.isArray(kleRows) && kleRows.length > 0 && !kleRows.error) {
        const byKL = {};
        kleRows.forEach(r => {
          const name = r.kl_name || "unknown";
          if (!byKL[name]) byKL[name] = { injected: 0, sectionsInfluenced: 0, corrections: 0, advanced: 0 };
          byKL[name].injected++;
          byKL[name].sectionsInfluenced += r.sections_it_influenced || 0;
          if (r.user_edited_kl_content) byKL[name].corrections++;
          if (r.deal_outcome === "FAST_TRACK") byKL[name].advanced++;
        });
        intelligence.klEffectiveness = Object.entries(byKL).map(([name, d]) => ({
          name, injected: d.injected,
          avgSectionsInfluenced: d.injected > 0 ? Math.round(d.sectionsInfluenced / d.injected * 10) / 10 : 0,
          corrections: d.corrections,
          correctionRate: d.injected > 0 ? Math.round(d.corrections / d.injected * 100) : 0,
          advanced: d.advanced,
        })).sort((a, b) => b.correctionRate - a.correctionRate || b.injected - a.injected);
      } else {
        intelligence.klEffectiveness = null;
      }
    } catch { intelligence.klEffectiveness = null; }

    // ICP edit trends (from icp_edit_log)
    try {
      const editRows = await sbFetch("icp_edit_log?select=field_name,market_category,new_value,old_value&order=created_at.desc&limit=5000");
      if (Array.isArray(editRows) && editRows.length > 0 && !editRows.error) {
        const byField = {};
        editRows.forEach(r => {
          const f = r.field_name || "unknown";
          if (!byField[f]) byField[f] = { count: 0, categories: {} };
          byField[f].count++;
          const cat = r.market_category || "Unknown";
          byField[f].categories[cat] = (byField[f].categories[cat] || 0) + 1;
        });
        intelligence.editTrends = Object.entries(byField).map(([field, d]) => {
          const topCat = Object.entries(d.categories).sort((a, b) => b[1] - a[1])[0];
          return { field, count: d.count, topCategory: topCat?.[0] || "—", direction: "corrected" };
        }).sort((a, b) => b.count - a.count);
      } else {
        intelligence.editTrends = null;
      }
    } catch { intelligence.editTrends = null; }

    // Competitor intel coverage (from competitor_intel)
    try {
      const ciRows = await sbFetch("competitor_intel?select=market_category,competitor_name,verified,times_cited&limit=5000");
      if (Array.isArray(ciRows) && ciRows.length > 0 && !ciRows.error) {
        const byCat = {};
        ciRows.forEach(r => {
          const cat = r.market_category || "Unknown";
          if (!byCat[cat]) byCat[cat] = { competitors: new Set(), verified: 0, citations: 0 };
          byCat[cat].competitors.add(r.competitor_name);
          if (r.verified) byCat[cat].verified++;
          byCat[cat].citations += r.times_cited || 0;
        });
        intelligence.competitorCoverage = Object.entries(byCat).map(([cat, d]) => ({
          category: cat, competitorsMapped: d.competitors.size, verified: d.verified, citations: d.citations,
        })).sort((a, b) => b.competitorsMapped - a.competitorsMapped);
      } else {
        intelligence.competitorCoverage = null;
      }
    } catch { intelligence.competitorCoverage = null; }

    // Conversion funnel (from prospect_events)
    try {
      const peRows = await sbFetch("prospect_events?select=event_type&limit=10000");
      if (Array.isArray(peRows) && peRows.length > 0 && !peRows.error) {
        const counts = {};
        peRows.forEach(r => { counts[r.event_type] = (counts[r.event_type] || 0) + 1; });
        intelligence.conversionFunnel = {
          generated: counts.generated || 0,
          viewed: counts.viewed || 0,
          briefed: counts.briefed || 0,
          pushed_crm: counts.pushed_crm || 0,
          advanced: counts.advanced || 0,
          disqualified: counts.disqualified || 0,
          total: peRows.length,
        };
      } else {
        intelligence.conversionFunnel = null;
      }
    } catch { intelligence.conversionFunnel = null; }

    // Brief quality (from brief_quality_signals)
    try {
      const bqRows = await sbFetch("brief_quality_signals?select=sections_completed,sections_edited,sections_attempted,pushed_hubspot&limit=5000");
      if (Array.isArray(bqRows) && bqRows.length > 0 && !bqRows.error) {
        const totalBriefs = bqRows.length;
        const avgSections = bqRows.reduce((s, r) => s + (r.sections_completed || 0), 0) / totalBriefs;
        const avgEdited = bqRows.filter(r => r.sections_edited > 0).length;
        const avgEditRate = totalBriefs > 0 ? Math.round(avgEdited / totalBriefs * 100) : 0;
        const crmPushes = bqRows.filter(r => r.pushed_hubspot).length;
        const crmRate = totalBriefs > 0 ? Math.round(crmPushes / totalBriefs * 100) : 0;
        intelligence.briefQuality = {
          totalBriefs,
          avgSectionsComplete: Math.round(avgSections * 10) / 10,
          avgEditRate,
          crmPushRate: crmRate,
        };
      } else {
        intelligence.briefQuality = null;
      }
    } catch { intelligence.briefQuality = null; }

    res.setHeader("Cache-Control", "private, no-cache");
    res.json({
      intelligence,
      summary: {
        total_users: (users || []).length,
        active_today: activeToday,
        active_this_week: activeWeek,
        total_sessions: totalSessions,
        total_runs: totalRuns,
        total_max_runs: totalMaxRuns,
        total_orgs: (orgs || []).length,
        unique_seller_urls: allSellerUrls.length,
        total_milton_messages: totalMiltonMessages,
        guest_api_calls: guestActivity.total_calls,
        pending_access_requests: accessRequests.length,
      },
      pagination: { page, limit, total: totalSessions },
      environment: envStatus,
      users: Object.entries(userMap).map(([id, u]) => ({
        id,
        ...u,
        org_name: u.org_id && orgMap[u.org_id] ? orgMap[u.org_id].name : null,
        org_plan: u.org_id && orgMap[u.org_id] ? orgMap[u.org_id].plan : null,
      })),
      orgs: Object.entries(orgMap).map(([id, o]) => ({ id, ...o })),
      access_requests: accessRequests,
      recent_activity: recentActivity,
      seller_urls: allSellerUrls,
      costs,
      dbCosts: dbCosts || null, // server-side aggregated costs (exact, no row limit)
      learnings,
      sessionFunnel,
      guestActivity,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
}
