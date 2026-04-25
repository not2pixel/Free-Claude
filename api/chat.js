// api/chat.js — Vercel Edge Function
// Supports Groq and OpenRouter with SSE streaming
// Set GROQ_API_KEY and OPENROUTER_API_KEY in Vercel Environment Variables

export const config = { runtime: "edge" };

const ENDPOINTS = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { messages, model, provider, system } = body;

  if (!messages || !model || !provider) {
    return json({ error: "Missing required fields: messages, model, provider" }, 400);
  }

  const apiKey =
    provider === "groq"
      ? process.env.GROQ_API_KEY
      : provider === "openrouter"
      ? process.env.OPENROUTER_API_KEY
      : null;

  if (!apiKey) {
    return json(
      {
        error: `No API key found for provider "${provider}". Add ${
          provider === "groq" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY"
        } to your Vercel environment variables.`,
      },
      500
    );
  }

  const url = ENDPOINTS[provider];
  if (!url) return json({ error: `Unknown provider: ${provider}` }, 400);

  const fullMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  const extraHeaders =
    provider === "openrouter"
      ? {
          "HTTP-Referer": "https://openclaude.vercel.app",
          "X-Title": "OpenClaude",
        }
      : {};

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      let msg = text;
      try {
        msg = JSON.parse(text)?.error?.message || text;
      } catch {}
      return json({ error: `Upstream error (${upstream.status}): ${msg}` }, upstream.status);
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return json({ error: `Fetch failed: ${err.message}` }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
