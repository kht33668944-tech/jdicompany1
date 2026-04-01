export default function HeroSection() {
  return (
    <div
      className="hidden xl:flex flex-col justify-center w-full max-w-2xl 2xl:max-w-3xl shrink animate-fade-in-up min-w-0"
      style={{ animationDelay: "0.1s" }}
    >
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 border border-slate-200/60 backdrop-blur-sm text-slate-600 text-base font-medium mb-8 w-fit shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" className="text-brand-600">
          <path d="M208,82v92a6,6,0,0,1-3,5.2l-72,41.71a6,6,0,0,1-6.06,0L55,179.17A6,6,0,0,1,52,174V82a6,6,0,0,1,3-5.2l72-41.71a6,6,0,0,1,6.06,0l72,41.71A6,6,0,0,1,208,82Z" opacity="0.2"/><path d="M223.68,66.15,135.68,15a15.88,15.88,0,0,0-15.36,0l-88,51.12A16,16,0,0,0,24,80v96a16,16,0,0,0,8.32,14l88,51.12a15.88,15.88,0,0,0,15.36,0l88-51.12A16,16,0,0,0,232,176V80A16,16,0,0,0,223.68,66.15ZM128,29.09,207.39,75.1,128,120.91,48.61,75.1ZM40,90l80,45.51V223.56L40,176ZM136,223.56V135.56L216,90v86Z"/>
        </svg>
        Authorized Personnel Only
      </div>

      <h1 className="text-7xl xl:text-8xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.15]">
        JDICOMPANY
        <br />
        <span className="text-6xl xl:text-7xl text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600">
          Internal System
        </span>
      </h1>

      <p className="text-xl text-slate-600 max-w-xl leading-relaxed mb-2">
        상품 관리, 주문 처리, 고객 데이터까지
      </p>
      <p className="text-xl text-slate-500 max-w-xl leading-relaxed mb-14">
        모든 이커머스 업무를 한 곳에서 관리하세요.
      </p>

      <div className="flex items-center gap-6 text-base font-medium text-slate-500">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/50 transition-colors cursor-default">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </div>
          <span>운영 시스템 정상</span>
        </div>
      </div>
    </div>
  );
}
