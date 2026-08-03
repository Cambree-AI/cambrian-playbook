// api/_fetch-ssrf.js — SSRF validation for /api/fetch (HANDOFF_06 §2)
//
// All outbound-URL validation lives here so the test suite can import and
// exercise it in isolation with mocked DNS — no network required.
//
// The endpoint calls validateUrl() before making any outbound connection.
// Each helper is exported so the test suite can unit-test ranges directly.

import { promises as dnsPromises } from 'node:dns';

// ── Alternative IPv4 notation normalization ───────────────────────────────────
// Converts non-standard IPv4 representations to canonical dotted-decimal BEFORE
// the private-range check. Defense-in-depth: the WHATWG URL parser already
// normalizes most of these, but we do it explicitly so the security property is
// self-contained and auditable in this module — not relying on any OS behavior.
//
// Handles all inet_aton forms:
//   Decimal integer:  2130706433        → 127.0.0.1  (single 32-bit int)
//   Hex integer:      0x7f000001        → 127.0.0.1
//   Octal first part: 0177.0.0.1        → 127.0.0.1
//   Mixed hex/octal:  0x7f.0x0.0.0x1   → 127.0.0.0 (each octet)
//   3-part (c=16bit): 0177.0.1          → 127.0.0.1
//   2-part (b=24bit): 0177.1            → 127.0.0.1
//
// Non-IP hostnames (contain alpha chars that aren't a 0x prefix) pass through
// unchanged — parseIntFlex returns null for any non-numeric part.

// Parse a string as hex (0x…), octal (leading 0 + only octal digits), or decimal.
// Returns the integer value, or null if not a numeric string.
function parseIntFlex(s) {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^0[0-7]+$/.test(s)) return parseInt(s, 8);  // leading 0 + only [0-7]
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  return null; // domain label — contains non-numeric chars
}

// Convert a 32-bit unsigned integer to dotted-decimal notation
function uint32ToDotted(n) {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>>  8) & 0xff,
    (n >>>  0) & 0xff,
  ].join('.');
}

export function normalizeHostname(hostname) {
  const h = hostname.toLowerCase();

  // IPv6 (contains colon or brackets) — pass through unchanged
  if (h.includes(':') || h.startsWith('[')) return hostname;

  const parts = h.split('.');

  // ── Single-part: full 32-bit decimal or hex integer ──────────────────────
  if (parts.length === 1) {
    const n = parseIntFlex(h);
    if (n !== null && Number.isInteger(n) && n >= 0 && n <= 0xffffffff) {
      return uint32ToDotted(n);
    }
    return hostname; // not a number — it's a hostname, leave unchanged
  }

  // ── Multi-part: each part may be hex, octal, or decimal ──────────────────
  // Any null from parseIntFlex means it's a domain label → leave unchanged
  const nums = parts.map(p => parseIntFlex(p));
  if (nums.some(n => n === null)) return hostname;

  switch (parts.length) {
    case 4:
      // a.b.c.d — each octet must be 0-255
      if (nums.every(n => n >= 0 && n <= 255)) return nums.join('.');
      break;
    case 3:
      // a.b.c — c is a 16-bit value (inet_aton 3-part form)
      if (nums[0] >= 0 && nums[0] <= 255 &&
          nums[1] >= 0 && nums[1] <= 255 &&
          nums[2] >= 0 && nums[2] <= 0xffff) {
        return [nums[0], nums[1], (nums[2] >>> 8) & 0xff, nums[2] & 0xff].join('.');
      }
      break;
    case 2:
      // a.b — b is a 24-bit value (inet_aton 2-part form)
      if (nums[0] >= 0 && nums[0] <= 255 &&
          nums[1] >= 0 && nums[1] <= 0xffffff) {
        return [nums[0], (nums[1] >>> 16) & 0xff, (nums[1] >>> 8) & 0xff, nums[1] & 0xff].join('.');
      }
      break;
  }

  return hostname; // out of range — leave; DNS will reject or block at resolve step
}

// ── Blocked host list ─────────────────────────────────────────────────────────
// linkedin.com: ToS prohibition + exec names come from the snippet path anyway
// (HANDOFF_05 §2). Expand cautiously — overly broad blocks degrade accuracy.
const BLOCKED_HOSTS = new Set([
  'linkedin.com',
  'www.linkedin.com',
  'lnkd.in',
]);

export function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.+$/, ''); // strip trailing dots
  if (BLOCKED_HOSTS.has(h)) return true;
  // Suffix match: sub.linkedin.com is also blocked
  for (const blocked of BLOCKED_HOSTS) {
    if (h.endsWith('.' + blocked)) return true;
  }
  return false;
}

// ── Private/reserved IPv4 range check ────────────────────────────────────────
// Covers all SSRF-relevant private, loopback, link-local, and reserved ranges.
// Reference: RFC 1918, RFC 3927, RFC 6598, RFC 5771, RFC 919.
export function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;

  if (a === 10) return true;                          // 10.0.0.0/8  — RFC 1918 private
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 — RFC 1918 private
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16 — RFC 1918 private
  if (a === 127) return true;                         // 127.0.0.0/8 — loopback (RFC 990)
  if (a === 169 && b === 254) return true;            // 169.254.0.0/16 — link-local + AWS IMDSv1
  if (a === 0) return true;                           // 0.0.0.0/8 — "this" network (RFC 791)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT (RFC 6598)
  if (a >= 224 && a <= 239) return true;              // 224.0.0.0/4 — multicast (RFC 5771)
  if (a >= 240) return true;                          // 240.0.0.0/4 — reserved + broadcast
  return false;
}

// ── Private/reserved IPv6 range check ────────────────────────────────────────
// Reference: RFC 4291, RFC 4193, RFC 4007.
export function isPrivateIPv6(ip) {
  // Strip URL-form brackets: [::1] → ::1
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');

  if (addr === '::1') return true;                      // loopback (RFC 4291)
  if (addr === '::') return true;                       // unspecified
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // fc00::/7 unique-local (RFC 4193)
  if (/^fe[89ab]/i.test(addr)) return true;             // fe80::/10 link-local (RFC 4291)
  if (addr.startsWith('ff')) return true;               // ff00::/8 multicast (RFC 4291)
  return false;
}

// Dispatches to the correct checker based on whether the address contains ':'
export function isPrivateIp(ip) {
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

// ── validateUrl ───────────────────────────────────────────────────────────────
// Full SSRF validation for a single URL. Must pass before any outbound connection.
//
// Arguments:
//   rawUrl    — the URL string to validate
//   dnsLookup — optional override: async (hostname: string) => string[] | null
//               Returns array of resolved IP strings, or null on resolution failure.
//               Pass a mock in tests to avoid real DNS lookups.
//
// Returns:
//   { ok: true,  resolvedIps: string[] }           — safe to connect
//   { ok: false, reason: string, detail?: string }  — blocked; do not connect
export async function validateUrl(rawUrl, { dnsLookup } = {}) {
  // 1. Parse URL — reject malformed strings immediately
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'fetch_failed', detail: 'invalid URL' };
  }

  // 2. Scheme allowlist — only http / https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'disallowed_scheme' };
  }

  // 3. No userinfo (credentials embedded in URL — strips before we resolve)
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'disallowed_scheme', detail: 'credentials in URL' };
  }

  const hostname = parsed.hostname;

  // 4. Blocked host list (linkedin.com etc.) — before DNS to avoid unnecessary lookup
  if (isBlockedHost(hostname)) {
    return { ok: false, reason: 'blocked_host' };
  }

  // 5. Normalize alternative IPv4 representations to canonical dotted-decimal,
  //    then reject any private/reserved range — no DNS lookup needed.
  //    Without normalization, 2130706433 / 0x7f000001 / 0177.0.0.1 pass the
  //    literal check and reach DNS; this catches them before any connection.
  const normalizedHost = normalizeHostname(hostname);
  if (isPrivateIp(normalizedHost)) {
    return { ok: false, reason: 'blocked_private_ip' };
  }

  // 6. DNS-resolve then block if ANY resolved address is private.
  //    This is the DNS-rebinding guard: catches public hostnames that resolve
  //    to private IPs, and non-standard IP notations (octal, hex) that the
  //    URL parser passes through as opaque hostnames.
  const resolve = dnsLookup ?? (async (host) => {
    try {
      const records = await dnsPromises.lookup(host, { all: true });
      return records.map(r => r.address);
    } catch {
      return null; // null → resolution failure
    }
  });

  let addresses;
  try {
    addresses = await resolve(hostname);
  } catch {
    return { ok: false, reason: 'fetch_failed', detail: 'DNS lookup threw' };
  }

  if (!addresses || addresses.length === 0) {
    return { ok: false, reason: 'fetch_failed', detail: 'DNS resolution failed' };
  }

  // Block if ANY resolved IP is in a private/reserved range (all A/AAAA records)
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      return { ok: false, reason: 'blocked_private_ip', detail: `resolved to ${addr}` };
    }
  }

  return { ok: true, resolvedIps: addresses };
}
