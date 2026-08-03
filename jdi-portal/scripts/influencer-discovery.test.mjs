// 인플루언서 발굴 — 순수 계산·판정 회귀 검사 (네트워크 없음)
// 실행: node --test scripts/influencer-discovery.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  coefficientOfVariation,
  computeMetrics,
  computeReelMetrics,
  median,
  medianIntervalDays,
  stdev,
  viewCountOf,
} from "./influencer-discovery/metrics.mjs";
import { normalizeReels, playCountOf } from "./influencer-discovery/reels.mjs";
import { buildReport, collectRow } from "./influencer-discovery/report.mjs";
import {
  addSeed,
  countPendingSeeds,
  expansionSources,
  isRegistered,
  pickPendingSeeds,
  setRegistered,
} from "./influencer-discovery/state.mjs";
import {
  buildContext,
  businessSignals,
  countCookingHits,
  countHomeLivingHits,
  engagementFloorFailed,
  isCookingChannel,
  judge,
  judgePreGate,
  judgeWithContext,
} from "./influencer-discovery/verdict.mjs";
import {
  computeScore,
  gradeOf,
  scoreHigherBetter,
  scoreLowerBetter,
  stabilityLabel,
} from "./influencer-discovery/score.mjs";

const NOW = new Date("2026-07-30T12:00:00+09:00");

// 기준 시각으로부터 d일 전 ISO 문자열
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function reel(views, daysBack) {
  return {
    type: "Video",
    productType: "clips",
    videoPlayCount: views,
    likesCount: Math.round(views * 0.05),
    commentsCount: Math.round(views * 0.002),
    timestamp: daysAgo(daysBack),
    hashtags: ["집꾸미기", "홈스타일링"],
  };
}

/** 통과하는 기본 프로필. 각 테스트에서 필요한 필드만 덮어쓴다. */
function goodProfile(overrides = {}) {
  return {
    username: "good_home",
    fullName: "굿홈",
    biography: "집꾸미기 · 홈스타일링 기록 📩 hello@example.com",
    followersCount: 20_000,
    followsCount: 500,
    latestPosts: [
      reel(30_000, 2),
      reel(28_000, 8),
      reel(32_000, 14),
      reel(29_000, 20),
    ],
    ...overrides,
  };
}

test("median — 홀수/짝수/빈 배열", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test("stdev / 변동계수 — 모두 같은 값이면 편차 0", () => {
  assert.equal(stdev([5, 5, 5]), 0);
  assert.equal(coefficientOfVariation([5, 5, 5]), 0);
  // 평균이 0이면 정의되지 않는다
  assert.equal(coefficientOfVariation([0, 0]), null);
  assert.equal(coefficientOfVariation([]), null);
});

test("medianIntervalDays — 간격의 중앙값, 표본 1개면 null", () => {
  const ts = [daysAgo(0), daysAgo(5), daysAgo(10), daysAgo(30)];
  // 간격: 5, 5, 20 → 중앙값 5 (평균이면 10 — 긴 공백에 끌려간다)
  assert.equal(medianIntervalDays(ts), 5);
  assert.equal(medianIntervalDays([daysAgo(1)]), null);
  assert.equal(medianIntervalDays([]), null);
});

test("viewCountOf — 액터별 필드명 3종을 모두 받는다", () => {
  assert.equal(viewCountOf({ videoPlayCount: 10 }), 10);
  assert.equal(viewCountOf({ igPlayCount: 20 }), 20);
  assert.equal(viewCountOf({ videoViewCount: 30 }), 30);
  assert.equal(viewCountOf({ videoPlayCount: 0 }), null);
  assert.equal(viewCountOf({}), null);
});

test("computeMetrics — 릴스만 골라 지표를 만든다", () => {
  const m = computeMetrics(
    goodProfile({
      latestPosts: [
        reel(30_000, 2),
        reel(10_000, 9),
        { type: "Image", likesCount: 100, commentsCount: 5, timestamp: daysAgo(4) },
      ],
    }),
    NOW,
  );
  assert.equal(m.postCount, 3);
  assert.equal(m.reelCount, 2);
  assert.equal(m.viewSample, 2);
  assert.equal(m.medianViews, 20_000);
  assert.equal(m.efficiency, 1); // 20,000 / 20,000
  assert.ok(Math.abs(m.reelsRatio - 2 / 3) < 1e-9);
  assert.ok(m.daysSinceLastPost < 3);
});

test("computeMetrics — 릴스가 1개면 전체 게시물 간격으로 대체한다", () => {
  const m = computeMetrics(
    goodProfile({
      latestPosts: [
        reel(9_000, 1),
        { type: "Image", likesCount: 10, commentsCount: 1, timestamp: daysAgo(5) },
        { type: "Image", likesCount: 10, commentsCount: 1, timestamp: daysAgo(9) },
      ],
    }),
    NOW,
  );
  assert.equal(m.postIntervalDays, 4); // 릴스 1개로는 간격 계산 불가 → 전체 게시물 기준
});

test("countHomeLivingHits — 소개글과 해시태그 양쪽을 센다", () => {
  assert.ok(countHomeLivingHits(goodProfile()) >= 2);
  assert.equal(
    countHomeLivingHits({ biography: "뷰티 메이크업 꿀팁", latestPosts: [] }),
    0,
  );
});

test("businessSignals — 신호를 개별로 잡아낸다", () => {
  assert.deepEqual(businessSignals({ biography: "예쁜 집 기록" }), []);
  assert.deepEqual(businessSignals({ biography: "제품 판매 문의" }), ["판매키워드"]);
  const two = businessSignals({
    biography: "가구 판매합니다 smartstore.naver.com/abc",
    username: "wood_공방",
  });
  assert.ok(two.length >= 2);
});

test("engagementFloorFailed — 함수는 남아있지만 게이트로는 쓰이지 않는다", () => {
  // 계산 자체는 그대로 (참고용 지표로 남김)
  assert.equal(engagementFloorFailed(50_000, 1.9), true);
  assert.equal(engagementFloorFailed(50_000, 2.0), false);

  // 그러나 판정에서는 이 하한으로 탈락시키지 않는다 — 2026-07-30 파일럿 근거.
  // _favorite.zip 실제 수치: 팔로워 42,101 · 효율 4.88배 · 주기 2.6일 · ER 1.71%
  const metrics = {
    followers: 42_101, follows: 800, reelsRatio: 0.9, viewSample: 12,
    medianViews: 205_261, efficiency: 4.88, viewCV: 0.9, postIntervalDays: 2.6,
    engagementRate: 1.71, medianLikes: 720, likePerView: 720 / 205_261,
    daysSinceLastPost: 3,
  };
  assert.equal(
    engagementFloorFailed(metrics.followers, metrics.engagementRate),
    true,
    "옛 하한 기준으로는 탈락 대상이었다",
  );
  const r = judgeWithContext(
    { isPrivate: false, homeLivingHits: 4, signals: [], businessCategoryName: null },
    metrics,
  );
  assert.equal(r.verdict, "pass", "그러나 이제는 통과해야 한다");
});

test("반응낮음 플래그 — 조회수 대비 좋아요가 0.2% 미만이면 표시만 한다", () => {
  const base = {
    followers: 30_000, follows: 500, reelsRatio: 0.9, viewSample: 12,
    medianViews: 100_000, efficiency: 3.3, viewCV: 0.6, postIntervalDays: 4,
    engagementRate: 1.0, daysSinceLastPost: 2,
  };
  const ctx = { isPrivate: false, homeLivingHits: 3, signals: [], businessCategoryName: null };

  const low = judgeWithContext(ctx, { ...base, medianLikes: 100, likePerView: 0.001 });
  assert.equal(low.verdict, "pass", "제외하지 않는다");
  assert.ok(low.flags.includes("반응낮음"));

  const ok = judgeWithContext(ctx, { ...base, medianLikes: 500, likePerView: 0.005 });
  assert.ok(!ok.flags.includes("반응낮음"));
});

test("judge — 정상 계정은 통과", () => {
  const p = goodProfile();
  const r = judge(p, computeMetrics(p, NOW));
  assert.equal(r.verdict, "pass");
  assert.equal(r.filterReason, null);
});

test("judge — 팔로워 하한 경계값 6,999 / 7,000", () => {
  const low = goodProfile({ followersCount: 6_999 });
  assert.equal(judge(low, computeMetrics(low, NOW)).filterReason, "팔로워 7,000명 미만");

  // 7,000 이면 하한은 통과해야 한다 (다른 사유로 걸릴 수는 있음)
  const at = goodProfile({ followersCount: 7_000 });
  assert.notEqual(
    judge(at, computeMetrics(at, NOW)).filterReason,
    "팔로워 7,000명 미만",
  );
});

test("judge — 각 제외 사유가 올바르게 잡힌다", () => {
  const cases = [
    [{ private: true }, "비공개 계정"],
    [{ followersCount: 400_000 }, "팔로워 30만명 초과"],
    [
      { biography: "가구 판매 smartstore.naver.com/x 집꾸미기" },
      "업체·판매 계정 (판매키워드,쇼핑몰링크)",
    ],
    [
      {
        latestPosts: [
          { type: "Image", likesCount: 900, commentsCount: 50, timestamp: daysAgo(1) },
          { type: "Image", likesCount: 900, commentsCount: 50, timestamp: daysAgo(3) },
        ],
      },
      "릴스 비중 30% 미만",
    ],
    [
      { latestPosts: [{ ...reel(0, 1), videoPlayCount: undefined }, reel(0, 5)] },
      "릴스 조회수 확인 불가",
    ],
    [
      { followersCount: 100_000, latestPosts: [reel(2_000, 1), reel(2_100, 5), reel(1_900, 9)] },
      "릴스 도달 부족(0.3배 미만)",
    ],
    [{ followersCount: 8_000, followsCount: 9_000 }, "품앗이 의심(팔로잉>팔로워)"],
    [
      { latestPosts: [reel(30_000, 40), reel(28_000, 50), reel(31_000, 60)] },
      "30일 이상 미게시",
    ],
    [
      {
        biography: "뷰티 메이크업",
        latestPosts: [
          { ...reel(30_000, 2), hashtags: ["메이크업"] },
          { ...reel(28_000, 8), hashtags: ["뷰티"] },
          { ...reel(31_000, 14), hashtags: ["립"] },
        ],
      },
      "카테고리 이탈(홈리빙 키워드 없음)",
    ],
  ];

  for (const [overrides, expected] of cases) {
    const p = goodProfile(overrides);
    const r = judge(p, computeMetrics(p, NOW));
    assert.equal(r.filterReason, expected, `기대: ${expected}`);
  }
});

test("judge — 폐기된 ER 상한: 참여율이 아무리 높아도 제외하지 않는다", () => {
  // hippo.mansion 실제 사례: 대표가 S 등급을 준 계정인데 116 기준으로는 "품앗이"로 탈락했다
  const p = goodProfile({
    username: "hippo_like",
    followersCount: 26_050,
    latestPosts: [
      { ...reel(300_000, 2), likesCount: 25_000, commentsCount: 300 },
      { ...reel(280_000, 7), likesCount: 24_000, commentsCount: 280 },
      { ...reel(310_000, 13), likesCount: 26_000, commentsCount: 310 },
    ],
  });
  const m = computeMetrics(p, NOW);
  assert.ok(m.engagementRate > 90, "ER 이 90%를 넘는 표본이어야 한다");
  assert.equal(judge(p, m).verdict, "pass", "높은 ER 을 이유로 제외해서는 안 된다");
});

test("judge — 업체 신호 1개는 통과 + 표시", () => {
  const p = goodProfile({ biography: "집꾸미기 기록 · 협업 문의 DM · 구매하기 링크" });
  const r = judge(p, computeMetrics(p, NOW));
  assert.equal(r.verdict, "pass");
  assert.ok(r.flags.some((f) => f.startsWith("업체?")));
});

test("점수 보간 — 앵커 사이가 계단이 아니라 직선", () => {
  assert.equal(scoreHigherBetter(50_000, [[50_000, 25], [20_000, 15], [0, 0]]), 25);
  assert.equal(scoreHigherBetter(35_000, [[50_000, 25], [20_000, 15], [0, 0]]), 20);
  assert.equal(scoreHigherBetter(null, [[50_000, 25], [0, 0]]), 0);

  assert.equal(scoreLowerBetter(0.5, [[0.5, 25], [0.8, 15], [Infinity, 0]]), 25);
  assert.equal(scoreLowerBetter(0.65, [[0.5, 25], [0.8, 15], [Infinity, 0]]), 20);
  assert.equal(scoreLowerBetter(5, [[0.5, 25], [0.8, 15], [Infinity, 0]]), 0);
});

test("computeScore — 표본 3개 미만이면 안정성을 빼고 75점을 100점으로 환산", () => {
  const base = {
    medianViews: 50_000,
    efficiency: 2.0,
    postIntervalDays: 7,
    viewCV: 3.0, // 신뢰할 수 없는 값 — 무시되어야 한다
  };

  const short = computeScore({ ...base, viewSample: 2 });
  assert.equal(short.stabilityReliable, false);
  assert.equal(short.score, 100, "75점 만점 → 100점 환산");

  const full = computeScore({ ...base, viewSample: 5 });
  assert.equal(full.stabilityReliable, true);
  assert.equal(full.score, 75, "안정성 0점이 그대로 반영된다");
});

test("gradeOf — 등급 경계 79/80, 64/65, 49/50", () => {
  assert.equal(gradeOf(80), "S");
  assert.equal(gradeOf(79), "A");
  assert.equal(gradeOf(65), "A");
  assert.equal(gradeOf(64), "B");
  assert.equal(gradeOf(50), "B");
  assert.equal(gradeOf(49), null);
});

test("stabilityLabel — 설계 문서 임계값과 일치", () => {
  assert.equal(stabilityLabel(0.5, 5), "안정");
  assert.equal(stabilityLabel(0.8, 5), "보통");
  assert.equal(stabilityLabel(0.81, 5), "들쭉날쭉");
  assert.equal(stabilityLabel(0.3, 2), "판단보류");
});

// ============================================================
// 파일럿에서 드러난 근본 원인에 대한 회귀 검사 (2026-07-30)
// ============================================================

test("playCountOf / normalizeReels — 필드명 변형과 불량 항목을 흡수한다", () => {
  assert.equal(playCountOf({ videoPlayCount: 100 }), 100);
  assert.equal(playCountOf({ playCount: 200 }), 200);
  assert.equal(playCountOf({}), null);

  const rows = normalizeReels([
    { timestamp: daysAgo(1), videoPlayCount: 500, likesCount: 10, commentsCount: 2 },
    { videoPlayCount: 999 }, // timestamp 없음 → 버린다
    null,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].playCount, 500);
});

test("근본원인 재현 — details 조회수로는 hippo.mansion 이 탈락하지만 릴스 액터 값으로는 통과한다", () => {
  // 2026-07-30 실측 데이터. 같은 계정 같은 릴스, 두 출처의 조회수.
  const followers = 34_998;
  const detailsViews = [4_173_705, 17_908, 4_088, 27_453, 420, 758, 498, 4_930];
  const reelViews = [
    8_930_833, 371_936, 221_850, 176_641, 71_378, 64_176, 35_736, 19_927,
    14_946, 14_509, 12_989, 5_877,
  ];

  // details 값: 중앙값 약 4,509 → 효율 0.13배 → "릴스 도달 부족" 으로 탈락했다
  const detailsMedian = median(detailsViews);
  assert.ok(detailsMedian / followers < 0.3, "details 값이면 도달 부족으로 걸린다");

  // 릴스 액터 값: 중앙값 약 49,956 → 효율 1.43배 → 통과해야 한다
  const reelMedian = median(reelViews);
  assert.ok(reelMedian / followers > 1.4, `실제 효율은 1.4배 이상 (${reelMedian / followers})`);

  const metrics = computeReelMetrics(
    { followers, follows: 500, reelsRatio: 8 / 12 },
    reelViews.map((v, i) => ({
      playCount: v,
      likesCount: Math.round(v * 0.02),
      commentsCount: Math.round(v * 0.003),
      timestamp: daysAgo(i * 4 + 1),
    })),
    NOW,
  );
  const r = judgeWithContext(
    { isPrivate: false, homeLivingHits: 3, signals: [], businessCategoryName: null },
    metrics,
  );
  assert.equal(r.verdict, "pass", `탈락 사유: ${r.filterReason}`);
});

test("ER 은 평균이 아니라 중앙값 — 바이럴 1건이 122%를 만들지 않는다", () => {
  // hippo.mansion 실제 좋아요 분포: 1건만 489,232, 나머지는 수십~수천
  const likes = [489_232, 2_523, 194, 4_580, 360, 90, 72, 444, 379, 26, 72, 109];
  const followers = 34_998;

  const meanER = ((likes.reduce((s, n) => s + n, 0) / likes.length) / followers) * 100;
  assert.ok(meanER > 100, `평균 기반 ER 은 100%를 넘는다 (${meanER.toFixed(0)}%)`);

  const metrics = computeReelMetrics(
    { followers, follows: 500, reelsRatio: 0.7 },
    likes.map((l, i) => ({
      playCount: 50_000,
      likesCount: l,
      commentsCount: 0,
      timestamp: daysAgo(i * 3 + 1),
    })),
    NOW,
  );
  // 중앙값 좋아요는 약 265 → ER 약 0.76%
  assert.ok(metrics.engagementRate < 5, `중앙값 기반 ER 은 낮다 (${metrics.engagementRate})`);
});

test("computeReelMetrics — 조회수 없는 릴스는 표본에서 빠지고 간격은 유지된다", () => {
  const metrics = computeReelMetrics(
    { followers: 20_000, follows: 300, reelsRatio: 0.8 },
    [
      { playCount: 40_000, likesCount: 800, commentsCount: 20, timestamp: daysAgo(1) },
      { playCount: null, likesCount: 700, commentsCount: 18, timestamp: daysAgo(6) },
      { playCount: 44_000, likesCount: 900, commentsCount: 25, timestamp: daysAgo(11) },
    ],
    NOW,
  );
  assert.equal(metrics.reelCount, 3);
  assert.equal(metrics.viewSample, 2, "조회수 없는 1건은 표본에서 빠진다");
  assert.equal(metrics.medianViews, 42_000);
  assert.equal(metrics.postIntervalDays, 5, "간격은 릴스 3건 전부로 계산한다");
});

test("buildContext / judgeWithContext — 맥락만으로 같은 판정을 재현한다", () => {
  const p = goodProfile();
  const m = computeMetrics(p, NOW);
  const viaProfile = judge(p, m);
  const viaContext = judgeWithContext(buildContext(p), m);
  assert.deepEqual(viaContext, viaProfile);
});

// ============================================================
// 중복 차단 — 이미 등록된 계정에 돈을 쓰지 않는다
// ============================================================

test("등록 계정은 후보 대기열에서 빠진다 (Apify 호출 전 차단)", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  setRegistered(state, ["Hippo.Mansion", "kkom.bam"]);

  // 등록 계정을 확장 출발점으로 담는다
  addSeed(state, "hippo.mansion", { sourceOnly: true, priority: 2 });
  addSeed(state, "kkom.bam", { sourceOnly: true, priority: 2 });
  // 새로 발견한 계정
  addSeed(state, "brand_new_home", { sourceUsername: "hippo.mansion", priority: 1 });

  const pending = pickPendingSeeds(state, 10);
  assert.deepEqual(pending.map((s) => s.username), ["brand_new_home"]);
  assert.equal(countPendingSeeds(state), 1);
});

test("등록 판정은 대소문자를 무시한다", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  setRegistered(state, ["Hippo.Mansion"]);
  assert.equal(isRegistered(state, "hippo.mansion"), true);
  assert.equal(isRegistered(state, "  HIPPO.MANSION  "), true);
  assert.equal(isRegistered(state, "other"), false);
});

test("sourceOnly 가 아닌 등록 계정도 후보에서 빠진다 (이전 실행의 씨앗)", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  // 중복 차단을 도입하기 전에 담긴 씨앗 — sourceOnly 표시가 없다
  addSeed(state, "kkom.bam", { priority: 2 });
  assert.equal(countPendingSeeds(state), 1, "등록 전에는 후보 대기열에 있다");

  setRegistered(state, ["kkom.bam"]);
  assert.equal(countPendingSeeds(state), 0, "등록되면 즉시 빠진다");
});

test("expansionSources — 등록 계정과 sourceOnly 씨앗을 모두 출발점으로 준다", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  setRegistered(state, ["a_home"]);
  addSeed(state, "b_home", { sourceOnly: true });
  addSeed(state, "c_new", {});

  const sources = expansionSources(state);
  assert.equal(sources.size, 2);
  assert.ok(sources.has("a_home"));
  assert.ok(sources.has("b_home"));
  assert.ok(!sources.has("c_new"), "후보는 출발점이 아니다");
});

// ============================================================
// 요리 채널 제외 (2026-07-30 대표 지시: 집밥 계열 제외)
// ============================================================

test("요리 채널은 제외한다 — 요리 신호가 홈리빙 신호보다 많거나 같을 때", () => {
  const cooking = {
    username: "honbap_like",
    biography: "혼밥 레시피 · 간단요리 · 자취요리 기록 / 자취 살림",
    latestPosts: [{ hashtags: ["집밥", "요리", "반찬"], caption: "오늘의 한끼" }],
  };
  const ctx = buildContext(cooking);
  assert.ok(ctx.cookingHits >= ctx.homeLivingHits, "요리 신호가 더 많아야 하는 표본");
  assert.equal(isCookingChannel(ctx), true);
  assert.equal(
    judgePreGate(ctx, { followers: 20_000, follows: 500, reelsRatio: 0.9, daysSinceLastPost: 2 })
      .filterReason,
    "카테고리 이탈(요리 채널)",
  );
});

test("홈리빙 계정이 음식 얘기를 조금 하는 건 통과시킨다", () => {
  const home = {
    username: "real_home",
    biography: "집꾸미기 · 홈스타일링 · 인테리어 소품 / 신혼집 기록",
    latestPosts: [{ hashtags: ["집들이", "홈데코", "가구"], caption: "홈카페 코너 만들었어요 간단요리도 해먹고" }],
  };
  const ctx = buildContext(home);
  assert.ok(ctx.homeLivingHits > ctx.cookingHits, "홈리빙 신호가 더 많아야 한다");
  assert.equal(isCookingChannel(ctx), false);
  assert.equal(
    judgePreGate(ctx, { followers: 20_000, follows: 500, reelsRatio: 0.9, daysSinceLastPost: 2 })
      .verdict,
    "pass",
  );
});

test("요리 신호가 0이면 무조건 통과 (판정이 과하게 걸리지 않도록)", () => {
  const ctx = buildContext({
    biography: "인테리어 · 집꾸미기",
    latestPosts: [{ hashtags: ["소품"], caption: "" }],
  });
  assert.equal(ctx.cookingHits, 0);
  assert.equal(isCookingChannel(ctx), false);
});

test("홈스토랑은 더 이상 홈리빙 신호가 아니다", () => {
  const ctx = buildContext({ biography: "홈스토랑 운영중", latestPosts: [] });
  assert.equal(ctx.homeLivingHits, 0, "홈스토랑만으로는 홈리빙 키워드가 잡히지 않아야 한다");
});

test("요리 채널 판정은 본 판정과 프로필 판정에서 같은 사유를 낸다", () => {
  const ctx = buildContext({
    biography: "레시피 · 먹방 · 집밥",
    latestPosts: [{ hashtags: ["살림"], caption: "요리" }],
  });
  const facts = { followers: 20_000, follows: 500, reelsRatio: 0.9, daysSinceLastPost: 2 };
  const pre = judgePreGate(ctx, facts);
  const full = judgeWithContext(ctx, {
    ...facts, viewSample: 10, medianViews: 60_000, efficiency: 3,
    viewCV: 0.5, postIntervalDays: 3, engagementRate: 2, medianLikes: 900,
    likePerView: 0.015,
  });
  assert.equal(pre.filterReason, "카테고리 이탈(요리 채널)");
  assert.equal(full.filterReason, pre.filterReason);
});

// ============================================================
// 비용 절감 — 프로필 판정으로 먼저 걸러 릴스 호출을 아낀다
// ============================================================

test("judgePreGate — 프로필만으로 판정 가능한 사유를 잡아낸다", () => {
  const ctx = { isPrivate: false, homeLivingHits: 3, signals: [], businessCategoryName: null };
  const ok = { followers: 20_000, follows: 500, reelsRatio: 0.8, daysSinceLastPost: 3 };

  assert.equal(judgePreGate(ctx, ok).verdict, "pass");

  const cases = [
    [{ ...ctx, isPrivate: true }, ok, "비공개 계정"],
    [ctx, { ...ok, followers: 6_999 }, "팔로워 7,000명 미만"],
    [ctx, { ...ok, followers: 400_000 }, "팔로워 30만명 초과"],
    [{ ...ctx, signals: ["판매키워드", "쇼핑몰링크"] }, ok, "업체·판매 계정 (판매키워드,쇼핑몰링크)"],
    [ctx, { ...ok, reelsRatio: 0.2 }, "릴스 비중 30% 미만"],
    [ctx, { ...ok, followers: 8_000, follows: 9_000 }, "품앗이 의심(팔로잉>팔로워)"],
    [ctx, { ...ok, daysSinceLastPost: 45 }, "30일 이상 미게시"],
    [{ ...ctx, homeLivingHits: 0 }, ok, "카테고리 이탈(홈리빙 키워드 없음)"],
  ];
  for (const [c, f, expected] of cases) {
    assert.equal(judgePreGate(c, f).filterReason, expected, `기대: ${expected}`);
  }
});

test("judgePreGate — 조회수에 의존하는 사유는 통과시킨다 (릴스를 받아야 알 수 있다)", () => {
  const ctx = { isPrivate: false, homeLivingHits: 3, signals: [], businessCategoryName: null };
  // 도달 부족·표본 없음은 프로필만으로 알 수 없으므로 여기서 걸러선 안 된다
  assert.equal(
    judgePreGate(ctx, { followers: 100_000, follows: 500, reelsRatio: 0.9, daysSinceLastPost: 1 })
      .verdict,
    "pass",
  );
});

test("judgePreGate — 사유 문자열이 본 판정과 일치한다 (집계가 갈라지지 않도록)", () => {
  const ctx = { isPrivate: false, homeLivingHits: 3, signals: [], businessCategoryName: null };
  const facts = { followers: 6_500, follows: 400, reelsRatio: 0.8, daysSinceLastPost: 2 };

  const pre = judgePreGate(ctx, facts);
  const full = judgeWithContext(ctx, {
    ...facts, viewSample: 10, medianViews: 5_000, efficiency: 0.8,
    viewCV: 0.5, postIntervalDays: 4, engagementRate: 2,
  });
  assert.equal(pre.filterReason, full.filterReason);
});

// ============================================================
// 한 번 보고한 계정은 다시 보고하지 않는다 (대표 지시)
// ============================================================

test("collectRow — 같은 계정을 두 번 보고하지 않는다", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  const entry = {
    username: "new_creator", grade: "S", score: 90, flags: [],
    metrics: { followers: 20_000 },
  };

  const first = [];
  assert.equal(collectRow(state, entry, first), "reported");
  assert.equal(first.length, 1);
  assert.ok(entry.reportedAt, "보고 시각이 찍혀야 한다");

  // 두 번째 실행 — 같은 계정
  const second = [];
  assert.equal(collectRow(state, entry, second), "already-reported");
  assert.equal(second.length, 0, "두 번째 보고서에는 나오지 않는다");
});

test("collectRow — 등급이 올라가도 이미 보고했으면 다시 내지 않는다", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  const entry = {
    username: "climber", grade: "B", score: 55, flags: [],
    metrics: { followers: 12_000 },
  };
  assert.equal(collectRow(state, entry, []), "reported");

  // 판정 기준이 바뀌어 S 로 올랐다 — 그래도 다시 보고하지 않는다
  entry.grade = "S";
  entry.score = 92;
  const rows = [];
  assert.equal(collectRow(state, entry, rows), "already-reported");
  assert.equal(rows.length, 0);
});

test("collectRow — 구버전 상태의 reported=true 도 이미 보고한 것으로 본다", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  // reportedAt 없이 reported 만 있는 옛 형식
  const entry = {
    username: "legacy", grade: "A", score: 70, flags: [], reported: true,
    metrics: { followers: 15_000 },
  };
  assert.equal(collectRow(state, entry, []), "already-reported");
});

test("collectRow — --all 이면 이미 보고한 것도 다시 낸다", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  const entry = {
    username: "again", grade: "A", score: 72, flags: [], reported: true,
    metrics: { followers: 15_000 },
  };
  const rows = [];
  assert.equal(collectRow(state, entry, rows, { includeReported: true }), "reported");
  assert.equal(rows.length, 1);
});

test("collectRow — 등록 계정은 보고 이력과 무관하게 항상 제외", () => {
  const state = { version: 1, registered: {}, profiles: {}, seeds: {}, runs: [] };
  setRegistered(state, ["known_one"]);
  const entry = {
    username: "known_one", grade: "S", score: 95, flags: [],
    metrics: { followers: 30_000 },
  };
  const rows = [];
  assert.equal(collectRow(state, entry, rows), "already-registered");
  assert.equal(rows.length, 0);
  assert.ok(!entry.reportedAt, "보고하지 않았으니 시각도 찍히지 않는다");
});

test("buildReport — 신규 후보 수가 맨 위에 오고, 0명이면 제외 사유를 밝힌다", () => {
  const empty = buildReport([], {
    fetched: 30, failed: 0, passed: 21, rejectReasons: {},
    alreadyRegistered: 16, alreadyReported: 5, seedHarvested: 0,
    pendingSeeds: 37, statePath: "x",
  });
  assert.match(empty.split("\n")[0], /신규 후보 0명/);
  assert.match(empty, /이미 등록된 계정 16건/);
  assert.match(empty, /이전에 보고한 계정 5건/);

  const one = buildReport([{
    username: "fresh", grade: "S", score: 88, flags: [],
    metrics: {
      followers: 20_000, medianViews: 60_000, efficiency: 3, postIntervalDays: 4,
      viewCV: 0.4, viewSample: 10, daysSinceLastPost: 1,
    },
    contact: { email: "a@b.com", kakao: null, link: null },
  }], {
    fetched: 10, failed: 0, passed: 1, rejectReasons: {},
    seedHarvested: 3, pendingSeeds: 20, statePath: "x",
  });
  assert.match(one.split("\n")[0], /신규 후보 1명/);
  assert.match(one, /@fresh/);
});

test("게시물 배열 형식 응답 — owner 필드에서 메타를 복원해도 판정이 돈다", () => {
  // Apify 가 프로필 형식이 아니라 게시물 배열을 주는 사례 (기존 influencer-extract 가 겪은 문제)
  const posts = [reel(40_000, 2), reel(38_000, 8), reel(42_000, 15)];
  const restored = {
    username: "posts_shape",
    fullName: "복원됨",
    biography: "집꾸미기 홈스타일링",
    followersCount: 25_000,
    followsCount: 400,
    latestPosts: posts,
  };
  const m = computeMetrics(restored, NOW);
  const r = judge(restored, m);
  assert.equal(r.verdict, "pass");
  assert.equal(m.medianViews, 40_000);
});
