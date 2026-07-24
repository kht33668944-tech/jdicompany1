// 보관함 도메인 타입

export interface Corporation {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

/** 서류 + 현재 버전 요약(목록 표시용) */
export interface VaultDocument {
  id: string;
  corporation_id: string;
  title: string;
  category: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // 현재 버전 요약
  current_version_id: string | null;
  current_version_no: number | null;
  current_storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  updated_by_name: string | null;
  version_count: number;
}

export interface VaultDocumentVersion {
  id: string;
  document_id: string;
  storage_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  version_no: number;
  is_current: boolean;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

export interface DocumentMetaInput {
  corporationId: string;
  title: string;
  category: string | null;
  note: string | null;
}

/** 스토리지 업로드 후 서버 액션에 넘기는 파일 메타 */
export interface UploadedFileMeta {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/** 잠금 해제 후 클라이언트로 내려가는 계정(비번은 평문으로 복호화됨) */
export interface VaultAccount {
  id: string;
  service_name: string;
  username: string | null;
  url: string | null;
  note: string | null;
  tags: string[];
  password: string; // 복호화된 평문(잠금 해제 상태에서만 전달)
  secondary: string; // 복호화된 평문("" 가능)
  updated_at: string;
  history_count: number;
}

export interface AccountInput {
  service_name: string;
  username: string;
  url: string;
  note: string;
  tags: string[];
  password: string;
  secondary: string;
}

export interface AccountSecretHistoryItem {
  id: string;
  field: "password" | "secondary";
  value: string; // 복호화된 옛 비밀번호
  changed_by_name: string | null;
  changed_at: string;
}
