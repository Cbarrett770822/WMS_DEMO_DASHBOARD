const fs = require('fs');

const filePath = 'src/App.tsx';
let t = fs.readFileSync(filePath, 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Fix accidental literal "\\n" between tabs.
const tabGlue = '</TabsContent>\\n<TabsContent value="dashboard" className="mt-4">';
if (t.includes(tabGlue)) {
  t = t.replace(tabGlue, '</TabsContent>\n\n          <TabsContent value="dashboard" className="mt-4">');
}

// Remove Executive Snapshot support state (latestMonth) and useMemo import.
const latestMonthRe = /\r?\n\s*const latestMonth = useMemo\(\(\) => \{[\s\S]*?\}\s*,\s*\[datasets\]\s*\);\r?\n/;
if (latestMonthRe.test(t)) {
  t = t.replace(latestMonthRe, '\n');
}

t = t.replace('import { useEffect, useMemo, useState } from "react";', 'import { useEffect, useState } from "react";');

// Remove canMock (we will run plan+mock sequentially via one button)
const canMockRe = /^\s*const canMock = .*\r?\n/m;
if (canMockRe.test(t)) {
  t = t.replace(canMockRe, '');
}

// Replace doPlanDashboard + doMockData with doPlanAndMock
const planAndMockBlockRe = /\r?\n\s*async function doPlanDashboard\(\) \{[\s\S]*?\r?\n\s*\}\r?\n\s*\r?\n\s*async function doMockData\(\) \{[\s\S]*?\r?\n\s*\}\r?\n/;
assert(planAndMockBlockRe.test(t), 'Could not locate doPlanDashboard + doMockData block');

const doPlanAndMock = `

  async function doPlanAndMock() {
    try {
      setError("");
      setBusy("plan");
      setDatasets(null);

      const respPlan = await postJson<{ dashboardConfig: DashboardConfig }>("/.netlify/functions/planDashboard", {
        companyName: companyName.trim(),
        classification,
        researchText,
        apiKey: getSessionApiKey()
      });

      const cfg = respPlan.dashboardConfig;
      setDashboardConfig(cfg);

      setBusy("mock");
      const respMock = await postJson<{ datasets: Datasets }>("/.netlify/functions/mockData", {
        dashboardConfig: cfg
      });

      setDatasets(respMock.datasets);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
`;

t = t.replace(planAndMockBlockRe, doPlanAndMock + '\n');

// Dashboard tab edits
const dashStart = t.indexOf('<TabsContent value="dashboard"');
assert(dashStart !== -1, 'Could not find dashboard tab');

const dashEnd = t.indexOf('\n          </TabsContent>', dashStart);
assert(dashEnd !== -1, 'Could not find end of dashboard tab');

let dash = t.slice(dashStart, dashEnd);

// Add bottom padding so sticky footer doesn't cover content
if (dash.includes('<div className="grid gap-4">')) {
  dash = dash.replace('<div className="grid gap-4">', '<div className="grid gap-4 pb-24">');
}

// Expand generate card to full width
if (dash.includes('<Card className="md:col-span-1">')) {
  dash = dash.replace('<Card className="md:col-span-1">', '<Card className="md:col-span-3">');
}

// Replace Generate Dashboard card content with single button
const genContentRe = /<CardContent className=\"flex flex-col gap-2\">[\s\S]*?<\/CardContent>/;
assert(genContentRe.test(dash), 'Could not find Generate Dashboard CardContent');

dash = dash.replace(
  genContentRe,
  `<CardContent className="flex flex-col gap-2">\n                    <Button onClick={doPlanAndMock} disabled={!canPlan}>\n                      {busy === "plan" ? "Planning…" : busy === "mock" ? "Generating…" : "Plan + Generate Mock Data"}\n                    </Button>\n                    <div className="text-xs text-muted-foreground">Plans the dashboard, then generates mock data automatically.</div>\n                  </CardContent>`
);

// Remove Executive Snapshot card
const execCardRe = /\r?\n\s*<Card className=\"md:col-span-2\">[\s\S]*?\r?\n\s*<\/Card>\r?\n/;
if (execCardRe.test(dash)) {
  dash = dash.replace(execCardRe, '\n');
}

// Sticky footer with fullscreen actions
const footer = `

              <div className="sticky bottom-0 z-10 -mx-6 mt-4 border-t bg-background/95 p-4 backdrop-blur">
                <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="secondary"
                      disabled={!dashboardConfig || !datasets}
                      onClick={() => {
                        try {
                          const id = saveSnapshot();
                          window.open(\`/dash/\${id}\`, "_blank");
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
                          const url = \`\${window.location.origin}/dash/\${id}\`;
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
                    <div className="text-xs text-muted-foreground break-all">Last link: {\`\${window.location.origin}/dash/\${shareId}\`}</div>
                  ) : null}
                </div>
              </div>`;

if (!dash.includes('sticky bottom-0')) {
  dash = dash + footer;
}

// Write back
const out = t.slice(0, dashStart) + dash + t.slice(dashEnd);
fs.writeFileSync(filePath, out, 'utf8');
console.log('Applied UI changes #2-#4');
