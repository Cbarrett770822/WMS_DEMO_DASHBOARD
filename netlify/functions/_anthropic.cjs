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
  const maxRetries = 3;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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
        const isOverloaded = res.status === 529;
        const isRateLimit = res.status === 429;
        
        if ((isOverloaded || isRateLimit) && attempt < maxRetries - 1) {
          clearTimeout(t);
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        throw new Error(Anthropic error : );
      }

      const data = JSON.parse(text);
      const out = (data?.content || []).map((c) => c?.text || "").join("\n");
      clearTimeout(t);
      return out;
    } catch (error) {
      clearTimeout(t);
      lastError = error;
      
      if (attempt < maxRetries - 1 && (error.message.includes("529") || error.message.includes("429"))) {
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

module.exports = { json, anthropicMessages, HEADERS };
