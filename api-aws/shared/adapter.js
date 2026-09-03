// api-aws/shared/adapter.js
/* global Buffer */
//
// Thin translation between API Gateway HTTP API (payload v2.0) events and the
// Vercel-style (req, res) handler shape the existing api/ functions use.
// Written once here so every endpoint port is a near-copy of its Vercel
// source — the port recipe in api-aws/README.md depends on this staying thin.
//
// Deliberately NOT covered (add only when an endpoint needs it):
//   - streaming responses (claude-stream stays on Vercel until Phase 4)
//   - multipart bodies

// Build a Vercel-like req from an APIGW v2 event. Header names arrive
// lowercased from API Gateway, matching what the handlers already expect.
export function eventToReq(event) {
  const headers = event.headers || {};
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");
  let body = rawBody;
  const ct = headers["content-type"] || "";
  if (rawBody && ct.includes("application/json")) {
    try { body = JSON.parse(rawBody); } catch { body = undefined; }
  }
  return {
    method: event.requestContext?.http?.method || "GET",
    url: event.rawPath || "/",
    headers,
    body,
    rawBody,
    // Vercel handlers read the client IP off the socket as a last resort;
    // API Gateway gives it to us authoritatively.
    socket: { remoteAddress: event.requestContext?.http?.sourceIp || "" },
  };
}

// A Vercel-like res that accumulates into an APIGW v2 response object.
export function makeRes() {
  const out = { statusCode: 200, headers: {}, body: "" };
  let finished = false;
  const res = {
    _result: out,
    _finished: () => finished,
    setHeader(name, value) { out.headers[name] = String(value); return res; },
    status(code) { out.statusCode = code; return res; },
    json(obj) {
      out.headers["Content-Type"] = "application/json";
      out.body = JSON.stringify(obj);
      finished = true;
      return res;
    },
    send(text) { out.body = String(text ?? ""); finished = true; return res; },
    end(text) { if (text != null) out.body = String(text); finished = true; return res; },
  };
  return res;
}

// Wraps a Vercel-style handler into an APIGW Lambda handler.
export function httpAdapter(handler) {
  return async (event) => {
    const req = eventToReq(event);
    const res = makeRes();
    try {
      await handler(req, res);
    } catch (e) {
      console.error("[adapter] handler threw:", e?.message || e);
      if (!res._finished()) res.status(500).json({ error: "internal error" });
    }
    return res._result;
  };
}
