// 순수 계산 함수만 둔다. 네트워크·파일 접근 없음 → 테스트 가능.
// 설계: docs/superpowers/specs/2026-07-30-influencer-discovery-relatedprofiles-design.md

const DAY_MS = 24 * 60 * 60 * 1000;

export function mean(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// 모집단 표준편차. 표본이 아니라 "이 계정의 최근 릴스 전체"를 보는 것이므로 n 으로 나눈다.
export function stdev(nums) {
  if (nums.length === 0) return null;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((s, n) => s + (n - m) ** 2, 0) / nums.length);
}

// 변동계수 — 조회수가 들쭉날쭉한 정도. 낮을수록 꾸준.
export function coefficientOfVariation(nums) {
  if (nums.length === 0) return null;
  const m = mean(nums);
  if (!m) return null; // 평균 0 이면 정의되지 않음
  return stdev(nums) / m;
}

// 게시 간격의 중앙값(일). 평균은 긴 공백 하나에 끌려간다.
export function medianIntervalDays(timestamps) {
  const times = timestamps
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a); // 최신 → 과거
  if (times.length < 2) return null;
  const gaps = [];
  for (let i = 0; i < times.length - 1; i++) {
    gaps.push((times[i] - times[i + 1]) / DAY_MS);
  }
  return median(gaps);
}

export function isReel(post) {
  return post?.productType === "clips" || post?.type === "Video";
}

// Apify 응답에서 조회수 필드명이 액터·시점에 따라 다르다. 있는 것을 쓴다.
export function viewCountOf(post) {
  const v = post?.videoPlayCount ?? post?.igPlayCount ?? post?.videoViewCount;
  return typeof v === "number" && v > 0 ? v : null;
}

/**
 * 전용 릴스 액터에서 받은 릴스로 지표를 만든다. **조회수의 유일한 신뢰 출처.**
 *
 * details 모드의 videoViewCount 는 실제의 10~90분의 1로 나온다(2026-07-30 실측).
 * 좋아요 4,580 · 댓글 13,659 인 릴스의 조회수가 4,088 로 나온 사례가 결정적 증거다.
 * 그래서 조회수·간격·ER 은 모두 여기서 계산하고, details 응답은 프로필 메타와
 * 릴스 비중(reelsRatio) 계산에만 쓴다.
 *
 * ER 도 평균이 아니라 중앙값을 쓴다 — 바이럴 1건이 평균을 122%까지 끌어올린 사례가 있었다.
 *
 * @param {{followers:number|null, follows:number|null, reelsRatio:number|null}} facts
 * @param {Array<{playCount:number|null, likesCount:number, commentsCount:number, timestamp:string}>} reels
 */
export function computeReelMetrics(facts, reels, now = new Date()) {
  const views = reels.map((r) => r.playCount).filter((v) => typeof v === "number" && v > 0);
  const times = reels.map((r) => r.timestamp).filter(Boolean);

  const followers = facts.followers ?? null;
  const medianViews = median(views);
  const lastMs = times
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .reduce((max, t) => (t > max ? t : max), -Infinity);
  const lastPostAt = Number.isFinite(lastMs) ? new Date(lastMs) : null;

  const medLikes = median(reels.map((r) => r.likesCount ?? 0));
  const medComments = median(reels.map((r) => r.commentsCount ?? 0));

  return {
    followers,
    follows: facts.follows ?? null,
    reelsRatio: facts.reelsRatio ?? null,
    reelCount: reels.length,
    viewSample: views.length,
    medianViews,
    medianLikes: medLikes,
    medianComments: medComments,
    // 좋아요를 팔로워가 아니라 조회수로 나눈 값. 릴스에서는 이게 진짜 반응률이다
    // (팔로워 기준 ER 은 릴스가 팔로워 밖으로 퍼지면 의미가 깨진다).
    likePerView: medianViews > 0 && medLikes != null ? medLikes / medianViews : null,
    efficiency: medianViews != null && followers > 0 ? medianViews / followers : null,
    viewCV: coefficientOfVariation(views),
    postIntervalDays: medianIntervalDays(times),
    engagementRate: followers > 0 && reels.length > 0
      ? ((medLikes + medComments) / followers) * 100
      : null,
    lastPostAt,
    daysSinceLastPost: lastPostAt
      ? (now.getTime() - lastPostAt.getTime()) / DAY_MS
      : null,
  };
}

/**
 * 프로필 1건 → 판정에 쓸 지표 묶음.
 * ⚠️ 여기서 나온 medianViews/efficiency/viewCV 는 신뢰할 수 없다(위 주석 참조).
 *    reelsRatio 와 프로필 메타를 얻는 용도로만 쓴다.
 * @param {object} profile Apify details 응답을 정규화한 객체
 * @param {Date} now 기준 시각 (테스트에서 고정하기 위해 주입)
 */
export function computeMetrics(profile, now = new Date()) {
  const posts = Array.isArray(profile?.latestPosts) ? profile.latestPosts : [];
  const followers = profile?.followersCount ?? null;
  const follows = profile?.followsCount ?? null;

  const reels = posts.filter(isReel);
  const views = reels.map(viewCountOf).filter((v) => v !== null);

  const medianViews = median(views);
  const efficiency = medianViews != null && followers > 0
    ? medianViews / followers
    : null;

  const postTimes = posts.map((p) => p.timestamp).filter(Boolean);
  const reelTimes = reels.map((p) => p.timestamp).filter(Boolean);

  const lastPostMs = postTimes
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .reduce((max, t) => (t > max ? t : max), -Infinity);
  const lastPostAt = Number.isFinite(lastPostMs) ? new Date(lastPostMs) : null;

  const likes = posts.map((p) => p.likesCount ?? 0);
  const comments = posts.map((p) => p.commentsCount ?? 0);
  const engagementRate = followers > 0 && posts.length > 0
    ? ((mean(likes) + mean(comments)) / followers) * 100
    : null;

  return {
    followers,
    follows,
    postCount: posts.length,
    reelCount: reels.length,
    reelsRatio: posts.length > 0 ? reels.length / posts.length : null,
    viewSample: views.length,
    medianViews,
    efficiency,
    // 릴스 간격을 우선 보고, 릴스가 1개 이하면 전체 게시물 간격으로 대체한다.
    postIntervalDays: medianIntervalDays(reelTimes) ?? medianIntervalDays(postTimes),
    viewCV: coefficientOfVariation(views),
    engagementRate,
    lastPostAt,
    daysSinceLastPost: lastPostAt
      ? (now.getTime() - lastPostAt.getTime()) / DAY_MS
      : null,
  };
}
