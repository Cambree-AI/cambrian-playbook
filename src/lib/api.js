// lib/api.js — Anthropic API wrapper
// All Claude calls go through /api/claude serverless proxy

// API origin (issue #83). Unset/empty => relative paths (same-origin), so
// Vercel-served deploys are byte-identical in behavior. Amplify builds set
// VITE_API_URL to the Vercel API origin until the functions migrate to AWS.
export const API_BASE = import.meta.env.VITE_API_URL || "";

// Every client call to /api/* goes through this so the origin is switchable
// per deployment (and later per endpoint, when functions move to AWS).
export const apiFetch = (path, opts) => fetch(API_BASE + path, opts);

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function callAI(prompt, maxTok=1000){
  for(let attempt=0; attempt<3; attempt++){
    try{
      const r = await apiFetch("/api/claude",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-haiku-4-5-20251001",
          max_tokens:5500,
          system:"You are a JSON API. Output only valid JSON. Use only ASCII punctuation — no curly quotes, no em-dashes.",
          messages:[
            {role:"user",content:prompt},
            {role:"assistant",content:"{"},
          ],
        }),
      });
      const d = await r.json();
      if(d.error){
        if(d.error.type==="rate_limit_error"){
          console.warn("callAI rate limit, waiting 15s... attempt", attempt+1);
          await sleep(15000);
          continue;
        }
        console.error("callAI error:",d.error);
        return null;
      }
      const raw=(d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      if(!raw) return null;
      // If model already included the opening {, don't double up
      const text = raw.startsWith("{") ? raw : "{" + raw;
      console.log("callAI response chars:", text.length, "preview:", text.slice(0,80));

      const last = text.lastIndexOf("}");
      if(last<=0) return null;

      const candidate = text.slice(0, last+1);

      // Try 1: direct parse
      try{return JSON.parse(candidate);}catch{}

      // Try 2: unicode-only sanitize + trailing comma removal
      const sanitized = candidate
        .replace(/[\u2018\u2019]/g,"'")
        .replace(/[\u201C\u201D]/g,'"')
        .replace(/[\u2013\u2014]/g,"-")
        .replace(/[\u2026]/g,"...")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"")
        .replace(/,\s*([}\]])/g,"$1"); // strip trailing commas
      try{return JSON.parse(sanitized);}catch{}

      // Try 3: full character-by-character JSON repair
      // - Escapes unescaped double quotes INSIDE string values
      // - Escapes raw newlines only inside strings (structural newlines left as-is)
      // - Correct peek-ahead that skips escape sequences
      const repairJSON = s => {
        let out="", inStr=false, esc=false;
        for(let i=0;i<s.length;i++){
          const ch=s[i];
          if(esc){out+=ch;esc=false;continue;}
          if(ch==="\\"){out+=ch;esc=true;continue;}
          if(inStr){
            if(ch==="\n"){out+="\\n";continue;} // raw newline inside string → escape
            if(ch==="\r"){out+="\\r";continue;}
            if(ch==="\t"){out+="\\t";continue;}
            if(ch==='"'){
              // Peek ahead past whitespace+escape-seqs to classify this quote
              let j=i+1;
              while(j<s.length){
                if(s[j]==="\n"||s[j]==="\r"||s[j]===" "||s[j]==="\t"){j++;continue;}
                if(s[j]==="\\"){j+=2;continue;} // skip escape sequence
                break;
              }
              const nxt=j<s.length?s[j]:"";
              if(nxt===","||nxt==="}"||nxt==="]"||nxt===":"||nxt===""){
                inStr=false;out+=ch; // legitimate closing quote
              }else{
                out+='\\"'; // interior quote — escape it
              }
              continue;
            }
            out+=ch;
          }else{
            if(ch==='"'){inStr=true;out+=ch;continue;}
            out+=ch;
          }
        }
        return out;
      };
      try{return JSON.parse(repairJSON(sanitized));}catch(e){
        console.error("JSON repair failed:",e.message,"pos:",e.message.match(/\d+/)?.[0]);
        console.log("Sample:",sanitized.slice(Math.max(0,parseInt(e.message.match(/\d+/)?.[0]||0)-80),parseInt(e.message.match(/\d+/)?.[0]||0)+80));
      }

      return null;
    }catch(e){console.error("callAI fetch error:",e);return null;}
  }
  return null;
}

// ── GENERATE BRIEF ────────────────────────────────────────────────────────────

export async function callAIRaw(payload) {
  const r = await apiFetch("/api/claude", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function streamAI(prompt, onChunk, maxTok=2000) {
  const response = await apiFetch('/api/claude-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTok,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' }
      ],
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '{';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text;
          onChunk(fullText);
        }
      } catch {}
    }
  }

  try {
    const cleaned = fullText.trim();
    const lastBrace = cleaned.lastIndexOf('}');
    return JSON.parse(lastBrace > 0 ? cleaned.slice(0, lastBrace+1) : cleaned);
  } catch { return null; }
}
