const { json, anthropicMessages, HEADERS } = require("./_anthropic.cjs");

function stripCodeFences(text) {
  const t = String(text || "").trim();
  if (!t.startsWith("```")) return t;
  const withoutStart = t.replace(/^```[a-zA-Z]*\s*/, "");
  return withoutStart.replace(/\s*```\s*$/, "").trim();
}

function extractJsonObject(text) {
  const t = String(text || "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };
  try {
    const req = event.body ? JSON.parse(event.body) : {};
    const companyName = String(req.companyName || "").trim();
    const researchText = String(req.researchText || "").trim();
    const apiKey = String(req.apiKey || process.env.ANTHROPIC_API_KEY || "").trim();

    if (!companyName) return json(400, { error: "companyName is required" });
    if (!apiKey) return json(500, { error: "Missing ANTHROPIC_API_KEY env var." });

    const model = "claude-3-haiku-20240307";
    const system = "You classify companies for warehouse and logistics dashboards.";

    const user =
      `Classify the company into an industry + sub-vertical for warehouse/logistics dashboards.\n\n` +
      `Return ONLY valid JSON (no markdown, no commentary, no code fences).\n` +
      `The response MUST be a single JSON object.\n\n` +
      `Return exactly this shape:\n` +
      `{\n` +
      `  \"industry\": \"3PL\" or \"Distribution\",\n` +
      `  \"subVertical\": string,\n` +
      `  \"confidence\": number,\n` +
      `  \"rationale\": string[]\n` +
      `}\n\n` +
      `Allowed subVertical examples:\n` +
      `- 3PL: EcomFulfillment3PL, B2BDistribution3PL, ColdChain3PL\n` +
      `- Distribution: WholesaleDistribution, RetailDC, MROPartsDistribution\n\n` +
      `Company: ${companyName}\n\n` +
      (researchText ? `Research:\n${researchText}\n\n` : "") +
      `Rules:\n- confidence must be 0 to 1\n- rationale must be 3-6 short strings`;

    const raw = await anthropicMessages({ apiKey, model, system, user, maxTokens: 400, timeoutMs: 20000 });
    const cleaned = stripCodeFences(raw);
    const jsonText = extractJsonObject(cleaned);

    let classification;
    try {
      classification = JSON.parse(jsonText);
    } catch (parseErr) {
      return json(500, {
        error: "Failed to parse classification JSON from model output",
        details: {
          message: parseErr instanceof Error ? parseErr.message : String(parseErr),
          raw: String(raw || "").slice(0, 6000),
          extracted: String(jsonText || "").slice(0, 6000)
        }
      });
    }

    return json(200, { classification });
  } catch (e) {
    return json(500, { error: e && e.message ? e.message : String(e) });
  }
};