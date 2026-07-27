"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getChatFileUrls } from "@/lib/chat/actions";
import { CHAT_FILE_URL_TTL_SECONDS } from "@/lib/chat/constants";
import { readCachedFileUrls, writeCachedFileUrls } from "@/lib/chat/fileUrlCache";

/**
 * 채널 내 파일/이미지 메시지의 서명 URL을 한 번에 일괄 생성하여 공유.
 *
 * URL 확보 순서 — 앞에서 해결될수록 사진이 빨리 뜬다.
 *  1) SSR initialUrls  : 채널에 직접 진입·새로고침. 왕복 0
 *  2) localStorage 캐시: 채널 전환(클라이언트 상태 전환이라 SSR 이 없다). 왕복 0
 *  3) batch 서버 요청  : 1·2 에 없는 것만 모아 단일 요청 (16ms 디바운스)
 *
 * 1·3 의 결과는 캐시에 적재해 다음 전환 때 2번 경로가 받아 준다.
 * 캐시는 표시용이며 권한 검증은 항상 서버 RLS 가 담당한다.
 */

interface ChatFileUrlsContextValue {
  urls: Record<string, string>;
  /** 누락된 path 만 batch 요청. 이미 요청했거나 완료된 path 는 건너뜀. */
  ensure: (paths: string[]) => void;
}

const ChatFileUrlsContext = createContext<ChatFileUrlsContextValue | null>(null);

export function ChatFileUrlsProvider({
  children,
  initialUrls,
}: {
  children: React.ReactNode;
  /** SSR 에서 미리 발급한 path → signedUrl. 첫 렌더부터 이미지가 바로 뜬다. */
  initialUrls?: Record<string, string>;
}) {
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls ?? {});
  // 이미 요청된 path (in-flight 포함) — 중복 요청 방지.
  // 서버가 내려준 path 는 이미 확보된 것이므로 처음부터 등록해 재요청을 막는다.
  const requestedRef = useRef<Set<string>>(new Set(Object.keys(initialUrls ?? {})));
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
        // 다음 채널 전환 때 왕복 없이 쓰도록 저장
        writeCachedFileUrls(map, CHAT_FILE_URL_TTL_SECONDS);
      })
      .catch(() => {
        // 실패 시 다음 ensure 에서 재시도 가능하도록 requested 에서 제거
        batch.forEach((p) => requestedRef.current.delete(p));
      });
  }, []);

  // 서버가 내려준 URL 을 캐시에도 넣어 둬야 이후 채널 전환에서 재사용된다.
  // (localStorage 접근은 클라이언트 전용이라 마운트 후에 한다 — hydration 안전.
  //  같은 값을 다시 써도 결과가 같으므로 재실행돼도 무해하다)
  useEffect(() => {
    if (!initialUrls || Object.keys(initialUrls).length === 0) return;
    writeCachedFileUrls(initialUrls, CHAT_FILE_URL_TTL_SECONDS);
  }, [initialUrls]);

  const ensure = useCallback(
    (paths: string[]) => {
      // 아직 확보하지 않은 경로만 대상으로 한다
      const fresh = paths.filter((p) => p && !requestedRef.current.has(p));
      if (fresh.length === 0) return;

      // 로컬 캐시에 살아 있는 URL 은 즉시 반영하고(채널 전환 시 왕복 0),
      // 없는 것만 batch 요청 대기열에 넣는다.
      // (localStorage 는 동기 접근이라 이 자리에서 바로 확인할 수 있다)
      const cached = readCachedFileUrls(fresh);
      const hits: Record<string, string> = {};
      let hasHits = false;
      let added = false;
      for (const p of fresh) {
        requestedRef.current.add(p);
        if (cached[p]) {
          hits[p] = cached[p];
          hasHits = true;
        } else {
          pendingRef.current.add(p);
          added = true;
        }
      }
      if (hasHits) setUrls((prev) => ({ ...prev, ...hits }));

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

export function useChatFileUrl(path: string): string | null {
  const { urls, ensure } = useChatFileUrls();

  useEffect(() => {
    if (!path) return;
    ensure([path]);
  }, [ensure, path]);

  return urls[path] ?? null;
}
