// 채팅 보고용 마크다운 생성 + 보고 대상 선별.
// 대표가 읽고 "들어가 볼지" 판단할 정보만 둔다.

import { stabilityLabel } from "./score.mjs";
import { isRegistered } from "./state.mjs";

export function rowFrom(entry) {
  return {
    username: entry.username,
    metrics: { ...entry.metrics },
    score: entry.score,
    grade: entry.grade,
    flags: entry.flags ?? [],
    contact: entry.contact ?? { email: null, kakao: null, link: null },
  };
}

/**
 * 보고 대상에 넣는다. 두 종류를 걸러낸다 —
 *  ① 이미 포털에 등록된 계정: 대표가 이미 아는 사람이다.
 *  ② 이미 한 번 보고한 계정: 같은 명단을 두 번 확인하게 만들면 안 된다.
 *
 * ②는 판정 기준이 바뀌어 등급이 올라가도 다시 내보내지 않는다. 대표 지시사항이다.
 * 전체를 다시 봐야 할 때만 includeReported(--all)로 우회한다.
 *
 * @returns {'reported'|'already-registered'|'already-reported'|'below-grade'}
 */
export function collectRow(state, entry, rows, { includeReported = false } = {}) {
  if (!entry.grade) return "below-grade";
  if (isRegistered(state, entry.username)) {
    entry.alreadyRegistered = true;
    return "already-registered";
  }
  // reportedAt 이 있거나, 구버전 상태의 reported===true 면 이미 보고한 것이다.
  const wasReported = Boolean(entry.reportedAt) || entry.reported === true;
  if (wasReported && !includeReported) return "already-reported";

  rows.push(rowFrom(entry));
  entry.reportedAt ??= new Date().toISOString();
  entry.reported = true;
  return "reported";
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const KAKAO_RE = /(?:카톡|카카오|kakao)\s*[:：]?\s*([\w.-]{2,30})/i;

export function extractContact(profile) {
  const bio = profile?.biography ?? "";
  return {
    email: bio.match(EMAIL_RE)?.[0] ?? null,
    kakao: bio.match(KAKAO_RE)?.[1] ?? null,
    link: profile?.externalUrl ?? null,
  };
}

const fmt = (n) => (n == null ? "-" : Math.round(n).toLocaleString("ko-KR"));
const days = (n) => (n == null ? "-" : `${Math.round(n)}일`);

function recency(d) {
  if (d == null) return "-";
  const r = Math.round(d);
  return r <= 0 ? "오늘" : `${r}일 전`;
}

/**
 * @param {Array} rows [{username, metrics, score, grade, flags, contact}]
 * @param {object} summary 실행 요약
 */
export function buildReport(rows, summary) {
  const out = [];

  // 신규 후보 수가 이 도구의 유일한 성과 지표다. 맨 위에 둔다.
  out.push(`## 신규 후보 ${rows.length}명`, "");

  if (rows.length === 0) {
    out.push("이번 실행에서 처음 보고할 계정이 나오지 않았습니다.");
    const excluded = [];
    if (summary.alreadyRegistered > 0) {
      excluded.push(`이미 등록된 계정 ${summary.alreadyRegistered}건`);
    }
    if (summary.alreadyReported > 0) {
      excluded.push(`이전에 보고한 계정 ${summary.alreadyReported}건`);
    }
    if (excluded.length > 0) {
      out.push(`\n(등급은 통과했지만 ${excluded.join(" · ")}은 제외했습니다.)`);
    }
  } else {
    out.push(
      "| 등급 | 점수 | 계정 | 팔로워 | 조회수(중앙) | 효율 | 업로드주기 | 안정성 | 최근 | 비고 |",
      "|---|---|---|---|---|---|---|---|---|---|",
    );
    for (const r of rows) {
      const m = r.metrics;
      out.push(
        [
          r.grade,
          r.score,
          `[@${r.username}](https://www.instagram.com/${r.username}/)`,
          fmt(m.followers),
          fmt(m.medianViews),
          m.efficiency == null ? "-" : `${m.efficiency.toFixed(1)}배`,
          days(m.postIntervalDays),
          stabilityLabel(m.viewCV, m.viewSample),
          recency(m.daysSinceLastPost),
          r.flags.length ? r.flags.join(", ") : "",
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
      );
    }

    out.push("", "**연락처**");
    for (const r of rows) {
      const c = r.contact;
      const parts = [c.email, c.kakao ? `카톡 ${c.kakao}` : null, c.link].filter(Boolean);
      out.push(`- @${r.username} — ${parts.length ? parts.join(" · ") : "DM"}`);
    }
  }

  out.push("", "**이번 실행 요약**");
  out.push(`- 수집: ${summary.fetched}건 (실패 ${summary.failed}건)`);
  if (summary.skippedRegistered > 0) {
    out.push(`- 이미 등록된 계정이라 호출 생략(비용 0원): ${summary.skippedRegistered}건`);
  }
  out.push(`- 통과: ${summary.passed}건 / 그중 신규 보고: ${rows.length}건`);
  if (summary.alreadyRegistered > 0) {
    out.push(`- 통과했지만 이미 포털에 등록돼 제외: ${summary.alreadyRegistered}건`);
  }
  if (summary.alreadyReported > 0) {
    out.push(`- 통과했지만 이전에 보고해서 제외: ${summary.alreadyReported}건`);
  }
  if (summary.rejectReasons && Object.keys(summary.rejectReasons).length > 0) {
    out.push("- 제외 사유:");
    for (const [reason, n] of Object.entries(summary.rejectReasons).sort((a, b) => b[1] - a[1])) {
      out.push(`  - ${reason}: ${n}건`);
    }
  }
  if (summary.preGateRejected > 0) {
    out.push(
      `- 프로필 판정에서 걸러 릴스 호출 생략: ${summary.preGateRejected}건 ` +
        `(약 $${(summary.preGateRejected * 0.0218).toFixed(2)} 절감)`,
    );
  }
  if (summary.reelsFetched != null) {
    out.push(`- 릴스까지 수집한 계정: ${summary.reelsFetched}건`);
  }
  if (summary.budgetDeferred > 0) {
    out.push(
      `- ⏸ 예산 한도($${summary.maxUsd})로 다음 실행에 미룬 계정: ${summary.budgetDeferred}건` +
        ` (씨앗 큐에 그대로 남아 있습니다)`,
    );
  }
  if (summary.estimatedUsd != null) {
    out.push(
      `- 이번 실행 비용: 약 $${summary.estimatedUsd.toFixed(3)} ` +
        `(${Math.round(summary.estimatedUsd * 1390).toLocaleString("ko-KR")}원)`,
    );
  }
  out.push(`- 새로 담은 유사 계정(씨앗): ${summary.seedHarvested}개`);
  out.push(`- 씨앗 큐 잔량: ${summary.pendingSeeds}개`);
  out.push(`- 상태 파일: ${summary.statePath}`);

  return out.join("\n");
}
