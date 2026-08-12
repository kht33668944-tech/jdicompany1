// 2차 비밀번호 잠금 확인 — 보관함과 이를 재사용하는 도메인(TMA 계약 정산 등)의 단일 소스.
// 서버 액션이 아닌 서버 모듈로 둔다("use server" 파일에서 export 하면 액션으로 노출되기 때문).

import { cookies } from "next/headers";
import { verifyUnlockToken } from "./crypto";
import { VAULT_UNLOCK_COOKIE } from "./constants";

/** 잠금 해제 상태 확인. 미해제면 한국어 문구로 throw. */
export async function requireVaultUnlock(userId: string): Promise<void> {
  const store = await cookies();
  const token = store.get(VAULT_UNLOCK_COOKIE)?.value;
  if (!verifyUnlockToken(token, userId)) {
    throw new Error("잠금이 필요합니다. 2차 비밀번호를 입력해주세요.");
  }
}
