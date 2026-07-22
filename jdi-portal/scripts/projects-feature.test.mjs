import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

test("101 마이그레이션: projects 테이블 + RLS + FK 컬럼", () => {
  const path = "supabase/migrations/101_projects.sql";
  assert.ok(existsSync(join(process.cwd(), path)), "101_projects.sql 이 없습니다");
  const sql = read(path);
  assert.match(sql, /CREATE TABLE public\.projects/);
  assert.match(sql, /ALTER TABLE public\.projects ENABLE ROW LEVEL SECURITY/);
  // 삭제는 admin만
  assert.match(sql, /FOR DELETE[\s\S]*?role = 'admin'/);
  // 이름 중복 방지(대소문자·공백 무시)
  assert.match(sql, /lower\(btrim\(name\)\)/);
  // 프로젝트 삭제 시 글/할일은 미분류로 (created_by 포함 3회 이상)
  assert.ok((sql.match(/ON DELETE SET NULL/g) ?? []).length >= 3);
  assert.match(sql, /ALTER TABLE public\.work_timeline_entries\s+ADD COLUMN project_id/);
  assert.match(sql, /ALTER TABLE public\.tasks\s+ADD COLUMN project_id/);
  // 부분 인덱스
  assert.match(sql, /idx_work_timeline_entries_project[\s\S]*?WHERE project_id IS NOT NULL/);
  assert.match(sql, /idx_tasks_project[\s\S]*?WHERE project_id IS NOT NULL/);
  // 초기 데이터 + 접두어 자동 분류
  assert.match(sql, /코스피랩/);
  assert.match(sql, /JDI 포탈/);
  assert.match(sql, /regexp_replace/);
  assert.match(sql, /오너먼트/);
  // KST 규칙 위반 금지: 날짜 컬럼 없음 → CURRENT_DATE 미사용
  assert.doesNotMatch(sql, /CURRENT_DATE/);
});
