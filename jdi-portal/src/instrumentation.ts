/**
 * Next.js instrumentation hook.
 *
 * Keep this lightweight: importing dashboard UI modules here loads large
 * client-only libraries during server startup and can slow Railway cold starts.
 */

const KEEP_WARM_INTERVAL_MS = 4 * 60 * 1000;
const KEEP_WARM_PATH = "/api/keep-warm";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as { __jdiWarmStarted?: boolean };
  if (g.__jdiWarmStarted) return;
  g.__jdiWarmStarted = true;

  const port = process.env.PORT || "3000";
  const selfUrl = `http://127.0.0.1:${port}${KEEP_WARM_PATH}`;
  const timer = setInterval(() => {
    fetch(selfUrl).catch(() => {});
  }, KEEP_WARM_INTERVAL_MS);
  timer.unref();
}
