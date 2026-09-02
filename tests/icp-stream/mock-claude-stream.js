// tests/icp-stream/mock-claude-stream.js — mock of the live /api/claude-stream
// service (the Anthropic SSE proxy). Builds real Response objects whose body is
// a ReadableStream emitting Anthropic Messages API SSE events, so the stream
// transport in src/lib/icpStream.js is exercised exactly as in prod — byte
// chunking, event framing, [DONE] terminator — with zero network access and
// zero API spend.

const encoder = new TextEncoder();

export function sseFrame(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// Standard event sequence for a text completion, mirroring what the proxy
// relays from Anthropic: message_start → content_block_start → N deltas →
// content_block_stop → message_delta (carries stop_reason + output_tokens).
export function claudeTextEvents(text, { stopReason = "end_turn", outputTokens = 250, pieces = 8 } = {}) {
  const events = [
    { type: "message_start", message: { id: "msg_mock", model: "claude-sonnet-4-6", usage: { input_tokens: 1200 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  ];
  const step = Math.max(1, Math.ceil(text.length / pieces));
  for (let i = 0; i < text.length; i += step) {
    events.push({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + step) } });
  }
  events.push({ type: "content_block_stop", index: 0 });
  events.push({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } });
  events.push({ type: "message_stop" });
  return events;
}

// Builds the Response a caller of /api/claude-stream would receive.
// chunkSize deliberately misaligns byte chunks with SSE frame boundaries so the
// buffering logic in consumeClaudeSse is genuinely tested.
export function mockClaudeStreamResponse(events, { chunkSize = 17, status = 200, extraRaw = "" } = {}) {
  const raw = events.map(sseFrame).join("") + extraRaw + "data: [DONE]\n\n";
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < raw.length; i += chunkSize) {
        controller.enqueue(encoder.encode(raw.slice(i, i + chunkSize)));
      }
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "Content-Type": "text/event-stream" } });
}

// fetch-shaped mock for the whole service: returns a function with the same
// call signature as fetch("/api/claude-stream", init) that resolves to the SSE
// Response above and records the request body for assertions.
export function mockClaudeStreamService(events, opts = {}) {
  const calls = [];
  const service = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    return mockClaudeStreamResponse(events, opts);
  };
  service.calls = calls;
  return service;
}
