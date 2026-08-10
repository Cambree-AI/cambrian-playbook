#!/usr/bin/env node
// scripts/daily-health.mjs — Daily API health check from api_usage_log (#27)
//
// Reports per-endpoint latency percentiles (p50/p95), slow-call counts, and
// prompt-cache hit rates so speed regressions and cache effectiveness are
// queryable without the SuperAdmin dashboard.
//
// Usage:
//   node scripts/daily-health.mjs               # last 1 day
//   node scripts/daily-health.mjs --days=7      # last 7 days
//   node scripts/daily-health.mjs --by-model    # additionally split by model
//
// Requires: SUPABASE_SERVICE_KEY (service_role — same as nightly-backup.mjs).
// Optional: SUPABASE_URL / VITE_SUPABASE_URL to point at a different project
// (defaults to the production project used by nightly-backup.mjs).
// Reads .env.local / .env from the repo root if present.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  const p = join(ROOT, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      process.env[m[1]] = val;
    }
  }
}

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://xtnidawfuaxwwwcnkewu.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB_KEY) {
  console.error("SUPABASE_SERVICE_KEY not set. Get it from Supabase Dashboard → Settings → API → service_role key.");
  process.exit(1);
}

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const DAYS = Math.max(1, parseInt(args.days, 10) || 1);
const BY_MODEL = !!args["by-model"];
const SLOW_MS = 60_000; // acceptance criterion for #27: no call >60s at p95

const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

const fmtMs = v => v == null ? "—" : v >= 10_000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;
const pct = (n, d) => d ? `${((100 * n) / d).toFixed(1)}%` : "—";

async function fetchRows() {
  // Page through PostgREST results (default server cap is 1000 rows).
  const rows = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const url = `${SB_URL}/rest/v1/api_usage_log` +
      `?select=endpoint,model,duration_ms,input_tokens,cache_read_tokens,cache_creation_tokens,created_at` +
      `&created_at=gte.${encodeURIComponent(since)}` +
      `&order=created_at.desc&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) {
      console.error(`api_usage_log query failed: ${res.status} — ${(await res.text()).slice(0, 200)}`);
      process.exit(1);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE || rows.length >= 100_000) break;
  }
  return rows;
}

function summarize(rows) {
  const durations = rows.map(r => r.duration_ms).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  const cacheReads = rows.filter(r => (r.cache_read_tokens || 0) > 0).length;
  const cacheWrites = rows.filter(r => (r.cache_creation_tokens || 0) > 0).length;
  return {
    calls: rows.length,
    withDuration: durations.length,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    max: durations.length ? durations[durations.length - 1] : null,
    slow: durations.filter(v => v > SLOW_MS).length,
    cacheReads,
    cacheWrites,
  };
}

function printTable(title, groups) {
  console.log(`\n--- ${title} ---`);
  const header = ["group", "calls", "p50", "p95", "max", `>${SLOW_MS / 1000}s`, "cache-hit", "cache-write"];
  const lines = [header];
  for (const [name, s] of groups) {
    lines.push([
      name, String(s.calls), fmtMs(s.p50), fmtMs(s.p95), fmtMs(s.max),
      String(s.slow), pct(s.cacheReads, s.calls), pct(s.cacheWrites, s.calls),
    ]);
  }
  const widths = lines[0].map((_, i) => Math.max(...lines.map(l => l[i].length)));
  for (const l of lines) console.log("  " + l.map((c, i) => c.padEnd(widths[i] + 2)).join(""));
}

async function main() {
  console.log(`\n=== CAMBRIAN CATALYST DAILY HEALTH CHECK ===`);
  console.log(`Window: last ${DAYS} day(s) (since ${since})`);
  console.log(`Source: ${SB_URL} api_usage_log`);

  const rows = await fetchRows();
  if (!rows.length) {
    console.log("\nNo api_usage_log rows in window — nothing to report.");
    return;
  }

  // Overall
  printTable("OVERALL", [["all", summarize(rows)]]);

  // Per endpoint (p50/p95 duration_ms by endpoint — #27 measurement task)
  const byEndpoint = new Map();
  for (const r of rows) {
    const key = r.endpoint || "unknown";
    if (!byEndpoint.has(key)) byEndpoint.set(key, []);
    byEndpoint.get(key).push(r);
  }
  printTable("BY ENDPOINT", [...byEndpoint.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, v]) => [k, summarize(v)]));

  if (BY_MODEL) {
    const byModel = new Map();
    for (const r of rows) {
      const key = `${r.endpoint || "unknown"} / ${r.model || "unknown"}`;
      if (!byModel.has(key)) byModel.set(key, []);
      byModel.get(key).push(r);
    }
    printTable("BY ENDPOINT / MODEL", [...byModel.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, v]) => [k, summarize(v)]));
  }

  // Long-pole detail: the 10 slowest calls in the window
  const slowest = rows.filter(r => Number.isFinite(r.duration_ms))
    .sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 10);
  console.log(`\n--- 10 SLOWEST CALLS ---`);
  for (const r of slowest) {
    console.log(`  ${fmtMs(r.duration_ms).padEnd(8)} ${(r.endpoint || "?").padEnd(14)} ${(r.model || "?").padEnd(28)} in:${r.input_tokens || 0} cacheRead:${r.cache_read_tokens || 0} ${r.created_at}`);
  }
  console.log("");
}

main().catch(e => { console.error("Health check failed:", e); process.exit(1); });
