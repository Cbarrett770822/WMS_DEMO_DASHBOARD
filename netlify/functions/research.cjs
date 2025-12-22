const { json, anthropicMessages, HEADERS } = require("./_anthropic.cjs");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };
  try {
    const req = event.body ? JSON.parse(event.body) : {};
    const companyName = String(req.companyName || "").trim();
    const notes = String(req.notes || "").trim();
    const apiKey = String(req.apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
    if (!companyName) return json(400, { error: "companyName is required" });
    if (!apiKey) return json(500, { error: "Missing ANTHROPIC_API_KEY env var." });

    const model = "claude-3-haiku-20240307";
    const system = "You are a supply chain and warehouse operations pre-sales consultant.";
    const notesBlock = notes ? `\n\nDISCOVERY NOTES (INPUT):\n${notes}\n` : "";
    const user =
      `Write a structured plain-text research brief for "${companyName}". Output MUST be plain text only (no markdown).\n\n` +
      `Use EXACTLY this template:\n` +
      `1) COMPANY OVERVIEW\n- ...\n` +
      `2) LIKELY SUPPLY CHAIN / FULFILLMENT PROFILE\n- Channels: ...\n- Regions: ...\n- Facilities: ...\n- Seasonality: ...\n` +
      `3) WAREHOUSE OPERATIONS ASSUMPTIONS\n- Receiving: ...\n- Putaway: ...\n- Picking: ...\n- Packing: ...\n- Shipping: ...\n` +
      `4) KPIs THAT WILL MATTER (10-15)\n- ...\n` +
      `5) TOP RISKS / PAIN POINTS (5)\n- ...\n` +
      `6) QUESTIONS TO VALIDATE (8)\n- ...\n\n` +
      `Rules:\n- Use '-' for bullets only.\n- Keep bullets short (<= 1 line).\n- No long paragraphs.` +
      notesBlock;

    const text = await anthropicMessages({ apiKey, model, system, user, maxTokens: 900, timeoutMs: 20000 });
    return json(200, { text });
  } catch (e) {
    return json(500, { error: e.message || String(e) });
  }
};
