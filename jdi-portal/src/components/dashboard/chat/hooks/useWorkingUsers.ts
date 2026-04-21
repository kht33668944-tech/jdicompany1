"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 채팅 사이드바의 "온라인" 표시를 실제 출근(근무중) 상태 기준으로 계산
// - 기존 Supabase Presence (채팅창 접속 여부) 를 대체
// - get_working_user_ids RPC 로 오늘(KST) 근무중인 user_id 목록 조회
// - 30초 폴링 + 탭 visible 전환 시 즉시 갱신
const POLL_INTERVAL_MS = 30_000;

export function useWorkingUsers(): Set<string> {
  const [workingUsers, setWorkingUsers] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_working_user_ids");
      if (error) return;
      if (!Array.isArray(data)) return;
      setWorkingUsers(new Set(data as string[]));
    } catch {
      // silent — 일시적 네트워크 오류는 다음 폴링에서 복구
    }
  }, []);

  useEffect(() => {
    // rAF 로 지연 — hydration 후 비동기 적용 (cascading render 방지)
    const initialRaf = requestAnimationFrame(() => void refresh());

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refresh();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(initialRaf);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return workingUsers;
}
