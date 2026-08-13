// 로컬 개발 서버를 "운영 전용 서버 키"와 함께 띄운다: npm run dev:keys
//
// 배경: 2차 비밀번호 잠금 해제(ACCOUNT_VAULT_KEY)와 전자서명(SUPABASE_SERVICE_ROLE_KEY)은
// 서버 전용 키가 필요한데, 보안상 .env.local 파일에는 남기지 않는다. 그래서 평범한
// `npm run dev` 로 띄운 로컬에서는 이 기능들이 동작하지 않는다.
//
// 이 스크립트는 GCP Secret Manager 에서 키를 읽어 "환경변수로만" 주입해 next dev 를
// 띄운다 — 키가 파일이나 화면에 남지 않는다. gcloud 로그인이 되어 있어야 한다.

import { spawnSync, spawn } from "node:child_process";

const PROJECT = "jdi-portal-seoul";
const SECRETS = ["ACCOUNT_VAULT_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const isWindows = process.platform === "win32";

function readSecret(name) {
  const result = spawnSync(
    "gcloud",
    ["secrets", "versions", "access", "latest", `--secret=${name}`, "--project", PROJECT],
    { encoding: "utf8", shell: isWindows, windowsHide: true },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    console.error(`\n❌ ${name} 키를 가져오지 못했습니다.`);
    console.error("   gcloud 로그인이 되어 있는지 확인해주세요: gcloud auth login");
    console.error(`   (오류: ${(result.stderr || "").trim().split("\n")[0] || "알 수 없음"})\n`);
    process.exit(1);
  }
  return result.stdout.trim();
}

console.log("🔑 운영 서버 키를 GCP Secret Manager 에서 불러오는 중… (파일에 저장되지 않아요)");
const env = { ...process.env };
for (const name of SECRETS) {
  env[name] = readSecret(name);
  console.log(`   ✓ ${name}`);
}

console.log("🚀 개발 서버 시작 (localhost:3000) — 잠금 해제·전자서명 로컬 동작 가능\n");
const child = spawn("npx", ["next", "dev"], {
  env,
  stdio: "inherit",
  shell: isWindows,
});
child.on("exit", (code) => process.exit(code ?? 0));
