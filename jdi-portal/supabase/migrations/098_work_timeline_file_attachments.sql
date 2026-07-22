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
