// AUTH_SECRET 부트 초기화 — 멀티 레플리카에서 토큰 서명 키를 전 pod가 공유하게 하고, 재시작·롤아웃에도 유지한다.
// 우선순위: ① env AUTH_SECRET(명시 주입 — SealedSecret 도입 후 정식 경로)
//          ② 저장소 app_state 'auth_secret'(영속 — DB가 살아 있는 한 키가 바뀌지 않음)
//          ③ Valkey get-or-create 'app:auth-secret'(SET NX 원자적 — 첫 생성 시 pod 간 중재) → 얻으면 ②에 영속화
//          ④ 프로세스 임시 키(config가 생성) — 백그라운드에서 ②③ 재시도해 얻는 즉시 교체(수렴)
//
// 2026-09-29 보강(키트 v4.9): 롤아웃 직후마다 bad_signature 재발(OP 9/28·9/29). 원인 후보 둘 다 막는다 —
//  (a) Valkey 키 유실(공용 kvstore 축출·재시작) → 새 pod가 새 키 생성 → 기존 토큰 전부 무효: ②가 영속 원본이라 방지
//  (b) 부트 직후 Valkey 연결 실패 → pod별 임시 키로 굳음: 재시도·수렴 + /healthz authSecret 노출로 방지·가시화
import crypto from 'node:crypto';
import { config } from '../config.js';
import { kvGetOrSetShared, kvSharedMode } from '../lib/kvcache.js';

const STATE_KEY = 'auth_secret';
const KV_KEY = 'app:auth-secret';
const BOOT_ATTEMPTS = 4;       // 부트 시 최대 4회 × 2초 (+시도당 상한 5초) ≈ 30초 이내
const BOOT_DELAY_MS = 2000;
const ATTEMPT_TIMEOUT_MS = 5000; // 한 번의 시도가 매달리지 않게(연결 대기 상한)
const RECONCILE_MS = 60000;    // 기동 후 1분마다 저장소 값과 대조 — 드문 동시 생성 경합도 1분 안에 수렴
const BG_RETRY_MS = 15000;     // 그래도 실패하면 15초 간격으로 계속

let source = (process.env.AUTH_SECRET || '').trim() ? 'env' : 'temp'; // 'env' | 'db' | 'shared' | 'temp'
let bgTimer = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newSecret = () => crypto.randomUUID() + '_' + crypto.randomUUID();
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + ms + 'ms')), ms).unref?.())]);

function adopt(secret, from) {
  if (config.authSecret !== secret) config.authSecret = secret;
  source = from;
}

/** 1회 시도: DB → Valkey(원자적 생성) → DB 영속화. 성공 true / 아직 못 얻음 false (예외 삼킴) */
async function tryAdopt(store) {
  // ② 영속 원본
  if (store?.state) {
    try {
      const v = String((await withTimeout(store.state.get(STATE_KEY), ATTEMPT_TIMEOUT_MS)) || '').trim();
      if (v) { adopt(v, 'db'); return true; }
    } catch (e) { console.warn('[auth] app_state auth_secret 조회 실패: ' + e.message); }
  }
  // ③ Valkey 원자적 get-or-create (첫 생성 시 pod 간 중재)
  let secret = null;
  if (kvSharedMode()) {
    try {
      secret = await withTimeout(kvGetOrSetShared(KV_KEY, newSecret), ATTEMPT_TIMEOUT_MS);
    } catch (e) { console.warn('[auth] Valkey 공유 AUTH_SECRET 조회 실패: ' + e.message); }
  }
  if (!secret && store?.state) secret = newSecret(); // Valkey를 못 쓰면 저장소에만 영속(경합은 아래 read-back + 주기 대조로 수렴)
  if (!secret) return false;
  // ②에 영속화 — 경합 시 저장된 값을 다시 읽어 그것을 채택(마지막 쓰기 기준 수렴)
  if (store?.state) {
    try {
      const cur = String((await store.state.get(STATE_KEY)) || '').trim();
      if (!cur) await store.state.set(STATE_KEY, secret);
      const stored = String((await store.state.get(STATE_KEY)) || '').trim();
      if (stored) { adopt(stored, 'db'); return true; }
    } catch (e) { console.warn('[auth] app_state auth_secret 영속화 실패(Valkey 값으로 진행): ' + e.message); }
  }
  adopt(secret, 'shared');
  return true;
}

/** @param {object} [store] Store 인스턴스(app_state 영속화용). 없으면 Valkey/임시 키만. */
export async function initSharedAuthSecret(store) {
  if (source === 'env') return; // 명시 주입이 항상 우선
  if (!kvSharedMode() && !store?.state) return; // 로컬(메모리·Valkey 없음) — config의 임시 키 유지
  for (let i = 1; i <= BOOT_ATTEMPTS; i++) {
    if (await tryAdopt(store)) {
      console.log(`[auth] AUTH_SECRET = ${source === 'db' ? '저장소 영속 키' : 'Valkey 공유 키'} (시도 ${i}회 — 전 레플리카 동일 서명, 재시작에도 유지)`);
      startReconcile(store);
      return;
    }
    await sleep(BOOT_DELAY_MS);
  }
  console.error(`[auth] ⚠ 공유 AUTH_SECRET을 ${BOOT_ATTEMPTS}회 안에 얻지 못함 — pod별 임시 키로 기동. 백그라운드 재시도 계속(얻는 즉시 교체). 그때까지 이 pod의 토큰 검증은 다른 pod와 어긋난다`);
  bgTimer = setInterval(async () => {
    if (await tryAdopt(store)) {
      console.log('[auth] AUTH_SECRET 수렴 — 공유 키로 교체 완료 (임시 키로 발급된 토큰은 무효)');
      clearInterval(bgTimer);
      bgTimer = null;
      startReconcile(store);
    }
  }, BG_RETRY_MS);
  bgTimer.unref?.();
}

/** 저장소 값과 주기 대조 — 다른 pod가 나중에 쓴 값이 있으면 그쪽으로 맞춘다(마지막 쓰기 기준 수렴). */
function startReconcile(store) {
  if (!store?.state) return;
  const t = setInterval(async () => {
    try {
      const v = String((await withTimeout(store.state.get(STATE_KEY), ATTEMPT_TIMEOUT_MS)) || '').trim();
      if (v && v !== config.authSecret) { adopt(v, 'db'); console.warn('[auth] AUTH_SECRET 재수렴 — 저장소 값으로 교체'); }
    } catch { /* 다음 주기 */ }
  }, RECONCILE_MS);
  t.unref?.();
}

/** /healthz 진단용 — env(명시 주입) | db(저장소 영속) | shared(Valkey) | temp(pod별 임시 — 멀티 레플리카에서 로그인 어긋남) */
export function authSecretSource() {
  return source;
}
