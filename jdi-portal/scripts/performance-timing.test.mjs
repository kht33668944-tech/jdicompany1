import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

const appRoot = path.resolve(import.meta.dirname, "..");
const timingSource = path.join(appRoot, "src", "lib", "performance", "timing.ts");

function loadTimingHelper() {
  assert.ok(existsSync(timingSource), "performance timing helper must exist");
  const outputDir = mkdtempSync(path.join(tmpdir(), "jdi-performance-timing-"));
  try {
    execFileSync(
      process.execPath,
      [
        path.join(appRoot, "node_modules", "typescript", "bin", "tsc"),
        "--module", "commonjs",
        "--moduleResolution", "node",
        "--target", "es2022",
        "--esModuleInterop",
        "true",
        "--skipLibCheck",
        "true",
        "--outDir",
        outputDir,
        timingSource,
      ],
      { cwd: appRoot, stdio: "pipe" },
    );
    return {
      timing: createRequire(import.meta.url)(path.join(outputDir, "timing.js")),
      outputDir,
    };
  } catch (error) {
    rmSync(outputDir, { recursive: true, force: true });
    throw error;
  }
}

test("records only privacy-safe fields for operations taking at least one second", async () => {
  const { timing, outputDir } = loadTimingHelper();
  try {
    const events = [];
    let now = 100;
    const result = await timing.measureOperation(
      { route: "/dashboard", operation: "postgres.dashboard_snapshot", requestId: "request-1" },
      async () => {
        now = 1_100;
        return "ok";
      },
      { now: () => now, emit: (event) => events.push(event) },
    );

    assert.equal(result, "ok");
    assert.deepEqual(events, [{
      route: "/dashboard",
      operation: "postgres.dashboard_snapshot",
      durationMs: 1_000,
      requestId: "request-1",
    }]);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("does not emit fast operations", async () => {
  const { timing, outputDir } = loadTimingHelper();
  try {
    const events = [];
    let now = 100;
    await timing.measureOperation(
      { route: "/dashboard", operation: "postgres.dashboard_snapshot", requestId: "request-1" },
      async () => {
        now = 999;
      },
      { now: () => now, emit: (event) => events.push(event) },
    );

    assert.deepEqual(events, []);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
