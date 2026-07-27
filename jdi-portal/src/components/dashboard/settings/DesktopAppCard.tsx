"use client";

import { useSyncExternalStore } from "react";
import { DownloadSimple, CheckCircle, Info, Monitor } from "phosphor-react";

/**
 * Windows 데스크톱 앱(트레이 상주) 다운로드 카드.
 * - 설치 파일은 GitHub 릴리스의 최신본을 받는다 (버전이 올라가도 주소는 그대로)
 * - 이미 데스크톱 앱 안에서 이 화면을 보고 있으면 "사용 중" 안내로 바뀐다
 * - Windows 가 아니면 다운로드 대신 안내만 표시
 */

const DOWNLOAD_URL =
  "https://github.com/kht33668944-tech/jdicompany1/releases/latest/download/JDI-Portal-Setup.exe";

// 브라우저에서만 알 수 있는 값들 — 서버 렌더링 시에는 기본값을 쓰고,
// 화면이 붙은 뒤 실제 값으로 맞춘다 (변하지 않는 값이라 구독은 필요 없다).
const noopSubscribe = () => () => {};

function useIsWindows(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Windows/i.test(window.navigator.userAgent),
    () => true
  );
}

function useInDesktopApp(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () =>
      (window as unknown as { jdiDesktop?: { isDesktopApp?: boolean } }).jdiDesktop?.isDesktopApp === true,
    () => false
  );
}

export default function DesktopAppCard() {
  const isWindows = useIsWindows();
  const inDesktopApp = useInDesktopApp();

  if (inDesktopApp) {
    return (
      <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-5 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={24} weight="fill" className="text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">데스크톱 앱으로 사용 중입니다</h2>
            <p className="text-sm text-slate-500 mt-1">
              창을 닫아도 트레이(작업표시줄 오른쪽 숨겨진 아이콘)에 남아 알림을 계속 받습니다.
              새 버전이 나오면 알아서 업데이트되므로 다시 설치하지 않아도 됩니다.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-5 sm:p-8">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-50 to-indigo-50 flex items-center justify-center flex-shrink-0">
          <Monitor size={24} weight="bold" className="text-brand-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-800">Windows 데스크톱 앱</h2>
          <p className="text-sm text-slate-500 mt-1">
            컴퓨터에 설치하면 브라우저 없이 바로 열 수 있고, 창을 닫아도 트레이에 남아 업무 지시·채팅 알림을 놓치지 않습니다.
          </p>
        </div>
      </div>

      {isWindows ? (
        <a
          href={DOWNLOAD_URL}
          className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-bold text-sm shadow-md hover:shadow-lg hover:from-brand-700 hover:to-indigo-700 transition-all inline-flex items-center justify-center gap-2"
        >
          <DownloadSimple size={18} weight="bold" />
          설치 파일 내려받기
        </a>
      ) : (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm text-slate-600">
          현재 Windows 데스크톱 앱만 제공합니다. 다른 기기에서는 위의 <strong>앱으로 설치하기</strong>를 이용해 주세요.
        </div>
      )}

      <div className="mt-6 bg-blue-50/60 border border-blue-100 rounded-2xl p-5 text-sm text-slate-600 leading-relaxed">
        <div className="flex items-center gap-2 mb-2 text-blue-700 font-bold">
          <Info size={18} weight="bold" />
          설치 방법
        </div>
        <ol className="list-decimal list-inside space-y-1">
          <li>내려받은 <strong>JDI-Portal-Setup.exe</strong> 파일을 실행합니다.</li>
          <li>
            <strong>&ldquo;Windows의 PC 보호&rdquo;</strong> 파란 창이 뜨면 <strong>추가 정보</strong> → <strong>실행</strong>을 누릅니다.
            (사내 프로그램이라 인증서가 없어 나오는 정상적인 안내입니다.)
          </li>
          <li>설치가 끝나면 바탕화면과 시작 메뉴에 <strong>JDI 포털</strong> 아이콘이 생깁니다.</li>
          <li>
            실행 후 트레이 아이콘을 <strong>우클릭</strong> → <strong>Windows 시작 시 자동 실행</strong>을 체크하면
            컴퓨터를 켤 때마다 자동으로 실행됩니다.
          </li>
        </ol>
        <p className="text-xs text-slate-400 mt-3">
          ※ 포털 화면과 기능은 항상 서버에서 최신으로 불러오므로, 기능이 추가돼도 다시 설치할 필요가 없습니다.
        </p>
      </div>
    </section>
  );
}
