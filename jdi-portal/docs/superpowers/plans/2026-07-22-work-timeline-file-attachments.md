# 업무 타임라인 일반 파일 첨부 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업무 타임라인의 이미지 전용 첨부를 "위험 실행파일만 차단"하는 일반 파일 첨부(엑셀·PDF·한글 등)로 확장한다.

**Architecture:** 이미 검증된 첨부 시스템(직접 스토리지 업로드 → 메타데이터 finalize → 서명 URL → RLS/정리 큐)을 유지한 채, "이미지만" 잠금이 걸린 3곳(DB CHECK, 스토리지 버킷 allowed_mime_types, 앱 코드/문구)을 해제한다. 이미지는 기존 썸네일/라이트박스 렌더링을 유지하고, 비이미지 파일은 파일 카드(아이콘·이름·용량·다운로드)로 표시한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase(Postgres·Storage·RLS), Tailwind CSS 4, phosphor-react 아이콘.

## Global Constraints

- 모든 사용자 대면 문구는 한국어. 사용자는 비개발자 운영자.
- 마이그레이션은 순차 번호 신규 추가만. 다음 번호는 **098**. 기존 마이그레이션 수정 금지.
- 운영 DB 변경(마이그레이션 098 적용)은 실행 전 사용자 재확인 필수. 계획서는 SQL 작성까지만 하고, `npx supabase db push --linked` 적용은 사용자 승인 후 별도 단계로 수행.
- 보안 불변조건 유지: 비공개 버킷 `work-timeline`, 서명 URL(1시간), RLS(`is_approved_user()` + 소유자/관리자), 경로 규칙 `{userId}/{entryId}/{filename}`.
- 성능 불변조건 유지: 대시보드/타임라인 빠른 경로·keepalive 등 건드리지 않음. 작업 후 `npm run test:performance`(40개 검사)와 `npm run lint` 통과 필수.
- 파일 상한: 개당 **52428800 바이트(50MB)**, 항목당 이미지+파일 합산 **10개**.
- 차단 확장자(소문자): `exe, bat, cmd, com, msi, scr, pif, cpl, jar, js, jse, mjs, cjs, vbs, vbe, ws, wsf, wsh, ps1, psm1, ps1xml, sh, bash, zsh, app, deb, rpm, dll, sys, drv, hta, reg, lnk, gadget, apk, ipa, vb, vbscript`. 확장자 없는 파일도 거부.
- 이미지 MIME(썸네일/미리보기 대상): `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- MIME이 빈 문자열인 파일(일부 hwp 등)은 `application/octet-stream`으로 저장.
- 모든 명령은 `jdi-portal/` 안에서 실행.

## File Structure

**생성**
- `jdi-portal/supabase/migrations/098_work_timeline_file_attachments.sql` — DB CHECK/버킷 제약 완화
- `jdi-portal/src/lib/work-timeline/fileKind.ts` — 확장자→종류/색상/라벨 매핑(파일 카드·아이콘 공용)
- `jdi-portal/src/components/dashboard/work-timeline/AttachmentFileCard.tsx` — 비이미지 파일 카드 UI
- `jdi-portal/scripts/work-timeline-attachments.test.mjs` — 소스 스캔형 회귀 가드

**수정**
- `jdi-portal/src/lib/work-timeline/constants.ts` — 상한/블록리스트 상수
- `jdi-portal/src/lib/work-timeline/utils.ts` — `validateWorkTimelineFile`, `isWorkTimelineImage`, `getBlockedExtension`
- `jdi-portal/src/lib/work-timeline/types.ts` — `WorkTimelineImageUpload` → `WorkTimelineFileUpload`
- `jdi-portal/src/lib/work-timeline/clientUploads.ts` — 일반 파일 업로드(이미지만 썸네일)
- `jdi-portal/src/lib/work-timeline/actions.ts` — finalize 검증 완화, 개수/문구
- `jdi-portal/src/lib/work-timeline/queries.ts` — thumbnailOnly는 이미지 썸네일만 서명
- `jdi-portal/src/components/dashboard/work-timeline/WorkTimelineCreateModal.tsx` — 파일 선택/미리보기
- `jdi-portal/src/components/dashboard/work-timeline/WorkTimelineDetailClient.tsx` — 이미지/파일 분리 렌더
- `jdi-portal/src/components/dashboard/work-timeline/WorkTimelineSection.tsx` — 리스트 미리보기 아이콘

---

## Task 1: 마이그레이션 098 (DB/버킷 제약 완화)

**Files:**
- Create: `jdi-portal/supabase/migrations/098_work_timeline_file_attachments.sql`

**Interfaces:**
- Produces: `work_timeline_attachments`의 mime 자유화, 용량 50MB, position 0..9. 버킷 `work-timeline`의 `file_size_limit=52428800`, `allowed_mime_types=NULL`.

- [ ] **Step 1: 마이그레이션 파일 작성**

`jdi-portal/supabase/migrations/098_work_timeline_file_attachments.sql`:

```sql
-- ============================================================
-- 098: 업무 타임라인 일반 파일 첨부 허용
--   - 첨부 mime 제한(이미지 4종) 해제
--   - 개당 용량 10MB -> 50MB
--   - 항목당 첨부 5개 -> 10개 (position 0..9)
--   - 스토리지 버킷 allowed_mime_types 전체 허용, file_size_limit 50MB
-- 위험 실행파일 차단은 앱 코드(확장자 블록리스트)에서 강제한다.
-- ============================================================

-- 1) mime 제한 해제 (NOT NULL 은 유지)
ALTER TABLE public.work_timeline_attachments
  DROP CONSTRAINT IF EXISTS work_timeline_attachments_mime_type_check;

-- 2) 용량 상한 50MB
ALTER TABLE public.work_timeline_attachments
  DROP CONSTRAINT IF EXISTS work_timeline_attachments_file_size_check;
ALTER TABLE public.work_timeline_attachments
  ADD CONSTRAINT work_timeline_attachments_file_size_check
    CHECK (file_size BETWEEN 1 AND 52428800);

-- 3) position 상한 0..9 (항목당 10개)
ALTER TABLE public.work_timeline_attachments
  DROP CONSTRAINT IF EXISTS work_timeline_attachments_position_check;
ALTER TABLE public.work_timeline_attachments
  ADD CONSTRAINT work_timeline_attachments_position_check
    CHECK (position BETWEEN 0 AND 9);

-- 4) 스토리지 버킷: 전체 형식 허용 + 50MB
UPDATE storage.buckets
  SET file_size_limit = 52428800,
      allowed_mime_types = NULL
  WHERE id = 'work-timeline';
```

- [ ] **Step 2: SQL 문법 확인 (적용 아님)**

Run: `cd jdi-portal && node -e "const s=require('fs').readFileSync('supabase/migrations/098_work_timeline_file_attachments.sql','utf8'); if(!/DROP CONSTRAINT IF EXISTS work_timeline_attachments_mime_type_check/.test(s)||!/52428800/.test(s)||!/allowed_mime_types = NULL/.test(s)) throw new Error('migration content missing'); console.log('098 OK');"`
Expected: `098 OK`

- [ ] **Step 3: 커밋**

```bash
git add jdi-portal/supabase/migrations/098_work_timeline_file_attachments.sql
git commit -m "DB: 업무 타임라인 첨부 일반 파일 허용 마이그레이션(098)"
```

> 적용(`npx supabase db push --linked`)은 코드 구현 완료 후 **사용자 승인 단계**에서 수행한다(마지막 Task 참조). 롤백 시 083의 원래 CHECK/`allowed_mime_types`를 복원하는 역마이그레이션을 새 번호로 추가한다.

---

## Task 2: 상수/검증 유틸 확장

**Files:**
- Modify: `jdi-portal/src/lib/work-timeline/constants.ts`
- Modify: `jdi-portal/src/lib/work-timeline/utils.ts`

**Interfaces:**
- Produces (constants): `WORK_TIMELINE_MAX_ATTACHMENTS = 10`, `WORK_TIMELINE_MAX_FILE_SIZE = 52428800`, `WORK_TIMELINE_BLOCKED_EXTENSIONS: ReadonlySet<string>`, 기존 `WORK_TIMELINE_IMAGE_MIME_TYPES` 유지.
- Produces (utils): `isWorkTimelineImage(mimeType: string): boolean`, `getBlockedExtension(fileName: string): string | null`, `validateWorkTimelineFile(file: File): void`. 기존 `validateWorkTimelineImage`는 유지(썸네일 생성 경로 방어용).
- Consumes: 없음.

- [ ] **Step 1: constants.ts 수정**

`constants.ts`에서 이미지 전용 상한 상수를 일반 파일용으로 교체(추가)한다. 기존:

```ts
export const WORK_TIMELINE_MAX_IMAGES = 5;
export const WORK_TIMELINE_MAX_IMAGE_SIZE = 10 * 1024 * 1024;
```

를 다음으로 교체:

```ts
export const WORK_TIMELINE_MAX_ATTACHMENTS = 10;
export const WORK_TIMELINE_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// 사내 공유에서 실행/스크립트류는 차단한다. (다운로드만 가능하지만 확산 방지)
export const WORK_TIMELINE_BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "pif", "cpl", "jar",
  "js", "jse", "mjs", "cjs", "vbs", "vbe", "ws", "wsf", "wsh",
  "ps1", "psm1", "ps1xml", "sh", "bash", "zsh",
  "app", "deb", "rpm", "dll", "sys", "drv", "hta", "reg", "lnk",
  "gadget", "apk", "ipa", "vb", "vbscript",
]);
```

`WORK_TIMELINE_IMAGE_MIME_TYPES`는 그대로 둔다(썸네일/미리보기 판별에 계속 사용).

- [ ] **Step 2: utils.ts 수정 — import 및 신규 함수**

`utils.ts` 상단 import를 교체:

```ts
import { addDays } from "@/lib/utils/date";
import {
  WORK_TIMELINE_BLOCKED_EXTENSIONS,
  WORK_TIMELINE_IMAGE_MIME_TYPES,
  WORK_TIMELINE_MAX_DESCRIPTION_LENGTH,
  WORK_TIMELINE_MAX_FILE_SIZE,
  WORK_TIMELINE_MAX_TITLE_LENGTH,
} from "./constants";
```

기존 `validateWorkTimelineImage`(이미지 MIME/10MB 검사)는 이 리팩터링 이후 사용처가 사라지므로(Task 3/6/7에서 `validateWorkTimelineFile`로 교체) **삭제**한다. 그 자리에 신규 함수 추가. `isWorkTimelineImage`는 기존 `ALLOWED_IMAGE_TYPES` Set을 재사용한다:

```ts
export function isWorkTimelineImage(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimeType);
}

/** 차단 확장자면 그 확장자를, 아니면 null. 확장자 없으면 빈 문자열("")을 반환해 거부 유도. */
export function getBlockedExtension(fileName: string): string | null {
  const parts = fileName.split(".");
  if (parts.length < 2) return ""; // 확장자 없음 → 거부
  const ext = parts.pop()!.toLowerCase();
  if (!ext) return "";
  return WORK_TIMELINE_BLOCKED_EXTENSIONS.has(ext) ? ext : null;
}

export function validateWorkTimelineFile(file: File): void {
  if (file.size <= 0) throw new Error("내용이 없는 파일은 첨부할 수 없습니다.");
  if (file.size > WORK_TIMELINE_MAX_FILE_SIZE) {
    throw new Error("파일은 개당 50MB 이하만 첨부할 수 있습니다.");
  }
  const blocked = getBlockedExtension(file.name);
  if (blocked === "") throw new Error("확장자가 없는 파일은 첨부할 수 없습니다.");
  if (blocked) throw new Error(`보안상 '.${blocked}' 형식의 파일은 첨부할 수 없습니다.`);
}
```

> `getFileExtension`은 그대로 둔다. 이미지가 아니면 파일명 확장자 fallback이라 xlsx/hwp 등에서 정상 동작한다. `WORK_TIMELINE_MAX_IMAGE_SIZE` 참조가 있던 `validateWorkTimelineImage`는 삭제되므로 dangling 참조가 남지 않는다.

- [ ] **Step 3: lint 통과 확인**

Run: `cd jdi-portal && npm run lint`
Expected: 통과(경고/에러 없음). 아직 상수 이름을 참조하던 다른 파일들은 다음 Task에서 고치므로, 이 단계에서 `WORK_TIMELINE_MAX_IMAGES` 미해결 참조가 남아 있으면 lint/타입 에러가 날 수 있다 → Task 3~8까지 완료 후 최종 빌드로 확인한다. 이 단계에서는 constants.ts/utils.ts 자체에 새 문법 오류가 없는지만 확인.

- [ ] **Step 4: 커밋**

```bash
git add jdi-portal/src/lib/work-timeline/constants.ts jdi-portal/src/lib/work-timeline/utils.ts
git commit -m "기능: 업무 타임라인 파일 검증 유틸(블록리스트/50MB/이미지 판별)"
```

---

## Task 3: 타입 + 클라이언트 업로드 일반화

**Files:**
- Modify: `jdi-portal/src/lib/work-timeline/types.ts`
- Modify: `jdi-portal/src/lib/work-timeline/clientUploads.ts`

**Interfaces:**
- Produces: 타입 `WorkTimelineFileUpload { file: File; thumbnail?: File | null }`. 함수 `uploadWorkTimelineFilesDirect({ entryId, userId, files, positions }): Promise<WorkTimelineAttachment[]>`.
- Consumes: Task 2의 `validateWorkTimelineFile`, `WorkTimelineAttachment`, `WorkTimelineAttachmentInput`.

- [ ] **Step 1: types.ts — 업로드 타입 이름 변경**

`types.ts`에서:

```ts
export interface WorkTimelineImageUpload {
  file: File;
  thumbnail?: File | null;
}
```

를:

```ts
export interface WorkTimelineFileUpload {
  file: File;
  thumbnail?: File | null;
}
```

- [ ] **Step 2: clientUploads.ts — 함수/검증 일반화**

`clientUploads.ts` 전체를 다음으로 교체:

```ts
"use client";

import { createClient } from "@/lib/supabase/client";
import {
  cleanupWorkTimelineStoragePaths,
  finalizeWorkTimelineAttachments,
} from "./actions";
import { WORK_TIMELINE_BUCKET } from "./constants";
import type {
  WorkTimelineAttachment,
  WorkTimelineAttachmentInput,
  WorkTimelineFileUpload,
} from "./types";
import { getFileExtension, validateWorkTimelineFile } from "./utils";

interface DirectUploadOptions {
  entryId: string;
  userId: string;
  files: WorkTimelineFileUpload[];
  positions: number[];
}

const FALLBACK_MIME = "application/octet-stream";

async function cleanupUploadedPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await cleanupWorkTimelineStoragePaths(paths);
  } catch (error) {
    console.error("업무 타임라인 업로드 롤백을 정리 대기열에 기록하지 못했습니다.", { paths, error });
  }
}

export async function uploadWorkTimelineFilesDirect({
  entryId,
  userId,
  files,
  positions,
}: DirectUploadOptions): Promise<WorkTimelineAttachment[]> {
  if (files.length !== positions.length) throw new Error("첨부 파일 순서가 올바르지 않습니다.");
  const supabase = createClient();
  const uploadedPaths: string[] = [];
  const metadata: WorkTimelineAttachmentInput[] = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const { file, thumbnail = null } = files[index];
      const position = positions[index];
      validateWorkTimelineFile(file);

      const uniqueId = crypto.randomUUID();
      const basePath = `${userId}/${entryId}/${uniqueId}`;
      const filePath = `${basePath}.${getFileExtension(file)}`;
      const thumbnailPath = thumbnail
        ? `${basePath}_thumb.${getFileExtension(thumbnail)}`
        : null;
      const contentType = file.type || FALLBACK_MIME;

      const { error: fileError } = await supabase.storage
        .from(WORK_TIMELINE_BUCKET)
        .upload(filePath, file, { contentType, upsert: false });
      if (fileError) throw fileError;
      uploadedPaths.push(filePath);

      if (thumbnail && thumbnailPath) {
        const { error: thumbnailError } = await supabase.storage
          .from(WORK_TIMELINE_BUCKET)
          .upload(thumbnailPath, thumbnail, { contentType: thumbnail.type || FALLBACK_MIME, upsert: false });
        if (thumbnailError) throw thumbnailError;
        uploadedPaths.push(thumbnailPath);
      }

      metadata.push({
        fileName: file.name,
        filePath,
        thumbnailPath,
        mimeType: contentType,
        fileSize: file.size,
        position,
      });
    }

    return await finalizeWorkTimelineAttachments(entryId, metadata);
  } catch (error) {
    await cleanupUploadedPaths(uploadedPaths);
    throw error;
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add jdi-portal/src/lib/work-timeline/types.ts jdi-portal/src/lib/work-timeline/clientUploads.ts
git commit -m "기능: 업무 타임라인 일반 파일 직접 업로드(이미지만 썸네일)"
```

---

## Task 4: 서버 액션 finalize 검증 완화

**Files:**
- Modify: `jdi-portal/src/lib/work-timeline/actions.ts`

**Interfaces:**
- Consumes: Task 2의 `WORK_TIMELINE_MAX_ATTACHMENTS`, `WORK_TIMELINE_MAX_FILE_SIZE`, `getBlockedExtension`.
- Produces: `finalizeWorkTimelineAttachments`가 일반 파일(비이미지 포함)을 허용, 항목당 최대 10개, position 0..9.

- [ ] **Step 1: import 교체**

`actions.ts` 상단 constants import를:

```ts
import {
  WORK_TIMELINE_BUCKET,
  WORK_TIMELINE_MAX_ATTACHMENTS,
  WORK_TIMELINE_MAX_FILE_SIZE,
  WORK_TIMELINE_SIGNED_URL_TTL_SECONDS,
} from "./constants";
```

utils import에 `getBlockedExtension` 추가:

```ts
import {
  assertUuid,
  getBlockedExtension,
  isUniqueViolation,
  validateWorkTimelineInput,
} from "./utils";
```

(`WORK_TIMELINE_IMAGE_MIME_TYPES`, `WORK_TIMELINE_MAX_IMAGES`, `WORK_TIMELINE_MAX_IMAGE_SIZE` import는 제거)

- [ ] **Step 2: validateAttachmentInput 교체**

기존 `validateAttachmentInput` 함수를 다음으로 교체(이미지 MIME 화이트리스트 → 확장자 블록리스트 + 50MB + 개수/경로):

```ts
function validateAttachmentInput(
  input: WorkTimelineAttachmentInput,
  userId: string,
  entryId: string,
): void {
  if (!input.fileName.trim() || input.fileName.length > 255) throw new Error("첨부 파일 이름이 올바르지 않습니다.");
  const blocked = getBlockedExtension(input.fileName);
  if (blocked === "") throw new Error("확장자가 없는 파일은 첨부할 수 없습니다.");
  if (blocked) throw new Error(`보안상 '.${blocked}' 형식의 파일은 첨부할 수 없습니다.`);
  if (!input.mimeType.trim()) throw new Error("첨부 파일 형식이 올바르지 않습니다.");
  if (!Number.isInteger(input.fileSize) || input.fileSize < 1 || input.fileSize > WORK_TIMELINE_MAX_FILE_SIZE) {
    throw new Error("첨부 파일 크기가 올바르지 않습니다.");
  }
  if (!Number.isInteger(input.position) || input.position < 0 || input.position >= WORK_TIMELINE_MAX_ATTACHMENTS) {
    throw new Error("첨부 파일 순서가 올바르지 않습니다.");
  }
  const expectedPrefix = `${userId}/${entryId}/`;
  if (!input.filePath.startsWith(expectedPrefix) || getStoragePathOwner(input.filePath) !== userId) {
    throw new Error("첨부 파일 경로가 올바르지 않습니다.");
  }
  if (input.thumbnailPath && (
    !input.thumbnailPath.startsWith(expectedPrefix)
    || getStoragePathOwner(input.thumbnailPath) !== userId
  )) {
    throw new Error("첨부 파일 썸네일 경로가 올바르지 않습니다.");
  }
}
```

- [ ] **Step 3: finalizeWorkTimelineAttachments 개수 상한/문구 교체**

`finalizeWorkTimelineAttachments` 내부의 `WORK_TIMELINE_MAX_IMAGES` 3곳을 `WORK_TIMELINE_MAX_ATTACHMENTS`로, 문구 "이미지"를 "파일"로 교체:

```ts
  if (inputs.length > WORK_TIMELINE_MAX_ATTACHMENTS) {
    throw new Error(`파일은 최대 ${WORK_TIMELINE_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
  }
```

```ts
  if (entry.user_id !== userId) throw new Error("본인의 업무 타임라인에만 파일을 추가할 수 있습니다.");
```

```ts
  if ((existing?.length ?? 0) + inputs.length > WORK_TIMELINE_MAX_ATTACHMENTS) {
    throw new Error(`파일은 최대 ${WORK_TIMELINE_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
  }
```

`occupied.has(input.position)` 중복 메시지도 "이미 사용 중인 첨부 순서입니다."로 교체.

- [ ] **Step 4: lint 확인**

Run: `cd jdi-portal && npm run lint`
Expected: actions.ts 관련 미사용 import/미해결 참조 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add jdi-portal/src/lib/work-timeline/actions.ts
git commit -m "기능: 업무 타임라인 첨부 finalize 일반 파일 검증(블록리스트/50MB/10개)"
```

---

## Task 5: 파일 종류 매핑 + 파일 카드 컴포넌트

**Files:**
- Create: `jdi-portal/src/lib/work-timeline/fileKind.ts`
- Create: `jdi-portal/src/components/dashboard/work-timeline/AttachmentFileCard.tsx`

**Interfaces:**
- Produces (fileKind): `getAttachmentKind(fileName: string, mimeType?: string): AttachmentKindInfo`, `formatFileSize(bytes: number): string`.
  `AttachmentKindInfo = { label: string; colorClass: string; ext: string }`.
- Produces (AttachmentFileCard): 기본 export 컴포넌트 `AttachmentFileCard`.
- Consumes: Task 2 `isWorkTimelineImage`(카드 사용측에서 필터), phosphor-react `FileArrowDown`, `X`.

- [ ] **Step 1: fileKind.ts 작성**

`jdi-portal/src/lib/work-timeline/fileKind.ts`:

```ts
export interface AttachmentKindInfo {
  label: string;
  colorClass: string; // Tailwind text color for the badge
  ext: string;
}

const KIND_BY_EXT: Record<string, { label: string; colorClass: string }> = {
  xls: { label: "Excel", colorClass: "text-emerald-600" },
  xlsx: { label: "Excel", colorClass: "text-emerald-600" },
  csv: { label: "CSV", colorClass: "text-emerald-600" },
  doc: { label: "Word", colorClass: "text-blue-600" },
  docx: { label: "Word", colorClass: "text-blue-600" },
  ppt: { label: "PPT", colorClass: "text-orange-600" },
  pptx: { label: "PPT", colorClass: "text-orange-600" },
  pdf: { label: "PDF", colorClass: "text-red-600" },
  hwp: { label: "한글", colorClass: "text-sky-600" },
  hwpx: { label: "한글", colorClass: "text-sky-600" },
  zip: { label: "압축", colorClass: "text-amber-600" },
  "7z": { label: "압축", colorClass: "text-amber-600" },
  rar: { label: "압축", colorClass: "text-amber-600" },
  txt: { label: "텍스트", colorClass: "text-slate-500" },
};

export function getAttachmentKind(fileName: string): AttachmentKindInfo {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const known = KIND_BY_EXT[ext];
  return {
    label: known?.label ?? (ext ? ext.toUpperCase() : "파일"),
    colorClass: known?.colorClass ?? "text-slate-500",
    ext,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 2: AttachmentFileCard.tsx 작성**

`jdi-portal/src/components/dashboard/work-timeline/AttachmentFileCard.tsx`:

```tsx
"use client";

import { FileArrowDown, X } from "phosphor-react";
import { getAttachmentKind, formatFileSize } from "@/lib/work-timeline/fileKind";

interface AttachmentFileCardProps {
  fileName: string;
  fileSize: number;
  downloadUrl: string | null;
  onDelete?: () => void;
  deleting?: boolean;
}

export default function AttachmentFileCard({
  fileName,
  fileSize,
  downloadUrl,
  onDelete,
  deleting = false,
}: AttachmentFileCardProps) {
  const kind = getAttachmentKind(fileName);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-white ${kind.colorClass}`}>
        <FileArrowDown size={20} weight="fill" aria-hidden="true" />
        <span className="mt-0.5 text-[9px] font-bold leading-none">{kind.label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-700" title={fileName}>{fileName}</p>
        <p className="text-xs text-slate-400">{formatFileSize(fileSize)}</p>
      </div>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`${fileName} 삭제`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-50"
        >
          <X size={16} weight="bold" aria-hidden="true" />
        </button>
      ) : downloadUrl ? (
        <a
          href={downloadUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${fileName} 다운로드`}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          <FileArrowDown size={15} weight="bold" aria-hidden="true" />
          다운로드
        </a>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: lint 확인**

Run: `cd jdi-portal && npm run lint`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add jdi-portal/src/lib/work-timeline/fileKind.ts jdi-portal/src/components/dashboard/work-timeline/AttachmentFileCard.tsx
git commit -m "기능: 업무 타임라인 파일 카드 UI + 확장자 종류 매핑"
```

---

## Task 6: 생성 모달 — 일반 파일 선택/미리보기

**Files:**
- Modify: `jdi-portal/src/components/dashboard/work-timeline/WorkTimelineCreateModal.tsx`

**Interfaces:**
- Consumes: `uploadWorkTimelineFilesDirect`(Task 3), `validateWorkTimelineFile`/`isWorkTimelineImage`(Task 2), `WORK_TIMELINE_MAX_ATTACHMENTS`(Task 2), `AttachmentFileCard`/`getAttachmentKind`/`formatFileSize`(Task 5).

- [ ] **Step 1: import/상수 교체**

상단 import 교체:
- `import { uploadWorkTimelineImagesDirect } ...` → `import { uploadWorkTimelineFilesDirect } from "@/lib/work-timeline/clientUploads";`
- constants import: `WORK_TIMELINE_MAX_IMAGES` → `WORK_TIMELINE_MAX_ATTACHMENTS`, `WORK_TIMELINE_IMAGE_MIME_TYPES` 제거
- `import { validateWorkTimelineImage } ...` → `import { isWorkTimelineImage, validateWorkTimelineFile } from "@/lib/work-timeline/utils";`
- 추가: `import AttachmentFileCard from "./AttachmentFileCard";` 및 `import { FileArrowUp } from "phosphor-react";`(상단 phosphor import에 병합)

- [ ] **Step 2: 선택 항목 타입/미리보기 로직 일반화**

`SelectedImage` 인터페이스를 교체:

```ts
interface SelectedAttachment {
  id: string;
  file: File;
  isImage: boolean;
  previewUrl: string | null; // 이미지에만 존재
}
```

상태 이름은 `images`를 유지해도 되지만 의미를 위해 유지(대량 변경 방지). 단 타입만 `SelectedAttachment[]`로 바꾼다:

```ts
const [images, setImages] = useState<SelectedAttachment[]>([]);
```

`applyDraft` 내부의 이미지 복원 루프를 일반 파일 복원으로 교체:

```ts
    for (const storedImage of storedImages.slice(0, WORK_TIMELINE_MAX_ATTACHMENTS)) {
      const file = new File([storedImage.blob], storedImage.name, {
        type: storedImage.type,
        lastModified: storedImage.lastModified,
      });
      try {
        validateWorkTimelineFile(file);
      } catch {
        continue;
      }
      const isImage = isWorkTimelineImage(file.type);
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      restoredImages.push({ id: storedImage.id || crypto.randomUUID(), file, isImage, previewUrl });
    }
```

`applyDraft`에서 기존 이미지 revoke 시 `image.previewUrl`이 null일 수 있으므로 가드:

```ts
      for (const image of current) {
        if (image.previewUrl) {
          URL.revokeObjectURL(image.previewUrl);
          previewUrlsRef.current.delete(image.previewUrl);
        }
      }
```

- [ ] **Step 3: addFiles/removeImage 일반화**

`addFiles` 내부의 상한/검증/프리뷰를 교체:

```ts
    for (const file of files) {
      if (images.length + accepted.length >= WORK_TIMELINE_MAX_ATTACHMENTS) {
        toast.error(`파일은 최대 ${WORK_TIMELINE_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
        break;
      }
      if (existingKeys.has(getFileKey(file))) {
        toast.error(`${file.name} 파일은 이미 첨부되어 있습니다.`);
        continue;
      }
      try {
        validateWorkTimelineFile(file);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `${file.name} 파일을 확인해주세요.`);
        continue;
      }
      const isImage = isWorkTimelineImage(file.type);
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      existingKeys.add(getFileKey(file));
      accepted.push({ id: crypto.randomUUID(), file, isImage, previewUrl });
    }
```

`accepted` 배열 타입도 `SelectedAttachment[]`로. `removeImage`의 revoke도 null 가드:

```ts
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
```

`discardDraft`의 revoke 루프도 동일하게 null 가드.

- [ ] **Step 4: handleSubmit — 이미지만 썸네일 처리**

`handleSubmit`의 `processedImages` 생성 및 업로드 호출을 교체:

```ts
      const processedFiles = await Promise.all(
        images.map(async ({ file, isImage }) => {
          if (!isImage) return { file, thumbnail: null };
          const resized = await resizeImageIfNeeded(file, { maxDim: 2560, quality: 0.92 });
          const thumbnail = await createImageThumbnail(resized);
          return { file: resized, thumbnail };
        }),
      );
      const result = await createWorkTimelineEntry({ /* 기존 그대로 */
        title: title.trim(),
        description: description.trim() || null,
        completedAt: new Date(`${completedAt}:00+09:00`).toISOString(),
        taskId,
      });
      if (!result.duplicate) {
        createdEntryId = result.entry.id;
        await uploadWorkTimelineFilesDirect({
          entryId: result.entry.id,
          userId: currentUserId,
          files: processedFiles,
          positions: processedFiles.map((_, index) => index),
        });
      }
```

- [ ] **Step 5: 첨부 영역 UI 교체(라벨/accept/미리보기)**

첨부 섹션의 라벨을 "이미지"→"파일", 카운터를 `WORK_TIMELINE_MAX_ATTACHMENTS`로:

```tsx
              <label className="text-sm font-bold text-slate-700">
                파일 첨부 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                {images.length}/{WORK_TIMELINE_MAX_ATTACHMENTS}
              </span>
```

드롭존 안내 문구/아이콘/`accept` 교체:

```tsx
              <FileArrowUp size={25} className="text-indigo-500" aria-hidden="true" />
              <p className="mt-2 text-xs font-bold text-slate-600">클릭, 드래그 또는 붙여넣기로 추가</p>
              <p className="mt-1 text-[11px] text-slate-400">엑셀·PDF·한글·이미지 등 · 파일당 최대 50MB</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                className="sr-only"
                tabIndex={-1}
              />
```

(`accept` 속성 제거 → 모든 파일 선택 가능, 실제 차단은 `validateWorkTimelineFile`가 담당)

미리보기 목록을 이미지 그리드 + 파일 카드 혼합으로 교체:

```tsx
            {images.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label="선택한 첨부">
                {images.map((item) => (
                  <li key={item.id}>
                    {item.isImage && item.previewUrl ? (
                      <div className="group relative flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <div
                          role="img"
                          aria-label={item.file.name}
                          className="h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
                          style={{ backgroundImage: `url(${JSON.stringify(item.previewUrl)})` }}
                        />
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700" title={item.file.name}>
                          {item.file.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeImage(item.id)}
                          disabled={submitting}
                          aria-label={`${item.file.name} 제거`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-40"
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <AttachmentFileCard
                        fileName={item.file.name}
                        fileSize={item.file.size}
                        downloadUrl={null}
                        onDelete={() => removeImage(item.id)}
                        deleting={submitting}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
```

- [ ] **Step 6: lint 확인**

Run: `cd jdi-portal && npm run lint`
Expected: 통과. `ImageSquare` 미사용이면 import에서 제거.

- [ ] **Step 7: 커밋**

```bash
git add jdi-portal/src/components/dashboard/work-timeline/WorkTimelineCreateModal.tsx
git commit -m "기능: 업무 타임라인 생성 모달 일반 파일 첨부/미리보기"
```

---

## Task 7: 상세 화면 — 이미지/파일 분리 렌더 + 파일 추가

**Files:**
- Modify: `jdi-portal/src/components/dashboard/work-timeline/WorkTimelineDetailClient.tsx`

**Interfaces:**
- Consumes: `uploadWorkTimelineFilesDirect`(Task 3), `isWorkTimelineImage`/`validateWorkTimelineFile`(Task 2), `WORK_TIMELINE_MAX_ATTACHMENTS`(Task 2), `AttachmentFileCard`(Task 5).

- [ ] **Step 1: import/상수 교체**

- `uploadWorkTimelineImagesDirect` → `uploadWorkTimelineFilesDirect`
- constants: `WORK_TIMELINE_MAX_IMAGES` → `WORK_TIMELINE_MAX_ATTACHMENTS`, `WORK_TIMELINE_IMAGE_MIME_TYPES` 제거
- `validateWorkTimelineImage` → `isWorkTimelineImage, validateWorkTimelineFile`
- 추가: `import AttachmentFileCard from "./AttachmentFileCard";`, phosphor에 `FileArrowUp` 추가

- [ ] **Step 2: 이미지/파일 목록 분리**

`viewableAttachments` 정의를 이미지 전용으로 좁히고, 파일 목록을 추가:

```ts
  const imageAttachments = entry.attachments.filter(
    (attachment) => isWorkTimelineImage(attachment.mime_type)
      && (attachment.original_url || attachment.thumbnail_url),
  );
  const fileAttachments = entry.attachments.filter(
    (attachment) => !isWorkTimelineImage(attachment.mime_type),
  );
  const viewableAttachments = imageAttachments; // 라이트박스는 이미지에만
```

이후 라이트박스/그리드에서 쓰는 `viewableAttachments` 참조는 그대로 두면 이미지 그리드는 자동으로 이미지만 표시된다.

- [ ] **Step 3: handleAddImages → handleAddFiles 일반화**

`handleAddImages` 함수를 교체(이미지만 썸네일, 상한 `WORK_TIMELINE_MAX_ATTACHMENTS`):

```ts
  const handleAddFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const availableSlots = WORK_TIMELINE_MAX_ATTACHMENTS - entry.attachments.length;
    const selected = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      toast.error(`파일은 최대 ${WORK_TIMELINE_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
    }
    if (selected.length === 0) return;

    setUploadingImages(true);
    try {
      const processed = await Promise.all(selected.map(async (file) => {
        validateWorkTimelineFile(file);
        if (!isWorkTimelineImage(file.type)) return { file, thumbnail: null };
        const resized = await resizeImageIfNeeded(file, { maxDim: 2560, quality: 0.92 });
        const thumbnail = await createImageThumbnail(resized);
        return { file: resized, thumbnail };
      }));
      const occupied = new Set(entry.attachments.map((attachment) => attachment.position));
      const positions = Array.from({ length: WORK_TIMELINE_MAX_ATTACHMENTS }, (_, index) => index)
        .filter((position) => !occupied.has(position))
        .slice(0, processed.length);
      const attachments = await uploadWorkTimelineFilesDirect({
        entryId: entry.id,
        userId: currentUserId,
        files: processed,
        positions,
      });
      let signedUrls: Record<string, string>;
      try {
        signedUrls = await getWorkTimelineSignedUrls(
          attachments.flatMap((attachment) => [attachment.file_path, attachment.thumbnail_path ?? ""]),
        );
      } catch (error) {
        console.warn("추가된 첨부 파일의 서명 URL을 즉시 발급하지 못했습니다.", error);
        toast.success("첨부 파일을 추가했습니다. 화면을 새로 불러옵니다.");
        router.refresh();
        return;
      }
      const signedAttachments = attachments.map((attachment) => ({
        ...attachment,
        original_url: signedUrls[attachment.file_path] ?? null,
        thumbnail_url: attachment.thumbnail_path
          ? signedUrls[attachment.thumbnail_path] ?? null
          : signedUrls[attachment.file_path] ?? null,
      }));
      setEntry((current) => ({
        ...current,
        attachments: [...current.attachments, ...signedAttachments]
          .sort((a, b) => a.position - b.position),
      }));
      toast.success("첨부 파일을 추가했습니다.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 추가하지 못했습니다.");
    } finally {
      setUploadingImages(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };
```

- [ ] **Step 4: 편집 영역 "이미지 추가" → "파일 추가"**

편집 폼의 파일 input/버튼 교체:

```tsx
                <input
                  ref={imageInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => void handleAddFiles(event.target.files)}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImages || entry.attachments.length >= WORK_TIMELINE_MAX_ATTACHMENTS}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileArrowUp size={17} aria-hidden="true" />
                  {uploadingImages ? "파일 추가 중..." : "파일 추가"}
                </button>
                <span className="text-xs font-semibold text-slate-400">
                  {entry.attachments.length}/{WORK_TIMELINE_MAX_ATTACHMENTS}
                </span>
```

- [ ] **Step 5: 첨부 섹션 — 파일 카드 목록 추가**

첨부 섹션 `<section ...>`의 제목/조건을 전체 첨부 기준으로 바꾸고, 이미지 그리드 아래에 파일 카드 목록을 추가한다. `entry.attachments.length > 0` 조건은 유지. 제목:

```tsx
              <h2 id="timeline-images-title" className="text-sm font-bold text-slate-800">
                첨부 파일 {entry.attachments.length}
              </h2>
```

"전체 저장" 버튼 조건은 이미지 기준(`viewableAttachments.length >= 2`) 유지. 이미지 그리드(`<div className="grid gap-4 sm:grid-cols-2">...`)는 그대로 두되, 그 뒤에 파일 카드 목록을 추가:

```tsx
            {fileAttachments.length > 0 && (
              <ul className="mt-4 space-y-2" aria-label="첨부 문서">
                {fileAttachments.map((attachment) => (
                  <li key={attachment.id}>
                    <AttachmentFileCard
                      fileName={attachment.file_name}
                      fileSize={attachment.file_size}
                      downloadUrl={attachment.original_url}
                      onDelete={isOwner && editing ? () => handleDeleteAttachment(attachment.id) : undefined}
                      deleting={deletingAttachmentId === attachment.id}
                    />
                  </li>
                ))}
              </ul>
            )}
```

> 주의: 이미지 그리드 렌더는 `viewableAttachments`(=`imageAttachments`)를 순회하도록 이미 되어 있어야 한다. 기존 코드가 `viewableAttachments.map(...)`을 사용하므로 Step 2의 재정의만으로 이미지 전용이 된다.

- [ ] **Step 6: 삭제/확인 문구 정리**

`handleDeleteAttachment`, `handleDelete`, 삭제 확인 박스의 "이미지" 문구를 "파일"로 교체:
- "첨부 이미지를 삭제했습니다." → "첨부 파일을 삭제했습니다."
- "첨부 이미지를 삭제하지 못했습니다." → "첨부 파일을 삭제하지 못했습니다."
- "업무 기록과 첨부 이미지 삭제를 완료했습니다." → "업무 기록과 첨부 파일 삭제를 완료했습니다."
- "일부 저장소 이미지 정리가 필요합니다." → "일부 저장소 파일 정리가 필요합니다."
- 확인 박스 "기록과 첨부 이미지가 함께 삭제되며..." → "기록과 첨부 파일이 함께 삭제되며..."

- [ ] **Step 7: lint 확인**

Run: `cd jdi-portal && npm run lint`
Expected: 통과. 미사용 `ImageSquare` 등 import 정리.

- [ ] **Step 8: 커밋**

```bash
git add jdi-portal/src/components/dashboard/work-timeline/WorkTimelineDetailClient.tsx
git commit -m "기능: 업무 타임라인 상세 이미지/파일 분리 렌더 + 파일 추가"
```

---

## Task 8: 리스트 미리보기 + 쿼리 서명 최적화

**Files:**
- Modify: `jdi-portal/src/lib/work-timeline/queries.ts`
- Modify: `jdi-portal/src/components/dashboard/work-timeline/WorkTimelineSection.tsx`

**Interfaces:**
- Consumes: Task 2 `isWorkTimelineImage`.
- Produces: 리스트(thumbnailOnly)는 이미지 썸네일만 서명(비이미지 대용량 파일 서명 방지). 리스트 카드 미리보기는 이미지가 있으면 썸네일, 없고 파일만 있으면 파일 아이콘+개수.

- [ ] **Step 1: queries.ts — thumbnailOnly는 이미지만 서명**

`getWorkTimelineAttachments`의 import에 `isWorkTimelineImage` 추가:

```ts
import { assertUuid, escapePostgrestIlike, getKstDayRange, isWorkTimelineImage } from "./utils";
```

서명 대상 계산과 매핑을 교체:

```ts
  const rows = (data ?? []) as RawAttachment[];
  const signPaths = options.thumbnailOnly
    ? rows
        .filter((row) => isWorkTimelineImage(row.mime_type) && row.thumbnail_path)
        .map((row) => row.thumbnail_path as string)
    : rows.flatMap((row) => [row.file_path, row.thumbnail_path ?? ""]);
  const urls = await createSignedUrlMap(supabase, signPaths);
  return rows.map((row) => {
    const isImage = isWorkTimelineImage(row.mime_type);
    if (options.thumbnailOnly) {
      return {
        ...row,
        original_url: null,
        thumbnail_url: isImage && row.thumbnail_path ? urls[row.thumbnail_path] ?? null : null,
      };
    }
    return {
      ...row,
      original_url: urls[row.file_path] ?? null,
      thumbnail_url: row.thumbnail_path
        ? urls[row.thumbnail_path] ?? urls[row.file_path] ?? null
        : urls[row.file_path] ?? null,
    };
  });
```

> 상세(`getWorkTimelineEntryById`)는 `thumbnailOnly` 없이 호출하므로 모든 첨부(이미지+파일)에 대해 `original_url`이 발급되어 파일 카드 다운로드가 동작한다.

- [ ] **Step 2: Section.tsx — AttachmentPreview 이미지/파일 분기**

`WorkTimelineSection.tsx` 상단 import에 추가:

```ts
import { FileArrowDown } from "phosphor-react";
import { isWorkTimelineImage } from "@/lib/work-timeline/utils";
```

(phosphor import 라인에 `FileArrowDown` 병합)

`AttachmentPreview` 컴포넌트를 교체:

```tsx
function AttachmentPreview({ entry }: { entry: WorkTimelineEntryWithProfile }) {
  const images = entry.attachments
    .filter((attachment) => isWorkTimelineImage(attachment.mime_type)
      && (attachment.thumbnail_url || attachment.original_url))
    .slice(0, 5);
  const fileCount = entry.attachments.filter(
    (attachment) => !isWorkTimelineImage(attachment.mime_type),
  ).length;

  if (images.length > 0) {
    const image = images[0];
    const url = image.thumbnail_url ?? image.original_url;
    return (
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-slate-100 sm:w-24">
        <div
          role="img"
          aria-label={`${entry.title} 첨부 이미지 미리보기`}
          className="h-full w-full bg-slate-200 bg-cover bg-center"
          style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}
        />
        {(images.length + fileCount) > 1 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">
            +{images.length + fileCount - 1}
          </span>
        )}
      </div>
    );
  }

  if (fileCount > 0) {
    return (
      <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-slate-100 text-slate-500 sm:w-24">
        <FileArrowDown size={24} weight="fill" aria-hidden="true" />
        <span className="text-[11px] font-bold">파일 {fileCount}</span>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 3: lint 확인**

Run: `cd jdi-portal && npm run lint`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add jdi-portal/src/lib/work-timeline/queries.ts jdi-portal/src/components/dashboard/work-timeline/WorkTimelineSection.tsx
git commit -m "기능: 업무 타임라인 리스트 파일 미리보기 + 서명 최적화"
```

---

## Task 9: 회귀 가드 테스트 + 전체 검증

**Files:**
- Create: `jdi-portal/scripts/work-timeline-attachments.test.mjs`

**Interfaces:**
- Consumes: 앞선 모든 Task의 산출물(소스 텍스트 스캔).

- [ ] **Step 1: 소스 스캔형 가드 테스트 작성**

`jdi-portal/scripts/work-timeline-attachments.test.mjs` (기존 `performance-architecture.test.mjs`와 동일한 node:test + 파일 읽기 방식):

```js
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
```

- [ ] **Step 2: 가드 테스트 실행**

Run: `cd jdi-portal && node --test scripts/work-timeline-attachments.test.mjs`
Expected: 5개 테스트 PASS.

- [ ] **Step 3: lint + 성능 회귀 + 검색 프라이버시 전체 검증**

Run: `cd jdi-portal && npm run lint && npm run test:performance && npm run test:search-privacy`
Expected: 모두 통과. (성능 40개 검사 통과 = 속도 불변조건 유지)

- [ ] **Step 4: 프로덕션 빌드로 타입/컴파일 확인**

Run: `cd jdi-portal && npm run build`
Expected: 빌드 성공(타입 에러 0). 미해결 `WORK_TIMELINE_MAX_IMAGES`/`uploadWorkTimelineImagesDirect` 참조가 남아 있으면 여기서 실패 → 해당 파일 수정.

- [ ] **Step 5: 커밋**

```bash
git add jdi-portal/scripts/work-timeline-attachments.test.mjs
git commit -m "테스트: 업무 타임라인 파일 첨부 회귀 가드"
```

---

## Task 10: 마이그레이션 적용 + 브라우저 수동 검증 (사용자 승인 필요)

**Files:** 없음(운영 반영 단계).

- [ ] **Step 1: 사용자에게 마이그레이션 적용 승인 요청**

운영 DB 변경이므로 실행 전 사용자에게 확인:
> "코드 구현이 끝났습니다. 이제 DB에 첨부 형식/용량 제한 완화(마이그레이션 098)를 적용해야 실제로 파일 업로드가 됩니다. 적용해도 될까요?"

승인 시에만 다음 단계 진행.

- [ ] **Step 2: 마이그레이션 적용**

Run: `cd jdi-portal && npx supabase db push --linked`
Expected: 098 적용 성공. (참고: 원격 마이그레이션 기록 드리프트가 있으면 로그 확인 후 진행)

- [ ] **Step 3: 브라우저 수동 검증 (dev 서버)**

Run: `cd jdi-portal && npm run dev` (백그라운드) 후 `localhost:3000/dashboard/work-timeline`에서 확인:
- 업무 추가 → 엑셀(.xlsx) 첨부 → 파일 카드로 표시, 등록 성공
- PDF·한글(.hwp)·이미지 혼합 첨부 → 이미지는 썸네일, 나머지는 파일 카드
- 상세 화면에서 파일 카드 "다운로드" 클릭 → 정상 다운로드
- `.exe` 첨부 시도 → "보안상 '.exe' 형식의 파일은 첨부할 수 없습니다." 토스트
- 50MB 초과 파일 → 거부 토스트
- 11개째 첨부 → 상한 토스트
- 리스트(타임라인)에서 파일만 있는 항목 → "파일 N" 아이콘 표시
- 첨부 삭제(편집 모드) → 삭제 후 목록 갱신, 스토리지 정리 동작

- [ ] **Step 4: 최종 정리**

문제 없으면 완료 보고. 문제가 있으면 systematic-debugging으로 원인 추적 후 수정.

---

## Self-Review

**Spec coverage:**
- 위험 파일만 차단(블록리스트) → Task 2(상수/유틸), Task 4(서버), Task 6(모달) ✅
- 한글(hwp/hwpx) 포함 → 블록리스트 미포함이므로 자동 허용, fileKind 라벨 매핑 ✅
- 개당 50MB / 항목당 10개 → Task 1(DB), Task 2(상수), Task 4(서버), Task 6/7(UI) ✅
- 이미지 썸네일 유지 + 문서 파일 카드 → Task 5/6/7 ✅
- 드래그&드롭 → 생성 모달 기존 드롭존 유지(Task 6), accept 제거로 모든 파일 허용 ✅
- 비공개/서명 URL/RLS 유지 → 스토리지 정책 변경 없음, 상세는 original_url 발급(Task 8) ✅
- 성능 불변조건 → Task 9에서 test:performance 검증, thumbnailOnly 서명 최적화(Task 8) ✅
- 마이그레이션 098, 운영 적용 전 확인 → Task 1(작성)/Task 10(승인 후 적용) ✅

**Placeholder scan:** "TBD/TODO/적절히" 등 없음. 각 코드 스텝에 실제 코드 포함. ✅

**Type consistency:**
- `WorkTimelineFileUpload`(Task 3) — clientUploads/모달/상세에서 동일 사용 ✅
- `uploadWorkTimelineFilesDirect({files, positions})`(Task 3) — Task 6/7 동일 시그니처 ✅
- `WORK_TIMELINE_MAX_ATTACHMENTS`/`WORK_TIMELINE_MAX_FILE_SIZE`(Task 2) — Task 4/6/7 동일 참조 ✅
- `isWorkTimelineImage(mimeType)`/`validateWorkTimelineFile(file)`/`getBlockedExtension(fileName)`(Task 2) — 이후 동일 시그니처 ✅
- `getAttachmentKind`/`formatFileSize`(Task 5) — AttachmentFileCard에서 사용 ✅
- `AttachmentFileCard` props(fileName, fileSize, downloadUrl, onDelete?, deleting?) — Task 6/7 동일 ✅
