import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("마이그레이션 098이 이미지 mime 제한을 해제한다", () => {
  const sql = read("supabase/migrations/098_work_timeline_file_attachments.sql");
  assert.match(sql, /DROP CONSTRAINT IF EXISTS work_timeline_attachments_mime_type_check/);
  assert.match(sql, /file_size BETWEEN 1 AND 52428800/);
  assert.match(sql, /position BETWEEN 0 AND 9/);
  assert.match(sql, /allowed_mime_types = NULL/);
});

test("상수에 블록리스트와 확대된 상한이 있다", () => {
  const src = read("src/lib/work-timeline/constants.ts");
  assert.match(src, /WORK_TIMELINE_MAX_ATTACHMENTS = 10/);
  assert.match(src, /WORK_TIMELINE_MAX_FILE_SIZE = 50 \* 1024 \* 1024/);
  assert.match(src, /WORK_TIMELINE_BLOCKED_EXTENSIONS/);
  assert.match(src, /"exe"/);
});

test("검증 유틸이 일반 파일 검증/이미지 판별을 제공한다", () => {
  const src = read("src/lib/work-timeline/utils.ts");
  assert.match(src, /export function validateWorkTimelineFile/);
  assert.match(src, /export function isWorkTimelineImage/);
  assert.match(src, /export function getBlockedExtension/);
});

test("생성 모달이 이미지 전용 accept 잠금을 걸지 않는다", () => {
  const src = read("src/components/dashboard/work-timeline/WorkTimelineCreateModal.tsx");
  assert.doesNotMatch(src, /accept=\{WORK_TIMELINE_IMAGE_MIME_TYPES/);
  assert.match(src, /uploadWorkTimelineFilesDirect/);
});

test("상세 화면이 이미지/파일을 분리 렌더한다", () => {
  const src = read("src/components/dashboard/work-timeline/WorkTimelineDetailClient.tsx");
  assert.match(src, /imageAttachments/);
  assert.match(src, /fileAttachments/);
  assert.match(src, /AttachmentFileCard/);
});
