"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { getChatFileUrls } from "@/lib/chat/actions";

/**
 * 채널 내 파일/이미지 메시지의 서명 URL을 한 번에 일괄 생성하여 공유.
 * - 기존: 메시지마다 개별 createSignedUrl 요청 (채널에 파일 20개면 20 roundtrip)
 * - 변경: messages 변경 시 누락된 path 만 모아 단일 batch 요청 → 네트워크 ~1회
 */

interface ChatFileUrlsContextValue {
  urls: Record<string, string>;
  /** 누락된 path 만 batch 요청. 이미 요청했거나 완료된 path 는 건너뜀. */
  ensure: (paths: string[]) => void;
}

const ChatFileUrlsContext = createContext<ChatFileUrlsContextValue | null>(null);

export function ChatFileUrlsProvider({ children }: { children: React.ReactNode }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  // 이미 요청된 path (in-flight 포함) — 중복 요청 방지
  const requestedRef = useRef<Set<string>>(new Set());
  // batch 플러시 타이머 — 짧은 시간 내 여러 ensure 호출을 하나로 합침
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    const batch = Array.from(pendingRef.current);
    pendingRef.current.clear();
    if (batch.length === 0) return;
    getChatFileUrls(batch)
      .then((map) => {
        if (Object.keys(map).length === 0) return;
        setUrls((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {
        // 실패 시 다음 ensure 에서 재시도 가능하도록 requested 에서 제거
        batch.forEach((p) => requestedRef.current.delete(p));
      });
  }, []);

  const ensure = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      let added = false;
      for (const p of paths) {
        if (!p) continue;
        if (requestedRef.current.has(p)) continue;
        requestedRef.current.add(p);
        pendingRef.current.add(p);
        added = true;
      }
      if (!added) return;
      if (flushTimerRef.current) return;
      // 16ms 디바운스 — 같은 렌더 주기 내의 모든 ensure 를 하나로 합침
      flushTimerRef.current = setTimeout(flush, 16);
    },
    [flush]
  );

  return (
    <ChatFileUrlsContext.Provider value={{ urls, ensure }}>
      {children}
    </ChatFileUrlsContext.Provider>
  );
}

/**
 * 채팅 내 파일/이미지 서명 URL 컨텍스트 훅.
 * Provider 밖에서는 빈 map + no-op 으로 안전하게 동작 (기존 경로 미사용 시 회귀 없음)
 */
export function useChatFileUrls(): ChatFileUrlsContextValue {
  const ctx = useContext(ChatFileUrlsContext);
  if (ctx) return ctx;
  return { urls: {}, ensure: () => {} };
}
