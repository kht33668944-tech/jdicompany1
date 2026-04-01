import Aurora from "@/components/Aurora";
import DotBackground from "@/components/DotBackground";
import HeroSection from "@/components/HeroSection";
import LoginCard from "@/components/LoginCard";

export const metadata = {
  title: "JDICOMPANY Internal Portal - 로그인",
  description: "JDICOMPANY 내부 시스템 로그인",
};

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full selection:bg-brand-200 selection:text-brand-900">
      <DotBackground />
      <Aurora />
      <main className="relative z-10 flex min-h-screen w-full items-center justify-center lg:justify-between px-6 py-12 lg:px-24 xl:px-32">
        <HeroSection />
        <LoginCard />
      </main>
    </div>
  );
}
