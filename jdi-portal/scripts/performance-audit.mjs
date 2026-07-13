import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ROUTE_BUDGETS = {
  "/dashboard": 766_743,
  "/dashboard/influencer": 850_000,
};

export const ROUTE_BASELINES = {};

function walk(directory, predicate) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function loadManifest(filename) {
  const context = { globalThis: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), context, { filename });
  return context.globalThis.__RSC_MANIFEST ?? {};
}

function routeFromManifestKey(route) {
  return route.replace(/\/page$/, "") || "/";
}

function chunkBytes(buildDir, chunk) {
  const relativePath = chunk.replace(/^\/?_next\//, "");
  const filename = path.join(buildDir, relativePath);
  return existsSync(filename) ? statSync(filename).size : 0;
}

function routeReport(buildDir, manifest) {
  return Object.entries(manifest).map(([manifestRoute, value]) => {
    const chunks = new Set(Object.values(value.entryJSFiles ?? {}).flat());
    return {
      route: routeFromManifestKey(manifestRoute),
      files: chunks.size,
      bytes: [...chunks].reduce((total, chunk) => total + chunkBytes(buildDir, chunk), 0),
      chunks: [...chunks],
    };
  });
}

function sourceFile(appDirectory, relativePath) {
  const filename = path.join(appDirectory, relativePath);
  return existsSync(filename) ? readFileSync(filename, "utf8") : "";
}

export function auditSourceGuards(sourceRoot = appRoot) {
  const shell = sourceFile(sourceRoot, "src/components/dashboard/DashboardShell.tsx");
  const dashboard = sourceFile(sourceRoot, "src/components/dashboard/DashboardClient.tsx");
  const tasks = sourceFile(sourceRoot, "src/components/dashboard/tasks/TasksPageClient.tsx");
  const schedule = sourceFile(sourceRoot, "src/components/dashboard/schedule/SchedulePageClient.tsx");
  const chat = sourceFile(sourceRoot, "src/components/dashboard/chat/ChatPageClient.tsx");
  const influencerUrl = sourceFile(sourceRoot, "src/lib/influencer/url.ts");
  const topUrlBar = sourceFile(sourceRoot, "src/components/dashboard/influencer/TopUrlBar.tsx");
  const failures = [];

  if (/<DashboardWarmup\b/.test(shell)) {
    failures.push("DashboardShell must not mount DashboardWarmup.");
  }
  if (/\b(?:router\.)?prefetch\s*\(\s*["']\/dashboard(?:\/[^"']*)?["']/.test(shell)) {
    failures.push("DashboardShell must not prefetch dashboard routes globally.");
  }
  if (/useEffect\s*\(\s*\(\)\s*=>\s*\{\s*(?:void\s+)?router\.refresh\s*\(\s*\)\s*;?\s*\}\s*,\s*\[\s*(?:router)?\s*\]\s*\)/.test(dashboard)) {
    failures.push("DashboardClient must not refresh the dashboard on initial mount.");
  }
  if (/useEffect\s*\(\s*\(\)\s*=>\s*\{\s*(?:void\s+refreshTasks|const\s+id\s*=\s*requestAnimationFrame\s*\(\s*\(\)\s*=>\s*void\s+refreshTasks)[\s\S]{0,200}?\}\s*,\s*\[\s*(?:refreshTasks)?\s*\]\s*\)/.test(tasks)) {
    failures.push("TasksPageClient must not refresh tasks in an initial effect.");
  }
  if (/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,300}?void\s+refetchMonth\s*\(\s*(?:initialYear|\d+)\s*,\s*(?:initialMonth|\d+)\s*\)[\s\S]{0,200}?\}\s*,\s*\[\s*\]\s*\)/.test(schedule)) {
    failures.push("SchedulePageClient must not refetch a month in an initial effect.");
  }
  if (
    /\bgetAllProfiles\s*\(/.test(chat) &&
    !/if\s*\(\s*initialPeople\s*!==\s*undefined\s*\)\s*return/.test(chat)
  ) {
    failures.push("ChatPageClient must not reload initial people on mount.");
  }
  if (
    /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,300}?ensureMemoChannel\s*\(/.test(chat) &&
    !/initialChannels\.some\s*\(\s*\(channel\)\s*=>\s*channel\.type\s*===\s*["']memo["']\s*\)/.test(chat)
  ) {
    failures.push("ChatPageClient must only ensure a missing memo channel.");
  }
  if (/import\s+\*\s+as\s+XLSX\s+from\s+["']xlsx["']/.test(influencerUrl)) {
    failures.push("Influencer URL parsing must not statically import xlsx.");
  }
  if (/import\s+BulkUploadModal\s+from\s+["']\.\/BulkUploadModal["']/.test(topUrlBar)) {
    failures.push("TopUrlBar must not statically import BulkUploadModal.");
  }
  if (/<BulkUploadModal\b[\s\S]*\/>/.test(topUrlBar) && !/bulkOpen\s*&&\s*\(\s*<BulkUploadModal\b/.test(topUrlBar)) {
    failures.push("TopUrlBar must mount BulkUploadModal only while it is open.");
  }
  return failures;
}

export function auditBuild({
  buildDir = path.join(appRoot, ".next"),
  budgets = ROUTE_BUDGETS,
  baselines = ROUTE_BASELINES,
  appRoot: sourceRoot = appRoot,
} = {}) {
  const manifestFiles = walk(
    path.join(buildDir, "server", "app"),
    (name) => name === "page_client-reference-manifest.js",
  );
  const routes = manifestFiles.flatMap((filename) => routeReport(buildDir, loadManifest(filename)));
  const failures = [];

  for (const report of routes) {
    const maximum = budgets[report.route] ?? (baselines[report.route] ? Math.floor(baselines[report.route] * 1.1) : undefined);
    if (maximum !== undefined && report.bytes > maximum) {
      failures.push(`${report.route}: ${report.bytes}B exceeds ${maximum}B.`);
    }
  }

  const influencerManifest = manifestFiles.find((filename) => filename.endsWith(path.join("dashboard", "influencer", "page_client-reference-manifest.js")));
  if (influencerManifest) {
    const contents = readFileSync(influencerManifest, "utf8");
    const influencer = routes.find((route) => route.route === "/dashboard/influencer");
    const hasXlsxChunk = influencer?.chunks.some((chunk) => /xlsx/i.test(chunk)) ?? false;
    if (/xlsx/i.test(contents) || hasXlsxChunk) {
      failures.push("/dashboard/influencer: initial manifest must not contain xlsx.");
    }
  }

  return {
    routes: routes.map(({ route, files, bytes }) => ({ route, files, bytes })),
    failures,
    sourceFailures: auditSourceGuards(sourceRoot),
  };
}

function formatRoute(route) {
  return `${route.route}: ${route.files} files, ${route.bytes}B`;
}

function main() {
  const strictSourceGuards = process.argv.includes("--strict-source-guards");
  const report = auditBuild();
  if (report.routes.length === 0) {
    console.error("Performance audit failed: no page client-reference manifests found. Run npm run build first.");
    process.exitCode = 1;
    return;
  }

  console.log("Initial JavaScript by route:");
  for (const route of report.routes.sort((a, b) => a.route.localeCompare(b.route))) console.log(`- ${formatRoute(route)}`);

  if (report.sourceFailures.length > 0) {
    const heading = strictSourceGuards ? "Static guard failures:" : "Static guards pending later remediation stages:";
    console[strictSourceGuards ? "error" : "warn"](heading);
    for (const failure of report.sourceFailures) console[strictSourceGuards ? "error" : "warn"](`- ${failure}`);
  }

  if (report.failures.length > 0) {
    console.error("Performance audit failed:");
    for (const failure of report.failures) console.error(`- ${failure}`);
  }
  if (report.failures.length > 0 || (strictSourceGuards && report.sourceFailures.length > 0)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
