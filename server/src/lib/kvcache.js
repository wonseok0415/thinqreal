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
      const kv = config.kvstore;
      const hostPort = String(kv.addr).replace(/^rediss?:\/\//i, ''); // 스킴은 tls 플래그로 흡수
      const scheme = kv.tls ? 'rediss' : 'redis';
      // TLS(ElastiCache Encryption in transit): rootNodes와 클러스터가 알려주는 노드 접속 모두에 socket.tls 적용(defaults)
      const defaults = {
        socket: kv.tls ? { tls: true, rejectUnauthorized: kv.rejectUnauthorized } : undefined,
        username: kv.username || undefined,
        password: kv.password || undefined,
      };
      const c = createCluster({ rootNodes: [{ url: `${scheme}://${hostPort}` }], defaults });
      c.on('error', (e) => console.error('[kvstore] error: ' + e.message));
      await c.connect();
      console.log(`[kvstore] Valkey 연결 — 레플리카 공유 캐시 모드 (${kv.tls ? 'TLS' : '평문'}${kv.username || kv.password ? ', 인증' : ''})`);
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

/** 없으면 생성해 영구 저장(SET NX) — 전 레플리카가 같은 값을 보게 함 (AUTH_SECRET 공유 등).
 *  Valkey에 붙지 못하면 **null**을 돌려준다(폴백 생성 금지) — 호출자가 재시도해 수렴하게 (auth/secret.js).
 *  연결 실패 캐시(degradedWarned)를 무시하고 매번 다시 붙어 본다 — 부트 직후 일시 실패가 굳지 않도록. */
export async function kvGetOrSetShared(key, producer) {
  if (!config.kvstore.addr) return null;
  let c;
  try {
    c = await getClient();
  } catch {
    return null;
  }
  const existing = await c.get(k(key));
  if (existing) return existing;
  const value = producer();
  const won = await c.set(k(key), value, { NX: true });
  if (won) return value;
  return (await c.get(k(key))) || null;
}

/** 구 API — 연결 실패 시 producer() 폴백(공유 안 됨). 서명 키에는 쓰지 말 것 → kvGetOrSetShared. */
export async function kvGetOrSet(key, producer) {
  return (await kvGetOrSetShared(key, producer)) ?? producer();
}

/** 일일 잡 락 — SET NX EX. true = 이 인스턴스가 락 획득 (해당 키로는 유일한 실행자).
 *  Valkey 미설정 시 프로세스 메모리 — 단일 인스턴스 전제라 항상 획득. */
export async function kvTryLock(key, ttlSec) {
  const c = await shared();
  if (!c) {
    if (memCache.get(key)) return false;
    memCache.put(key, '1', ttlSec);
    return true;
  }
  const won = await c.set(k(key), '1', { NX: true, EX: ttlSec });
  return !!won;
}

export function kvSharedMode() {
  return !!config.kvstore.addr;
}

/** healthz 진단용 — memory(주소 미설정) / shared(Valkey 연결됨) / degraded(주소는 있으나 연결 실패 → 메모리 폴백) / connecting */
export function kvStatus() {
  if (!config.kvstore.addr) return 'memory';
  if (client) return 'shared';
  if (degradedWarned) return 'degraded';
  return 'connecting';
}
