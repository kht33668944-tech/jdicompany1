import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "jdi-performance-audit-"));
  const buildDir = path.join(root, ".next");
  const manifestDir = path.join(buildDir, "server", "app", "dashboard");
  const staticDir = path.join(buildDir, "static", "chunks");
  mkdirSync(manifestDir, { recursive: true });
  mkdirSync(staticDir, { recursive: true });
  writeFileSync(path.join(staticDir, "shared.js"), "x".repeat(10));
  writeFileSync(path.join(staticDir, "page.js"), "x".repeat(20));
  writeFileSync(
    path.join(manifestDir, "page_client-reference-manifest.js"),
    'globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n' +
      'globalThis.__RSC_MANIFEST["/dashboard/page"] = {"entryJSFiles":{"page":["static/chunks/shared.js","static/chunks/page.js"]}};\n',
  );
  return { root, buildDir };
}

test("audits manifest chunk counts and byte budgets", async () => {
  const { auditBuild } = await import("./performance-audit.mjs");
  const { root, buildDir } = makeFixture();
  try {
    const report = auditBuild({
      buildDir,
      budgets: { "/dashboard": 30 },
      baselines: {},
      appRoot: root,
    });

    assert.deepEqual(report.routes, [{ route: "/dashboard", files: 2, bytes: 30 }]);
    assert.deepEqual(report.failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails a route that exceeds its budget by one byte", async () => {
  const { auditBuild } = await import("./performance-audit.mjs");
  const { root, buildDir } = makeFixture();
  try {
    const report = auditBuild({
      buildDir,
      budgets: { "/dashboard": 29 },
      baselines: {},
      appRoot: root,
    });

    assert.match(report.failures.join("\n"), /\/dashboard.*30B.*29B/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when the influencer initial manifest contains xlsx", async () => {
  const { auditBuild } = await import("./performance-audit.mjs");
  const { root, buildDir } = makeFixture();
  const manifestDir = path.join(buildDir, "server", "app", "dashboard", "influencer");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    path.join(manifestDir, "page_client-reference-manifest.js"),
    'globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n' +
      'globalThis.__RSC_MANIFEST["/dashboard/influencer/page"] = {"entryJSFiles":{"page":["static/chunks/shared.js"]},"clientModules":{"xlsx":{"chunks":["/_next/static/chunks/shared.js"]}}};\n',
  );
  try {
    const report = auditBuild({ buildDir, budgets: {}, baselines: {}, appRoot: root });
    assert.match(report.failures.join("\n"), /xlsx/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("guards Stage 5 influencer XLSX and bulk-upload lazy loading", async () => {
  const { auditSourceGuards } = await import("./performance-audit.mjs");
  const root = mkdtempSync(path.join(tmpdir(), "jdi-performance-stage-5-"));
  try {
    const sources = [
      ["src/lib/influencer/url.ts", 'import * as XLSX from "xlsx";'],
      [
        "src/components/dashboard/influencer/TopUrlBar.tsx",
        'import BulkUploadModal from "./BulkUploadModal";\n<BulkUploadModal open={bulkOpen} onClose={close} />;',
      ],
    ];
    for (const [relativePath, contents] of sources) {
      const filename = path.join(root, relativePath);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, contents);
    }

    assert.deepEqual(auditSourceGuards(root), [
      "Influencer URL parsing must not statically import xlsx.",
      "TopUrlBar must not statically import BulkUploadModal.",
      "TopUrlBar must mount BulkUploadModal only while it is open.",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("detects remediated-source regressions in strict mode", async () => {
  const { auditSourceGuards } = await import("./performance-audit.mjs");
  const root = mkdtempSync(path.join(tmpdir(), "jdi-performance-sources-"));
  try {
    const sources = [
      ["src/components/dashboard/DashboardShell.tsx", 'import DashboardWarmup from "./DashboardWarmup";\nexport default () => <DashboardWarmup />;'],
      ["src/components/dashboard/tasks/TasksPageClient.tsx", 'useEffect(() => { void refreshTasks(); }, []);'],
      ["src/components/dashboard/schedule/SchedulePageClient.tsx", 'useEffect(() => { void refetchMonth(2026, 7); }, []);'],
    ];
    for (const [relativePath, contents] of sources) {
      const filename = path.join(root, relativePath);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, contents);
    }

    assert.deepEqual(auditSourceGuards(root), [
      "DashboardShell must not mount DashboardWarmup.",
      "TasksPageClient must not refresh tasks in an initial effect.",
      "SchedulePageClient must not refetch a month in an initial effect.",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects dashboard-wide route prefetches", async () => {
  const { auditSourceGuards } = await import("./performance-audit.mjs");
  const root = mkdtempSync(path.join(tmpdir(), "jdi-performance-prefetch-"));
  try {
    const filename = path.join(root, "src/components/dashboard/DashboardShell.tsx");
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(
      filename,
      'router.prefetch("/dashboard/tasks");\nrouter.prefetch("/dashboard/schedule");',
    );

    assert.deepEqual(auditSourceGuards(root), [
      "DashboardShell must not prefetch dashboard routes globally.",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("guards Stage 2 duplicate hydration refetches", async () => {
  const { auditSourceGuards } = await import("./performance-audit.mjs");
  const root = mkdtempSync(path.join(tmpdir(), "jdi-performance-stage-2-"));
  try {
    const sources = [
      ["src/components/dashboard/DashboardClient.tsx", 'useEffect(() => {\n  router.refresh();\n}, [router]);'],
      ["src/components/dashboard/tasks/TasksPageClient.tsx", 'useEffect(() => {\n  void refreshTasks();\n}, []);'],
      ["src/components/dashboard/schedule/SchedulePageClient.tsx", 'useEffect(() => {\n  void refetchMonth(initialYear, initialMonth);\n}, []);'],
      ["src/components/dashboard/chat/ChatPageClient.tsx", 'useEffect(() => {\n  getAllProfiles();\n}, [userId]);\nuseEffect(() => {\n  ensureMemoChannel();\n}, [userId]);'],
    ];
    for (const [relativePath, contents] of sources) {
      const filename = path.join(root, relativePath);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, contents);
    }

    assert.deepEqual(auditSourceGuards(root), [
      "DashboardClient must not refresh the dashboard on initial mount.",
      "TasksPageClient must not refresh tasks in an initial effect.",
      "SchedulePageClient must not refetch a month in an initial effect.",
      "ChatPageClient must not reload initial people on mount.",
      "ChatPageClient must only ensure a missing memo channel.",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("guards Stage 5 influencer list payload and single responsive row rendering", () => {
  const appRoot = path.resolve(import.meta.dirname, "..");
  const queries = readFileSync(path.join(appRoot, "src/lib/influencer/queries.ts"), "utf8");
  const listQuery = queries.split("export async function getInfluencerById")[0];
  const page = readFileSync(path.join(appRoot, "src/app/dashboard/influencer/page.tsx"), "utf8");
  const detailPanel = readFileSync(
    path.join(appRoot, "src/components/dashboard/influencer/InfluencerDetailPanel.tsx"),
    "utf8",
  );
  const table = readFileSync(
    path.join(appRoot, "src/components/dashboard/influencer/InfluencerTable.tsx"),
    "utf8",
  );

  assert.match(listQuery, /pageSize\s*=\s*25/);
  assert.doesNotMatch(listQuery, /\b(bio|ai_insights|ai_summary|notes)\b/);
  assert.match(page, /pageSize:\s*25/);
  assert.match(detailPanel, /if \(!influencerId\) return;/);
  assert.match(detailPanel, /\.select\("\*"\)\s*\.eq\("id", influencerId\)/);

  const rowRendering = table.slice(table.indexOf("const displayed"));
  assert.match(rowRendering, /displayed\.map\(/);
  assert.match(rowRendering, /\{isMobile\s*&&\s*\([\s\S]*?displayed\.map\(/);
  assert.match(rowRendering, /\{!isMobile\s*&&\s*\([\s\S]*?displayed\.map\(/);
});
