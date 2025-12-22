import ReactECharts from "echarts-for-react";

type MonthlyRow = { month: string; [key: string]: any };

export function EChartsLineWidget({ rows, keys }: { rows: MonthlyRow[]; keys: string[] }) {
  const data = rows.slice(-12);
  if (!data.length) return <div className="text-sm text-muted-foreground">No data</div>;
  const option = {
    grid: { top: 16, right: 16, bottom: 32, left: 48 },
    xAxis: { type: "category", data: data.map(r => r.month.slice(5)) },
    yAxis: { type: "value" },
    tooltip: { trigger: "axis" },
    legend: { data: keys, bottom: 0 },
    series: keys.map((k, i) => ({
      name: k, type: "line", data: data.map(r => r[k]), smooth: true,
      color: ["#2563eb", "#f97316", "#10b981", "#8b5cf6"][i % 4]
    }))
  };
  return <ReactECharts option={option} style={{ height: "224px" }} opts={{ renderer: "svg" }} />;
}

export function EChartsBarWidget({ rows, keys }: { rows: MonthlyRow[]; keys: string[] }) {
  const data = rows.slice(-12);
  if (!data.length) return <div className="text-sm text-muted-foreground">No data</div>;
  const option = {
    grid: { top: 16, right: 16, bottom: 32, left: 48 },
    xAxis: { type: "category", data: data.map(r => r.month.slice(5)) },
    yAxis: { type: "value" },
    tooltip: { trigger: "axis" },
    legend: { data: keys, bottom: 0 },
    series: keys.map((k, i) => ({
      name: k, type: "bar", data: data.map(r => r[k]),
      color: ["#2563eb", "#f97316", "#10b981", "#8b5cf6"][i % 4]
    }))
  };
  return <ReactECharts option={option} style={{ height: "224px" }} opts={{ renderer: "svg" }} />;
}

export function EChartsSparkline({ rows, metricKey }: { rows: MonthlyRow[]; metricKey: string }) {
  const data = rows.slice(-12);
  const option = {
    grid: { top: 0, right: 0, bottom: 0, left: 0 },
    xAxis: { type: "category", show: false, data: data.map((_, i) => i) },
    yAxis: { type: "value", show: false },
    series: [{ type: "line", data: data.map(r => r[metricKey]), smooth: true, symbol: "none", lineStyle: { color: "#2563eb", width: 2 } }]
  };
  return <ReactECharts option={option} style={{ height: "40px" }} opts={{ renderer: "svg" }} />;
}

export function EChartsPieWidget({ rows, nameKey, valueKey }: { rows: any[]; nameKey: string; valueKey: string }) {
  const data = (rows || []).map(r => ({ name: r[nameKey], value: r[valueKey] })).filter(d => d.value > 0);
  if (!data.length) return <div className="text-sm text-muted-foreground">No data</div>;
  const option = {
    tooltip: { trigger: "item" },
    series: [{
      type: "pie", radius: ["40%", "70%"], data,
      label: { show: true, formatter: "{b}: {d}%" },
      color: ["#2563eb", "#f97316", "#10b981", "#8b5cf6", "#ec4899", "#f59e0b"]
    }]
  };
  return <ReactECharts option={option} style={{ height: "224px" }} opts={{ renderer: "svg" }} />;
}

export function EChartsStackedBar({ data, xKey, series }: { data: any[]; xKey: string; series: Array<{ key: string; name: string; color: string }> }) {
  if (!data.length) return <div className="text-sm text-muted-foreground">No data</div>;
  const option = {
    grid: { top: 16, right: 16, bottom: 32, left: 48 },
    xAxis: { type: "category", data: data.map(d => d[xKey]) },
    yAxis: { type: "value" },
    tooltip: { trigger: "axis" },
    legend: { data: series.map(s => s.name), bottom: 0 },
    series: series.map(s => ({
      name: s.name, type: "bar", stack: "total", data: data.map(d => d[s.key]), color: s.color
    }))
  };
  return <ReactECharts option={option} style={{ height: "224px" }} opts={{ renderer: "svg" }} />;
}

export function EChartsComposed({ data, xKey, bars, lines }: {
  data: any[]; xKey: string;
  bars: Array<{ key: string; name: string; color: string; yAxisIndex?: number }>;
  lines: Array<{ key: string; name: string; color: string; yAxisIndex?: number }>;
}) {
  if (!data.length) return <div className="text-sm text-muted-foreground">No data</div>;
  const option = {
    grid: { top: 16, right: 48, bottom: 32, left: 48 },
    xAxis: { type: "category", data: data.map(d => d[xKey]) },
    yAxis: [
      { type: "value", position: "left" },
      { type: "value", position: "right", min: 0, max: 100, axisLabel: { formatter: "{value}%" } }
    ],
    tooltip: { trigger: "axis" },
    legend: { data: [...bars.map(b => b.name), ...lines.map(l => l.name)], bottom: 0 },
    series: [
      ...bars.map(b => ({ name: b.name, type: "bar", data: data.map(d => d[b.key]), color: b.color, yAxisIndex: b.yAxisIndex || 0 })),
      ...lines.map(l => ({ name: l.name, type: "line", data: data.map(d => d[l.key]), smooth: true, color: l.color, yAxisIndex: l.yAxisIndex || 0 }))
    ]
  };
  return <ReactECharts option={option} style={{ height: "224px" }} opts={{ renderer: "svg" }} />;
}
