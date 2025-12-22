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

function isNumberInRange(x, min, max) {
  return typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
}

function validateDashboardConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return "dashboardConfig is not an object";
  if (!(cfg.template === "3PL" || cfg.template === "Distribution")) return "template must be '3PL' or 'Distribution'";
  if (!isNonEmptyString(cfg.subVertical)) return "subVertical is required";
  if (!Array.isArray(cfg.pages) || cfg.pages.length < 2) return "pages must be an array with at least 2 pages";
  if (!cfg.mockData || typeof cfg.mockData !== "object") return "mockData is required";
  if (typeof cfg.mockData.months !== "number" || typeof cfg.mockData.seed !== "number") return "mockData.months and mockData.seed must be numbers";

  for (const p of cfg.pages) {
    if (!p || typeof p !== "object") return "page is not an object";
    if (!isNonEmptyString(p.id) || !isNonEmptyString(p.title)) return "page.id and page.title are required";
    if (!Array.isArray(p.widgets) || p.widgets.length < 8) return `page ${p.id || "?"} must have widgets`;
    for (const w of p.widgets) {
      if (!w || typeof w !== "object") return "widget is not an object";
      if (!isNonEmptyString(w.id) || !isNonEmptyString(w.type) || !isNonEmptyString(w.title)) return "widget.id, widget.type, widget.title are required";
      if (!isValidMetric(w.metric) || !isNonEmptyString(w.description)) return `widget ${w.id || "?"} must include metric and description`;
    }
  }

  return null;
}

function validateNarrativeAngle(x) {
  if (!x || typeof x !== "object") return "narrativeAngle is required";
  if (!isNonEmptyString(x.primaryAngle)) return "narrativeAngle.primaryAngle is required";
  if (!isStringArray(x.rationaleBullets) || x.rationaleBullets.length < 2) return "narrativeAngle.rationaleBullets must be string[]";
  return null;
}

function validateStoryPack(x) {
  if (!x || typeof x !== "object") return "storyPack is required";
  if (!isNonEmptyString(x.execHeadline)) return "storyPack.execHeadline is required";
  if (!Array.isArray(x.hardDiagnoses) || x.hardDiagnoses.length < 2) return "storyPack.hardDiagnoses must be an array";
  for (const d of x.hardDiagnoses) {
    if (!d || typeof d !== "object") return "storyPack.hardDiagnoses entry must be an object";
    if (!isNonEmptyString(d.assertion)) return "storyPack.hardDiagnoses.assertion is required";
    if (!isStringArray(d.evidenceWidgetIds) || d.evidenceWidgetIds.length < 1) return "storyPack.hardDiagnoses.evidenceWidgetIds must be string[]";
    if (!isStringArray(d.howToVerify) || d.howToVerify.length < 1) return "storyPack.hardDiagnoses.howToVerify must be string[]";
    if (!isStringArray(d.wmsFix) || d.wmsFix.length < 1) return "storyPack.hardDiagnoses.wmsFix must be string[]";
  }
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

function toKebab(x) {
  return String(x || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqId(base, existing) {
  let id = toKebab(base);
  if (!id) id = "widget";
  if (!existing.has(id)) {
    existing.add(id);
    return id;
  }
  for (let i = 2; i < 1000; i++) {
    const next = `${id}-${i}`;
    if (!existing.has(next)) {
      existing.add(next);
      return next;
    }
  }
  const fallback = `${id}-${Date.now()}`;
  existing.add(fallback);
  return fallback;
}

function collectIds(cfg) {
  const s = new Set();
  for (const p of cfg.pages || []) {
    if (p && p.id) s.add(String(p.id));
    for (const w of p.widgets || []) {
      if (w && w.id) s.add(String(w.id));
    }
  }
  return s;
}

function addWidget(page, widget, existingIds) {
  const w = { ...widget };
  w.id = uniqId(w.id || w.title || "widget", existingIds);
  page.widgets = Array.isArray(page.widgets) ? page.widgets : [];
  page.widgets.push(w);
}

function ensurePage(cfg, id, title) {
  cfg.pages = Array.isArray(cfg.pages) ? cfg.pages : [];
  let p = cfg.pages.find((x) => x && x.id === id);
  if (!p) {
    p = { id, title, widgets: [] };
    cfg.pages.push(p);
  }
  if (!p.widgets) p.widgets = [];
  return p;
}

function augmentDashboardConfig(inputCfg, researchText) {
  const cfg = JSON.parse(JSON.stringify(inputCfg || {}));
  cfg.pages = Array.isArray(cfg.pages) ? cfg.pages : [];

  const rt = String(researchText || "").toLowerCase();
  const focus = {
    labor: /labor|uph|productivity|staffing|overtime|shift/.test(rt),
    inventory: /inventory|cycle count|cycle-count|accuracy|shrink|aging/.test(rt),
    quality: /damage|defect|quality|claims/.test(rt),
    returns: /returns|reverse logistics|rma/.test(rt),
    backlog: /backlog|late|past due|aging/.test(rt),
    carrier: /carrier|parcel|ltl|ftl|freight|on-time delivery|shipping cost/.test(rt),
    receiving: /receiving|inbound|dock-to-stock|dock to stock|putaway/.test(rt)
  };

  const existingIds = collectIds(cfg);

  const executive = cfg.pages.find((p) => p && p.id === "executive") || ensurePage(cfg, "executive", "Executive");
  addWidget(
    executive,
    { id: "kpi-inbound-receipts", type: "kpi", title: "Inbound Receipts", metric: "inboundReceipts", description: "Inbound receipts per month" },
    existingIds
  );
  addWidget(
    executive,
    { id: "kpi-outbound-shipments", type: "kpi", title: "Outbound Shipments", metric: "outboundShipments", description: "Outbound shipments per month" },
    existingIds
  );
  addWidget(executive, { id: "trend-otif", type: "line", title: "OTIF Trend", metric: "otif", description: "On-time in-full (%) trend" }, existingIds);

  const service = cfg.pages.find((p) => p && p.id === "service") || ensurePage(cfg, "service", "Service");
  addWidget(service, { id: "kpi-pick-accuracy", type: "kpi", title: "Pick Accuracy", metric: "pickAccuracyPct", description: "Picking accuracy (%)" }, existingIds);
  if (focus.backlog) {
    addWidget(
      service,
      { id: "trend-orders-vs-backlog", type: "line", title: "Orders vs Backlog", metric: ["orders", "backlogOrders"], description: "Monthly orders compared to backlog" },
      existingIds
    );
  }

  const productivity = cfg.pages.find((p) => p && p.id === "productivity") || ensurePage(cfg, "productivity", "Productivity");
  if (focus.labor) {
    addWidget(productivity, { id: "kpi-uph", type: "kpi", title: "Units per Hour (UPH)", metric: "uph", description: "Units per labor hour" }, existingIds);
    addWidget(productivity, { id: "bar-units-labor", type: "bar", title: "Units vs Labor Hours", metric: ["units", "laborHours"], description: "Output compared to labor input" }, existingIds);
  }

  const inventoryQuality =
    cfg.pages.find((p) => p && (p.id === "inventory-quality" || p.id === "inventory" || p.id === "quality")) ||
    ensurePage(cfg, "inventory-quality", "Inventory/Quality");
  addWidget(
    inventoryQuality,
    { id: "kpi-utilization", type: "kpi", title: "Space Utilization", metric: "utilizationPct", description: "Facility utilization (%)" },
    existingIds
  );
  if (focus.inventory) {
    addWidget(
      inventoryQuality,
      { id: "kpi-cycle-count", type: "kpi", title: "Cycle Count Accuracy", metric: "cycleCountAccuracyPct", description: "Inventory record accuracy (%)" },
      existingIds
    );
  }
  if (focus.receiving) {
    addWidget(
      inventoryQuality,
      { id: "kpi-dock-to-stock", type: "kpi", title: "Dock-to-Stock (hrs)", metric: "dockToStockHrs", description: "Inbound to available inventory" },
      existingIds
    );
  }

  const exceptions = cfg.pages.find((p) => p && p.id === "exceptions") || ensurePage(cfg, "exceptions", "Exceptions");
  if (focus.returns) {
    addWidget(exceptions, { id: "kpi-returns-rate", type: "kpi", title: "Returns Rate", metric: "returnsRatePct", description: "Returns as % of shipped" }, existingIds);
  }
  if (focus.quality) {
    addWidget(exceptions, { id: "kpi-damage-rate", type: "kpi", title: "Damage Rate", metric: "damagePct", description: "Damage as % of shipped" }, existingIds);
  }

  const reports = ensurePage(cfg, "reports", "Reports");
  addWidget(reports, { id: "report-sla", type: "table", title: "SLA by Customer", metric: "tables.slaByCustomer", description: "OTIF and delays by customer" }, existingIds);
  addWidget(reports, { id: "report-backlog", type: "table", title: "Backlog Aging", metric: "tables.backlogAging", description: "Backlog age distribution" }, existingIds);
  addWidget(reports, { id: "report-exceptions", type: "table", title: "Exceptions Summary", metric: "tables.exceptionsSummary", description: "Open exceptions and worst sites" }, existingIds);
  if (focus.inventory) {
    addWidget(reports, { id: "report-inventory-aging", type: "table", title: "Inventory Aging", metric: "tables.inventoryAging", description: "Inventory age/value distribution" }, existingIds);
  }
  if (focus.labor) {
    addWidget(reports, { id: "report-labor", type: "table", title: "Labor Productivity", metric: "tables.laborProductivityByShift", description: "UPH by shift vs target" }, existingIds);
  }
  if (focus.carrier) {
    addWidget(reports, { id: "report-carrier", type: "table", title: "Carrier Performance", metric: "tables.carrierPerformance", description: "Carrier on-time/damage/cost" }, existingIds);
  }

  return cfg;
}

function buildPrimaryPrompt({ companyName, classification, researchText, opsProfile }) {
  return (
    `You design customer-specific WMS pre-sales dashboards for warehouse and logistics leadership.\n` +
    `Audience: COO/VP Ops AND DC/Warehouse Managers.\n` +
    `Tone: executive-direct hard diagnosis (Mode 2).\n\n` +
    `Return ONLY valid JSON (no markdown, no commentary, no code fences).\n` +
    `The response MUST be a single JSON object with exactly these keys: dashboardConfig, narrativeAngle, storyPack.\n\n` +
    `HARD RULES:\n` +
    `- This is a LOGISTICS / WAREHOUSE (WMS) dashboard. Keep everything warehouse-execution anchored.\n` +
    `- EXACTLY 2 pages with EXACTLY 8 widgets per page.\n` +
    `- Include capacity metrics.\n` +
    `- Concise titles/descriptions.\n` +
    `- ids must be kebab-case and unique.\n` +
    `- Each widget: explanation, storyRole.\n` +
    `- Diagnoses need evidence.\n` +
    `- Prefer charts/tables that show WHY, not only WHAT.\n\n` +
    `dashboardConfig JSON shape:\n` +
    `{\n` +
    `  \"template\": \"3PL\" or \"Distribution\",\n` +
    `  \"subVertical\": string,\n` +
    `  \"pages\": [\n` +
    `    {\"id\":string, \"title\":string, \"widgets\":[\n` +
    `      {\"id\":string, \"type\":\"kpi\"|\"line\"|\"bar\"|\"table\", \"title\":string, \"metric\":string|[string], \"description\":string, \"storyRole\":string, \"explanation\":string}\n` +
    `    ]}\n` +
    `  ],\n` +
    `  \"mockData\": {\"months\": 12, \"seed\": 12345},\n` +
    `  "metricDefinitions": {"<key>": {"unitType":"count|percent|currency", "expectedRange":[min,max], "volatility":"low|med|high"}}\n` +
    `  }\n` +
    `}\n\n` +
    `narrativeAngle JSON shape:\n` +
    `{\n` +
    `  \"primaryAngle\": \"throughput_capacity\"|\"inventory_truth_and_availability\"|\"service_reliability\"|\"exception_cost_drain\"|\"returns_reverse_logistics\"|\"compliance_traceability\",\n` +
    `  \"secondaryAngles\": string[],\n` +
    `  \"rationaleBullets\": string[]\n` +
    `}\n\n` +
    `storyPack JSON shape:\n` +
    `{\n` +
    `  \"execHeadline\": string,\n` +
    `  \"hardDiagnoses\": [\n` +
    `    {\"assertion\": string, \"evidenceWidgetIds\": string[], \"wmsFix\": string[], \"howToVerify\": string[]}\n` +
    `  ],\n` +
    `  \"opsPlaybook\": string[],\n` +
    `  \"expectedImpact\": string[]\n` +
    `}\n\n` +
    `Company: ${companyName}\n` +
    (classification ? `Classification: ${JSON.stringify(classification)}\n` : "") +
    ((opsProfile ? `OpsProfile: ${JSON.stringify(opsProfile).slice(0,800)}\n` : "")) +
    ((researchText ? `Research (plain text):\n${String(researchText).slice(0,1000)}\n` : ""))
  );
}

function buildRepairPrompt({ badJsonText }) {
  return (
    `You will be given an INVALID JSON string.\n` +
    `Your task: output a COMPLETE, VALID JSON object ONLY (no markdown, no commentary).\n` +
    `Do not omit required keys. Ensure arrays and objects are properly closed and all strings are quoted.\n\n` +
    `Required keys: dashboardConfig, narrativeAngle, storyPack.\n` +
    `dashboardConfig keys: template, subVertical, pages, mockData.\n` +
    `Each widget MUST include: id, type, title, metric, description, storyRole, explanation.\n\n` +
    `INVALID_JSON_START\n${String(badJsonText || "").slice(0, 12000)}\nINVALID_JSON_END\n`
  );
}


async function getPlanWithRetry({ apiKey, model, system, companyName, classification, researchText, opsProfile }) {
  const user1 = buildPrimaryPrompt({ companyName, classification, researchText, opsProfile });
  
  const raw1 = await anthropicMessages({ apiKey, model, system, user: user1, maxTokens: 4096, timeoutMs: 28000 });
  const parsed = safeJsonParse(raw1);
  const err = validatePlan(parsed.value);
  if (err) throw new Error(`Validation failed: ${err}. Raw: ${String(raw1).slice(0, 600)}`);
  
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
    if (!apiKey) return json(500, { error: "Missing ANTHROPIC_API_KEY env var." });

    const model = "claude-3-haiku-20240307";
    const system = "You design WMS pre-sales dashboards for warehouse and supply chain operations.";

    const resp = await getPlanWithRetry({ apiKey, model, system, companyName, classification, researchText, opsProfile });
    if (resp && resp.error) return json(500, resp);

    let dashboardConfig = resp.out.dashboardConfig;
    // Backward-compatible deterministic augmentation only when opsProfile is not available
    if (!opsProfile) dashboardConfig = augmentDashboardConfig(dashboardConfig, researchText);

    return json(200, {
      dashboardConfig,
      narrativeAngle: resp.out.narrativeAngle,
      storyPack: resp.out.storyPack,
      attempts: resp.attempts
    });
  } catch (e) {
    return json(500, { error: e && e.message ? e.message : String(e) });
  }
};

