// 로컬 상태 파일. 행은 절대 지우지 않는다 — 지우면 다음 실행에 재수집해서 Apify 비용을 또 낸다.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DEFAULT_DIR =
  process.env.DISCOVERY_STATE_DIR ??
  "C:\\Users\\jdico\\Desktop\\트리 포세나 협찬\\인플루언서 발굴";

export function statePath(dir = DEFAULT_DIR) {
  return join(dir, "state.json");
}

const EMPTY = {
  version: 1,
  updatedAt: null,
  // 대표가 포털에 이미 등록해둔 계정. 확장의 출발점으로만 쓰고 후보로는 절대 올리지 않는다.
  // Apify 를 부르기 전에 여기서 걸러야 한다 — 이미 아는 사람에게 돈을 쓰는 게 가장 큰 낭비다.
  registered: {},
  profiles: {},
  seeds: {},
  runs: [],
};

export function loadState(dir = DEFAULT_DIR) {
  const p = statePath(dir);
  if (!existsSync(p)) return structuredClone(EMPTY);

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    // 손상된 파일을 덮어쓰지 않는다. 사람이 판단해야 한다.
    throw new Error(
      `상태 파일이 손상됐습니다: ${p}\n원인: ${err.message}\n` +
        `백업(state.backup.json)을 확인하고 직접 복구한 뒤 다시 실행하세요.`,
    );
  }
  if (parsed?.version !== 1) {
    throw new Error(`알 수 없는 상태 파일 버전: ${parsed?.version} (${p})`);
  }
  return { ...structuredClone(EMPTY), ...parsed };
}

export function saveState(state, dir = DEFAULT_DIR) {
  const p = statePath(dir);
  mkdirSync(dirname(p), { recursive: true });
  if (existsSync(p)) copyFileSync(p, join(dir, "state.backup.json"));
  state.updatedAt = new Date().toISOString();
  writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
  return p;
}

export const normKey = (username) => String(username ?? "").trim().toLowerCase();

/** 대표가 이미 등록한 계정인가. 후보 자격 판단의 첫 관문. */
export function isRegistered(state, username) {
  return Object.hasOwn(state.registered ?? {}, normKey(username));
}

/** 포털에서 읽어온 등록 계정 명단을 갱신한다. */
export function setRegistered(state, usernames) {
  state.registered ??= {};
  let added = 0;
  for (const u of usernames) {
    const key = normKey(u);
    if (!key || state.registered[key]) continue;
    state.registered[key] = { username: u, addedAt: new Date().toISOString() };
    added++;
  }
  return added;
}

/**
 * 씨앗 추가. 이미 있으면 건드리지 않는다(consumedAt 을 되돌리면 안 된다).
 * sourceOnly=true 는 "확장 출발점으로만 쓰고 후보로 채점하지 않는다"는 표시다.
 */
export function addSeed(
  state,
  username,
  { sourceUsername = null, priority = 0, sourceOnly = false } = {},
) {
  if (!username) return false;
  const key = normKey(username);
  if (!key || state.seeds[key] || state.profiles[key]) return false;
  state.seeds[key] = { username, sourceUsername, priority, sourceOnly, consumedAt: null };
  return true;
}

/**
 * 후보로 평가할 씨앗을 우선순위 높은 순으로 n개 꺼낸다.
 * 등록된 계정과 sourceOnly 씨앗은 제외한다 — Apify 를 부르기 전에 걸러야 돈이 안 나간다.
 */
export function pickPendingSeeds(state, n) {
  return Object.entries(state.seeds)
    .filter(([key, s]) =>
      !s.consumedAt && !s.sourceOnly && !isRegistered(state, key)
    )
    .sort((a, b) => (b[1].priority ?? 0) - (a[1].priority ?? 0))
    .slice(0, n)
    .map(([key, s]) => ({ key, ...s }));
}

export function countPendingSeeds(state) {
  return Object.entries(state.seeds).filter(([key, s]) =>
    !s.consumedAt && !s.sourceOnly && !isRegistered(state, key)
  ).length;
}

/** 확장 출발점으로 쓸 계정(등록 계정 + sourceOnly 씨앗). */
export function expansionSources(state) {
  const out = new Map();
  for (const [key, v] of Object.entries(state.registered ?? {})) {
    out.set(key, v.username);
  }
  for (const [key, s] of Object.entries(state.seeds)) {
    if (s.sourceOnly) out.set(key, s.username);
  }
  return out;
}
