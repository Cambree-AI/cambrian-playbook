// api-aws/contact/index.js
//
// Pilot AWS port of api/contact.js (issue #86) — enterprise/invoice inquiry
// form. Logic is a line-for-line copy of the Vercel handler wrapped in the
// shared adapter; keep the two in sync until the Vercel copy is removed in
// the final conversion issue. Response parity is asserted by
// tests/api-aws/contact.test.js against a mocked Supabase REST API.
//
// Differences from the Vercel copy (both platform-level, see shared/guard.js):
//   - no in-memory checkRateLimit — API Gateway stage throttling covers spam
//   - SUPABASE_SERVICE_KEY arrives via Secrets Manager at cold start

import { httpAdapter } from "../shared/adapter.js";
import { applyCors, isAllowedOrigin } from "../shared/guard.js";
import { logUsageRow } from "../shared/usage.js";
import { loadSecrets } from "../shared/secrets.js";

// Basic email format validation
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function contactHandler(req, res) {
  await loadSecrets(); // populates SUPABASE_SERVICE_KEY on cold start
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  if (req.method !== "POST") return res.status(405).end();

  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Origin not allowed" });

  const { name, email, company, interest, message } = req.body || {};
  if (!name || !email || !company) return res.status(400).json({ error: "Name, email, and company are required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Invalid email format" });
  // Cap field lengths to prevent abuse
  if (name.length > 200 || email.length > 254 || company.length > 200 || (message && message.length > 5000)) {
    return res.status(400).json({ error: "Input too long" });
  }

  const interestLabels = {
    enterprise: "Enterprise pricing",
    invoice: "Invoice / PO for procurement",
    security: "Security & compliance documentation",
    demo: "Product demo",
    other: "Other inquiry",
  };
  const interestLabel = interestLabels[interest] || interest || "General inquiry";
  const timestamp = new Date().toISOString();

  // Log the inquiry to api_usage_log for admin visibility. Awaited (not
  // fire-and-forget) because Lambda may freeze the instance the moment the
  // response returns — a pending fetch would silently die.
  await logUsageRow({
    user_id: "contact-form",
    model: "enterprise-inquiry",
    input_tokens: 0,
    output_tokens: 0,
    web_searches: 0,
    endpoint: JSON.stringify({ name, email, company, interest: interestLabel, message: message || "", timestamp }),
  }, { wait: true });

  res.json({
    ok: true,
    message: `Thanks, ${name}! We've received your inquiry about ${interestLabel.toLowerCase()} for ${company}. We'll be in touch within 1 business day at ${email}.`,
  });
}

export const handler = httpAdapter(contactHandler);
