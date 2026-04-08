#!/usr/bin/env node
// 마이그레이션 파일을 DATABASE_URL로 직접 실행
// 사용법: node scripts/run-migration.mjs <migration-file>

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

// .env.local 수동 로드 (dotenv 의존성 없이)
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf8");
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2];
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL 이 .env.local 에 없습니다");
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("사용법: node scripts/run-migration.mjs <file>");
  process.exit(1);
}

const sql = readFileSync(resolve(process.cwd(), migrationFile), "utf8");

const client = new pg.Client({
  connectionString,
  // Supabase pooler 는 TLS 필수
  ssl: { rejectUnauthorized: false },
});

try {
  console.log("🔌 DB 연결 중...");
  await client.connect();
  console.log("✅ 연결 성공");

  console.log(`▶ 실행: ${migrationFile}`);
  await client.query(sql);
  console.log("✅ 마이그레이션 적용 완료");

  // 검증: 함수/트리거 존재 확인
  const fnCheck = await client.query(
    "SELECT proname FROM pg_proc WHERE proname IN ('ensure_vacation_balance','on_hire_date_change')"
  );
  console.log("   생성된 함수:", fnCheck.rows.map((r) => r.proname).join(", "));

  const trgCheck = await client.query(
    "SELECT tgname FROM pg_trigger WHERE tgname = 'trg_profiles_hire_date_change'"
  );
  console.log("   생성된 트리거:", trgCheck.rows.length > 0 ? "trg_profiles_hire_date_change ✅" : "❌ 없음");

  // 백필 결과 확인
  const year = new Date().getFullYear();
  const backfillCheck = await client.query(
    "SELECT COUNT(*) AS c FROM vacation_balances WHERE year = $1",
    [year]
  );
  console.log(`   ${year}년 vacation_balances 레코드 수:`, backfillCheck.rows[0].c);
} catch (err) {
  console.error("❌ 마이그레이션 실패:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
