// 공유 캐시 — KVSTORE_ADDR(Valkey Cluster)가 있으면 레플리카 간 공유, 없으면 프로세스 메모리(ttlCache).
// 사내 K8s는 HPA min 2 레플리카라, 인증 코드를 발급한 pod와 검증 요청이 도착하는 pod가
// 다를 수 있다 — 이 모듈이 그 간극을 메우는 핵심 (gitea deploy/base/hpa.yaml 참조).
//
// 저장소 규칙 준수: 모든 키는 `${KVSTORE_PREFIX}:` 접두 (다른 앱과 충돌 방지), hash tag 금지.
// Valkey 장애 시에는 경고 후 메모리 폴백(성능 저하가 아니라 "단일 pod 한정 동작"으로 강등됨을 유의).
import { config } from '../config.js';
import { cache as memCache } from './ttlCache.js';

let client = null;
let connecting = null;
let degradedWarned = false;

async function getClient() {
  if (!config.kvstore.addr) return null;
  if (client) return client;
  if (!connecting) {
    connecting = (async () => {
      // redis 클라이언트는 Valkey 호환 (저장소 README: JS client redis 6.1.0, Cluster 모드)
      const { createCluster } = await import('redis');
      const c = createCluster({ rootNodes: [{ url: `redis://${config.kvstore.addr}` }] });
      c.on('error', (e) => console.error('[kvstore] error: ' + e.message));
      await c.connect();
      console.log('[kvstore] Valkey 연결 — 레플리카 공유 캐시 모드');
      client = c;
      return c;
    })().catch((e) => {
      connecting = null;
      throw e;
    });
  }
  return connecting;
}

async function shared() {
  try {
    return await getClient();
  } catch (e) {
    if (!degradedWarned) {
      degradedWarned = true;
      console.warn('[kvstore] Valkey 연결 실패 → 메모리 폴백 (⚠ 멀티 레플리카에서는 인증 코드 검증이 pod 간 공유되지 않음): ' + e.message);
    }
    return null;
  }
}

const k = (key) => `${config.kvstore.prefix}:${key}`;

export async function kvGet(key) {
  const c = await shared();
  if (!c) return memCache.get(key);
  return c.get(k(key));
}

export async function kvPut(key, value, ttlSec) {
  const c = await shared();
  if (!c) return memCache.put(key, value, ttlSec);
  await c.set(k(key), String(value), { EX: ttlSec });
}

export async function kvDel(key) {
  const c = await shared();
  if (!c) return memCache.remove(key);
  await c.del(k(key));
}

/** 없으면 생성해 영구 저장(SET NX) — 전 레플리카가 같은 값을 보게 함 (AUTH_SECRET 공유 등). */
export async function kvGetOrSet(key, producer) {
  const c = await shared();
  if (!c) return producer();
  const existing = await c.get(k(key));
  if (existing) return existing;
  const value = producer();
  const won = await c.set(k(key), value, { NX: true });
  if (won) return value;
  return (await c.get(k(key))) || value;
}

export function kvSharedMode() {
  return !!config.kvstore.addr;
}
