/**
 * 파일 다운로드(기기 저장) 유틸.
 *
 * Supabase Storage의 서명 URL(signed URL)이나 공개 URL은 브라우저에서 그냥 열면
 * 이미지가 새 탭에 "표시"만 되고 저장되지 않는다. 또한 교차 출처(cross-origin)
 * URL 에는 `<a download>` 속성이 무시된다.
 *
 * Supabase는 URL 에 `download` 쿼리 파라미터가 있으면 응답에
 * `Content-Disposition: attachment` 를 붙여 "저장"으로 동작시킨다. 이 파라미터는
 * 서명(token) 대상이 아니므로 이미 발급된 서명 URL 에 그대로 덧붙여도 안전하다.
 */

/**
 * 서명/공개 URL 을 "다운로드용" URL 로 바꾼다.
 * @param url      Supabase Storage 서명 URL 또는 공개 URL
 * @param fileName 저장될 파일명 (원본 파일명 유지용). 생략하면 서버 기본값 사용.
 */
export function toDownloadUrl(url: string, fileName?: string): string {
  try {
    const parsed = new URL(url);
    // fileName 이 있으면 그 이름으로 저장, 없으면 빈 값으로 attachment 만 강제.
    parsed.searchParams.set("download", fileName ?? "");
    return parsed.toString();
  } catch {
    // URL 파싱 실패 시 원본 그대로 반환 (그래도 열기는 됨).
    return url;
  }
}

/**
 * 브라우저에서 파일 저장(다운로드)을 트리거한다. 클라이언트 컴포넌트에서만 호출.
 * @param url      Supabase Storage 서명 URL 또는 공개 URL
 * @param fileName 저장될 파일명 (원본 파일명 유지용).
 */
export function triggerDownload(url: string, fileName?: string): void {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = toDownloadUrl(url, fileName);
  if (fileName) link.download = fileName;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 여러 파일을 순차로 저장(다운로드)한다. 각 파일은 개별 파일로 저장된다.
 * 브라우저가 연속 다운로드를 막지 않도록 파일 사이에 짧은 간격을 둔다.
 * @param files    { url, fileName? } 목록
 * @param gapMs    파일 사이 간격(ms). 기본 350ms.
 */
export async function triggerDownloadAll(
  files: { url: string; fileName?: string }[],
  gapMs = 350,
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    triggerDownload(files[i].url, files[i].fileName);
    if (i < files.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
  }
}
