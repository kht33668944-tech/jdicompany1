// Apify 실제 청구액 조회. 추정치가 아니라 콘솔과 같은 숫자를 본다.
//   node scripts/influencer-discovery/cost.mjs
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
const token = process.env.APIFY_API_TOKEN?.trim() ??
  env.match(/^APIFY_API_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token) throw new Error("APIFY_API_TOKEN 없음");

const api = async (path) => {
  const res = await fetch(`https://api.apify.com/v2${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data;
};

const me = await api("/users/me");
console.log(`계정: ${me.username} / 플랜: ${me.plan?.id ?? "?"}`);
if (me.plan?.monthlyUsageCreditsUsd != null) {
  console.log(`월 포함 크레딧: $${me.plan.monthlyUsageCreditsUsd}`);
}

// 이번 달 사용량
try {
  const usage = await api("/users/me/usage/monthly");
  console.log(
    `\n이번 달 누적 사용액: $${(usage.totalUsageCreditsUsd ?? 0).toFixed(3)}` +
      (usage.monthlyServiceUsage
        ? ` (기간 ${usage.usageCycle?.startAt?.slice(0, 10)} ~ ${usage.usageCycle?.endAt?.slice(0, 10)})`
        : ""),
  );
} catch (e) {
  console.log(`\n월 사용량 조회 실패: ${e.message}`);
}

// 최근 실행별 실제 비용
const runs = await api("/actor-runs?limit=1000&desc=true");

// actor id → 이름 (한 번만 조회)
const names = {};
for (const id of new Set(runs.items.map((r) => r.actId).filter(Boolean))) {
  try {
    const act = await api(`/acts/${id}`);
    names[id] = `${act.username}/${act.name}`;
  } catch {
    names[id] = id;
  }
}

const KST = (iso) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const today = KST(new Date().toISOString());
const cycleStart = me.plan?.usageCycle?.startAt ?? "2026-07-08";

function summarize(label, items) {
  const byActor = {};
  let total = 0;
  for (const r of items) {
    const key = names[r.actId] ?? r.actId ?? "unknown";
    byActor[key] ??= { runs: 0, usd: 0 };
    byActor[key].runs++;
    byActor[key].usd += r.usageTotalUsd ?? 0;
    total += r.usageTotalUsd ?? 0;
  }
  console.log(`\n=== ${label} — 실행 ${items.length}회 / $${total.toFixed(4)} (약 ${Math.round(total * 1390).toLocaleString("ko-KR")}원) ===`);
  for (const [name, v] of Object.entries(byActor).sort((a, b) => b[1].usd - a[1].usd)) {
    console.log(
      `  ${name.padEnd(36)} ${String(v.runs).padStart(3)}회  $${v.usd.toFixed(4)}  (평균 $${(v.usd / v.runs).toFixed(4)}/회)`,
    );
  }
  return total;
}

const todayRuns = runs.items.filter((r) => r.startedAt && KST(r.startedAt) === today);
const cycleRuns = runs.items.filter((r) => r.startedAt && r.startedAt >= cycleStart);

const todayTotal = summarize(`오늘(${today}) — 이번 발굴 작업`, todayRuns);
const cycleTotal = summarize(`이번 결제주기(${cycleStart.slice(0, 10)} 이후) 전체`, cycleRuns);

console.log(`\n무료 크레딧 $5 중 ${((cycleTotal / 5) * 100).toFixed(0)}% 사용 · 잔액 약 $${(5 - cycleTotal).toFixed(2)}`);

// 계정 수를 고정값으로 나누면 단가가 틀린다 — 상태 파일의 실행 기록에서 실제 평가 건수를 읽는다.
try {
  const { loadState } = await import("./state.mjs");
  const state = loadState();
  const todayKST = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const runsToday = state.runs.filter((r) => r.runDate === todayKST && r.mode !== "rejudge-offline");
  const accounts = runsToday.reduce((s, r) => s + (r.fetched ?? 0), 0);
  if (accounts > 0) {
    console.log(
      `\n오늘 평가한 계정 ${accounts}개 / 실제 $${todayTotal.toFixed(3)}` +
        ` → 계정당 $${(todayTotal / accounts).toFixed(4)} (약 ${Math.round((todayTotal / accounts) * 1390)}원)`,
    );
  }
  const last = runsToday.at(-1);
  if (last?.estimatedUsd != null && last.fetched > 0) {
    console.log(
      `가장 최근 실행: ${last.fetched}개 / 추정 $${last.estimatedUsd.toFixed(3)}` +
        ` → 계정당 약 ${Math.round((last.estimatedUsd / last.fetched) * 1390)}원`,
    );
  }
} catch (e) {
  console.log(`(상태 파일 기반 단가 계산 생략: ${e.message})`);
}
