import { cookies } from "next/headers";
import { verifyUnlockToken } from "./crypto";
import { VAULT_UNLOCK_COOKIE } from "./constants";

/**
 * 2차 비밀번호 잠금 해제 상태 확인. 미해제면 throw.
 *
 * 여기서 보는 서명 쿠키는 **빠른 1차 확인**이다. 실제 방어선은 DB 의
 * `vault_unlock_sessions` 와 이를 참조하는 Storage RLS 정책(마이그 111)이므로,
 * 쿠키를 우회해도 민감 파일에는 접근할 수 없다.
 *
 * 보관함(vault)과 인플루언서 민감 서류가 이 함수를 공유한다.
 */
export async function requireUnlock(userId: string) {
  const store = await cookies();
  const token = store.get(VAULT_UNLOCK_COOKIE)?.value;
  if (!verifyUnlockToken(token, userId)) {
    throw new Error("잠금이 필요합니다. 2차 비밀번호를 입력해주세요.");
  }
}
