// 전용 릴스 액터 호출. 조회수의 신뢰 출처.
// details 모드의 videoViewCount 를 쓰면 안 되는 이유는 metrics.mjs 의 computeReelMetrics 주석 참조.

const ACTOR = "apify~instagram-reel-scraper";
const ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 액터·시점에 따라 필드명이 다르다. 있는 것을 쓴다. */
export function playCountOf(reel) {
  const v = reel?.videoPlayCount ?? reel?.igPlayCount ?? reel?.playCount ??
    reel?.videoViewCount;
  return typeof v === "number" && v > 0 ? v : null;
}

export function normalizeReels(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    // 액터가 오류 항목을 섞어 보내는 경우가 있다 — 타임스탬프 없는 것은 버린다.
    .filter((r) => r && r.timestamp)
    .map((r) => ({
      playCount: playCountOf(r),
      likesCount: typeof r.likesCount === "number" ? r.likesCount : 0,
      commentsCount: typeof r.commentsCount === "number" ? r.commentsCount : 0,
      timestamp: r.timestamp,
      url: r.url ?? null,
    }));
}

/** 계정 1개의 최근 릴스. 실패 시 지수 백오프로 3회까지 재시도. */
export async function fetchReels(username, token, { limit = 12, retries = 3 } = {}) {
  const body = JSON.stringify({ username: [username], resultsLimit: limit });

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`재시도 가능 오류 ${res.status}`);
      }
      if (!res.ok) {
        throw Object.assign(
          new Error(`릴스 액터 ${res.status}: ${(await res.text()).slice(0, 200)}`),
          { fatal: true },
        );
      }
      return normalizeReels(await res.json());
    } catch (err) {
      lastError = err;
      if (err.fatal || attempt === retries) break;
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
