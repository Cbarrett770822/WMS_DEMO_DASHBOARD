const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST,OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

async function anthropicMessages({ apiKey, model, system, user, maxTokens = 800, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: system || "",
        messages: [{ role: "user", content: user }]
      }),
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Anthropic error ${res.status}: ${text}`);
    }

    const data = JSON.parse(text);
    const out = (data?.content || []).map((c) => c?.text || "").join("\n");
    return out;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { json, anthropicMessages, HEADERS };
