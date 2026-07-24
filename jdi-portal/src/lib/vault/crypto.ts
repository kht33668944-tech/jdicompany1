// 서버 전용 모듈: node:crypto + ACCOUNT_VAULT_KEY(process.env)를 사용하므로
// 서버 액션/서버 컴포넌트에서만 import 한다. (클라이언트 번들에 섞이면 빌드가 실패한다.)
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";

/**
 * 계정 보관함 비밀번호 암복호화 + 2차 비밀번호 잠금 쿠키 서명.
 *
 * - 암호화: AES-256-GCM. 저장 형식 = base64( iv(12) | authTag(16) | ciphertext ).
 * - 키: 서버 전용 환경변수 ACCOUNT_VAULT_KEY(32바이트 base64). 절대 클라이언트 노출 금지.
 * - 잠금 쿠키: HMAC-SHA256 서명. HMAC 키는 ACCOUNT_VAULT_KEY에서 파생(추가 env 불필요).
 *
 * ⚠️ ACCOUNT_VAULT_KEY 를 분실/교체하면 기존 암호문을 복호화할 수 없습니다.
 */

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ACCOUNT_VAULT_KEY;
  if (!raw) {
    throw new Error(
      "ACCOUNT_VAULT_KEY 환경변수가 없습니다. 계정 보관함 암호화 키를 설정해주세요.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ACCOUNT_VAULT_KEY 는 32바이트(base64) 여야 합니다. `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` 로 생성하세요.",
    );
  }
  cachedKey = key;
  return key;
}

/** 잠금 쿠키 서명용 파생 키(암호화 키와 분리) */
function getUnlockKey(): Buffer {
  return createHash("sha256").update(Buffer.concat([getKey(), Buffer.from(":unlock")])).digest();
}

/** 평문 → 저장용 암호문 문자열. 빈 값은 빈 문자열로 통과. */
export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** 저장용 암호문 문자열 → 평문. 빈 값/손상 시 빈 문자열 반환. */
export function decryptSecret(enc: string | null): string {
  if (!enc) return "";
  try {
    const buf = Buffer.from(enc, "base64");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/** 잠금 해제 토큰 발급: `${expEpoch}.${hmac}` (사용자 id에 바인딩) */
export function signUnlock(userId: string, expEpochSec: number): string {
  const payload = `${userId}:${expEpochSec}`;
  const sig = createHmac("sha256", getUnlockKey()).update(payload).digest("base64url");
  return `${expEpochSec}.${sig}`;
}

/** 잠금 토큰 검증: 서명 일치 + 미만료. 유효하면 true. */
export function verifyUnlockToken(token: string | undefined, userId: string): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expEpochSec = Number(expStr);
  if (!Number.isFinite(expEpochSec)) return false;
  if (Date.now() / 1000 > expEpochSec) return false; // 만료
  const expected = createHmac("sha256", getUnlockKey())
    .update(`${userId}:${expEpochSec}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
