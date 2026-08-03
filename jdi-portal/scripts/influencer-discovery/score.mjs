// 순수 점수·등급 산정. 네 항목 25점씩, 구간 사이는 선형 보간.

/** 값이 클수록 좋은 지표. anchors 는 [기준값, 점수] 내림차순. */
export function scoreHigherBetter(value, anchors) {
  if (value == null) return 0;
  if (value >= anchors[0][0]) return anchors[0][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [hiV, hiP] = anchors[i];
    const [loV, loP] = anchors[i + 1];
    if (value >= loV) {
      const t = (value - loV) / (hiV - loV);
      return loP + t * (hiP - loP);
    }
  }
  return anchors[anchors.length - 1][1];
}

/** 값이 작을수록 좋은 지표. anchors 는 [기준값, 점수] 오름차순(값 기준). */
export function scoreLowerBetter(value, anchors) {
  if (value == null) return 0;
  if (value <= anchors[0][0]) return anchors[0][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [loV, loP] = anchors[i];
    const [hiV, hiP] = anchors[i + 1];
    if (value <= hiV) {
      if (!Number.isFinite(hiV)) return hiP;
      const t = (value - loV) / (hiV - loV);
      return loP + t * (hiP - loP);
    }
  }
  return anchors[anchors.length - 1][1];
}

export const VIEW_ANCHORS = [[50_000, 25], [20_000, 15], [5_000, 8], [0, 0]];
export const EFFICIENCY_ANCHORS = [[2.0, 25], [1.0, 15], [0.5, 8], [0.3, 0]];
export const INTERVAL_ANCHORS = [[7, 25], [14, 15], [21, 8], [Infinity, 0]];
export const CV_ANCHORS = [[0.5, 25], [0.8, 15], [1.2, 8], [Infinity, 0]];

/**
 * 표본(조회수 보이는 릴스)이 3개 미만이면 안정성을 신뢰할 수 없다.
 * 그때는 안정성 항목을 빼고 나머지 75점을 100점으로 환산한다.
 * 조용히 0점 처리하면 좋은 계정이 억울하게 밀린다.
 */
export function computeScore(metrics) {
  const parts = {
    views: scoreHigherBetter(metrics.medianViews, VIEW_ANCHORS),
    efficiency: scoreHigherBetter(metrics.efficiency, EFFICIENCY_ANCHORS),
    interval: scoreLowerBetter(metrics.postIntervalDays, INTERVAL_ANCHORS),
    stability: scoreLowerBetter(metrics.viewCV, CV_ANCHORS),
  };

  const stabilityReliable = metrics.viewSample >= 3 && metrics.viewCV != null;
  const total = stabilityReliable
    ? parts.views + parts.efficiency + parts.interval + parts.stability
    : ((parts.views + parts.efficiency + parts.interval) / 75) * 100;

  return {
    parts,
    stabilityReliable,
    score: Math.round(total),
  };
}

export function gradeOf(score) {
  if (score >= 80) return "S";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  return null; // 보고서에서 제외 (상태 파일에는 남긴다)
}

/** viewCV → 대표가 읽을 수 있는 말. 설계 문서의 임계값과 일치해야 한다. */
export function stabilityLabel(viewCV, viewSample) {
  if (viewSample < 3 || viewCV == null) return "판단보류";
  if (viewCV <= 0.5) return "안정";
  if (viewCV <= 0.8) return "보통";
  return "들쭉날쭉";
}
