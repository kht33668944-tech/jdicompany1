// 인플루언서 사이즈 티어 · 도달 추정 · 등급 공통 유틸
// 2025 업계 벤치마크 기반 (Social Insider, Rival IQ, InfluenceFlow)

import type { InfluencerGrade } from "./types";

export type InfluencerTier = "nano" | "micro" | "mid" | "macro" | "mega";

export interface TierInfo {
  key: InfluencerTier;
  label: string;
  shortLabel: string;
  /** 팔로워 구간 표기 (예: "1만~5만") */
  rangeLabel: string;
  /** 팔로워 대비 평균 organic reach 비율 (2025 인스타 벤치마크) */
  reachRate: number;
  /** 사이즈별 ER 등급 임계값 (%) - 이 미만은 C */
  grades: { S: number; A: number; B: number };
}

const TIERS: ReadonlyArray<{ maxExclusive: number; info: TierInfo }> = [
  {
    maxExclusive: 10_000,
    info: {
      key: "nano",
      label: "나노 인플루언서",
      shortLabel: "나노",
      rangeLabel: "~1만",
      reachRate: 0.10,
      grades: { S: 6, A: 3, B: 1 },
    },
  },
  {
    maxExclusive: 50_000,
    info: {
      key: "micro",
      label: "마이크로 인플루언서",
      shortLabel: "마이크로",
      rangeLabel: "1만~5만",
      reachRate: 0.07,
      grades: { S: 4, A: 2, B: 0.8 },
    },
  },
  {
    maxExclusive: 500_000,
    info: {
      key: "mid",
      label: "미드 인플루언서",
      shortLabel: "미드",
      rangeLabel: "5만~50만",
      reachRate: 0.05,
      grades: { S: 2.5, A: 1.5, B: 0.5 },
    },
  },
  {
    maxExclusive: 1_000_000,
    info: {
      key: "macro",
      label: "매크로 인플루언서",
      shortLabel: "매크로",
      rangeLabel: "50만~100만",
      reachRate: 0.04,
      grades: { S: 1.5, A: 0.8, B: 0.3 },
    },
  },
  {
    maxExclusive: Number.POSITIVE_INFINITY,
    info: {
      key: "mega",
      label: "메가 인플루언서",
      shortLabel: "메가",
      rangeLabel: "100만+",
      reachRate: 0.035,
      grades: { S: 1.0, A: 0.5, B: 0.2 },
    },
  },
];

export function getTier(followerCount: number | null): TierInfo | null {
  if (followerCount === null || followerCount <= 0) return null;
  for (const t of TIERS) {
    if (followerCount < t.maxExclusive) return t.info;
  }
  return TIERS[TIERS.length - 1].info;
}

/** 팔로워 사이즈별 평균 organic reach rate를 적용한 추정 도달 인원 */
export function calcEstimatedReach(followerCount: number | null): number {
  if (followerCount === null || followerCount <= 0) return 0;
  const tier = getTier(followerCount);
  if (!tier) return 0;
  return Math.round(followerCount * tier.reachRate);
}

/** 사이즈별 ER 등급 (같은 ER이라도 팔로워 구간에 따라 등급이 달라짐) */
export function calcGradeBySize(
  engagementRate: number | null,
  followerCount: number | null,
): InfluencerGrade {
  if (engagementRate === null || followerCount === null) return "UNRATED";
  const tier = getTier(followerCount);
  if (!tier) return "UNRATED";
  if (engagementRate >= tier.grades.S) return "S";
  if (engagementRate >= tier.grades.A) return "A";
  if (engagementRate >= tier.grades.B) return "B";
  return "C";
}

/** 좋아요 ÷ 댓글 비율 — 1:100~200(=100~200)이 정상, 너무 높으면 봇 의심 */
export function calcLikeCommentRatio(
  avgLikes: number | null,
  avgComments: number | null,
): number | null {
  if (avgLikes === null || avgComments === null || avgComments <= 0) return null;
  return Math.round(avgLikes / avgComments);
}

/** 같은 사이즈 평균 ER 대비 얼마나 잘하는지 (%) - 양수면 평균 이상 */
export function calcErVsTierAverage(
  engagementRate: number | null,
  followerCount: number | null,
): number | null {
  if (engagementRate === null || followerCount === null) return null;
  const tier = getTier(followerCount);
  if (!tier) return null;
  // 사이즈별 평균 ER은 A 등급 임계값을 평균선으로 가정
  const avg = tier.grades.A;
  if (avg <= 0) return null;
  return ((engagementRate - avg) / avg) * 100;
}
