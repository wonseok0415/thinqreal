// AUTH_SECRET 부트 초기화 — 멀티 레플리카에서 토큰 서명 키를 전 pod가 공유하게 한다.
// 우선순위: ① env AUTH_SECRET(명시 주입 — SealedSecret 도입 후 정식 경로)
//          ② Valkey get-or-create 공유 키(임시 경로 — SealedSecret 설정 완료 전 ST/QA용)
//          ③ 프로세스 임시 키(config가 생성 — 로컬 dev 전용, 재시작 시 토큰 무효화)
// ②가 없으면 레플리카마다 서명 키가 달라져 "pod A가 발급한 토큰을 pod B가 거부"하는 문제가 생긴다.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { kvGetOrSet, kvSharedMode } from '../lib/kvcache.js';

export async function initSharedAuthSecret() {
  if ((process.env.AUTH_SECRET || '').trim()) return; // 명시 주입이 항상 우선
  if (!kvSharedMode()) return; // 로컬 — config의 임시 키 유지
  try {
    const secret = await kvGetOrSet('app:auth-secret',
      () => crypto.randomUUID() + '_' + crypto.randomUUID());
    config.authSecret = secret;
    console.log('[auth] AUTH_SECRET = Valkey 공유 키 (SealedSecret 도입 전 임시 — 전 레플리카 동일 서명)');
  } catch (e) {
    console.error('[auth] Valkey 공유 AUTH_SECRET 초기화 실패 (pod별 임시 키로 동작 — 토큰 검증이 pod 간 어긋날 수 있음): ' + e.message);
  }
}
