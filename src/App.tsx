import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Classification = {
  industry: "3PL" | "Distribution";
  subVertical: string;
  confidence: number;
  rationale: string[];
};

type OpsProfile = any;
type NarrativeAngle = any;
type StoryPack = any;


type DashboardWidget = {
  id: string;
  type: "kpi" | "line" | "bar" | "table";
  title: string;
  metric: string | string[];
  description: string;
};

type DashboardPage = {
  id: string;
  title: string;
  widgets: DashboardWidget[];
};

type DashboardConfig = {
  template: "3PL" | "Distribution";
  subVertical: string;
  pages: DashboardPage[];
  mockData: { months: number; seed: number };
  metricDefinitions?: Record<string, any>;
};

type MonthlyRow = {
  month: string;
  orders: number;
  lines: number;
  otif: number;
  costPerOrder: number;
};

type Datasets = {
  monthly: MonthlyRow[];
};

async function postJson<T>(url: string, body: unknown, timeoutMs = 25000): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err: any) {
      const name = String(err?.name || "");
      if (name === "AbortError") {
        throw new Error(timedOut ? `Request timed out after ${Math.round(timeoutMs / 1000)}s` : "Request was aborted");
      }
      throw err;
    }

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      let msg = typeof data?.error === "string" ? data.error : `HTTP ${res.status}`;
      if (data?.details) {
        msg += `\n\n${JSON.stringify(data.details, null, 2)}`;
      }
      throw new Error(msg);
    }

    return data as T;
  } finally {
    clearTimeout(t);
  }
}

function getSessionApiKey(): string {
  return String(sessionStorage.getItem("anthropicApiKey") || "").trim();
}

function setSessionApiKey(key: string) {
  const k = String(key || "").trim();
  if (!k) {
    sessionStorage.removeItem("anthropicApiKey");
  } else {
    sessionStorage.setItem("anthropicApiKey", k);
  }
}

export default function App() {
  const [tab, setTab] = useState("setup");

  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");

  const [apiKeyLoaded, setApiKeyLoaded] = useState(() => !!getSessionApiKey());

  const [researchText, setResearchText] = useState("");
  const [researchCompanyName, setResearchCompanyName] = useState("");
  const [classification, setClassification] = useState<Classification | null>(null);
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);
  const [datasets, setDatasets] = useState<Datasets | null>(null);
  const [chartLibrary, setChartLibrary] = useState<"recharts" | "echarts">("recharts");

  const [opsProfile, setOpsProfile] = useState<OpsProfile | null>(null);
  const [narrativeAngle, setNarrativeAngle] = useState<NarrativeAngle | null>(null);
  const [storyPack, setStoryPack] = useState<StoryPack | null>(null);

  const [shareId, setShareId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const apiKeyStatus = apiKeyLoaded ? "API key loaded (session only)" : "No API key loaded";

  const canResearch = companyName.trim().length > 0 && getSessionApiKey().length > 0 && !busy;
  const canPlan = (researchText.trim().length > 0) && (researchCompanyName === companyName.trim()) && getSessionApiKey().length > 0 && !busy;
  useEffect(() => {
    try {
      const cn = localStorage.getItem("psdg:companyName");
      const n = localStorage.getItem("psdg:notes");
      const rt = localStorage.getItem("psdg:researchText");
      const rcn = localStorage.getItem("psdg:researchCompanyName");
      const cl = localStorage.getItem("psdg:classification");
      const dc = localStorage.getItem("psdg:dashboardConfig");
      const ds = localStorage.getItem("psdg:datasets");
      const op = localStorage.getItem("psdg:opsProfile");
      const lib = localStorage.getItem("psdg:chartLibrary");
      const na = localStorage.getItem("psdg:narrativeAngle");
      const sp = localStorage.getItem("psdg:storyPack");

      if (typeof cn === "string") setCompanyName(cn);
      if (typeof n === "string") setNotes(n);
      if (typeof rt === "string") setResearchText(rt);
      if (typeof rcn === "string") setResearchCompanyName(rcn);
      if (cl) setClassification(JSON.parse(cl));
      if (dc) setDashboardConfig(JSON.parse(dc));
      if (ds) setDatasets(JSON.parse(ds));
      if (op) setOpsProfile(JSON.parse(op));
      if (na) setNarrativeAngle(JSON.parse(na));
      if (sp) setStoryPack(JSON.parse(sp));
      if (lib && (lib === "recharts" || lib === "echarts")) setChartLibrary(lib);
    } catch {
      
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("psdg:companyName", companyName);
  }, [companyName]);

  useEffect(() => {
    localStorage.setItem("psdg:notes", notes);
  }, [notes]);

  useEffect(() => {
    if (researchText) localStorage.setItem("psdg:researchText", researchText);
    else localStorage.removeItem("psdg:researchText");
  }, [researchText]);
  useEffect(() => {
    if (researchCompanyName) localStorage.setItem("psdg:researchCompanyName", researchCompanyName);
    else localStorage.removeItem("psdg:researchCompanyName");
  }, [researchCompanyName]);

  useEffect(() => {
    if (classification) localStorage.setItem("psdg:classification", JSON.stringify(classification));
    else localStorage.removeItem("psdg:classification");
  }, [classification]);

  useEffect(() => {
    if (dashboardConfig) localStorage.setItem("psdg:dashboardConfig", JSON.stringify(dashboardConfig));
    else localStorage.removeItem("psdg:dashboardConfig");
  }, [dashboardConfig]);

  useEffect(() => {
    if (datasets) localStorage.setItem("psdg:datasets", JSON.stringify(datasets));
    else localStorage.removeItem("psdg:datasets");
  }, [datasets]);

  useEffect(() => {
    if (opsProfile) localStorage.setItem("psdg:opsProfile", JSON.stringify(opsProfile));
    else localStorage.removeItem("psdg:opsProfile");
  }, [opsProfile]);

  useEffect(() => {
    if (narrativeAngle) localStorage.setItem("psdg:narrativeAngle", JSON.stringify(narrativeAngle));
    else localStorage.removeItem("psdg:narrativeAngle");
  }, [narrativeAngle]);

  useEffect(() => {
    if (storyPack) localStorage.setItem("psdg:storyPack", JSON.stringify(storyPack));
    else localStorage.removeItem("psdg:storyPack");
  }, [storyPack]);

  useEffect(() => {
    localStorage.setItem("psdg:chartLibrary", chartLibrary);
  }, [chartLibrary]);

  async function onLoadKeyFile(file: File) {
    const text = String(await file.text()).trim();
    if (!text) throw new Error("Empty key file");
    setSessionApiKey(text);
    setApiKeyLoaded(true);
  }

  async function doResearch() {
    try {
      setError("");
      setBusy("research");
      setDashboardConfig(null);
      setDatasets(null);

      const resp = await postJson<{ researchText: string; classification: Classification; opsProfile?: OpsProfile }>("/.netlify/functions/researchAndClassify", {
        companyName: companyName.trim(),
        notes: notes.trim() || undefined,
        apiKey: getSessionApiKey()
      }, 75000);

      setResearchText(String(resp?.researchText || ""));
      setResearchCompanyName(companyName.trim());
      setClassification(resp?.classification || null);
      setOpsProfile((resp as any)?.opsProfile || null);
      setNarrativeAngle(null);
      setStoryPack(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function doPlanAndMock() {
    try {
      setError("");
      setBusy("plan");
      setDatasets(null);

      const respPlan = await postJson<{ dashboardConfig: DashboardConfig; narrativeAngle?: NarrativeAngle; storyPack?: StoryPack }>("/.netlify/functions/planDashboard", {
        companyName: companyName.trim(),
        classification,
        opsProfile,
        researchText,
        apiKey: getSessionApiKey()
      }, 75000);

      const cfg = respPlan.dashboardConfig;
      setDashboardConfig(cfg);

      setNarrativeAngle((respPlan as any)?.narrativeAngle || null);
      setStoryPack((respPlan as any)?.storyPack || null);

      setBusy("mock");
      const respMock = await postJson<{ datasets: Datasets }>("/.netlify/functions/mockData", {
        dashboardConfig: cfg
      }, 40000);

      setDatasets(respMock.datasets);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function saveSnapshot(): string {
    if (!dashboardConfig || !datasets) throw new Error("Generate dashboard + mock data first.");
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const key = `psdg:snapshot:${id}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        companyName: companyName.trim(),
        dashboardConfig,
        datasets,
        opsProfile,
        narrativeAngle,
        storyPack,
        chartLibrary,
        savedAt: new Date().toISOString()
      })
    );
    setShareId(id);
    return id;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <div className="text-sm text-muted-foreground">Pre-Sales Dashboard Generator</div>
          <div className="text-2xl font-semibold tracking-tight">Customer-Specific Logistics Dashboard</div>
          <div className="text-sm text-muted-foreground">Templates: 3PL and Distribution (industry + sub-vertical)</div>
        </div>

        {error ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">Error</CardTitle>
              <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="research">Research</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="mt-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>1) Load Anthropic API Key</CardTitle>
                  <CardDescription>{apiKeyStatus}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Input
                    type="file"
                    accept=".txt"
                    onChange={async (e) => {
                      const inputEl = e.currentTarget as HTMLInputElement;
                      try {
                        setError("");
                        const f = e.target.files?.[0];
                        if (!f) return;
                        await onLoadKeyFile(f);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                        setApiKeyLoaded(false);
                        setSessionApiKey("");
                      } finally {
                        inputEl.value = "";
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSessionApiKey("");
                        setApiKeyLoaded(false);
                      }}
                      disabled={!apiKeyLoaded}
                    >
                      Clear Key
                    </Button>
                    <Button
                      onClick={() => setTab("research")}
                      disabled={!getSessionApiKey()}
                    >
                      Continue
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    The key is stored in sessionStorage for this browser session only.
                  </div>
                </CardContent>
              </Card>
              {narrativeAngle || storyPack ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Presales Narrative (Optional)</CardTitle>
                    <CardDescription>Collapsed by default. Use as a talk track; the dashboard still stands on its own.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">Show narrative + diagnosis</summary>
                      <div className="mt-3 grid gap-3">
                        {narrativeAngle ? (
                          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">{JSON.stringify(narrativeAngle, null, 2)}</pre>
                        ) : null}
                        {storyPack ? (
                          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">{JSON.stringify(storyPack, null, 2)}</pre>
                        ) : null}
                      </div>
                    </details>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>
          <TabsContent value="research" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Company Context</CardTitle>
                    <CardDescription>Used to tailor research + KPIs for 3PL/Distribution pre-sales demos.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="grid gap-2">
                      <div className="text-sm font-medium">Company name</div>
                      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. DHL Supply Chain" />
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm font-medium">Discovery notes (optional)</div>
                      <textarea
                        className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Known pain points, volumes, channels, regions..."
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Tip: Run with <span className="font-mono">netlify dev</span> to test functions locally.
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Run AI Research + Classification</CardTitle>
                    <CardDescription>Creates a concise brief used to drive classification and dashboard planning.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Button onClick={doResearch} disabled={!canResearch}>
                      {busy === "research" ? "Researching…" : "Research + Classify"}
                    </Button>
                    <div className="text-xs text-muted-foreground">Requires company name + API key.</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Research Output</CardTitle>
                  <CardDescription>Plain text (for now). Next: structured JSON + better rendering.</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">
                    {researchText || "No research yet."}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="dashboard" className="mt-4">
            <div className="grid gap-4 pb-24">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="md:col-span-3">
                  <CardHeader>
                    <CardTitle>Generate Dashboard</CardTitle>
                    <CardDescription>Creates a dashboard config (pages + widgets).</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Button onClick={doPlanAndMock} disabled={!canPlan}>
                      {busy === "plan" ? "Planning…" : busy === "mock" ? "Generating…" : "Plan + Generate Mock Data"}
                    </Button>
                    <div className="text-xs text-muted-foreground">Plans the dashboard, then generates mock data automatically.</div>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <span className="text-sm font-medium">Chart Library:</span>
                      <Button
                        variant={chartLibrary === "recharts" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setChartLibrary("recharts")}
                      >
                        Recharts
                      </Button>
                      <Button
                        variant={chartLibrary === "echarts" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setChartLibrary("echarts")}
                      >
                        ECharts
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Dashboard Config</CardTitle>
                    <CardDescription>AI-generated widget layout (JSON).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">
                      {dashboardConfig ? JSON.stringify(dashboardConfig, null, 2) : "No dashboard config yet."}
                    </pre>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Mock Dataset</CardTitle>
                    <CardDescription>Monthly dataset (JSON) used to drive charts.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">
                      {datasets ? JSON.stringify(datasets, null, 2) : "No datasets yet."}
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="sticky bottom-0 z-10 -mx-6 border-t bg-background/95 p-4 backdrop-blur">
                <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="secondary"
                      disabled={!dashboardConfig || !datasets}
                      onClick={() => {
                        try {
                          const id = saveSnapshot();
                          window.open(`/dash/${id}?lib=${chartLibrary}`, "_blank");
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Open Fullscreen
                    </Button>

                    <Button
                      variant="secondary"
                      disabled={!dashboardConfig || !datasets}
                      onClick={async () => {
                        try {
                          const id = saveSnapshot();
                          const url = `${window.location.origin}/dash/${id}?lib=${chartLibrary}`;
                          await navigator.clipboard.writeText(url);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Copy Fullscreen Link
                    </Button>
                  </div>

                  {shareId ? (
                    <div className="text-xs text-muted-foreground break-all">Last link: {`${window.location.origin}/dash/${shareId}`}</div>
                  ) : null}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}



























