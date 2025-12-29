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

function validateDashboardConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return "dashboardConfig is not an object";
  if (!cfg.industryType || typeof cfg.industryType !== "string") return "industryType is required";
  if (!Array.isArray(cfg.pages) || cfg.pages.length < 1) return "pages must be an array with at least 1 page";
  if (!cfg.mockData || typeof cfg.mockData !== "object") return "mockData is required";
  if (!cfg.metricDefinitions || typeof cfg.metricDefinitions !== "object") return "metricDefinitions is required";

  for (const p of cfg.pages) {
    if (!p || typeof p !== "object") return "page is not an object";
    if (!p.id || !p.title) return "page.id and page.title are required";
    if (!Array.isArray(p.widgets) || p.widgets.length < 1) return "page must have at least 1 widget";
    
    for (const w of p.widgets) {
      if (!w || typeof w !== "object") return "widget is not an object";
      if (!w.id || !w.type || !w.title) return "widget.id, widget.type, widget.title are required";
      if (!w.metric) return "widget.metric is required";
    }
  }

  return null;
}

function validatePlan(out) {
  if (!out || typeof out !== "object") return "output is not an object";
  const cfgErr = validateDashboardConfig(out.dashboardConfig);
  if (cfgErr) return cfgErr;
  if (!out.narrativeAngle || typeof out.narrativeAngle !== "object") return "narrativeAngle is required";
  if (!out.storyPack || typeof out.storyPack !== "object") return "storyPack is required";
  return null;
}

function buildPrompt({ companyName, classification, researchText }) {
  return `You are a WMS pre-sales dashboard designer. Analyze the company and create a FULLY CUSTOM dashboard.

CRITICAL: NO TEMPLATES. Define ALL metrics dynamically based on THIS specific company.

Company: ${companyName}
${classification ? `Classification: ${JSON.stringify(classification)}` : ""}
${researchText ? `Research:\n${String(researchText).slice(0, 1000)}` : ""}

Return ONLY valid JSON (no markdown, no commentary):

{
  "dashboardConfig": {
    "industryType": "string (e.g., 3PL, Distribution, Manufacturing, Pharmaceutical)",
    "subVertical": "string (specific industry segment)",
    "pages": [
      {
        "id": "kebab-case-id",
        "title": "Page Title",
        "widgets": [
          {
            "id": "kebab-case-widget-id",
            "type": "kpi|line|bar|table",
            "title": "Widget Title",
            "metric": "metricKey" or ["metric1", "metric2"],
            "description": "What this shows"
          }
        ]
      }
    ],
    "mockData": {"months": 12, "seed": 12345},
    "metricDefinitions": {
      "metricKey": {
        "unitType": "count|percent|currency|duration",
        "expectedRange": [min, max],
        "directionality": "higher_better|lower_better",
        "volatility": "low|med|high"
      }
    }
  },
  "narrativeAngle": {
    "primaryAngle": "string",
    "rationaleBullets": ["string"]
  },
  "storyPack": {
    "execHeadline": "string",
    "hardDiagnoses": [
      {
        "assertion": "string",
        "evidenceWidgetIds": ["widget-id"],
        "wmsFix": ["string"],
        "howToVerify": ["string"]
      }
    ]
  }
}

RULES:
- Define 10-15 warehouse KPIs relevant to THIS company
- Create 2-3 pages with 4-6 widgets each
- For EVERY metric you use, define it in metricDefinitions
- Table metrics must start with "tables."
- All IDs must be unique and kebab-case`;
}

async function getPlan({ apiKey, model, system, companyName, classification, researchText }) {
  const user = buildPrompt({ companyName, classification, researchText });
  const raw = await anthropicMessages({ apiKey, model, system, user, maxTokens: 4096, timeoutMs: 35000 });
  const parsed = safeJsonParse(raw);
  const err = validatePlan(parsed.value);
  if (err) throw new Error(`Validation failed: ${err}. Raw: ${String(raw).slice(0, 400)}`);
  return parsed.value;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };
  
  try {
    const req = event.body ? JSON.parse(event.body) : {};
    const companyName = String(req.companyName || "").trim();
    const classification = req.classification || null;
    const researchText = String(req.researchText || "").trim();
    const apiKey = String(req.apiKey || process.env.ANTHROPIC_API_KEY || "").trim();

    if (!companyName) return json(400, { error: "companyName is required" });
    if (!apiKey) return json(500, { error: "Missing ANTHROPIC_API_KEY" });

    const model = "claude-3-haiku-20240307";
    const system = "You design WMS pre-sales dashboards for warehouse operations.";

    const result = await getPlan({ apiKey, model, system, companyName, classification, researchText });
    
    return json(200, {
      dashboardConfig: result.dashboardConfig,
      narrativeAngle: result.narrativeAngle,
      storyPack: result.storyPack,
      attempts: 1
    });
  } catch (e) {
    return json(500, { error: e && e.message ? e.message : String(e) });
  }
};
