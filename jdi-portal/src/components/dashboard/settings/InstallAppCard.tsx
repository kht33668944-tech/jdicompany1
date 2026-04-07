"use client";

import { useEffect, useState } from "react";
import { DownloadSimple, CheckCircle, DeviceMobile } from "phosphor-react";

/**
 * PWA 설치 카드 — 직원이 직접 클릭하여 데스크탑/모바일에 앱 설치.
 * - Chrome/Edge: beforeinstallprompt 이벤트로 네이티브 설치 다이얼로그 띄움
 * - 이미 설치된 경우: 설치 완료 안내 표시
 * - iOS Safari: 자동 설치 불가 → 수동 안내 (공유 → 홈 화면에 추가)
 */

// Chrome/Edge BeforeInstallPromptEvent 타입 (TS lib 에 미정의)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 이미 standalone 모드에서 실행 중이면 설치 완료로 간주
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);

    // iOS 감지 — beforeinstallprompt 이벤트 미지원이라 별도 안내 필요
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setIsIOS(true);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setBusy(true);
    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    } finally {
      setBusy(false);
    }
  };

  // 설치 완료 상태
  if (installed) {
    return (
      <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={24} weight="fill" className="text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">앱이 설치되어 있습니다</h2>
            <p className="text-sm text-slate-500 mt-1">
              JDI 포털을 앱으로 사용 중이거나 이 기기에 이미 설치되어 있습니다. 더 빠르고 깔끔하게 이용하실 수 있어요.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-50 to-indigo-50 flex items-center justify-center flex-shrink-0">
          <DownloadSimple size={24} weight="bold" className="text-brand-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-800">앱으로 설치하기</h2>
          <p className="text-sm text-slate-500 mt-1">
            JDI 포털을 데스크탑/모바일 앱으로 설치하면 주소창 없는 독립 창으로 더 빠르게 실행할 수 있습니다.
          </p>
        </div>
      </div>

      {/* 데스크탑/안드로이드 — 자동 설치 가능 */}
      {deferredPrompt && !isIOS && (
        <button
          type="button"
          onClick={handleInstall}
          disabled={busy}
          className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-bold text-sm shadow-md hover:shadow-lg hover:from-brand-700 hover:to-indigo-700 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <DownloadSimple size={18} weight="bold" />
          {busy ? "설치 중..." : "지금 설치"}
        </button>
      )}

      {/* iOS — 수동 안내 */}
      {isIOS && (
        <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5 text-sm text-slate-600 leading-relaxed">
          <div className="flex items-center gap-2 mb-2 text-blue-700 font-bold">
            <DeviceMobile size={18} weight="bold" />
            iPhone / iPad 설치 방법
          </div>
          <ol className="list-decimal list-inside space-y-1">
            <li>Safari 하단의 <strong>공유 버튼</strong> (□↑) 탭</li>
            <li>목록에서 <strong>홈 화면에 추가</strong> 선택</li>
            <li>오른쪽 위 <strong>추가</strong> 탭</li>
          </ol>
          <p className="text-xs text-slate-400 mt-3">※ Chrome/기타 브라우저가 아닌 Safari 에서만 설치 가능합니다.</p>
        </div>
      )}

      {/* 자동 설치 미지원 + 비-iOS — 수동 안내 */}
      {!deferredPrompt && !isIOS && (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm text-slate-600 leading-relaxed space-y-2">
          <p className="font-bold text-slate-700">설치 버튼이 활성화되지 않은 경우</p>
          <ul className="list-disc list-inside space-y-1 text-xs text-slate-500">
            <li>주소창 오른쪽의 📥 모니터 아이콘을 클릭하세요.</li>
            <li>또는 브라우저 우상단 ⋮ → <strong>앱 설치</strong> / <strong>페이지를 앱으로 설치</strong>를 클릭하세요.</li>
            <li>Chrome / Edge / 삼성 인터넷 등 최신 브라우저에서 지원됩니다.</li>
          </ul>
        </div>
      )}
    </section>
  );
}
