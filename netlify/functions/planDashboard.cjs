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

function safeJsonParse(text) {
  const cleaned = stripCodeFences(text);
  const jsonText = extractJsonObject(cleaned);
  return { cleaned, jsonText, value: JSON.parse(jsonText) };
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function isStringArray(x) {
  return Array.isArray(x) && x.every((v) => isNonEmptyString(v));
}

function isValidMetric(x) {
  return isNonEmptyString(x) || isStringArray(x);
}

function validateDashboardConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return "dashboardConfig is not an object";
  if (!isNonEmptyString(cfg.industryType)) return "industryType is required";
  if (!Array.isArray(cfg.pages) || cfg.pages.length < 1) return "pages must be an array";
  if (!cfg.mockData || typeof cfg.mockData !== "object") return "mockData is required";

  for (const p of cfg.pages) {
    if (!p || typeof p !== "object") return "page is not an object";
    if (!isNonEmptyString(p.id) || !isNonEmptyString(p.title)) return "page.id and page.title are required";
    if (!Array.isArray(p.widgets) || p.widgets.length < 1) return page must have widgets;
    for (const w of p.widgets) {
      if (!w || typeof w !== "object") return "widget is not an object";
      if (!isNonEmptyString(w.id) || !isNonEmptyString(w.type) || !isNonEmptyString(w.title)) return "widget.id, widget.type, widget.title are required";
      if (!isValidMetric(w.metric)) return widget must include metric;
    }
  }

  if (!cfg.metricDefinitions || typeof cfg.metricDefinitions !== "object") return "metricDefinitions is required";

  return null;
}

function validateNarrativeAngle(x) {
  if (!x || typeof x !== "object") return "narrativeAngle is required";
  if (!isNonEmptyString(x.primaryAngle)) return "narrativeAngle.primaryAngle is required";
  return null;
}

function validateStoryPack(x) {
  if (!x || typeof x !== "object") return "storyPack is required";
  if (!isNonEmptyString(x.execHeadline)) return "storyPack.execHeadline is required";
  if (!Array.isArray(x.hardDiagnoses) || x.hardDiagnoses.length < 1) return "storyPack.hardDiagnoses must be an array";
  return null;
}

function validatePlan(out) {
  if (!out || typeof out !== "object") return "output is not an object";
  const cfgErr = validateDashboardConfig(out.dashboardConfig);
  if (cfgErr) return cfgErr;
  const angleErr = validateNarrativeAngle(out.narrativeAngle);
  if (angleErr) return angleErr;
  const storyErr = validateStoryPack(out.storyPack);
  if (storyErr) return storyErr;
  return null;
}

function buildPrimaryPrompt({ companyName, classification, researchText, opsProfile }) {
  return (
    You design customer-specific WMS pre-sales dashboards for warehouse and logistics leadership.\n +
    Analyze the company and create a FULLY CUSTOM dashboard with relevant KPIs.\n +
    NO TEMPLATES. Define ALL metrics dynamically based on the company's operations.\n\n +
    Return ONLY valid JSON (no markdown, no commentary).\n\n +
    CRITICAL RULES:\n +
    - Define 10-15 warehouse KPIs relevant to THIS company\n +
    - Create 2-3 pages with 4-6 widgets each\n +
    - For EVERY metric you use, define it in metricDefinitions\n +
    - metricDefinitions MUST include: unitType (count|percent|currency|duration), expectedRange [min,max], directionality (higher_better|lower_better)\n +
    - Only use metrics you've defined in metricDefinitions\n +
    - Widget types: kpi, line, bar, table\n +
    - Table metrics must start with "tables."\n\n +
    JSON shape:\n +
    {\n +
      "dashboardConfig": {\n +
        "industryType": string,\n +
        "subVertical": string,\n +
        "pages": [{\"id\":string, \"title\":string, \"widgets\":[{\"id\":string, \"type\":string, \"title\":string, \"metric\":string|[string], \"description\":string}]}],\n +
        "mockData": {"months": 12, "seed": 12345},\n +
        "metricDefinitions": {"<metricKey>": {"unitType":"count|percent|currency|duration", "expectedRange":[min,max], "directionality":"higher_better|lower_better", "seasonality":"none|mild|strong", "volatility":"low|med|high"}}\n +
      },\n +
      "narrativeAngle": {"primaryAngle": string, "rationaleBullets": [string]},\n +
      "storyPack": {"execHeadline": string, "hardDiagnoses": [{"assertion": string, "evidenceWidgetIds": [string], "wmsFix": [string], "howToVerify": [string]}]}\n +
    }\n\n +
    Company: \n +
    (classification ? Classification: \n : "") +
    (researchText ? Research:\n\n : "")
  );
}

async function getPlanWithRetry({ apiKey, model, system, companyName, classification, researchText, opsProfile }) {
  const user1 = buildPrimaryPrompt({ companyName, classification, researchText, opsProfile });
  const raw1 = await anthropicMessages({ apiKey, model, system, user: user1, maxTokens: 4096, timeoutMs: 35000 });
  const parsed = safeJsonParse(raw1);
  const err = validatePlan(parsed.value);
  if (err) throw new Error(Validation failed: . Raw: );
  return { out: parsed.value, attempts: 1 };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };
  try {
    const req = event.body ? JSON.parse(event.body) : {};
    const companyName = String(req.companyName || "").trim();
    const classification = req.classification || null;
    const opsProfile = req.opsProfile || null;
    const researchText = String(req.researchText || "").trim();
    const apiKey = String(req.apiKey || process.env.ANTHROPIC_API_KEY || "").trim();

    if (!companyName) return json(400, { error: "companyName is required" });
    if (!apiKey) return json(500, { error: "Missing ANTHROPIC_API_KEY" });

    const model = "claude-3-haiku-20240307";
    const system = "You design WMS pre-sales dashboards for warehouse operations.";

    const resp = await getPlanWithRetry({ apiKey, model, system, companyName, classification, researchText, opsProfile });
    
    return json(200, {
      dashboardConfig: resp.out.dashboardConfig,
      narrativeAngle: resp.out.narrativeAngle,
      storyPack: resp.out.storyPack,
      attempts: resp.attempts
    });
  } catch (e) {
    return json(500, { error: e && e.message ? e.message : String(e) });
  }
};
