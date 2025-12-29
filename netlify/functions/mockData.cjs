const { json, HEADERS } = require("./_anthropic.cjs");

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(r, min, max) {
  return Math.floor(r() * (max - min + 1)) + min;
}

function randChoice(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}

function toKey(x) {
  return String(x || "").trim();
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function collectMonthlyMetricKeys(cfg) {
  const out = new Set();
  const pages = Array.isArray(cfg?.pages) ? cfg.pages : [];
  for (const p of pages) {
    const widgets = Array.isArray(p?.widgets) ? p.widgets : [];
    for (const w of widgets) {
      const m = w?.metric;
      const arr = Array.isArray(m) ? m : [m];
      for (const raw of arr) {
        const k = toKey(raw);
        if (!k) continue;
        if (k.startsWith("tables.")) continue;
        out.add(k);
      }
    }
  }

  const metricDefinitions = cfg?.metricDefinitions && typeof cfg.metricDefinitions === "object" ? cfg.metricDefinitions : null;
  if (metricDefinitions) {
    for (const k of Object.keys(metricDefinitions)) {
      const key = toKey(k);
      if (!key) continue;
      if (key.startsWith("tables.")) continue;
      out.add(key);
    }
  }

  return Array.from(out);
}

function isPctLikeMetric(key) {
  const k = String(key || "").toLowerCase();
  return k.includes("pct") || k.includes("percent") || k.includes("rate") || k.includes("accuracy") || k.includes("otif") || k.includes("on-time") || k.includes("ontime");
}

function isDurationLikeMetric(key) {
  const k = String(key || "").toLowerCase();
  return k.includes("hrs") || k.includes("hours") || k.includes("minutes") || k.includes("mins") || k.includes("duration") || k.includes("time") || k.includes("lead");
}

function isCurrencyLikeMetric(key) {
  const k = String(key || "").toLowerCase();
  return k.includes("cost") || k.includes("usd") || k.includes("$") || k.includes("price");
}

function normalizeTo01(x, min, max) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0.5;
  if (!(Number.isFinite(min) && Number.isFinite(max)) || max === min) return 0.5;
  return clamp((n - min) / (max - min), 0, 1);
}

function isBadDriverKey(k) {
  const s = String(k || "").toLowerCase();
  return /backlog|late|delay|damage|defect|return|hold|exception|cost|shrink|aging|overtime/.test(s);
}

function isGoodDriverKey(k) {
  const s = String(k || "").toLowerCase();
  return /accuracy|uph|throughput|units|shipments|on[-_ ]?time|otif|fill|productivity/.test(s);
}

function synthFromDefinition(r, key, def, ctx, monthIndex, months) {
  const unitType = String(def?.unitType || "").toLowerCase();
  const directionality = String(def?.directionality || "higher_better").toLowerCase();
  const expectedRange = Array.isArray(def?.expectedRange) ? def.expectedRange : null;
  const min = expectedRange && expectedRange.length === 2 ? Number(expectedRange[0]) : undefined;
  const max = expectedRange && expectedRange.length === 2 ? Number(expectedRange[1]) : undefined;

  const rangeMin = Number.isFinite(min) ? min : unitType === "percent" ? 85 : unitType === "currency" ? 3 : unitType === "duration" ? 2 : 50;
  const rangeMax = Number.isFinite(max) ? max : unitType === "percent" ? 99.5 : unitType === "currency" ? 12 : unitType === "duration" ? 48 : 2000;
  const span = rangeMax - rangeMin;

  const seasonality = String(def?.seasonality || "mild").toLowerCase();
  const volatility = String(def?.volatility || "med").toLowerCase();

  const seasonAmp = seasonality === "strong" ? 0.18 : seasonality === "none" ? 0.0 : 0.08;
  const volAmp = volatility === "high" ? 0.16 : volatility === "low" ? 0.04 : 0.08;

  const phase = (monthIndex + 1) / Math.max(1, months);
  const seasonal = Math.sin(phase * Math.PI * 2);

  let t = 0.55 + seasonAmp * seasonal + (r() - 0.5) * volAmp;

  const drivers = Array.isArray(def?.drivers) ? def.drivers : [];
  for (const rawD of drivers) {
    const d = String(rawD || "").trim();
    if (!d) continue;

    const dv = ctx[d];
    if (!Number.isFinite(Number(dv))) continue;

    const dm = ctx.__metricRanges?.[d];
    const dmin = dm?.min;
    const dmax = dm?.max;
    const dn = normalizeTo01(dv, dmin, dmax);

    let driverSign = 0;
    if (isBadDriverKey(d)) driverSign = -1;
    else if (isGoodDriverKey(d)) driverSign = +1;
    else driverSign = 0;

    // If the metric is lower-is-better, invert driver direction.
    if (directionality === "lower_better") driverSign = -driverSign;

    t += driverSign * (dn - 0.5) * 0.22;
  }

  t = clamp(t, 0.02, 0.98);
  let val = lerp(rangeMin, rangeMax, t);

  if (unitType === "percent" || isPctLikeMetric(key)) {
    val = Math.round(val * 10) / 10;
  } else if (unitType === "currency" || isCurrencyLikeMetric(key)) {
    val = Math.round(val * 100) / 100;
  } else if (unitType === "duration" || isDurationLikeMetric(key)) {
    val = Math.round(val * 10) / 10;
  } else {
    val = Math.round(val);
  }

  return clamp(val, rangeMin, rangeMax);
}

function synthFallback(r, key, ctx) {
  const k = String(key || "").toLowerCase();
  const orders = Number(ctx?.orders || 5000);
  const outbound = Number(ctx?.outboundShipments || orders);

  if (isPctLikeMetric(key)) {
    const v = 88 + r() * 11.5;
    return Math.round(v * 10) / 10;
  }

  if (k.includes("cost")) {
    return Math.round((3 + r() * 6.5) * 100) / 100;
  }

  if (k.includes("hour")) {
    return Math.round(800 + r() * 6200);
  }
  
  if (k.includes("task") || k.includes("completion") || k.includes("productivity") || k.includes("kpi")) {
    return Math.round((85 + r() * 12) * 10) / 10;
  }

  if (k.includes("ecommerce") || k.includes("e-com") || k.includes("ecom")) {
    return Math.round(outbound * (0.55 + r() * 0.2));
  }
  if (k.includes("b2b")) {
    return Math.round(outbound * (0.18 + r() * 0.2));
  }
  if (k.includes("b2c")) {
    return Math.round(outbound * (0.12 + r() * 0.18));
  }

  if (k.includes("volume") || k.includes("count") || k.includes("orders") || k.includes("ship") || k.includes("receip") || k.includes("line") || k.includes("unit")) {
    return Math.round(orders * (0.2 + r() * 1.4));
  }

  return Math.round(50 + r() * 950);
}

function deriveMetricRanges(series, keys) {
  const ranges = {};
  for (const k of keys) {
    let min = Infinity;
    let max = -Infinity;
    for (const row of series) {
      const v = Number(row?.[k]);
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min !== Infinity && max !== -Infinity) ranges[k] = { min, max };
  }
  return ranges;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };
  try {
    const req = event.body ? JSON.parse(event.body) : {};
    const cfg = req.dashboardConfig || {};
    const months = Math.max(6, Math.min(24, Number(cfg?.mockData?.months || 12)));
    const seed = Number(cfg?.mockData?.seed || 12345);
    const r = mulberry32(seed);

    const metricDefinitions = cfg?.metricDefinitions && typeof cfg.metricDefinitions === "object" ? cfg.metricDefinitions : {};
    const monthlyMetricKeys = collectMonthlyMetricKeys(cfg);

    const series = [];
    const now = new Date();

    // Latent factors (0..1) drive correlated behavior
    let demandPressure = 0.55 + (r() - 0.5) * 0.2;
    let capacityTightness = 0.45 + (r() - 0.5) * 0.2;
    let inventoryHealth = 0.65 + (r() - 0.5) * 0.2;
    let carrierReliability = 0.82 + (r() - 0.5) * 0.1;
    let qualityPressure = 0.35 + (r() - 0.5) * 0.15;
    let returnsPressure = 0.3 + (r() - 0.5) * 0.12;

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.toISOString().slice(0, 7);
      const idx = months - 1 - i;

      // Gentle random walk + seasonal cycle
      const seasonal = Math.sin(((idx + 1) / 12) * Math.PI * 2);
      demandPressure = clamp(demandPressure + (r() - 0.5) * 0.12 + seasonal * 0.06, 0.1, 0.95);
      capacityTightness = clamp(capacityTightness + (r() - 0.5) * 0.1 + seasonal * 0.03 + (demandPressure - 0.55) * 0.05, 0.05, 0.95);
      inventoryHealth = clamp(inventoryHealth + (r() - 0.5) * 0.08 - (demandPressure - 0.55) * 0.06, 0.1, 0.95);
      carrierReliability = clamp(carrierReliability + (r() - 0.5) * 0.06 - (demandPressure - 0.55) * 0.05, 0.55, 0.98);
      qualityPressure = clamp(qualityPressure + (r() - 0.5) * 0.08 + (capacityTightness - 0.5) * 0.06, 0.05, 0.95);
      returnsPressure = clamp(returnsPressure + (r() - 0.5) * 0.06 + seasonal * 0.04, 0.05, 0.85);

      const baseOrders = 5200;
      const orders = Math.round(baseOrders * (0.85 + demandPressure * 0.55) + (r() - 0.5) * 250);
      const lines = Math.round(orders * (2.3 + r() * 1.2));

      const inboundReceipts = Math.round(orders * (0.42 + r() * 0.25));
      const outboundShipments = Math.round(orders * (0.9 + r() * 0.15));

      // Capacity: higher tightness -> more labor hours per unit
      const laborHours = Math.round(2800 + orders * (0.22 + capacityTightness * 0.22) + (r() - 0.5) * 180);
      const units = Math.round(lines * (1.05 + r() * 0.6));
      const uph = Math.round((units / Math.max(1, laborHours)) * 10) / 10;

      // Backlog rises when demandPressure and capacityTightness are high
      const backlogOrders = Math.max(0, Math.round(orders * (0.01 + capacityTightness * 0.12 + Math.max(0, demandPressure - 0.6) * 0.08) + (r() - 0.5) * 50));

      // Quality and accuracy degrade under pressure
      const pickAccuracyPct = clamp(Math.round((99.4 - qualityPressure * 1.8 - capacityTightness * 0.8 + (r() - 0.5) * 0.25) * 100) / 100, 94.5, 99.9);
      const cycleCountAccuracyPct = clamp(Math.round((98.9 - (1 - inventoryHealth) * 2.2 + (r() - 0.5) * 0.35) * 100) / 100, 94.0, 99.8);

      const utilizationPct = clamp(Math.round((70 + demandPressure * 18 + (r() - 0.5) * 6) * 10) / 10, 55, 95);
      const dockToStockHrs = clamp(Math.round((6 + capacityTightness * 18 + (r() - 0.5) * 4) * 10) / 10, 2, 48);

      const returnsRatePct = clamp(Math.round((0.6 + returnsPressure * 3.2 + (r() - 0.5) * 0.4) * 10) / 10, 0.1, 8.0);
      const damagePct = clamp(Math.round((0.06 + qualityPressure * 0.55 + (r() - 0.5) * 0.05) * 100) / 100, 0.01, 2.5);

      // OTIF: punished by backlog + carrier reliability + picking accuracy
      const backlogRatio = backlogOrders / Math.max(1, outboundShipments);
      const otif = clamp(Math.round((
        98.5 - backlogRatio * 220 - (1 - carrierReliability) * 35 - (99.6 - pickAccuracyPct) * 1.1 + (r() - 0.5) * 0.8
      ) * 10) / 10, 65, 99.9);

      // Cost: rises with tightness and exceptions
      const costPerOrder = clamp(Math.round((4.1 + capacityTightness * 5.4 + backlogRatio * 8 + (r() - 0.5) * 0.6) * 100) / 100, 2.5, 18);

      // Aged inventory metrics (units in different age buckets)
      const totalInventory = Math.round(orders * (2.5 + r() * 1.5));
      const aged_0_3m = Math.round(totalInventory * (0.55 + inventoryHealth * 0.15));
      const aged_3_6m = Math.round(totalInventory * (0.20 + (1 - inventoryHealth) * 0.08));
      const aged_6_12m = Math.round(totalInventory * (0.12 + (1 - inventoryHealth) * 0.10));
      const aged_12m_plus = Math.max(0, totalInventory - aged_0_3m - aged_3_6m - aged_6_12m);

      const row = {
        month,
        orders,
        lines,
        inboundReceipts,
        outboundShipments,
        laborHours,
        units,
        uph,
        backlogOrders,
        otif,
        pickAccuracyPct,
        cycleCountAccuracyPct,
        utilizationPct,
        dockToStockHrs,
        returnsRatePct,
        damagePct,
        costPerOrder,
        "aged_0-3m": aged_0_3m,
        "aged_3-6m": aged_3_6m,
        "aged_6-12m": aged_6_12m,
        "aged_12m+": aged_12m_plus
      };

      // Apply metricDefinitions (company-specific metrics) with correlation to existing context.
      for (const k of Object.keys(metricDefinitions || {})) {
        const key = toKey(k);
        if (!key || key.startsWith("tables.")) continue;
        if (row[key] !== undefined && row[key] !== null) continue;
        row[key] = synthFromDefinition(r, key, metricDefinitions[key], row, idx, months);
      }

      // Ensure all widget metrics exist, with fallback synthesis.
      for (const k of monthlyMetricKeys) {
        if (row[k] === undefined || row[k] === null) {
          const def = metricDefinitions?.[k];
          if (def) row[k] = synthFromDefinition(r, k, def, row, idx, months);
          else row[k] = synthFallback(r, k, row);
        }
      }

      series.push(row);
    }

    // Build metric ranges for correlation in tables
    const allKeys = Array.from(new Set(["orders", "backlogOrders", "otif", "pickAccuracyPct", "cycleCountAccuracyPct", "damagePct", "returnsRatePct", ...monthlyMetricKeys]));
    const ranges = deriveMetricRanges(series, allKeys);

    const latest = series.length ? series[series.length - 1] : {};
    // attach ranges for downstream helpers
    latest.__metricRanges = ranges;

    const customers = ["Acme Retail", "Northwind", "Contoso", "BlueMart", "OmniShop", "Metro Wholesale", "Vertex Health"];
    const carriers = ["DHL", "FedEx", "UPS", "DPD", "LocalCarrier"];
    const facilities = ["DC-01", "DC-02", "FC-SEA", "FC-DAL"];

    const overallOtif = Number(latest?.otif ?? 95);
    const overallBacklog = Number(latest?.backlogOrders ?? 0);
    const overallPickAcc = Number(latest?.pickAccuracyPct ?? 99);
    const overallCycleAcc = Number(latest?.cycleCountAccuracyPct ?? 98.5);
    const overallDamage = Number(latest?.damagePct ?? 0.2);

    const backlogRatioNow = overallBacklog / Math.max(1, Number(latest?.outboundShipments ?? latest?.orders ?? 1));

    const tables = {
      slaByCustomer: customers.map((c) => {
        const shipped = randInt(r, 800, 4200);
        const lateBase = clamp(Math.round(shipped * (0.01 + backlogRatioNow * 0.35 + (r() - 0.5) * 0.02)), 0, Math.round(shipped * 0.25));
        const late = randInt(r, Math.max(0, lateBase - 12), lateBase + 12);
        const otifPct = clamp(Math.round(((shipped - late) / Math.max(1, shipped)) * 1000) / 10, 70, 99.9);
        return {
          customer: c,
          ordersShipped: shipped,
          lateOrders: late,
          otifPct,
          avgDelayHrs: randInt(r, 2, clamp(Math.round(8 + backlogRatioNow * 50), 8, 96))
        };
      }),

      backlogAging: [
        { bucket: "0-24h", orders: 0, pct: 0 },
        { bucket: "24-48h", orders: 0, pct: 0 },
        { bucket: "48-72h", orders: 0, pct: 0 },
        { bucket: "72h+", orders: 0, pct: 0 }
      ],

      exceptionsSummary: [],

      inventoryAging: [
        { bucket: "0-30", qty: 0, valueUsd: 0 },
        { bucket: "31-60", qty: 0, valueUsd: 0 },
        { bucket: "61-90", qty: 0, valueUsd: 0 },
        { bucket: "90+", qty: 0, valueUsd: 0 }
      ],

      laborProductivityByShift: ["Shift A", "Shift B", "Shift C"].map((s, idx) => {
        const baseHours = randInt(r, 1800, 5200);
        const efficiency = clamp(0.92 + (r() - 0.5) * 0.12 - backlogRatioNow * 0.15 + (idx === 1 ? -0.04 : 0.0), 0.75, 1.05);
        const units = Math.round(baseHours * clamp((latest?.uph ?? 30) * efficiency, 12, 85) * (0.95 + r() * 0.1));
        const uph = Math.round((units / Math.max(1, baseHours)) * 10) / 10;
        const target = Math.round((uph * (0.92 + r() * 0.1)) * 10) / 10;
        return { shift: s, hours: baseHours, units, uph, targetUph: target, variancePct: Math.round(((uph - target) / Math.max(1, target)) * 1000) / 10 };
      }),

      carrierPerformance: carriers.map((c) => {
        const shipments = randInt(r, 900, 7000);
        const onTimePct = clamp(Math.round((0.86 + (overallOtif / 100) * 0.12 + (r() - 0.5) * 0.03) * 1000) / 10, 70, 99.9);
        const dmg = clamp(Math.round((overallDamage * (0.8 + r() * 0.7)) * 10) / 10, 0, 5);
        const cost = clamp(Math.round((3.2 + backlogRatioNow * 1.5 + (r() * 2.8)) * 100) / 100, 2.5, 12);
        return { carrier: c, shipments, onTimePct, damagePct: dmg, costPerShipmentUsd: cost };
      })
    };

    // Backlog aging distribution, consistent with backlog size
    const totalBacklog = Math.max(0, Math.round(overallBacklog));
    const olderShare = clamp(0.12 + backlogRatioNow * 0.9, 0.12, 0.7);
    const bucket72 = Math.round(totalBacklog * olderShare * (0.5 + r() * 0.35));
    const bucket48 = Math.round(totalBacklog * olderShare * (0.25 + r() * 0.25));
    const bucket24 = Math.round(totalBacklog * (0.2 + r() * 0.2));
    const bucket0 = Math.max(0, totalBacklog - bucket72 - bucket48 - bucket24);

    tables.backlogAging = [
      { bucket: "0-24h", orders: bucket0, pct: 0 },
      { bucket: "24-48h", orders: bucket24, pct: 0 },
      { bucket: "48-72h", orders: bucket48, pct: 0 },
      { bucket: "72h+", orders: bucket72, pct: 0 }
    ];

    const totalBacklog2 = tables.backlogAging.reduce((a, b) => a + b.orders, 0) || 1;
    tables.backlogAging = tables.backlogAging.map((row) => ({ ...row, pct: Math.round((row.orders / totalBacklog2) * 1000) / 10 }));

    // Exceptions aligned to KPI signals
    const lateScore = clamp((100 - overallOtif) / 12, 0, 1);
    const shortPickScore = clamp((99.7 - overallPickAcc) / 2.8, 0, 1);
    const invHoldScore = clamp((99.3 - overallCycleAcc) / 3.0, 0, 1);
    const damageScore = clamp(overallDamage / 1.0, 0, 1);

    const exceptionTypes = [
      { name: "Late shipment", weight: 0.45 + lateScore * 0.9 },
      { name: "Short pick", weight: 0.25 + shortPickScore * 0.8 },
      { name: "Inventory hold", weight: 0.22 + invHoldScore * 0.85 },
      { name: "Carrier missed pickup", weight: 0.14 + lateScore * 0.5 },
      { name: "Address exception", weight: 0.08 + r() * 0.15 },
      { name: "Damaged", weight: 0.12 + damageScore * 0.9 }
    ];

    const baseOpen = clamp(Math.round(60 + totalBacklog * 0.25 + (lateScore + shortPickScore + invHoldScore) * 80), 15, 900);
    const weightSum = exceptionTypes.reduce((a, b) => a + b.weight, 0) || 1;

    tables.exceptionsSummary = exceptionTypes.map((t) => {
      const share = t.weight / weightSum;
      const open = clamp(Math.round(baseOpen * share * (0.85 + r() * 0.3)), 0, 1200);
      return {
        exceptionType: t.name,
        open,
        newToday: clamp(Math.round(open * (0.06 + r() * 0.12)), 0, 180),
        avgAgeHrs: clamp(Math.round(6 + share * 40 + backlogRatioNow * 50 + r() * 18), 2, 240),
        worstFacility: randChoice(r, facilities)
      };
    });

    // Inventory aging consistent with inventory health (low health => more aged)
    const health = clamp((overallCycleAcc - 94) / 6, 0, 1);
    const agedBias = 1 - health;
    const totalQty = randInt(r, 28000, 92000);
    const b90 = Math.round(totalQty * clamp(0.04 + agedBias * 0.18, 0.04, 0.35));
    const b61 = Math.round(totalQty * clamp(0.07 + agedBias * 0.14, 0.06, 0.32));
    const b31 = Math.round(totalQty * clamp(0.12 + agedBias * 0.12, 0.1, 0.35));
    const b0 = Math.max(0, totalQty - b90 - b61 - b31);

    const unitValue = randInt(r, 18, 95);
    tables.inventoryAging = [
      { bucket: "0-30", qty: b0, valueUsd: b0 * unitValue },
      { bucket: "31-60", qty: b31, valueUsd: b31 * unitValue },
      { bucket: "61-90", qty: b61, valueUsd: b61 * unitValue },
      { bucket: "90+", qty: b90, valueUsd: b90 * unitValue }
    ];

    // Alias for configs that expect "orderExceptionsByReason"
    tables.orderExceptionsByReason = (tables.exceptionsSummary || []).map((r) => ({
      reason: r.exceptionType,
      count: r.open,
      open: r.open,
      newToday: r.newToday,
      avgAgeHrs: r.avgAgeHrs,
      worstFacility: r.worstFacility
    }));
    
    tables.agedInventoryReport = tables.inventoryAging;
    tables.aged_inventory = tables.inventoryAging;    
    // Generate dynamic tables for custom metrics
    const pages = Array.isArray(cfg?.pages) ? cfg.pages : [];
    for (const p of pages) {
      const widgets = Array.isArray(p?.widgets) ? p.widgets : [];
      for (const w of widgets) {
        if (w.type !== "table") continue;
        const m = w?.metric;
        const arr = Array.isArray(m) ? m : [m];
        for (const raw of arr) {
          const k = toKey(raw);
          if (!k || !k.startsWith("tables.")) continue;
          const tableName = k.slice("tables.".length);
          if (tables[tableName]) continue;
          
          // Generate realistic industry-specific data
          const rowCount = randInt(r, 5, 8);
          tables[tableName] = [];
          
          if (tableName.includes("controlledSubstance") || tableName.includes("controlled")) {
            for (let i = 0; i < rowCount; i++) {
              tables[tableName].push({
                medication: `Med-${String.fromCharCode(65 + i)}`,
                schedule: randChoice(r, ["II", "III", "IV"]),
                onHandQty: randInt(r, 50, 500),
                cycleCountAccuracy: Math.round((97 + r() * 2.5) * 10) / 10,
                location: `Vault-${String.fromCharCode(65 + i)}`
              });
            }
          } else if (tableName.includes("recall")) {
            for (let i = 0; i < rowCount; i++) {
              tables[tableName].push({
                recallId: `RC-${2024000 + i}`,
                product: `Product-${String.fromCharCode(65 + i)}`,
                status: randChoice(r, ["Active", "In Progress", "Resolved"]),
                affectedUnits: randInt(r, 50, 2000),
                daysOpen: randInt(r, 1, 45)
              });
            }
          } else if (tableName.includes("return")) {
            for (let i = 0; i < rowCount; i++) {
              tables[tableName].push({
                returnType: randChoice(r, ["Damaged", "Expired", "Wrong Item", "Customer Return"]),
                count: randInt(r, 20, 300),
                processingTime: randInt(r, 2, 72),
                creditIssued: randInt(r, 500, 15000)
              });
            }
          } else {
            for (let i = 0; i < rowCount; i++) {
              const row = { id: i + 1, name: `Item ${i + 1}` };
              if (tableName.includes("expiration")) row.expiringPct = randInt(r, 5, 35);
              if (tableName.includes("location")) row.location = randChoice(r, ["DC-East", "DC-West", "DC-Central"]);
              if (tableName.includes("reconciliation") || tableName.includes("variance")) {
                row.expected = randInt(r, 100, 500);
                row.actual = row.expected + randInt(r, -20, 20);
                row.variance = row.actual - row.expected;
              }
              tables[tableName].push(row);
            }
          }
        }
      }
    }

    return json(200, { datasets: { monthly: series, tables } });
  } catch (e) {
    return json(500, { error: e.message || String(e) });
  }
};
