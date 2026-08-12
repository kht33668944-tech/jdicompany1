"use client";

// 리스트(influencers) 자동완성 공용 훅 — 계약 페이지 검색창과 계약 폼 이름 칸이 함께 쓴다.
// 300ms 디바운스, 2글자 이상일 때만 서버 검색, 최대 6건.
// 결과를 검색어와 함께 저장해 두고 "지금 검색어의 결과"만 돌려준다
// (effect 안 동기 setState 없이도 이전 검색어의 잔상이 보이지 않게).

import { useEffect, useState } from "react";
import { searchInfluencers } from "@/lib/influencer/actions";
import type { InfluencerListItem } from "@/lib/influencer/types";

const NO_SUGGESTIONS: InfluencerListItem[] = [];

export function useInfluencerSuggestions(
  term: string,
  enabled: boolean,
): InfluencerListItem[] {
  const [result, setResult] = useState<{ term: string; rows: InfluencerListItem[] }>({
    term: "",
    rows: NO_SUGGESTIONS,
  });

  const trimmed = term.trim();

  useEffect(() => {
    if (!enabled || trimmed.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchInfluencers(trimmed);
        if (!cancelled) setResult({ term: trimmed, rows: rows.slice(0, 6) });
      } catch {
        // 검색 실패는 조용히 무시 — 직접 입력으로 계속 진행 가능
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, enabled]);

  return enabled && trimmed.length >= 2 && result.term === trimmed
    ? result.rows
    : NO_SUGGESTIONS;
}
