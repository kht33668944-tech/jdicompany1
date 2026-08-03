// 진입점.
//   발굴:       node scripts/influencer-discovery/run.mjs --limit 30 --yes
//   재판정:     node scripts/influencer-discovery/run.mjs --rejudge --yes
//
//   씨앗 담기(--bootstrap)만 운영 DB 를 읽으므로 DATABASE_URL 이 필요하다.
//   예전에 쓰던 `railway run` 은 Railway 배포를 중지해서 더 이상 동작하지 않는다.
//   지금은 GCP Secret Manager 에서 꺼내 환경변수로만 넘긴다(파일·로그에 남지 않게).
//
//     bash:
//       DATABASE_URL="$(gcloud secrets versions access latest \
//         --secret=DATABASE_URL --project jdi-portal-seoul)" \
//         node scripts/influencer-discovery/run.mjs --bootstrap
//
//     PowerShell:
//       $env:DATABASE_URL = (gcloud secrets versions access latest `
//         --secret=DATABASE_URL --project jdi-portal-seoul)
//       node scripts/influencer-discovery/run.mjs --bootstrap
//
// 설계: docs/superpowers/specs/2026-07-30-influencer-discovery-relatedprofiles-design.md

import { readFileSync } from "node:fs";
import { fetchProfile } from "./apify.mjs";
import { fetchReels } from "./reels.mjs";
import { computeMetrics, computeReelMetrics } from "./metrics.mjs";
import { buildContext, judgePreGate, judgeWithContext } from "./verdict.mjs";
import { computeScore, gradeOf } from "./score.mjs";
import { buildReport, collectRow, extractContact } from "./report.mjs";
import {
  addSeed,
  countPendingSeeds,
  isRegistered,
  loadState,
  pickPendingSeeds,
  saveState,
  setRegistered,
} from "./state.mjs";

const HARD_CAP = 300;
const DAILY_CAP = 500;
const CONCURRENCY = 3;
// 릴스 12 → 8건. 꾸준함 계산에는 8건으로 충분하고(안정성 판정 최소 표본 3건),
// 릴스 1건당 $0.0026 이라 4건 줄이면 계정당 $0.0104 를 아낀다.
const REELS_PER_ACCOUNT = 8;

// 2026-07-30 실측 단가 (Apify API 로 확인):
//   instagram-scraper details 1회 = $0.0027
//   instagram-reel-scraper = actor-start $0.001 + 릴스당 $0.0026
const COST_PROFILE_USD = 0.0027;
const COST_REELS_USD = 0.001 + 0.0026 * REELS_PER_ACCOUNT; // = $0.0218

// 대표가 모아둔 52개 중 홈리빙이 아닌 계정 — 씨앗에서 제외한다.
const SEED_EXCLUDE = new Set([
  "yj_____07.08", "_u.nii", "duning_d", "ssongbi.mood", "februaryiin", "hanadool",
]);

function parseArgs(argv) {
  const args = {
    limit: 30, yes: false, bootstrap: false, rejudge: false, offline: false,
    // 기본은 "한 번 보고한 계정은 다시 안 낸다". 전체를 다시 봐야 할 때만 켠다.
    all: false,
    // 이번 실행 지출 상한(USD). 무료 플랜은 크레딧을 넘기면 다음 주기까지 정지되므로
    // 중간에 끊기지 않게 스스로 멈춘다.
    maxUsd: 0.5,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") args.yes = true;
    else if (a === "--bootstrap") args.bootstrap = true;
    else if (a === "--rejudge") args.rejudge = true;
    else if (a === "--offline") args.offline = true;
    else if (a === "--all") args.all = true;
    else if (a === "--max-usd") args.maxUsd = Number(argv[++i]);
    else if (a.startsWith("--max-usd=")) args.maxUsd = Number(a.split("=")[1]);
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a.startsWith("--limit=")) args.limit = Number(a.split("=")[1]);
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) {
    throw new Error("--limit 은 1 이상의 정수여야 합니다.");
  }
  if (args.limit > HARD_CAP) {
    throw new Error(`--limit 상한은 ${HARD_CAP} 입니다 (요청: ${args.limit}). 비용 안전장치.`);
  }
  if (!Number.isFinite(args.maxUsd) || args.maxUsd <= 0) {
    throw new Error("--max-usd 는 0보다 큰 숫자여야 합니다.");
  }
  return args;
}

function readToken() {
  if (process.env.APIFY_API_TOKEN) return process.env.APIFY_API_TOKEN.trim();
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  const t = env.match(/^APIFY_API_TOKEN=(.+)$/m)?.[1]?.trim();
  if (!t) throw new Error("APIFY_API_TOKEN 을 찾을 수 없습니다.");
  return t;
}

async function bootstrapSeeds(state) {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL 없음. GCP Secret Manager 에서 꺼내 환경변수로 넘기세요 " +
        "(이 파일 맨 위 주석에 bash/PowerShell 예시가 있습니다). " +
        "예전에 쓰던 `railway run` 은 Railway 배포 중지로 동작하지 않습니다.",
    );
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT username, follower_count FROM public.influencers
        WHERE platform = 'instagram' AND username IS NOT NULL`,
    );

    // ① 등록 명단으로 기록 → 이 계정들은 앞으로 후보에서 영구 제외된다.
    const registeredAdded = setRegistered(state, rows.map((r) => r.username));

    // ② 확장 출발점(sourceOnly)으로만 씨앗에 담는다. 후보로 채점하지 않는다.
    let sources = 0, skipped = 0;
    for (const r of rows) {
      if (SEED_EXCLUDE.has(r.username)) { skipped++; continue; }
      const f = r.follower_count ?? 0;
      const priority = f >= 7000 && f <= 300_000 ? 2 : 1;
      if (
        addSeed(state, r.username, {
          sourceUsername: "(대표 등록 명단)", priority, sourceOnly: true,
        })
      ) sources++;
    }
    console.log(
      `등록 계정 ${registeredAdded}개를 후보 제외 명단에 기록 (원본 ${rows.length}개)\n` +
        `확장 출발점으로 ${sources}개 등록, 카테고리 불일치 ${skipped}개 제외`,
    );
  } finally {
    await client.end();
  }
}

const todayKST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function usedToday(state) {
  return state.runs
    .filter((r) => r.runDate === todayKST())
    .reduce((s, r) => s + (r.calls ?? r.fetched ?? 0), 0);
}

async function pool(items, n, worker) {
  const results = [];
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

/**
 * 이전 실행에서 context 를 저장하지 않은 행을 위한 복원.
 * 저장된 flags/homeLivingHits 로 판정 맥락을 되살린다.
 * 재판정 대상 30건은 비공개·업체(2신호)로 걸린 적이 없으므로 그 둘은 안전하게 false/[] 이다.
 */
function reconstructContext(entry) {
  if (entry.context) return entry.context;
  const flags = entry.flags ?? [];
  const bizFlag = flags.find((f) => f.startsWith("업체?("));
  const catFlag = flags.find((f) => f.startsWith("업종:"));
  return {
    isPrivate: false,
    homeLivingHits: entry.homeLivingHits ?? 0,
    signals: bizFlag ? [bizFlag.slice(4, -1)] : [],
    businessCategoryName: catFlag ? catFlag.slice(3) : null,
  };
}

function applyVerdict(entry, context, metrics, now) {
  const verdict = judgeWithContext(context, metrics);
  const { score, stabilityReliable } = computeScore(metrics);
  const grade = verdict.verdict === "pass" ? gradeOf(score) : null;

  entry.judgedAt = now.toISOString();
  entry.context = context;
  entry.verdict = verdict.verdict;
  entry.filterReason = verdict.filterReason;
  entry.flags = verdict.flags;
  entry.score = verdict.verdict === "pass" ? score : null;
  entry.grade = grade;
  entry.stabilityReliable = stabilityReliable;
  entry.homeLivingHits = verdict.homeLivingHits;
  entry.metrics = {
    ...metrics,
    lastPostAt: metrics.lastPostAt ? metrics.lastPostAt.toISOString() : null,
  };
  return { verdict, score, grade };
}

// rowFrom / collectRow 는 report.mjs 로 옮겼다 — 보고 대상 선별은 보고서의 관심사이고,
// run.mjs 는 import 하면 main() 이 실행되므로 테스트에서 불러올 수 없다.

// ============================================================
// 재판정 — 프로필은 저장된 것을 쓰고 조회수만 제대로 다시 받는다
// ============================================================
async function rejudge(state, token, args) {
  const targets = Object.entries(state.profiles).filter(([, e]) => e.verdict !== "error");
  if (targets.length === 0) {
    console.log("재판정할 계정이 없습니다.");
    return;
  }

  // --offline: 저장된 조회수를 그대로 쓰고 판정·점수만 다시 계산한다. Apify 호출 0회, 비용 0원.
  // 판정 기준을 바꿨을 때 이미 수집한 계정에 소급 적용하는 용도.
  if (args.offline) {
    const usable = targets.filter(([, e]) => e.viewSource === "reel-scraper");
    console.log(
      `오프라인 재판정 ${usable.length}개 (저장된 조회수 사용, 호출 0회 · 비용 0원)` +
        (usable.length < targets.length
          ? `\n제외 ${targets.length - usable.length}개 — 신뢰할 수 없는 조회수 출처`
          : ""),
    );
    const now = new Date();
    let passed = 0, alreadyRegistered = 0, alreadyReported = 0;
    const rejectReasons = {};
    const rows = [];

    for (const [, entry] of usable) {
      const m = entry.metrics ?? {};
      const metrics = { ...m, lastPostAt: m.lastPostAt ? new Date(m.lastPostAt) : null };
      const { verdict } = applyVerdict(entry, reconstructContext(entry), metrics, now);
      if (verdict.verdict === "pass") {
        passed++;
        const outcome = collectRow(state, entry, rows, { includeReported: args.all });
        if (outcome === "already-registered") alreadyRegistered++;
        if (outcome === "already-reported") alreadyReported++;
      } else {
        rejectReasons[verdict.filterReason] = (rejectReasons[verdict.filterReason] ?? 0) + 1;
      }
    }

    rows.sort((a, b) => b.score - a.score);
    state.runs.push({
      at: now.toISOString(), runDate: todayKST(), mode: "rejudge-offline",
      calls: 0, fetched: usable.length, failed: 0, passed,
      reported: rows.length, seedHarvested: 0,
    });

    const saved = saveState(state);
    console.log("\n========== 재판정 보고서 (오프라인) ==========\n");
    console.log(
      buildReport(rows, {
        fetched: usable.length, failed: 0, passed, rejectReasons, seedHarvested: 0,
        alreadyRegistered, alreadyReported,
        pendingSeeds: countPendingSeeds(state), statePath: saved,
      }),
    );
    return;
  }

  console.log(
    `재판정 대상 ${targets.length}개 (릴스만 다시 수집)\n` +
      `예상 비용: 최대 약 $${(targets.length * COST_REELS_USD).toFixed(2)}`,
  );
  if (!args.yes) {
    console.log("실제로 실행하려면 --yes 를 붙이세요. (아무것도 호출하지 않았습니다)");
    return;
  }

  let fetched = 0, failed = 0, passed = 0, alreadyRegistered = 0, alreadyReported = 0;
  const rejectReasons = {};
  const rows = [];
  const now = new Date();

  await pool(targets, CONCURRENCY, async ([key, entry]) => {
    try {
      const reels = await fetchReels(entry.username, token, { limit: REELS_PER_ACCOUNT });
      fetched++;
      const context = reconstructContext(entry);
      const metrics = computeReelMetrics(
        {
          followers: entry.metrics?.followers ?? null,
          follows: entry.metrics?.follows ?? null,
          reelsRatio: entry.metrics?.reelsRatio ?? null,
        },
        reels,
        now,
      );
      const { verdict, score, grade } = applyVerdict(entry, context, metrics, now);
      entry.viewSource = "reel-scraper";

      if (verdict.verdict === "pass") {
        passed++;
        const outcome = collectRow(state, entry, rows, { includeReported: args.all });
        if (outcome === "already-registered") alreadyRegistered++;
        if (outcome === "already-reported") alreadyReported++;
      } else {
        rejectReasons[verdict.filterReason] = (rejectReasons[verdict.filterReason] ?? 0) + 1;
      }
      console.log(
        `  ✓ @${entry.username} — ${verdict.verdict === "pass" ? `${grade ?? "미달"} ${score}점` : verdict.filterReason}`,
      );
    } catch (err) {
      failed++;
      console.log(`  ✗ @${entry.username} — 실패: ${String(err.message).slice(0, 120)}`);
    }
  });

  rows.sort((a, b) => b.score - a.score);

  state.runs.push({
    at: now.toISOString(), runDate: todayKST(), mode: "rejudge",
    calls: fetched, fetched, failed, passed, reported: rows.length, seedHarvested: 0,
  });

  const saved = saveState(state);
  console.log("\n========== 재판정 보고서 ==========\n");
  console.log(
    buildReport(rows, {
      fetched, failed, passed, rejectReasons, seedHarvested: 0,
      alreadyRegistered, alreadyReported,
      pendingSeeds: countPendingSeeds(state), statePath: saved,
    }),
  );
}

// ============================================================
// 발굴 — 프로필 + 릴스 2회 호출
// ============================================================
async function discover(state, token, args) {
  const seeds = pickPendingSeeds(state, args.limit);
  if (seeds.length === 0) {
    console.log("수집할 씨앗이 없습니다. 먼저 --bootstrap 으로 씨앗을 담으세요.");
    return;
  }
  const perAccount = COST_PROFILE_USD + COST_REELS_USD;
  console.log(
    `수집 대상 ${seeds.length}개 / 씨앗 큐 잔량 ${countPendingSeeds(state)}개\n` +
      `예상 비용: 최대 $${(seeds.length * perAccount).toFixed(2)} ` +
      `(전원이 프로필 판정을 통과할 때. 계정당 $${perAccount.toFixed(4)})\n` +
      `           최소 $${(seeds.length * COST_PROFILE_USD).toFixed(2)} ` +
      `(전원이 프로필 판정에서 걸릴 때. 계정당 $${COST_PROFILE_USD})`,
  );
  if (!args.yes) {
    console.log("실제로 실행하려면 --yes 를 붙이세요. (아무것도 호출하지 않았습니다)");
    return;
  }

  let fetched = 0, failed = 0, passed = 0, seedHarvested = 0, calls = 0;
  let alreadyRegistered = 0, skippedRegistered = 0, alreadyReported = 0;
  let preGateRejected = 0, reelsFetched = 0, budgetDeferred = 0;
  const seedNotConsumed = new Set();
  const rejectReasons = {};
  const rows = [];
  const now = new Date();

  await pool(seeds, CONCURRENCY, async (seed) => {
    const key = seed.key;

    // Apify 를 부르기 전 차단. 여기서 걸러야 비용이 0원이다.
    if (isRegistered(state, seed.username)) {
      skippedRegistered++;
      state.seeds[key].consumedAt = new Date().toISOString();
      console.log(`  · @${seed.username} — 이미 등록된 계정, 호출 생략`);
      return;
    }

    try {
      // 1단: 값싼 프로필 호출 ($0.0027)
      const profile = await fetchProfile(seed.username, token);
      calls++;
      fetched++;
      // 조회수는 여기서 쓰지 않는다 — details 조회수는 신뢰할 수 없다(설계 문서 참조).
      const rough = computeMetrics(profile, now);
      const context = buildContext(profile);

      const entry = {
        username: profile.username ?? seed.username,
        fetchedAt: now.toISOString(),
        contact: extractContact(profile),
        sourceSeedUsername: seed.sourceUsername,
        reported: false,
      };

      // 유사 계정 수확은 릴스 호출과 무관하므로 먼저 처리한다.
      if (context.homeLivingHits > 0) {
        for (const rp of profile.relatedProfiles ?? []) {
          const uname = typeof rp === "string" ? rp : rp?.username;
          if (
            uname && !isRegistered(state, uname) &&
            addSeed(state, uname, { sourceUsername: profile.username, priority: 1 })
          ) seedHarvested++;
        }
      }

      // 2단: 프로필만으로 걸러낼 수 있으면 비싼 릴스 호출($0.0218)을 건너뛴다.
      const pre = judgePreGate(context, {
        followers: rough.followers,
        follows: rough.follows,
        reelsRatio: rough.reelsRatio,
        daysSinceLastPost: rough.daysSinceLastPost,
      });
      if (pre.verdict === "reject") {
        preGateRejected++;
        Object.assign(entry, {
          judgedAt: now.toISOString(), context,
          verdict: "reject", filterReason: pre.filterReason, flags: [],
          score: null, grade: null, viewSource: "pre-gate",
          metrics: {
            followers: rough.followers, follows: rough.follows,
            reelsRatio: rough.reelsRatio,
            lastPostAt: rough.lastPostAt ? rough.lastPostAt.toISOString() : null,
            daysSinceLastPost: rough.daysSinceLastPost,
          },
        });
        state.profiles[key] = entry;
        rejectReasons[pre.filterReason] = (rejectReasons[pre.filterReason] ?? 0) + 1;
        console.log(`  · @${seed.username} — ${pre.filterReason} (릴스 호출 생략)`);
        return;
      }

      // 예산 한도: 릴스를 더 부르면 상한을 넘는다면 여기서 멈춘다.
      // 씨앗은 소비 처리하지 않아 다음 실행에서 다시 잡힌다(프로필 $0.0027 만 재지출).
      const spentSoFar = fetched * COST_PROFILE_USD + reelsFetched * COST_REELS_USD;
      if (spentSoFar + COST_REELS_USD > args.maxUsd) {
        budgetDeferred++;
        seedNotConsumed.add(key);
        console.log(`  ⏸ @${seed.username} — 예산 한도($${args.maxUsd}) 도달, 다음 실행으로 미룸`);
        return;
      }

      // 3단: 통과한 계정만 릴스 수집
      const reels = await fetchReels(seed.username, token, { limit: REELS_PER_ACCOUNT });
      calls++;
      reelsFetched++;

      const metrics = computeReelMetrics(
        { followers: rough.followers, follows: rough.follows, reelsRatio: rough.reelsRatio },
        reels,
        now,
      );
      entry.viewSource = "reel-scraper";
      const { verdict, score, grade } = applyVerdict(entry, context, metrics, now);
      state.profiles[key] = entry;

      if (verdict.verdict === "pass") {
        passed++;
        const outcome = collectRow(state, entry, rows, { includeReported: args.all });
        if (outcome === "already-registered") alreadyRegistered++;
        if (outcome === "already-reported") alreadyReported++;
      } else {
        rejectReasons[verdict.filterReason] = (rejectReasons[verdict.filterReason] ?? 0) + 1;
      }
      console.log(
        `  ✓ @${seed.username} — ${verdict.verdict === "pass" ? `${grade ?? "미달"} ${score}점` : verdict.filterReason}`,
      );
    } catch (err) {
      failed++;
      state.profiles[key] = {
        username: seed.username, fetchedAt: now.toISOString(),
        verdict: "error", filterReason: String(err.message).slice(0, 300),
        flags: [], reported: false,
      };
      console.log(`  ✗ @${seed.username} — 실패: ${String(err.message).slice(0, 120)}`);
    } finally {
      // 예산 한도로 미룬 계정은 소비 처리하지 않는다 — 다음 실행에서 다시 평가해야 한다.
      if (!seedNotConsumed.has(key)) {
        state.seeds[key].consumedAt = new Date().toISOString();
      }
    }
  });

  rows.sort((a, b) => b.score - a.score);

  const spent = fetched * COST_PROFILE_USD + reelsFetched * COST_REELS_USD;
  state.runs.push({
    at: now.toISOString(), runDate: todayKST(), mode: "discover",
    calls, fetched, failed, passed, reported: rows.length, seedHarvested,
    skippedRegistered, preGateRejected, reelsFetched, budgetDeferred,
    estimatedUsd: Number(spent.toFixed(4)),
  });

  const saved = saveState(state);
  console.log("\n========== 보고서 ==========\n");
  console.log(
    buildReport(rows, {
      fetched, failed, passed, rejectReasons, seedHarvested,
      alreadyRegistered, skippedRegistered, alreadyReported,
      preGateRejected, reelsFetched, budgetDeferred, maxUsd: args.maxUsd,
      estimatedUsd: spent,
      pendingSeeds: countPendingSeeds(state), statePath: saved,
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const state = loadState();

  if (args.bootstrap) {
    await bootstrapSeeds(state);
    const p = saveState(state);
    console.log(`씨앗 큐 잔량: ${countPendingSeeds(state)}개 → ${p}`);
    return;
  }

  // 오프라인 재판정은 Apify 를 호출하지 않으므로 토큰도 상한 검사도 필요 없다.
  if (args.rejudge && args.offline) {
    await rejudge(state, null, args);
    return;
  }

  const token = readToken();
  const budget = args.rejudge ? args.limit : args.limit * 2;
  const already = usedToday(state);
  if (already + budget > DAILY_CAP) {
    throw new Error(`하루 상한(${DAILY_CAP}호출) 초과: 오늘 이미 ${already}호출.`);
  }

  if (args.rejudge) await rejudge(state, token, args);
  else await discover(state, token, args);
}

main().catch((err) => {
  console.error(`\n실행 중단: ${err.message}`);
  process.exitCode = 1;
});
