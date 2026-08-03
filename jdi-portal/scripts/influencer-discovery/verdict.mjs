// 순수 판정 함수. 네트워크·파일 접근 없음.
// 제외 우선순위는 설계 문서의 표 순서를 따른다 — 먼저 걸린 사유가 기록되도록.

// `홈스토랑` 은 음식 채널 신호라 제외했다 (2026-07-30 대표 지시: 집밥 계열 제외).
export const HOME_LIVING_RE =
  /인테리어|홈스타일링|집꾸미기|집꾸|홈데코|홈카페|살림|정리수납|가구|소품|홈파티|셀프인테리어|신혼집|우리집|집들이|리빙|플랜테리어|집스타그램|집순이|자취|크리스마스|트리|interior|homedeco|homestyling|living/i;

/**
 * 요리·먹방 채널 신호. 2026-07-30 파일럿에서 `honbap.master`(혼밥마스터),
 * `nomoney_cook` 같은 요리 채널이 후보로 올라왔다.
 * 원인은 `살림` 키워드가 살림 → 집밥 → 요리로 번진 것.
 *
 * `살림` 자체는 홈리빙에 유효한 신호(살림템·살림꿀팁)라 빼지 않는다.
 * 대신 **요리 신호가 홈리빙 신호와 같거나 많으면 요리 채널로 판정**한다.
 */
export const COOKING_RE =
  /집밥|레시피|요리|먹방|혼밥|반찬|밀키트|베이킹|쿠킹|식단|다이어트식|간단요리|자취요리|에어프라이어|밥상|한끼|주방살림|cook|recipe|baking|mukbang/i;

// 업체 신호 2 — 소개글 키워드
export const BUSINESS_BIO_RE =
  /판매|대여|렌탈|주문|예약|구매하기|배송|택배|공구\b|공동구매|입금|계좌|사업자|본점|지점|매장|스토어|store|shop|smartstore|납품|시공|설치|견적/i;

// 업체 신호 3 — 쇼핑몰 링크
export const SHOP_LINK_RE =
  /smartstore\.naver|shopping\.naver|coupang\.com|shop\d*\.|\.shop\b|ohou\.se\/store|idus\.com/i;

// 업체 신호 4 — 계정명·표시명
export const NAME_BIZ_RE =
  /공방|가구|조명|커튼|시공|스튜디오|official|_shop|store/i;

function profileText(profile) {
  const bio = profile?.biography ?? "";
  const tags = (profile?.latestPosts ?? [])
    .flatMap((p) => p.hashtags ?? [])
    .join(" ");
  const captions = (profile?.latestPosts ?? [])
    .map((p) => p.caption ?? "")
    .join(" ");
  return `${bio} ${tags} ${captions}`;
}

/** 서로 다른 키워드가 몇 종류 맞았는지 센다(같은 단어 반복은 1로 본다). */
function distinctHits(text, re) {
  const matches = text.match(new RegExp(re.source, "gi"));
  return matches ? new Set(matches.map((m) => m.toLowerCase())).size : 0;
}

export function countHomeLivingHits(profile) {
  return distinctHits(profileText(profile), HOME_LIVING_RE);
}

export function countCookingHits(profile) {
  return distinctHits(profileText(profile), COOKING_RE);
}

/** 업체 신호 목록을 반환한다. 2개 이상이면 제외, 1개면 표시만. */
export function businessSignals(profile) {
  const signals = [];
  const bio = profile?.biography ?? "";
  const name = `${profile?.username ?? ""} ${profile?.fullName ?? ""}`;

  if (profile?.isBusinessAccount === true) signals.push("비즈니스계정");
  if (BUSINESS_BIO_RE.test(bio)) signals.push("판매키워드");
  if (SHOP_LINK_RE.test(`${bio} ${profile?.externalUrl ?? ""}`)) {
    signals.push("쇼핑몰링크");
  }
  if (NAME_BIZ_RE.test(name)) signals.push("업체명");
  return signals;
}

/**
 * 폐기됨 — 게이트로 쓰지 않는다. 2026-07-30 파일럿 근거:
 * 이 하한으로 탈락한 14건 중 13건이 효율 0.5배 이상(도달 양호)이었고,
 * 그중에는 효율 4.88배·업로드 주기 2.6일인 `_favorite.zip` 도 있었다.
 *
 * 원인은 ER 정의다. ER = 좋아요÷팔로워 인데 릴스는 팔로워 밖으로 퍼지므로
 * 좋아요는 조회수 대비 0.5% 수준이 정상이고, 팔로워 대비로는 1~2%에 그친다.
 * 116 의 하한(3%/2%/1.5%)은 릴스가 아닌 피드 게시물 기준으로 잡힌 값이다.
 *
 * 도달 실패는 효율(조회수÷팔로워) 0.3배 하한이 더 직접적으로 걸러낸다.
 * 이 함수는 회귀 검사가 폐기 사실을 고정하기 위해 남겨둔다.
 */
export function engagementFloorFailed(followers, er) {
  if (er == null) return true;
  if (followers < 10_000) return er < 3;
  if (followers < 100_000) return er < 2;
  return er < 1.5;
}

/** 조회수는 나오는데 반응이 비정상적으로 적은 계정(조회수 부풀림 의심). 제외하지 않고 표시만. */
const LIKE_PER_VIEW_LOW = 0.002; // 0.2%

/**
 * 판정 본체. 프로필에서 뽑아낸 맥락을 값으로 받는다 —
 * 재판정 때 원본 프로필 없이도(저장된 맥락만으로) 같은 판정을 재현할 수 있어야 한다.
 *
 * @param {{isPrivate:boolean|null, homeLivingHits:number, signals:string[], businessCategoryName:string|null}} context
 * @returns {{verdict:'pass'|'reject', filterReason:string|null, flags:string[], homeLivingHits:number}}
 */
export function judgeWithContext(context, metrics) {
  const flags = [];
  const { homeLivingHits = 0, signals = [] } = context ?? {};
  const reject = (filterReason) => ({
    verdict: "reject",
    filterReason,
    flags,
    homeLivingHits,
  });

  if (context?.isPrivate === true) {
    return reject("비공개 계정");
  }
  if (metrics.followers == null || metrics.followers < 7000) {
    return reject("팔로워 7,000명 미만");
  }
  if (metrics.followers > 300_000) {
    return reject("팔로워 30만명 초과");
  }
  if (signals.length >= 2) {
    return reject(`업체·판매 계정 (${signals.join(",")})`);
  }
  if (metrics.reelsRatio == null || metrics.reelsRatio < 0.3) {
    return reject("릴스 비중 30% 미만");
  }
  if (metrics.viewSample === 0) {
    return reject("릴스 조회수 확인 불가");
  }
  if (metrics.efficiency == null || metrics.efficiency < 0.3) {
    return reject("릴스 도달 부족(0.3배 미만)");
  }
  // 폐기된 ER 상한 대신 진짜 품앗이 신호: 팔로잉 > 팔로워 이면서 소규모
  if (
    metrics.follows != null && metrics.followers != null &&
    metrics.follows > metrics.followers && metrics.followers < 10_000
  ) {
    return reject("품앗이 의심(팔로잉>팔로워)");
  }
  // 참여율(ER) 하한 게이트는 폐기했다 — engagementFloorFailed 주석 참조.
  if (metrics.daysSinceLastPost == null || metrics.daysSinceLastPost > 30) {
    return reject("30일 이상 미게시");
  }
  if (homeLivingHits === 0) {
    return reject("카테고리 이탈(홈리빙 키워드 없음)");
  }
  if (isCookingChannel(context)) {
    return reject("카테고리 이탈(요리 채널)");
  }

  // 통과. 애매한 것은 지우지 않고 표시만 한다.
  if (signals.length === 1) flags.push(`업체?(${signals[0]})`);
  if (metrics.viewSample < 3) flags.push("표본부족");
  if (metrics.likePerView != null && metrics.likePerView < LIKE_PER_VIEW_LOW) {
    flags.push("반응낮음");
  }
  if (context?.businessCategoryName) {
    flags.push(`업종:${context.businessCategoryName}`);
  }

  return { verdict: "pass", filterReason: null, flags, homeLivingHits };
}

/**
 * 값싼 프로필 응답($0.0027)만으로 판정 가능한 제외 사유를 먼저 본다.
 * 여기서 걸리면 비싼 릴스 호출($0.0218)을 건너뛴다 — 비용 절감의 핵심.
 *
 * 사유 문자열과 우선순위는 judgeWithContext 와 반드시 일치해야 한다.
 * 그래야 릴스를 부른 계정과 안 부른 계정의 제외 사유가 같은 이름으로 집계된다.
 *
 * 조회수에 의존하는 규칙(도달 부족·표본 없음)은 여기서 판단할 수 없으므로 통과시킨다.
 *
 * @param {{followers:number|null, follows:number|null, reelsRatio:number|null,
 *          daysSinceLastPost:number|null}} facts details 응답에서 뽑은 값
 */
export function judgePreGate(context, facts) {
  const signals = context?.signals ?? [];
  const reject = (filterReason) => ({ verdict: "reject", filterReason });

  if (context?.isPrivate === true) return reject("비공개 계정");
  if (facts.followers == null || facts.followers < 7000) {
    return reject("팔로워 7,000명 미만");
  }
  if (facts.followers > 300_000) return reject("팔로워 30만명 초과");
  if (signals.length >= 2) return reject(`업체·판매 계정 (${signals.join(",")})`);
  if (facts.reelsRatio == null || facts.reelsRatio < 0.3) {
    return reject("릴스 비중 30% 미만");
  }
  if (
    facts.follows != null && facts.followers != null &&
    facts.follows > facts.followers && facts.followers < 10_000
  ) {
    return reject("품앗이 의심(팔로잉>팔로워)");
  }
  // 전체 게시물 중 최신이 30일 초과면 릴스도 30일 초과다(릴스 ⊆ 게시물). 안전하게 미리 걸러낸다.
  if (facts.daysSinceLastPost == null || facts.daysSinceLastPost > 30) {
    return reject("30일 이상 미게시");
  }
  if ((context?.homeLivingHits ?? 0) === 0) {
    return reject("카테고리 이탈(홈리빙 키워드 없음)");
  }
  if (isCookingChannel(context)) {
    return reject("카테고리 이탈(요리 채널)");
  }
  return { verdict: "pass", filterReason: null };
}

/** 프로필에서 판정 맥락을 뽑아낸다. 재판정 때 저장해두고 재사용한다. */
export function buildContext(profile) {
  return {
    isPrivate: profile?.private === true || profile?.isPrivate === true,
    homeLivingHits: countHomeLivingHits(profile),
    cookingHits: countCookingHits(profile),
    signals: businessSignals(profile),
    businessCategoryName: profile?.businessCategoryName ?? null,
  };
}

/**
 * 요리 채널인가. 요리 신호가 홈리빙 신호와 같거나 많으면 요리 채널로 본다.
 * 요리 신호가 0이면 무조건 통과 — 홈리빙 계정이 음식 얘기를 조금 하는 건 정상이다.
 */
export function isCookingChannel(context) {
  const cooking = context?.cookingHits ?? 0;
  const home = context?.homeLivingHits ?? 0;
  return cooking > 0 && cooking >= home;
}

/** 편의 래퍼 — 원본 프로필이 있을 때. */
export function judge(profile, metrics) {
  return judgeWithContext(buildContext(profile), metrics);
}
