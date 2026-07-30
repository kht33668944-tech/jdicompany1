"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  STALE_DEPLOYMENT_EVENT,
  isStaleDeploymentError,
} from "@/lib/utils/errors";

/**
 * 배포로 화면이 낡았을 때 새로고침을 대신 해 주는 감시자.
 *
 * 왜 필요한가: 데스크톱 앱이 트레이에 상주해 화면을 며칠씩 열어 두므로, 배포할
 * 때마다 직원이 `Server Action ... was not found on the server` 라는 영어 오류를
 * 만난다(자세한 배경은 `src/lib/utils/errors.ts`). 새로고침 말고는 해결책이 없다.
 *
 * 입력이 있으면 자동으로 새로고침하지 않는다: 작성 중이던 글이 사라지기 때문이다.
 * 그 경우에는 버튼을 눌러 사용자가 직접 시점을 고르게 한다.
 */

/** 새로고침 전에 안내를 보여 줄 시간. */
const AUTO_RELOAD_DELAY_MS = 3000;

/**
 * 새로고침 뒤에도 같은 오류가 나면(다른 원인) 무한 새로고침이 된다.
 * 한 번 자동 새로고침했으면 이 시간 동안은 다시 하지 않고 버튼만 보여 준다.
 */
const RELOAD_COOLDOWN_MS = 60_000;
const RELOAD_MARK_KEY = "jdi:stale-reload-at";

/** 사용자가 입력해 둔 내용이 있는지 — 있으면 자동 새로고침하지 않는다. */
function hasUnsavedInput(): boolean {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input, textarea"
  );
  for (const field of fields) {
    if (field.disabled || field.readOnly) continue;
    if (field instanceof HTMLInputElement) {
      // 체크박스·버튼 같은 것은 "작성 중인 글" 이 아니다.
      const ignored = ["hidden", "checkbox", "radio", "submit", "button", "file"];
      if (ignored.includes(field.type)) continue;
    }
    if (field.value.trim().length > 0) return true;
  }
  return document.querySelector('[contenteditable="true"]') !== null;
}

function recentlyAutoReloaded(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_MARK_KEY) ?? 0);
    return Number.isFinite(at) && Date.now() - at < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markAutoReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_MARK_KEY, String(Date.now()));
  } catch {
    // 시크릿 모드 등에서 막혀도 새로고침 자체는 진행한다.
  }
}

export default function StaleDeploymentWatcher() {
  useEffect(() => {
    // 한 번의 실패로 여러 경로(가로챈 오류 + 미처리 거부)에서 신호가 올 수 있다.
    let handled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handle = () => {
      if (handled) return;
      handled = true;

      const canAutoReload = !hasUnsavedInput() && !recentlyAutoReloaded();

      if (!canAutoReload) {
        toast.error("새 버전이 배포되었습니다", {
          description:
            "작성 중인 내용이 있어 자동으로 새로고침하지 않았습니다. 내용을 복사해 두신 뒤 새로고침해 주세요.",
          duration: Infinity,
          action: {
            label: "새로고침",
            onClick: () => window.location.reload(),
          },
        });
        return;
      }

      toast.info("새 버전이 배포되었습니다", {
        description: "화면을 새로 불러오는 중입니다…",
        duration: AUTO_RELOAD_DELAY_MS,
      });
      markAutoReloaded();
      timer = setTimeout(() => window.location.reload(), AUTO_RELOAD_DELAY_MS);
    };

    // 1) 앱이 가로챈 오류 — getErrorMessage 가 알려 준다.
    const onSignal = () => handle();
    // 2) 아무도 가로채지 않은 오류.
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleDeploymentError(event.reason)) handle();
    };
    const onError = (event: ErrorEvent) => {
      if (isStaleDeploymentError(event.error ?? event.message)) handle();
    };

    window.addEventListener(STALE_DEPLOYMENT_EVENT, onSignal);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener(STALE_DEPLOYMENT_EVENT, onSignal);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
