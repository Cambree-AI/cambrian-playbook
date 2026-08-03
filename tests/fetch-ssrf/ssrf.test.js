#!/usr/bin/env node
// tests/fetch-ssrf/ssrf.test.js — SSRF unit tests for /api/fetch (HANDOFF_06 §6)
//
// Tests the validateUrl, isPrivateIp, and isBlockedHost functions directly
// with mocked DNS. No outbound network connections are made in this suite.
//
// Per HANDOFF_06 §6: assert rejection of private IPs, localhost, link-local,
// redirects-to-private, non-http schemes, and linkedin.com. Each case asserts
// the correct { ok: false, reason } — never a connection attempt.
//
// Usage: node tests/fetch-ssrf/ssrf.test.js
// Exit 0 = all green. Exit 1 = failures (do NOT proceed to 2b until green).

import {
  validateUrl,
  isPrivateIp,
  isPrivateIPv4,
  isPrivateIPv6,
  isBlockedHost,
  normalizeHostname,
} from '../../api/_fetch-ssrf.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failures.push(label);
    failed++;
  }
}

// ── DNS mock helpers ──────────────────────────────────────────────────────────
// Each mock simulates a different DNS resolution outcome — no network access.
const PUBLIC_IP = ['104.18.22.33'];  // Cloudflare CDN — definitively public

const dns = {
  public:       async () => PUBLIC_IP,
  localhost127: async () => ['127.0.0.1'],
  private192:   async () => ['192.168.1.100'],
  private10:    async () => ['10.0.0.1'],
  private172:   async () => ['172.16.0.1'],
  linkLocal:    async () => ['169.254.169.254'],  // AWS IMDSv1 cloud metadata
  ipv6loopback: async () => ['::1'],
  fail:         async () => null,  // simulate DNS resolution failure
};

async function run() {
  console.log('\n══ SSRF Unit Tests — /api/fetch (HANDOFF_06 §6) ══\n');

  // ── isPrivateIPv4: private range detection ────────────────────────────────
  console.log('isPrivateIPv4 — private ranges:');
  assert(isPrivateIPv4('10.0.0.1'),        '10.0.0.1 → private (RFC 1918)');
  assert(isPrivateIPv4('10.255.255.255'),   '10.255.255.255 → private (RFC 1918)');
  assert(isPrivateIPv4('172.16.0.1'),      '172.16.0.1 → private (RFC 1918)');
  assert(isPrivateIPv4('172.31.255.255'),  '172.31.255.255 → private (RFC 1918)');
  assert(isPrivateIPv4('192.168.0.1'),     '192.168.0.1 → private (RFC 1918)');
  assert(isPrivateIPv4('192.168.255.255'), '192.168.255.255 → private (RFC 1918)');
  assert(isPrivateIPv4('127.0.0.1'),       '127.0.0.1 → private (loopback)');
  assert(isPrivateIPv4('127.255.255.255'), '127.255.255.255 → private (loopback)');
  assert(isPrivateIPv4('169.254.169.254'), '169.254.169.254 → private (cloud metadata)');
  assert(isPrivateIPv4('169.254.0.1'),     '169.254.0.1 → private (link-local)');
  assert(isPrivateIPv4('0.0.0.0'),         '0.0.0.0 → private ("this network")');
  assert(isPrivateIPv4('0.255.255.255'),   '0.255.255.255 → private (0/8)');
  assert(isPrivateIPv4('100.64.0.1'),      '100.64.0.1 → private (CGNAT)');
  assert(isPrivateIPv4('100.127.255.255'), '100.127.255.255 → private (CGNAT)');
  assert(isPrivateIPv4('224.0.0.1'),       '224.0.0.1 → private (multicast)');
  assert(isPrivateIPv4('239.255.255.255'), '239.255.255.255 → private (multicast)');
  assert(isPrivateIPv4('255.255.255.255'), '255.255.255.255 → private (broadcast)');
  assert(isPrivateIPv4('240.0.0.1'),       '240.0.0.1 → private (reserved)');

  console.log('\nisPrivateIPv4 — public ranges (must NOT be blocked):');
  assert(!isPrivateIPv4('8.8.8.8'),        '8.8.8.8 → public (Google DNS)');
  assert(!isPrivateIPv4('1.1.1.1'),        '1.1.1.1 → public (Cloudflare)');
  assert(!isPrivateIPv4('104.18.22.33'),   '104.18.22.33 → public (Cloudflare CDN)');
  assert(!isPrivateIPv4('172.15.0.1'),     '172.15.0.1 → public (just below 172.16/12)');
  assert(!isPrivateIPv4('172.32.0.1'),     '172.32.0.1 → public (just above 172.31/12)');
  assert(!isPrivateIPv4('100.63.255.255'), '100.63.255.255 → public (just below CGNAT)');
  assert(!isPrivateIPv4('100.128.0.1'),    '100.128.0.1 → public (just above CGNAT)');
  assert(!isPrivateIPv4('223.255.255.255'),'223.255.255.255 → public (just below multicast)');

  // ── isPrivateIPv6: private range detection ────────────────────────────────
  console.log('\nisPrivateIPv6 — private ranges:');
  assert(isPrivateIPv6('::1'),             '::1 → private (loopback)');
  assert(isPrivateIPv6('[::1]'),           '[::1] → private (bracket form in URLs)');
  assert(isPrivateIPv6('::'),              ':: → private (unspecified)');
  assert(isPrivateIPv6('fc00::1'),         'fc00::1 → private (unique-local)');
  assert(isPrivateIPv6('fd12:3456::1'),    'fd12:3456::1 → private (unique-local)');
  assert(isPrivateIPv6('fdff::1'),         'fdff::1 → private (unique-local)');
  assert(isPrivateIPv6('fe80::1'),         'fe80::1 → private (link-local)');
  assert(isPrivateIPv6('fe8f::1'),         'fe8f::1 → private (link-local)');
  assert(isPrivateIPv6('fea0::1'),         'fea0::1 → private (link-local)');
  assert(isPrivateIPv6('febf::1'),         'febf::1 → private (link-local)');
  assert(isPrivateIPv6('ff02::1'),         'ff02::1 → private (multicast)');
  assert(isPrivateIPv6('ffff::1'),         'ffff::1 → private (multicast)');

  console.log('\nisPrivateIPv6 — public ranges (must NOT be blocked):');
  assert(!isPrivateIPv6('2606:4700::1'),   '2606:4700::1 → public (Cloudflare)');
  assert(!isPrivateIPv6('2001:4860::1'),   '2001:4860::1 → public (Google)');

  // ── isPrivateIp dispatch ──────────────────────────────────────────────────
  console.log('\nisPrivateIp dispatch:');
  assert(isPrivateIp('127.0.0.1'),         '127.0.0.1 → dispatches to IPv4 check');
  assert(isPrivateIp('::1'),               '::1 → dispatches to IPv6 check');
  assert(!isPrivateIp('8.8.8.8'),          '8.8.8.8 → public IPv4');
  assert(!isPrivateIp('2606:4700::1'),     '2606:4700::1 → public IPv6');

  // ── isBlockedHost ─────────────────────────────────────────────────────────
  console.log('\nisBlockedHost:');
  assert(isBlockedHost('linkedin.com'),        'linkedin.com → blocked');
  assert(isBlockedHost('LINKEDIN.COM'),         'LINKEDIN.COM → blocked (case-insensitive)');
  assert(isBlockedHost('www.linkedin.com'),     'www.linkedin.com → blocked');
  assert(isBlockedHost('sub.linkedin.com'),     'sub.linkedin.com → blocked (suffix match)');
  assert(isBlockedHost('lnkd.in'),             'lnkd.in → blocked');
  assert(!isBlockedHost('example.com'),         'example.com → not blocked');
  assert(!isBlockedHost('notlinkedin.com'),     'notlinkedin.com → not blocked');
  assert(!isBlockedHost('mylinkedinpage.com'),  'mylinkedinpage.com → not blocked (no suffix)');

  // ── validateUrl: scheme allowlist ─────────────────────────────────────────
  console.log('\nvalidateUrl — scheme allowlist:');
  {
    const r = await validateUrl('file:///etc/passwd', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'disallowed_scheme', 'file:///etc/passwd → disallowed_scheme');
  }
  {
    const r = await validateUrl('ftp://example.com/data', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'disallowed_scheme', 'ftp:// → disallowed_scheme');
  }
  {
    const r = await validateUrl('data:text/html,<h1>hi</h1>', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'disallowed_scheme', 'data: → disallowed_scheme');
  }
  {
    const r = await validateUrl('gopher://example.com', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'disallowed_scheme', 'gopher:// → disallowed_scheme');
  }
  {
    const r = await validateUrl('javascript:alert(1)', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'disallowed_scheme', 'javascript: → disallowed_scheme');
  }
  {
    const r = await validateUrl('ssh://user@host', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'disallowed_scheme', 'ssh:// → disallowed_scheme');
  }

  // ── validateUrl: credentials in URL ──────────────────────────────────────
  console.log('\nvalidateUrl — credentials in URL:');
  {
    const r = await validateUrl('https://user:pass@example.com/', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'disallowed_scheme', 'user:pass@host → disallowed_scheme');
  }
  {
    const r = await validateUrl('https://user@example.com/', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'disallowed_scheme', 'user@host (no pass) → disallowed_scheme');
  }

  // ── validateUrl: IP-literal private hosts (no DNS lookup) ────────────────
  console.log('\nvalidateUrl — IP-literal private hosts (blocked before DNS):');
  {
    const r = await validateUrl('http://127.0.0.1/path', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://127.0.0.1 → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://192.168.1.1/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://192.168.1.1 → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://10.0.0.1/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://10.0.0.1 → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://172.16.0.1/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://172.16.0.1 → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://169.254.169.254/latest/meta-data/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://169.254.169.254 (AWS cloud metadata) → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://0.0.0.0/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://0.0.0.0 → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://[::1]/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://[::1] → blocked_private_ip');
  }

  // ── validateUrl: DNS-resolved private IPs (DNS-rebinding guard) ───────────
  console.log('\nvalidateUrl — public hostnames resolving to private IPs:');
  {
    const r = await validateUrl('https://internal.corp.example.com/', { dnsLookup: dns.localhost127 });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'resolves to 127.0.0.1 → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://localhost/', { dnsLookup: dns.localhost127 });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'localhost → resolves to 127.0.0.1 → blocked_private_ip');
  }
  {
    const r = await validateUrl('https://internal.example.com/', { dnsLookup: dns.private192 });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'resolves to 192.168.x → blocked_private_ip');
  }
  {
    const r = await validateUrl('https://internal.example.com/', { dnsLookup: dns.private10 });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'resolves to 10.x → blocked_private_ip');
  }
  {
    const r = await validateUrl('https://internal.example.com/', { dnsLookup: dns.private172 });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'resolves to 172.16.x → blocked_private_ip');
  }
  {
    const r = await validateUrl('https://evil.example.com/', { dnsLookup: dns.linkLocal });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'resolves to 169.254.169.254 (cloud metadata) → blocked_private_ip');
  }
  {
    const r = await validateUrl('https://example.com/', { dnsLookup: dns.ipv6loopback });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'resolves to ::1 → blocked_private_ip');
  }

  // ── normalizeHostname unit tests ──────────────────────────────────────────
  // These verify the normalization function in isolation so failures are
  // clearly attributable to the normalization logic, not validateUrl's other checks.
  console.log('\nnormalizeHostname — inet_aton alternative forms:');
  assert(normalizeHostname('2130706433') === '127.0.0.1',    '2130706433 (decimal 32-bit) → 127.0.0.1');
  assert(normalizeHostname('0x7f000001') === '127.0.0.1',    '0x7f000001 (hex 32-bit) → 127.0.0.1');
  assert(normalizeHostname('0177.0.0.1') === '127.0.0.1',    '0177.0.0.1 (octal first octet) → 127.0.0.1');
  assert(normalizeHostname('0xc0a80101') === '192.168.1.1',  '0xc0a80101 (hex 192.168.1.1) → 192.168.1.1');
  assert(normalizeHostname('0xa9fea9fe') === '169.254.169.254', '0xa9fea9fe (hex cloud metadata) → 169.254.169.254');
  assert(normalizeHostname('0x7f.0.0.1') === '127.0.0.1',   '0x7f.0.0.1 (hex first octet) → 127.0.0.1');
  assert(normalizeHostname('127.0.0.1') === '127.0.0.1',     '127.0.0.1 (already canonical) → unchanged');
  assert(normalizeHostname('example.com') === 'example.com', 'example.com (domain) → unchanged');
  assert(normalizeHostname('octanner.com') === 'octanner.com', 'octanner.com (domain) → unchanged');
  assert(normalizeHostname('::1') === '::1',                  '::1 (IPv6) → unchanged');
  // 2-part form: a.b where b is 24-bit
  assert(normalizeHostname('0x7f.1') === '127.0.0.1',        '0x7f.1 (2-part: 0x7f prefix, b=1) → 127.0.0.1');

  // ── validateUrl: alternative IPv4 encoding ─────────────────────────────────
  // These use dns.fail — the normalization catches the private IP BEFORE DNS,
  // so dns.fail is passed but never called. Demonstrates normalization fires first.
  console.log('\nvalidateUrl — decimal/hex/octal IP encoding (SSRF bypass vectors):');
  {
    const r = await validateUrl('http://2130706433/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://2130706433 (decimal 127.0.0.1) → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://0x7f000001/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://0x7f000001 (hex 127.0.0.1) → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://0177.0.0.1/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://0177.0.0.1 (octal 127.0.0.1) → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://0xc0a80101/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://0xc0a80101 (hex 192.168.1.1) → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://0xa9fea9fe/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://0xa9fea9fe (hex 169.254.169.254 cloud metadata) → blocked_private_ip');
  }
  {
    const r = await validateUrl('http://0xc0a80001/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'blocked_private_ip', 'http://0xc0a80001 (hex 192.168.0.1) → blocked_private_ip');
  }

  // ── validateUrl: blocked hosts ────────────────────────────────────────────
  console.log('\nvalidateUrl — blocked hosts:');
  {
    const r = await validateUrl('https://www.linkedin.com/company/oc-tanner', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'blocked_host', 'linkedin.com → blocked_host');
  }
  {
    const r = await validateUrl('https://linkedin.com/in/someone', { dnsLookup: dns.public });
    assert(!r.ok && r.reason === 'blocked_host', 'linkedin.com profile → blocked_host');
  }

  // ── validateUrl: DNS resolution failure ──────────────────────────────────
  console.log('\nvalidateUrl — DNS failure:');
  {
    const r = await validateUrl('https://nonexistent-xyzzy-domain.example/', { dnsLookup: dns.fail });
    assert(!r.ok && r.reason === 'fetch_failed', 'DNS failure → fetch_failed (not a crash)');
  }

  // ── validateUrl: valid public URLs (should PASS) ─────────────────────────
  console.log('\nvalidateUrl — valid public URLs (must PASS):');
  {
    const r = await validateUrl('https://www.octanner.com/leadership', { dnsLookup: dns.public });
    assert(r.ok === true, 'octanner.com/leadership → ok:true');
  }
  {
    const r = await validateUrl('https://www.salesforce.com/company/leadership/', { dnsLookup: dns.public });
    assert(r.ok === true, 'salesforce.com/leadership → ok:true');
  }
  {
    const r = await validateUrl('https://company.com/about/leadership-team', { dnsLookup: dns.public });
    assert(r.ok === true, 'generic /about/leadership-team → ok:true');
  }
  {
    const r = await validateUrl('http://example.com/', { dnsLookup: dns.public });
    assert(r.ok === true, 'http:// (not https) to public host → ok:true (http is allowed)');
  }
  {
    const r = await validateUrl('https://example.com/', { dnsLookup: dns.public });
    assert(r.ok === true && Array.isArray(r.resolvedIps), 'resolvedIps returned on success');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n── Result: ${passed} passed, ${failed} failed ──\n`);

  if (failed > 0) {
    console.error('FAIL — SSRF suite has failures. Fix _fetch-ssrf.js before proceeding to 2b.\n');
    for (const f of failures) console.error('  ✗ ' + f);
    console.error('');
    process.exit(1);
  }

  console.log('PASS — SSRF suite green. Security layer validated. Proceed to 2b.\n');
  process.exit(0);
}

run().catch(err => {
  console.error('\nSSRF test runner fatal error:', err);
  process.exit(1);
});
