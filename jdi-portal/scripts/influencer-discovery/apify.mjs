// Apify 호출만 담당. 재시도·빈응답·응답형식 분기를 여기서 흡수한다.

const ACTOR = "apify~instagram-scraper";
const ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;

export class ApifyError extends Error {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 응답이 두 형식으로 올 수 있다 (기존 influencer-extract 가 겪은 문제).
 * 첫 항목에 프로필 필드가 있으면 프로필 형식, 없으면 게시물 배열로 보고 owner* 에서 메타를 복원한다.
 */
export function normalizeResponse(raw, username) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApifyError(`빈 응답 (@${username})`);
  }
  const first = raw[0];
  const looksLikeProfile = "followersCount" in first || "biography" in first ||
    "latestPosts" in first || "profilePicUrl" in first;

  if (looksLikeProfile) {
    return {
      username: first.username ?? username,
      fullName: first.fullName ?? null,
      biography: first.biography ?? null,
      externalUrl: first.externalUrl ?? null,
      followersCount: first.followersCount ?? null,
      followsCount: first.followsCount ?? null,
      postsCount: first.postsCount ?? null,
      private: first.private ?? first.isPrivate ?? null,
      isBusinessAccount: first.isBusinessAccount ?? null,
      businessCategoryName: first.businessCategoryName ?? null,
      profilePicUrl: first.profilePicUrl ?? null,
      latestPosts: Array.isArray(first.latestPosts) ? first.latestPosts : [],
      relatedProfiles: Array.isArray(first.relatedProfiles) ? first.relatedProfiles : [],
    };
  }

  // 게시물 배열 형식 — owner* 필드로 메타 복원
  return {
    username,
    fullName: first.ownerFullName ?? null,
    biography: null,
    externalUrl: null,
    followersCount: first.ownerFollowersCount ?? null,
    followsCount: null,
    postsCount: null,
    private: null,
    isBusinessAccount: null,
    businessCategoryName: null,
    profilePicUrl: first.ownerProfilePicUrl ?? null,
    latestPosts: raw,
    relatedProfiles: [],
  };
}

/** 계정 1개 상세 수집. 실패 시 지수 백오프로 3회까지 재시도. */
export async function fetchProfile(username, token, { retries = 3 } = {}) {
  const body = JSON.stringify({
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: "details",
    resultsLimit: 24,
    searchType: "user",
    addParentData: false,
  });

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (res.status === 429 || res.status >= 500) {
        throw new ApifyError(`재시도 가능 오류 ${res.status}`);
      }
      if (!res.ok) {
        // 4xx(권한·잘못된 입력)는 재시도해도 같다 — 즉시 포기
        throw Object.assign(
          new ApifyError(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`),
          { fatal: true },
        );
      }
      return normalizeResponse(await res.json(), username);
    } catch (err) {
      lastError = err;
      if (err.fatal || attempt === retries) break;
      await sleep(2000 * 2 ** (attempt - 1)); // 2s, 4s
    }
  }
  throw lastError;
}
