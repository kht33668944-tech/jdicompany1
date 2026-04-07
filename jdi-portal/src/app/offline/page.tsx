"use client";

// 오프라인 폴백 페이지 — Service Worker 가 네트워크 실패 시 이 페이지를 반환

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md w-full text-center bg-white rounded-3xl shadow-sm border border-slate-100 p-10">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="white" viewBox="0 0 256 256">
            <path d="M223.68,66.15,135.68,15a15.88,15.88,0,0,0-15.36,0l-88,51.12A16,16,0,0,0,24,80v96a16,16,0,0,0,8.32,14l88,51.12a15.88,15.88,0,0,0,15.36,0l88-51.12A16,16,0,0,0,232,176V80A16,16,0,0,0,223.68,66.15Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">오프라인 상태입니다</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          인터넷 연결이 끊겼습니다.
          <br />
          연결이 복구되면 자동으로 다시 불러옵니다.
        </p>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </main>
  );
}
